import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ACTIVE_DELIVERY_STATUSES } from '../deliveries/delivery.constants';
import { DRIVER_LOCATION_STORE } from '../deliveries/deliveries.tokens';
import type { DriverLocationStore } from '../deliveries/driver-location.store';
import { DRIVER_DOCUMENT_TYPES, DriverDocumentType } from '../deliveries/drivers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateDocumentsService } from '../uploads/private-documents.service';
import { APPROVAL_TRANSITIONS } from './approval-transitions';
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

@Injectable()
export class AdminDriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly documents: PrivateDocumentsService,
    @Inject(DRIVER_LOCATION_STORE) private readonly locations: DriverLocationStore,
  ) {}

  async list(query: ListAdminRestaurantsQueryDto) {
    const limit = query.limit ?? 30;
    const where: Prisma.DriverProfileWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { user: { OR: [{ firstName: { contains: query.q.trim(), mode: 'insensitive' } }, { phone: { contains: query.q.trim() } }] } }
        : {}),
    };
    const rows = await this.prisma.driverProfile.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true, status: true, statusReason: true, vehicleType: true, plateNumber: true, isOnline: true,
        totalDeliveries: true, rating: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async getOne(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, isActive: true } } },
    });
    if (!driver) throw new NotFoundException('Livreur introuvable.');
    const {
      selfieWithIdUrl, idCardUrl, vehicleRegistrationUrl, drivingLicenseUrl, vehiclePhotoUrl, ...rest
    } = driver;
    return {
      ...rest,
      documents: {
        'selfie-with-id': Boolean(selfieWithIdUrl),
        'id-card': Boolean(idCardUrl),
        'vehicle-registration': Boolean(vehicleRegistrationUrl),
        'driving-license': Boolean(drivingLicenseUrl),
        'vehicle-photo': Boolean(vehiclePhotoUrl),
      },
    };
  }

  async applyAction(adminId: string, driverId: string, dto: RestaurantActionDto, ipAddress?: string) {
    const rule = APPROVAL_TRANSITIONS[dto.action];
    if (rule.needsReason && !dto.reason?.trim()) {
      throw new BadRequestException('Un motif est obligatoire pour cette action.');
    }
    const driver = await this.prisma.driverProfile.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Livreur introuvable.');
    if (!rule.from.includes(driver.status)) {
      throw new ConflictException(
        `Action impossible : le livreur est ${driver.status}, « ${dto.action} » attend ${rule.from.join(' ou ')}.`,
      );
    }
    if (dto.action === 'SUSPEND') {
      // On ne coupe pas un livreur au milieu d'une livraison : la commande resterait sans porteur.
      const active = await this.prisma.delivery.findFirst({
        where: { driverId, status: { in: ACTIVE_DELIVERY_STATUSES } },
        select: { id: true },
      });
      if (active) throw new ConflictException('Ce livreur a une livraison en cours : attendez sa fin.');
    }

    const updated = await this.prisma.driverProfile.updateMany({
      where: { id: driverId, status: driver.status },
      data: {
        status: rule.to,
        statusReason: rule.needsReason ? dto.reason?.trim() : null,
        // Un livreur non approuvé n'est jamais joignable pour une offre.
        ...(rule.to !== 'APPROVED' ? { isOnline: false, isAvailable: false } : {}),
      },
    });
    if (updated.count === 0) throw new ConflictException('Le statut vient de changer, actualisez la page.');
    if (rule.to !== 'APPROVED') await this.locations.remove(driverId);

    await this.audit.log({
      actorId: adminId,
      action: `DRIVER_${dto.action}`,
      targetType: 'DRIVER',
      targetId: driverId,
      metadata: { from: driver.status, to: rule.to, reason: dto.reason?.trim() ?? null },
      ipAddress,
    });
    await this.notifications.create(driver.userId, NOTIFICATION_BY_ACTION[dto.action] ?? 'SYSTEM', {
      driverId,
      status: rule.to,
      body: dto.reason?.trim() ?? `Statut : ${rule.to}`,
    });
    return this.getOne(driverId);
  }

  async openDocument(adminId: string, driverId: string, type: DriverDocumentType, ipAddress?: string) {
    const column = DRIVER_DOCUMENT_TYPES[type];
    const driver = await this.prisma.driverProfile.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Livreur introuvable.');
    await this.audit.log({
      actorId: adminId,
      action: 'DRIVER_DOCUMENT_VIEWED',
      targetType: 'DRIVER',
      targetId: driverId,
      metadata: { type },
      ipAddress,
    });
    return this.documents.open(driver[column]);
  }
}
