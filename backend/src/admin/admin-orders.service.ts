import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderStateMachineService } from '../orders/order-state-machine.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminOrdersQueryDto } from './dto/admin-ops.dto';

const DEFAULT_PAGE_SIZE = 30;

const PERSON = { select: { id: true, firstName: true, lastName: true, phone: true } } as const;

const LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  deliveryType: true,
  subtotal: true,
  deliveryFee: true,
  discountAmount: true,
  total: true,
  paymentMethod: true,
  paymentStatus: true,
  createdAt: true,
  client: PERSON,
  restaurant: { select: { id: true, name: true } },
  delivery: {
    select: { status: true, driver: { select: { id: true, user: PERSON } } },
  },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

export interface TimelineEntry {
  at: Date;
  label: string;
  /** Qui a agi, quand c'est connu (journal d'audit). */
  actor?: string | null;
  detail?: string | null;
}

/**
 * Lecture des commandes pour le backoffice. Aucun statut n'est écrit ici :
 * l'unique action (annulation) passe par OrderStateMachineService, qui
 * applique la table des transitions et journalise l'action admin.
 */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: OrderStateMachineService,
  ) {}

  async list(query: ListAdminOrdersQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where = this.where(query);
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: LIST_SELECT,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(({ _count, delivery, ...order }) => ({
        ...order,
        itemCount: _count.items,
        delivery: delivery
          ? {
              status: delivery.status,
              driver: delivery.driver
                ? { id: delivery.driver.id, ...personOf(delivery.driver.user) }
                : null,
            }
          : null,
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getOne(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            isActive: true,
          },
        },
        restaurant: { select: { id: true, name: true, slug: true, phone: true, address: true } },
        items: { orderBy: { id: 'asc' } },
        payments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            provider: true,
            method: true,
            amount: true,
            currency: true,
            status: true,
            providerRef: true,
            paidAt: true,
            failedAt: true,
            createdAt: true,
          },
        },
        promoCode: { select: { id: true, code: true } },
        review: { select: { rating: true, comment: true, isHidden: true } },
        // Les codes de retrait / remise ne sortent jamais du backend.
        delivery: {
          select: {
            id: true,
            status: true,
            deliveryFee: true,
            distanceKm: true,
            searchAttempts: true,
            assignedAt: true,
            atRestaurantAt: true,
            pickedUpAt: true,
            arrivedAt: true,
            deliveredAt: true,
            cancelledAt: true,
            createdAt: true,
            driver: { select: { id: true, vehicleType: true, plateNumber: true, user: PERSON } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');

    const audit = await this.prisma.auditLog.findMany({
      where: { targetType: 'ORDER', targetId: orderId },
      orderBy: { createdAt: 'asc' },
      select: {
        action: true,
        metadata: true,
        createdAt: true,
        actor: { select: { firstName: true, lastName: true } },
      },
    });

    const { delivery, ...rest } = order;
    return {
      ...rest,
      delivery: delivery
        ? {
            ...delivery,
            driver: delivery.driver
              ? {
                  id: delivery.driver.id,
                  vehicleType: delivery.driver.vehicleType,
                  plateNumber: delivery.driver.plateNumber,
                  ...personOf(delivery.driver.user),
                }
              : null,
          }
        : null,
      timeline: buildTimeline(order, delivery, audit),
    };
  }

  /** Annulation exceptionnelle : règles, motif et journal imposés par la machine à états. */
  async cancel(adminId: string, orderId: string, reason: string, ipAddress?: string) {
    await this.stateMachine.apply(
      orderId,
      'CANCEL',
      { kind: 'ADMIN', userId: adminId },
      { reason, ipAddress },
    );
    return this.getOne(orderId);
  }

  private where(query: ListAdminOrdersQueryDto): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = [];
    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.deliveryType) and.push({ deliveryType: query.deliveryType });
    if (query.restaurantId) and.push({ restaurantId: query.restaurantId });
    if (query.clientId) and.push({ clientId: query.clientId });
    if (query.driverId) and.push({ delivery: { driverId: query.driverId } });
    if (query.from || query.to) {
      and.push({
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lt: new Date(query.to) } : {}),
        },
      });
    }
    const q = query.q?.trim().replace(/^#/, '');
    if (q) {
      const or: Prisma.OrderWhereInput[] = [
        { client: { phone: { contains: q.replace(/\s/g, '') } } },
        { client: { firstName: { contains: q, mode: 'insensitive' } } },
        { client: { lastName: { contains: q, mode: 'insensitive' } } },
      ];
      if (/^\d{1,9}$/.test(q)) or.unshift({ orderNumber: Number(q) });
      and.push({ OR: or });
    }
    return and.length ? { AND: and } : {};
  }
}

function personOf(user: { id: string; firstName: string; lastName: string; phone: string | null }) {
  return { userId: user.id, name: `${user.firstName} ${user.lastName}`.trim(), phone: user.phone };
}

const AUDIT_LABELS: Record<string, string> = {
  ORDER_CANCELLED_BY_ADMIN: 'Annulée par un administrateur',
};

function buildTimeline(
  order: {
    createdAt: Date;
    acceptedAt: Date | null;
    preparingAt: Date | null;
    readyAt: Date | null;
    deliveredAt: Date | null;
    cancelledAt: Date | null;
    status: string;
    rejectionReason: string | null;
    cancelReason: string | null;
    deliveryType: string;
    updatedAt: Date;
  },
  delivery: {
    assignedAt: Date | null;
    atRestaurantAt: Date | null;
    pickedUpAt: Date | null;
    arrivedAt: Date | null;
  } | null,
  audit: Array<{
    action: string;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    actor: { firstName: string; lastName: string } | null;
  }>,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [{ at: order.createdAt, label: 'Commande passée' }];
  const push = (at: Date | null | undefined, label: string, detail?: string | null) => {
    if (at) entries.push({ at, label, detail: detail ?? null });
  };
  push(order.acceptedAt, 'Acceptée par le restaurant');
  push(order.preparingAt, 'En préparation');
  push(order.readyAt, order.deliveryType === 'PICKUP' ? 'Prête pour le retrait' : 'Prête');
  push(delivery?.assignedAt, 'Livreur affecté');
  push(delivery?.atRestaurantAt, 'Livreur au restaurant');
  push(delivery?.pickedUpAt, 'Récupérée par le livreur');
  push(delivery?.arrivedAt, 'Livreur arrivé chez le client');
  push(order.deliveredAt, order.deliveryType === 'PICKUP' ? 'Remise au client' : 'Livrée');
  // Le refus n'a pas d'horodatage dédié : la dernière mise à jour est la plus proche.
  if (order.status === 'REJECTED')
    push(order.updatedAt, 'Refusée par le restaurant', order.rejectionReason);
  const adminCancel = audit.some((a) => a.action === 'ORDER_CANCELLED_BY_ADMIN');
  if (!adminCancel) push(order.cancelledAt, 'Annulée', order.cancelReason);
  for (const log of audit) {
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    entries.push({
      at: log.createdAt,
      label: AUDIT_LABELS[log.action] ?? log.action,
      actor: log.actor ? `${log.actor.firstName} ${log.actor.lastName}`.trim() : null,
      detail: typeof meta.reason === 'string' ? meta.reason : null,
    });
  }
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
}
