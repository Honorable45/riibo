import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePartnerRequestDto,
  ListPartnerRequestsQueryDto,
  UpdatePartnerRequestDto,
} from './dto/partner-request.dto';

const DEFAULT_PAGE_SIZE = 30;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Candidatures de restaurants envoyées depuis le site vitrine. Une demande
 * n'est confirmée au visiteur qu'une fois enregistrée en base ; l'équipe la
 * traite depuis le backoffice.
 */
@Injectable()
export class PartnerRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreatePartnerRequestDto) {
    // Champ piège rempli : envoi automatisé, rien n'est enregistré.
    if (dto.website?.trim()) throw new BadRequestException('Demande refusée.');

    const recent = await this.prisma.partnerRequest.findFirst({
      where: {
        phone: dto.phone,
        status: 'NEW',
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) {
      throw new ConflictException(
        'Une demande avec ce numéro est déjà en attente. Notre équipe vous rappellera.',
      );
    }

    const created = await this.prisma.partnerRequest.create({
      data: {
        restaurantName: dto.restaurantName,
        contactName: dto.contactName,
        phone: dto.phone,
        area: dto.area,
        cuisine: dto.cuisine || null,
        message: dto.message || null,
      },
      select: { id: true, createdAt: true },
    });
    // Rien d'autre n'est renvoyé au visiteur.
    return { id: created.id, receivedAt: created.createdAt };
  }

  async list(query: ListPartnerRequestsQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.partnerRequest.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const counts = await this.prisma.partnerRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return {
      items: page,
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    };
  }

  async update(adminId: string, id: string, dto: UpdatePartnerRequestDto, ipAddress?: string) {
    const existing = await this.prisma.partnerRequest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw new NotFoundException('Demande introuvable.');
    const updated = await this.prisma.partnerRequest.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.internalNote !== undefined ? { internalNote: dto.internalNote || null } : {}),
        handledById: adminId,
        handledAt: new Date(),
      },
    });
    await this.audit.log({
      actorId: adminId,
      action: 'PARTNER_REQUEST_UPDATED',
      targetType: 'PARTNER_REQUEST',
      targetId: id,
      metadata: { from: existing.status, to: dto.status },
      ipAddress,
    });
    return updated;
  }
}
