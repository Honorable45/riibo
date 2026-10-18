import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DOCUMENT_TYPES, DocumentType } from '../restaurants/restaurant-owner.service';
import { APPROVAL_TRANSITIONS as TRANSITIONS } from './approval-transitions';
import { PrivateDocumentsService } from '../uploads/private-documents.service';
import {
  ListAdminRestaurantsQueryDto,
  RestaurantAction,
  RestaurantActionDto,
} from './dto/admin-restaurants.dto';

const NOTIFICATION_BY_ACTION: Partial<Record<RestaurantAction, NotificationType>> = {
  APPROVE: 'ACCOUNT_APPROVED',
  REACTIVATE: 'ACCOUNT_APPROVED',
  SUSPEND: 'ACCOUNT_SUSPENDED',
};

const DEFAULT_PAGE_SIZE = 30;

@Injectable()
export class AdminRestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly documents: PrivateDocumentsService,
  ) {}

  async list(query: ListAdminRestaurantsQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.RestaurantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { name: { contains: query.q.trim(), mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.restaurant.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        slug: true,
        name: true,
        city: true,
        quarter: true,
        status: true,
        statusReason: true,
        createdAt: true,
        approvedAt: true,
        members: {
          where: { role: 'OWNER' },
          select: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(({ members, ...restaurant }) => ({ ...restaurant, owner: members[0]?.user ?? null })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getOne(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        categories: { select: { slug: true, name: true } },
        hours: true,
        members: {
          select: {
            role: true,
            user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, isActive: true } },
          },
        },
      },
    });
    if (!restaurant) throw new NotFoundException('Restaurant introuvable.');

    const {
      ownerIdCardUrl,
      businessRegistrationUrl,
      storefrontPhotoUrl,
      ...rest
    } = restaurant;
    return {
      ...rest,
      documents: {
        'owner-id-card': Boolean(ownerIdCardUrl),
        'business-registration': Boolean(businessRegistrationUrl),
        'storefront-photo': Boolean(storefrontPhotoUrl),
      },
    };
  }

  async applyAction(adminId: string, restaurantId: string, dto: RestaurantActionDto, ipAddress?: string) {
    const rule = TRANSITIONS[dto.action];
    if (rule.needsReason && !dto.reason?.trim()) {
      throw new BadRequestException('Un motif est obligatoire pour cette action.');
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { members: { select: { userId: true } } },
    });
    if (!restaurant) throw new NotFoundException('Restaurant introuvable.');
    if (!rule.from.includes(restaurant.status)) {
      throw new ConflictException(
        `Action impossible : le restaurant est ${restaurant.status}, « ${dto.action} » attend ${rule.from.join(' ou ')}.`,
      );
    }

    // Mise à jour conditionnelle : deux admins qui agissent en même temps ne
    // peuvent pas tous deux appliquer une transition depuis le même état.
    const updated = await this.prisma.restaurant.updateMany({
      where: { id: restaurantId, status: restaurant.status },
      data: {
        status: rule.to,
        statusReason: rule.needsReason ? dto.reason?.trim() : null,
        approvedAt: rule.to === 'APPROVED' && restaurant.approvedAt === null ? new Date() : undefined,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('Le statut vient de changer, actualisez la page.');
    }

    await this.audit.log({
      actorId: adminId,
      action: `RESTAURANT_${dto.action}`,
      targetType: 'RESTAURANT',
      targetId: restaurantId,
      metadata: { from: restaurant.status, to: rule.to, reason: dto.reason?.trim() ?? null },
      ipAddress,
    });

    const type = NOTIFICATION_BY_ACTION[dto.action] ?? 'SYSTEM';
    await Promise.all(
      restaurant.members.map((member) =>
        this.notifications.create(member.userId, type, {
          restaurantId,
          restaurantName: restaurant.name,
          status: rule.to,
          body: dto.reason?.trim() ?? `Statut : ${rule.to}`,
        }),
      ),
    );

    return this.getOne(restaurantId);
  }

  /** Ouvre une pièce justificative — chaque consultation est tracée dans le journal d'audit. */
  async openDocument(adminId: string, restaurantId: string, type: DocumentType, ipAddress?: string) {
    const column = DOCUMENT_TYPES[type];
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ownerIdCardUrl: true, businessRegistrationUrl: true, storefrontPhotoUrl: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant introuvable.');

    await this.audit.log({
      actorId: adminId,
      action: 'RESTAURANT_DOCUMENT_VIEWED',
      targetType: 'RESTAURANT',
      targetId: restaurantId,
      metadata: { type },
      ipAddress,
    });
    return this.documents.open(restaurant[column]);
  }
}
