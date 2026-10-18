import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { DriverLocationStore } from '../deliveries/driver-location.store';
import { OrderStateMachineService } from '../orders/order-state-machine.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryProvider } from '../uploads/cloudinary.provider';
import { MediaService } from '../uploads/media.service';
import { AdminInsightsService } from './admin-insights.service';
import { AdminMenuService } from './admin-menu.service';
import { AdminOrdersService } from './admin-orders.service';

type Where = { AND: Array<{ OR?: unknown[] } & Record<string, unknown>> };
type FindUniqueArgs = { include: { delivery: { select: Record<string, unknown> } } };

describe('AdminOrdersService', () => {
  const prisma = {
    order: { findMany: jest.fn(), findUnique: jest.fn() },
    auditLog: { findMany: jest.fn() },
  };
  const stateMachine = { apply: jest.fn() };
  const service = new AdminOrdersService(
    prisma as unknown as PrismaService,
    stateMachine as unknown as OrderStateMachineService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('annule uniquement via la machine à états, en tant qu’ADMIN et avec le motif', async () => {
    stateMachine.apply.mockResolvedValue(undefined);
    prisma.order.findUnique.mockResolvedValue(null); // relecture : peu importe ici
    await expect(
      service.cancel('admin-1', 'o1', 'Client injoignable', '1.2.3.4'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(stateMachine.apply).toHaveBeenCalledWith(
      'o1',
      'CANCEL',
      { kind: 'ADMIN', userId: 'admin-1' },
      { reason: 'Client injoignable', ipAddress: '1.2.3.4' },
    );
  });

  it('recherche « #42 » par numéro de commande et filtre statuts, livreur et période', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await service.list({
      q: '#42',
      status: ['PENDING', 'ACCEPTED'],
      driverId: 'd1',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-02T00:00:00.000Z',
    });
    const { where } = (prisma.order.findMany.mock.calls[0] as [{ where: Where }])[0];
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { status: { in: ['PENDING', 'ACCEPTED'] } },
        { delivery: { driverId: 'd1' } },
        {
          createdAt: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lt: new Date('2026-10-02T00:00:00.000Z'),
          },
        },
      ]),
    );
    const search = where.AND.find((c) => c.OR);
    expect(search?.OR?.[0]).toEqual({ orderNumber: 42 });
  });

  it('ne renvoie jamais les codes de retrait / remise', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await service.getOne('o1').catch(() => undefined);
    const select = (prisma.order.findUnique.mock.calls[0] as [FindUniqueArgs])[0].include.delivery
      .select;
    expect(select.pickupCode).toBeUndefined();
    expect(select.deliveryCode).toBeUndefined();
  });
});

describe('AdminMenuService', () => {
  const prisma = {
    menuItem: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
    restaurant: { count: jest.fn() },
  };
  const media = { savePublicImage: jest.fn(), deleteByUrl: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new AdminMenuService(
    prisma as unknown as PrismaService,
    media as unknown as MediaService,
    audit as unknown as AuditService,
  );
  const item = {
    id: 'i1',
    restaurantId: 'r1',
    imageUrl: '/api/v1/media/menu/old.jpg',
    isAvailable: true,
    name: 'Poulet braisé',
    description: null,
    price: 2500,
    stock: 0,
    maxQuantity: null,
    rating: 0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    restaurant: { id: 'r1', name: 'Chez Maman', status: 'APPROVED' },
    category: null,
    _count: { optionGroups: 0 },
    optionGroups: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.menuItem.findFirst.mockResolvedValue(item);
  });

  it('signale les défauts de fiche', async () => {
    const dto = await service.getOne('i1');
    expect(dto.issues).toEqual(['NO_DESCRIPTION', 'NO_CATEGORY', 'SOLD_OUT']);
  });

  it('retire un plat de la vente avec motif journalisé', async () => {
    await service.setAvailability('admin-1', 'i1', {
      isAvailable: false,
      reason: 'Photo trompeuse',
    });
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { isAvailable: false },
    });
    const metadata: unknown = expect.objectContaining({
      before: true,
      after: false,
      reason: 'Photo trompeuse',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MENU_ITEM_DISABLED_BY_ADMIN', metadata }),
    );
  });

  it('ne supprime pas un fichier encore utilisé ailleurs', async () => {
    prisma.menuItem.count.mockResolvedValue(1);
    prisma.restaurant.count.mockResolvedValue(0);
    await service.removeImage('admin-1', 'i1');
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { imageUrl: null },
    });
    expect(media.deleteByUrl).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MENU_ITEM_IMAGE_REMOVED_BY_ADMIN' }),
    );
  });

  it('supprime le fichier quand plus rien ne l’utilise', async () => {
    prisma.menuItem.count.mockResolvedValue(0);
    prisma.restaurant.count.mockResolvedValue(0);
    await service.removeImage('admin-1', 'i1');
    expect(media.deleteByUrl).toHaveBeenCalledWith('/api/v1/media/menu/old.jpg');
  });
});

describe('AdminInsightsService', () => {
  const prisma = {
    driverProfile: { findUnique: jest.fn() },
    delivery: { groupBy: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  };
  const locations = { get: jest.fn() };
  const cloudinary = { isConfigured: () => false };
  const service = new AdminInsightsService(
    prisma as unknown as PrismaService,
    cloudinary as unknown as CloudinaryProvider,
    locations as unknown as DriverLocationStore,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.delivery.groupBy.mockResolvedValue([]);
    prisma.delivery.findFirst.mockResolvedValue(null);
    prisma.delivery.findMany.mockResolvedValue([]);
  });

  it('refuse une période inversée ou trop longue', async () => {
    await expect(
      service.finance('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.finance('2024-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('n’affiche pas la position d’un livreur hors ligne', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'd1',
      isOnline: false,
      totalOffers: 0,
      acceptedOffers: 0,
    });
    const result = await service.driverInsights('d1');
    expect(locations.get).not.toHaveBeenCalled();
    expect(result.position).toBeNull();
  });

  it('écarte une position trop ancienne même si le livreur est en ligne', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'd1',
      isOnline: true,
      totalOffers: 4,
      acceptedOffers: 3,
    });
    locations.get.mockResolvedValue({ latitude: 6.1, longitude: 1.2, at: Date.now() - 5 * 60_000 });
    const result = await service.driverInsights('d1');
    expect(result.position).toBeNull();
    expect(result.acceptanceRate).toBe(0.75);
  });

  it('ne déclare aucune commission et n’expose aucun secret', () => {
    process.env.CLOUDINARY_API_SECRET = 'ne-doit-pas-sortir';
    const config = service.config();
    expect(config.commission).toEqual({ configured: false });
    expect(JSON.stringify(config)).not.toContain('ne-doit-pas-sortir');
    delete process.env.CLOUDINARY_API_SECRET;
  });
});
