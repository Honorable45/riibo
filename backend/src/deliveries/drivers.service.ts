import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateDocumentsService } from '../uploads/private-documents.service';
import { EventsGateway } from '../websocket/events.gateway';
import { ACTIVE_DELIVERY_STATUSES } from './delivery.constants';
import { UpdateDriverDto } from './dto/driver.dto';
import { DRIVER_LOCATION_STORE } from './deliveries.tokens';
import type { DriverLocationStore } from './driver-location.store';

/** Types de pièces → colonne de référence (privée) en base. */
export const DRIVER_DOCUMENT_TYPES = {
  'selfie-with-id': 'selfieWithIdUrl',
  'id-card': 'idCardUrl',
  'vehicle-registration': 'vehicleRegistrationUrl',
  'driving-license': 'drivingLicenseUrl',
  'vehicle-photo': 'vehiclePhotoUrl',
} as const;
export type DriverDocumentType = keyof typeof DRIVER_DOCUMENT_TYPES;

function startOfTodayLome(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: PrivateDocumentsService,
    private readonly audit: AuditService,
    private readonly events: EventsGateway,
    @Inject(DRIVER_LOCATION_STORE) private readonly locations: DriverLocationStore,
  ) {}

  async getMe(userId: string) {
    const profile = await this.requireProfile(userId);
    const since = startOfTodayLome();
    const [today, active] = await Promise.all([
      this.prisma.delivery.aggregate({
        where: { driverId: profile.id, status: 'DELIVERED', deliveredAt: { gte: since } },
        _count: { _all: true },
        _sum: { deliveryFee: true },
      }),
      this.prisma.delivery.findFirst({
        where: { driverId: profile.id, status: { in: ACTIVE_DELIVERY_STATUSES } },
        select: { id: true },
      }),
    ]);

    return {
      id: profile.id,
      status: profile.status,
      statusReason: profile.statusReason,
      vehicleType: profile.vehicleType,
      plateNumber: profile.plateNumber,
      vehicleBrand: profile.vehicleBrand,
      vehicleColor: profile.vehicleColor,
      mobileMoneyNumber: profile.mobileMoneyNumber,
      isOnline: profile.isOnline,
      isAvailable: profile.isAvailable,
      rating: profile.rating,
      ratingCount: profile.ratingCount,
      totalDeliveries: profile.totalDeliveries,
      today: { deliveries: today._count._all, earnings: today._sum.deliveryFee ?? 0 },
      activeDeliveryId: active?.id ?? null,
      // Jamais les références des pièces : seulement leur présence.
      documents: {
        'selfie-with-id': Boolean(profile.selfieWithIdUrl),
        'id-card': Boolean(profile.idCardUrl),
        'vehicle-registration': Boolean(profile.vehicleRegistrationUrl),
        'driving-license': Boolean(profile.drivingLicenseUrl),
        'vehicle-photo': Boolean(profile.vehiclePhotoUrl),
      },
    };
  }

  async update(userId: string, dto: UpdateDriverDto) {
    const profile = await this.requireProfile(userId);
    await this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: {
        vehicleType: dto.vehicleType,
        plateNumber: dto.plateNumber?.trim().toUpperCase(),
        vehicleBrand: dto.vehicleBrand?.trim(),
        vehicleColor: dto.vehicleColor?.trim(),
        mobileMoneyNumber: dto.mobileMoneyNumber,
      },
    });
    return this.getMe(userId);
  }

  async uploadDocument(userId: string, type: DriverDocumentType, file: Express.Multer.File | undefined) {
    const profile = await this.requireProfile(userId);
    const column = DRIVER_DOCUMENT_TYPES[type];
    const reference = await this.documents.save(file, `drivers/${profile.id}`);
    await this.prisma.driverProfile.update({ where: { id: profile.id }, data: { [column]: reference } });
    await this.documents.delete(profile[column]);
    return this.getMe(userId);
  }

  /** PENDING ou REJECTED → IN_REVIEW, avec les pièces indispensables. */
  async submitForReview(userId: string, ipAddress?: string) {
    const profile = await this.requireProfile(userId);
    if (profile.status !== 'PENDING' && profile.status !== 'REJECTED') {
      throw new ConflictException('Votre dossier est déjà en cours de vérification ou validé.');
    }
    const missing: string[] = [];
    if (!profile.idCardUrl) missing.push("Pièce d'identité");
    if (!profile.selfieWithIdUrl) missing.push("Selfie avec la pièce d'identité");
    if (profile.vehicleType !== 'VELO' && !profile.plateNumber) missing.push("Plaque d'immatriculation");
    if (missing.length > 0) throw new BadRequestException(`Dossier incomplet : ${missing.join(', ')}.`);

    await this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: { status: 'IN_REVIEW', statusReason: null },
    });
    await this.audit.log({
      actorId: userId,
      action: 'DRIVER_SUBMITTED',
      targetType: 'DRIVER',
      targetId: profile.id,
      ipAddress,
    });
    return this.getMe(userId);
  }

  /** En ligne = joignable pour de nouvelles offres. Hors ligne = plus aucune position conservée. */
  async setAvailability(userId: string, online: boolean) {
    const profile = await this.requireApproved(userId);
    const active = await this.prisma.delivery.findFirst({
      where: { driverId: profile.id, status: { in: ACTIVE_DELIVERY_STATUSES } },
      select: { id: true },
    });

    if (!online && active) {
      throw new ConflictException('Terminez ou libérez votre livraison en cours avant de vous mettre hors ligne.');
    }
    await this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: online ? { isOnline: true, isAvailable: !active } : { isOnline: false, isAvailable: false },
    });
    if (!online) await this.locations.remove(profile.id);
    return this.getMe(userId);
  }

  /**
   * Reçoit la position du livreur. Elle n'est acceptée que s'il est EN LIGNE
   * (jamais de pistage d'un livreur hors service), vit uniquement dans Redis
   * avec un TTL court, et n'est diffusée qu'au client de SA course en cours.
   */
  async updateLocation(userId: string, latitude: number, longitude: number) {
    const profile = await this.requireApproved(userId);
    if (!profile.isOnline) {
      throw new ConflictException('Passez en ligne pour partager votre position.');
    }
    await this.locations.set(profile.id, latitude, longitude);

    const active = await this.prisma.delivery.findFirst({
      where: { driverId: profile.id, status: { in: ACTIVE_DELIVERY_STATUSES } },
      select: { id: true, orderId: true, order: { select: { clientId: true } } },
    });
    if (active) {
      this.events.emitToUser(active.order.clientId, 'delivery:location', {
        orderId: active.orderId,
        deliveryId: active.id,
        latitude,
        longitude,
        at: new Date().toISOString(),
      });
    }
    return { ok: true, sharing: Boolean(active) };
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil livreur introuvable.');
    return profile;
  }

  async requireApproved(userId: string) {
    const profile = await this.requireProfile(userId);
    if (profile.status !== 'APPROVED') {
      throw new ConflictException("Votre compte livreur n'est pas encore validé.");
    }
    return profile;
  }
}
