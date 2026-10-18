import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RestaurantMemberRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../uploads/media.service';
import { PrivateDocumentsService } from '../uploads/private-documents.service';
import { CreateClosureDto } from './dto/create-closure.dto';
import { SetHoursDto } from './dto/set-hours.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { hasOverlap } from './restaurant-hours.util';

/** Types de pièces justificatives → colonne de référence (privée) en base. */
export const DOCUMENT_TYPES = {
  'owner-id-card': 'ownerIdCardUrl',
  'business-registration': 'businessRegistrationUrl',
  'storefront-photo': 'storefrontPhotoUrl',
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const IMAGE_KINDS = { logo: 'logoUrl', cover: 'coverUrl' } as const;
export type ImageKind = keyof typeof IMAGE_KINDS;

/** Champs qu'un membre STAFF (non propriétaire) a le droit de modifier. */
const STAFF_EDITABLE_FIELDS = new Set(['isPaused']);

@Injectable()
export class RestaurantOwnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly documents: PrivateDocumentsService,
    private readonly audit: AuditService,
  ) {}

  async getOne(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        categories: { select: { id: true, slug: true, name: true, icon: true } },
        hours: { orderBy: [{ dayOfWeek: 'asc' }, { opensAt: 'asc' }] },
        closures: { where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } },
      },
    });
    if (!restaurant) throw new NotFoundException('Restaurant introuvable.');

    return {
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      description: restaurant.description,
      phone: restaurant.phone,
      address: restaurant.address,
      city: restaurant.city,
      quarter: restaurant.quarter,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      logoUrl: restaurant.logoUrl,
      coverUrl: restaurant.coverUrl,
      status: restaurant.status,
      statusReason: restaurant.statusReason,
      deliveryFee: restaurant.deliveryFee,
      minOrderAmount: restaurant.minOrderAmount,
      prepTimeMin: restaurant.prepTimeMin,
      prepTimeMax: restaurant.prepTimeMax,
      isPaused: restaurant.isPaused,
      paymentAccountNumber: restaurant.paymentAccountNumber,
      rating: restaurant.rating,
      reviewCount: restaurant.reviewCount,
      categories: restaurant.categories,
      hours: restaurant.hours.map(({ dayOfWeek, opensAt, closesAt }) => ({
        dayOfWeek,
        opensAt,
        closesAt,
      })),
      closures: restaurant.closures.map(({ id, startsAt, endsAt, reason }) => ({
        id,
        startsAt,
        endsAt,
        reason,
      })),
      // Jamais les références des pièces : seulement leur présence.
      documents: {
        'owner-id-card': Boolean(restaurant.ownerIdCardUrl),
        'business-registration': Boolean(restaurant.businessRegistrationUrl),
        'storefront-photo': Boolean(restaurant.storefrontPhotoUrl),
      },
    };
  }

  async update(restaurantId: string, memberRole: RestaurantMemberRole, dto: UpdateRestaurantDto) {
    const provided = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (memberRole !== 'OWNER' && provided.some((key) => !STAFF_EDITABLE_FIELDS.has(key))) {
      throw new ForbiddenException('Seul le propriétaire peut modifier ces informations.');
    }

    const current = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });

    const prepMin = dto.prepTimeMin ?? current.prepTimeMin;
    const prepMax = dto.prepTimeMax ?? current.prepTimeMax;
    if (prepMin > prepMax) {
      throw new BadRequestException('Le délai minimum dépasse le délai maximum.');
    }
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('Latitude et longitude vont ensemble.');
    }

    let categories: Prisma.RestaurantUpdateInput['categories'];
    if (dto.cuisineCategoryIds) {
      const found = await this.prisma.restaurantCategory.count({
        where: { id: { in: dto.cuisineCategoryIds }, isActive: true },
      });
      if (found !== new Set(dto.cuisineCategoryIds).size) {
        throw new BadRequestException('Catégorie de cuisine inconnue.');
      }
      categories = { set: dto.cuisineCategoryIds.map((id) => ({ id })) };
    }

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        phone: dto.phone,
        address: dto.address?.trim(),
        city: dto.city?.trim(),
        quarter: dto.quarter?.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        deliveryFee: dto.deliveryFee,
        minOrderAmount: dto.minOrderAmount,
        prepTimeMin: dto.prepTimeMin,
        prepTimeMax: dto.prepTimeMax,
        isPaused: dto.isPaused,
        paymentAccountNumber: dto.paymentAccountNumber,
        categories,
      },
    });
    return this.getOne(restaurantId);
  }

  async setImage(restaurantId: string, kind: ImageKind, file: Express.Multer.File | undefined) {
    const column = IMAGE_KINDS[kind];
    const current = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const url = await this.media.savePublicImage(file, 'restaurants');
    await this.prisma.restaurant.update({ where: { id: restaurantId }, data: { [column]: url } });
    await this.media.deleteByUrl(current[column]);
    return { [column]: url };
  }

  /** Remplace tous les horaires : un seul état cohérent, jamais de plages orphelines. */
  async setHours(restaurantId: string, dto: SetHoursDto) {
    const byDay = new Map<number, Array<{ opensAt: string; closesAt: string }>>();
    for (const range of dto.ranges) {
      byDay.set(range.dayOfWeek, [...(byDay.get(range.dayOfWeek) ?? []), range]);
    }
    for (const [day, ranges] of byDay) {
      if (hasOverlap(ranges)) {
        throw new BadRequestException(`Des plages horaires se chevauchent (jour ${day}).`);
      }
    }

    await this.prisma.$transaction([
      this.prisma.restaurantHours.deleteMany({ where: { restaurantId } }),
      this.prisma.restaurantHours.createMany({
        data: dto.ranges.map(({ dayOfWeek, opensAt, closesAt }) => ({
          restaurantId,
          dayOfWeek,
          opensAt,
          closesAt,
        })),
      }),
    ]);
    return this.getOne(restaurantId);
  }

  async addClosure(restaurantId: string, dto: CreateClosureDto) {
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('La fin de la fermeture doit suivre son début.');
    }
    const count = await this.prisma.restaurantClosure.count({
      where: { restaurantId, endsAt: { gt: new Date() } },
    });
    if (count >= 30) throw new ConflictException('Trop de fermetures à venir.');

    await this.prisma.restaurantClosure.create({
      data: { restaurantId, startsAt: dto.startsAt, endsAt: dto.endsAt, reason: dto.reason },
    });
    return this.getOne(restaurantId);
  }

  async removeClosure(restaurantId: string, closureId: string) {
    const removed = await this.prisma.restaurantClosure.deleteMany({
      where: { id: closureId, restaurantId },
    });
    if (removed.count === 0) throw new NotFoundException('Fermeture introuvable.');
    return this.getOne(restaurantId);
  }

  // ---------------------------------------------------------------------------
  // Validation par un admin
  // ---------------------------------------------------------------------------

  async uploadDocument(
    restaurantId: string,
    type: DocumentType,
    file: Express.Multer.File | undefined,
  ) {
    const column = DOCUMENT_TYPES[type];
    const current = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const reference = await this.documents.save(file, `restaurants/${restaurantId}`);
    await this.prisma.restaurant.update({ where: { id: restaurantId }, data: { [column]: reference } });
    await this.documents.delete(current[column]);
    return this.getOne(restaurantId);
  }

  /**
   * Envoie le dossier à l'équipe (PENDING ou REJECTED → IN_REVIEW). Pièces
   * indispensables : pièce d'identité du gérant, photo de la devanture, position
   * GPS (nécessaire à la distance et au dispatch des livreurs).
   */
  async submitForReview(restaurantId: string, actorId: string, ipAddress?: string) {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    if (restaurant.status !== 'PENDING' && restaurant.status !== 'REJECTED') {
      throw new ConflictException('Le dossier est déjà en cours de vérification ou validé.');
    }

    const missing: string[] = [];
    if (!restaurant.ownerIdCardUrl) missing.push('Pièce d\'identité');
    if (!restaurant.storefrontPhotoUrl) missing.push('Photo de la devanture');
    if (restaurant.latitude === null || restaurant.longitude === null) missing.push('Position sur la carte');
    if (missing.length > 0) {
      throw new BadRequestException(`Dossier incomplet : ${missing.join(', ')}.`);
    }

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { status: 'IN_REVIEW', statusReason: null },
    });
    await this.audit.log({
      actorId,
      action: 'RESTAURANT_SUBMITTED',
      targetType: 'RESTAURANT',
      targetId: restaurantId,
      ipAddress,
    });
    return this.getOne(restaurantId);
  }
}
