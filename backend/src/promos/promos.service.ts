import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PromoCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto';

export interface PromoEvaluation {
  promo: PromoCode;
  discount: number;
}

const normalize = (code: string) => code.trim().toUpperCase();

/**
 * Calcule une remise. Le serveur est le SEUL juge : le client n'envoie qu'un code,
 * jamais un montant, et la remise est recalculée à la création de la commande.
 */
@Injectable()
export class PromosService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    codeInput: string,
    userId: string,
    restaurantId: string,
    subtotal: number,
    now = new Date(),
  ): Promise<PromoEvaluation> {
    const promo = await this.prisma.promoCode.findUnique({ where: { code: normalize(codeInput) } });
    // Même message pour « inconnu » et « désactivé » : on ne révèle pas quels codes existent.
    if (!promo || !promo.isActive) throw new BadRequestException('Code promo invalide.');
    if (promo.startsAt && promo.startsAt > now)
      throw new BadRequestException("Ce code n'est pas encore valable.");
    if (promo.expiresAt && promo.expiresAt < now)
      throw new BadRequestException('Ce code promo a expiré.');
    if (promo.restaurantId && promo.restaurantId !== restaurantId) {
      throw new BadRequestException("Ce code n'est pas valable dans ce restaurant.");
    }
    if (promo.minOrderAmount && subtotal < promo.minOrderAmount) {
      throw new BadRequestException(
        `Ce code demande une commande d'au moins ${promo.minOrderAmount} F.`,
      );
    }
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException("Ce code promo n'est plus disponible.");
    }
    if (promo.maxUsesPerUser !== null) {
      const used = await this.prisma.promoRedemption.count({
        where: { promoCodeId: promo.id, userId },
      });
      if (used >= promo.maxUsesPerUser)
        throw new BadRequestException('Vous avez déjà utilisé ce code.');
    }

    let discount =
      promo.discountType === 'PERCENT'
        ? Math.floor((subtotal * promo.discountValue) / 100)
        : promo.discountValue;
    if (promo.maxDiscount !== null) discount = Math.min(discount, promo.maxDiscount);
    // Jamais plus que le sous-total : la remise ne porte pas sur la livraison.
    discount = Math.max(0, Math.min(discount, subtotal));
    return { promo, discount };
  }

  /** Consomme une utilisation, dans la transaction de création de commande (jamais au-delà de maxUses). */
  async consume(
    tx: Prisma.TransactionClient,
    promo: PromoCode,
    userId: string,
    orderId: string,
    discount: number,
  ): Promise<void> {
    const updated = await tx.promoCode.updateMany({
      where: {
        id: promo.id,
        isActive: true,
        ...(promo.maxUses !== null ? { usedCount: { lt: promo.maxUses } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    if (updated.count === 0) throw new ConflictException("Ce code promo vient d'être épuisé.");
    await tx.promoRedemption.create({
      data: { promoCodeId: promo.id, userId, orderId, discountAmount: discount },
    });
  }

  // --- Administration ------------------------------------------------------
  list() {
    return this.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { restaurant: { select: { id: true, name: true } } },
    });
  }

  async create(dto: CreatePromoDto) {
    if (dto.discountType === 'PERCENT' && dto.discountValue > 100) {
      throw new BadRequestException('Un pourcentage ne peut pas dépasser 100.');
    }
    if (dto.startsAt && dto.expiresAt && dto.expiresAt <= dto.startsAt) {
      throw new BadRequestException('La date de fin doit suivre la date de début.');
    }
    if (dto.restaurantId) {
      const exists = await this.prisma.restaurant.findUnique({
        where: { id: dto.restaurantId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Restaurant introuvable.');
    }
    if (
      await this.prisma.promoCode.findUnique({ where: { code: dto.code }, select: { id: true } })
    ) {
      throw new ConflictException('Ce code existe déjà.');
    }
    return this.prisma.promoCode.create({
      data: {
        code: dto.code,
        description: dto.description?.trim() || null,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        maxDiscount: dto.maxDiscount,
        minOrderAmount: dto.minOrderAmount,
        maxUses: dto.maxUses,
        maxUsesPerUser: dto.maxUsesPerUser,
        startsAt: dto.startsAt,
        expiresAt: dto.expiresAt,
        restaurantId: dto.restaurantId,
      },
    });
  }

  async update(id: string, dto: UpdatePromoDto) {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Code promo introuvable.');
    if (dto.maxUses !== undefined && dto.maxUses < existing.usedCount) {
      throw new BadRequestException(`Ce code a déjà été utilisé ${existing.usedCount} fois.`);
    }
    return this.prisma.promoCode.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        description: dto.description?.trim(),
        maxUses: dto.maxUses,
        expiresAt: dto.expiresAt,
      },
    });
  }
}
