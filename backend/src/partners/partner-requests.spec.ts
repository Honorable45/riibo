import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerRequestDto, normalizeTogoPhone } from './dto/partner-request.dto';
import { PartnerRequestsService } from './partner-requests.service';

const valid = {
  restaurantName: '  Chez Ama ',
  contactName: 'Ama Koffi',
  phone: '90 12 34 56',
  area: 'Lomé, Bè',
};

describe('CreatePartnerRequestDto', () => {
  it('normalise un numéro togolais local et nettoie les champs', async () => {
    const dto = plainToInstance(CreatePartnerRequestDto, valid);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.phone).toBe('+22890123456');
    expect(dto.restaurantName).toBe('Chez Ama');
  });

  it('refuse un numéro invalide et les champs obligatoires vides', async () => {
    const dto = plainToInstance(CreatePartnerRequestDto, {
      ...valid,
      phone: '12',
      contactName: ' ',
    });
    const props = (await validate(dto)).map((e) => e.property).sort();
    expect(props).toEqual(['contactName', 'phone']);
  });

  it('accepte les formats internationaux courants', () => {
    expect(normalizeTogoPhone('00228 90 12 34 56')).toBe('+22890123456');
    expect(normalizeTogoPhone('+228-90-12-34-56')).toBe('+22890123456');
  });
});

describe('PartnerRequestsService', () => {
  const prisma = {
    partnerRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };
  const service = new PartnerRequestsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  const dto = { restaurantName: 'Chez Ama', contactName: 'Ama', phone: '+22890123456', area: 'Bè' };

  beforeEach(() => jest.clearAllMocks());

  it('enregistre la demande et ne renvoie que sa référence', async () => {
    prisma.partnerRequest.findFirst.mockResolvedValue(null);
    prisma.partnerRequest.create.mockResolvedValue({
      id: 'p1',
      createdAt: new Date('2026-10-18T10:00:00Z'),
    });
    await expect(service.create(dto)).resolves.toEqual({
      id: 'p1',
      receivedAt: new Date('2026-10-18T10:00:00Z'),
    });
  });

  it('champ piège rempli : rien n’est enregistré', async () => {
    await expect(service.create({ ...dto, website: 'http://spam' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.partnerRequest.create).not.toHaveBeenCalled();
  });

  it('refuse un doublon en attente pour le même numéro', async () => {
    prisma.partnerRequest.findFirst.mockResolvedValue({ id: 'p0' });
    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.partnerRequest.create).not.toHaveBeenCalled();
  });

  it('le traitement par l’équipe est journalisé', async () => {
    prisma.partnerRequest.findUnique.mockResolvedValue({ status: 'NEW' });
    prisma.partnerRequest.update.mockResolvedValue({ id: 'p1', status: 'CONTACTED' });
    await service.update('admin-1', 'p1', { status: 'CONTACTED' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PARTNER_REQUEST_UPDATED',
        metadata: { from: 'NEW', to: 'CONTACTED' },
      }),
    );
  });
});
