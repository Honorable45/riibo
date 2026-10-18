import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_LINE_QUANTITY, resolveSelection } from '../menu/option-selection.util';
import { computeOpenStatus } from '../restaurants/restaurant-hours.util';
import { PromosService } from '../promos/promos.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

const MAX_LINES = 30;

export const CART_INCLUDE = {
  restaurant: { include: { hours: true, closures: { where: { endsAt: { gt: new Date(0) } } } } },
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      menuItem: {
        include: {
          optionGroups: {
            orderBy: { position: 'asc' },
            include: { options: { orderBy: { position: 'asc' } } },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithRelations = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

/** Texte lisible d'une BadRequestException (message simple ou objet de validation). */
function messageOf(error: BadRequestException): string {
  const body = error.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: string | string[] }).message;
  return Array.isArray(message) ? message.join(' ') : (message ?? 'Article indisponible.');
}

const sameOptions = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((id, index) => id === [...b].sort()[index]);

@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promos: PromosService,
  ) {}

  /** Aperçu chiffré du panier — TOUJOURS recalculé depuis les prix actuels de la base. */
  async getCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        ...CART_INCLUDE,
        restaurant: { include: { hours: true, closures: { where: { endsAt: { gt: new Date() } } } } },
      },
    });
    return this.withPromo(userId, cart, this.toView(cart));
  }

  /** Applique un code promo au panier : validé maintenant, revalidé à la commande. */
  async applyPromo(userId: string, code: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { ...CART_INCLUDE, restaurant: { include: { hours: true, closures: { where: { endsAt: { gt: new Date() } } } } } },
    });
    const view = this.toView(cart);
    if (!cart || !view.restaurant) throw new BadRequestException("Ajoutez d'abord des plats à votre panier.");
    const { promo } = await this.promos.evaluate(code, userId, view.restaurant.id, view.subtotal);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { promoCode: promo.code } });
    return this.withPromo(userId, { ...cart, promoCode: promo.code }, view);
  }

  async removePromo(userId: string) {
    await this.prisma.cart.updateMany({ where: { userId }, data: { promoCode: null } });
    return this.getCart(userId);
  }

  /** Ajoute la remise au aperçu ; un code devenu invalide est signalé (et ignoré) plutôt que de casser le panier. */
  private async withPromo(userId: string, cart: CartWithRelations | null, view: ReturnType<CartsService['toView']>) {
    const base = { ...view, discount: 0, promo: null as { code: string; discountAmount: number } | null, promoIssue: null as string | null };
    if (!cart?.promoCode || !view.restaurant) return base;
    try {
      const { promo, discount } = await this.promos.evaluate(cart.promoCode, userId, view.restaurant.id, view.subtotal);
      return { ...base, discount, promo: { code: promo.code, discountAmount: discount }, total: view.subtotal - discount + view.deliveryFee };
    } catch (error) {
      return { ...base, promoIssue: error instanceof BadRequestException ? messageOf(error) : 'Code promo indisponible.' };
    }
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const optionIds = dto.optionIds ?? [];
    const note = dto.note?.trim() || null;

    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: dto.menuItemId, deletedAt: null, restaurant: { status: 'APPROVED' } },
      include: {
        optionGroups: { include: { options: true } },
      },
    });
    if (!menuItem) throw new NotFoundException('Plat introuvable.');

    const existing = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });

    if (existing?.restaurantId && existing.restaurantId !== menuItem.restaurantId && existing.items.length > 0) {
      if (!dto.replaceCart) {
        // `code` permet au client d'afficher « Vider le panier et commander ici ? ».
        throw new ConflictException({
          code: 'CART_OTHER_RESTAURANT',
          message: 'Votre panier contient des plats d\'un autre restaurant.',
        });
      }
      await this.prisma.cartItem.deleteMany({ where: { cartId: existing.id } });
    }

    const sameLine = existing?.restaurantId === menuItem.restaurantId
      ? existing.items.find(
          (line) =>
            line.menuItemId === menuItem.id &&
            sameOptions(line.optionIds, optionIds) &&
            (line.note ?? null) === note,
        )
      : undefined;

    const quantity = Math.min(MAX_LINE_QUANTITY, (sameLine?.quantity ?? 0) + dto.quantity);
    resolveSelection(menuItem, optionIds, quantity); // valide (options, stock, limites)

    if (!sameLine && (existing?.items.length ?? 0) >= MAX_LINES) {
      throw new BadRequestException('Panier plein (30 lignes maximum).');
    }

    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.upsert({
        where: { userId },
        create: { userId, restaurantId: menuItem.restaurantId },
        update: { restaurantId: menuItem.restaurantId },
      });
      if (sameLine) {
        await tx.cartItem.update({ where: { id: sameLine.id }, data: { quantity } });
      } else {
        await tx.cartItem.create({
          data: { cartId: cart.id, menuItemId: menuItem.id, quantity, optionIds, note },
        });
      }
    });
    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const line = await this.requireLine(userId, itemId);
    const optionIds = dto.optionIds ?? line.optionIds;
    const quantity = dto.quantity ?? line.quantity;

    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: line.menuItemId, deletedAt: null },
      include: { optionGroups: { include: { options: true } } },
    });
    if (!menuItem) throw new NotFoundException('Ce plat n\'existe plus.');
    resolveSelection(menuItem, optionIds, quantity);

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity, optionIds, note: dto.note === undefined ? undefined : dto.note.trim() || null },
    });
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const line = await this.requireLine(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    // Panier vide : plus rattaché à un restaurant.
    const remaining = await this.prisma.cartItem.count({ where: { cartId: line.cartId } });
    if (remaining === 0) await this.prisma.cart.update({ where: { id: line.cartId }, data: { restaurantId: null } });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await this.prisma.$transaction([
        this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),
        this.prisma.cart.update({ where: { id: cart.id }, data: { restaurantId: null, promoCode: null } }),
      ]);
    }
    return this.getCart(userId);
  }

  /** 404 si la ligne n'appartient pas au panier de CET utilisateur. */
  private async requireLine(userId: string, itemId: string) {
    const line = await this.prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
    if (!line) throw new NotFoundException('Article introuvable dans votre panier.');
    return line;
  }

  private toView(cart: CartWithRelations | null) {
    if (!cart || cart.items.length === 0 || !cart.restaurant) {
      return {
        restaurant: null,
        items: [],
        subtotal: 0,
        deliveryFee: 0,
        total: 0,
        canCheckout: false,
        blockers: [] as string[],
      };
    }

    const restaurant = cart.restaurant;
    const open = computeOpenStatus(
      { isPaused: restaurant.isPaused, hours: restaurant.hours, closures: restaurant.closures },
      new Date(),
    );

    // Stock cumulé par plat : deux lignes du même plat se partagent le stock.
    const wantedByItem = new Map<string, number>();
    for (const line of cart.items) {
      wantedByItem.set(line.menuItemId, (wantedByItem.get(line.menuItemId) ?? 0) + line.quantity);
    }

    let subtotal = 0;
    let hasIssue = false;
    const items = cart.items.map((line) => {
      let issue: string | null = null;
      let options: Array<{ id: string; name: string; priceDelta: number }> = [];
      let unitPrice = line.menuItem.price;
      try {
        const resolved = resolveSelection(line.menuItem, line.optionIds, line.quantity);
        options = resolved.options;
        unitPrice = resolved.unitPrice;
        const wanted = wantedByItem.get(line.menuItemId) ?? line.quantity;
        if (line.menuItem.stock !== null && wanted > line.menuItem.stock) {
          issue = `« ${line.menuItem.name} » : il n'en reste que ${line.menuItem.stock}.`;
        }
      } catch (error) {
        issue = error instanceof BadRequestException ? messageOf(error) : 'Article indisponible.';
      }
      if (issue) hasIssue = true;
      else subtotal += unitPrice * line.quantity;
      return {
        id: line.id,
        menuItemId: line.menuItemId,
        name: line.menuItem.name,
        imageUrl: line.menuItem.imageUrl,
        quantity: line.quantity,
        note: line.note,
        options,
        unitPrice,
        lineTotal: unitPrice * line.quantity,
        issue,
      };
    });

    const blockers: string[] = [];
    if (!open.isOpen) blockers.push(`${restaurant.name} est fermé pour le moment.`);
    if (hasIssue) blockers.push('Certains articles ne sont plus disponibles.');
    if (subtotal < restaurant.minOrderAmount) {
      blockers.push(`Commande minimum : ${restaurant.minOrderAmount} F.`);
    }

    return {
      restaurant: {
        id: restaurant.id,
        slug: restaurant.slug,
        name: restaurant.name,
        logoUrl: restaurant.logoUrl,
        minOrderAmount: restaurant.minOrderAmount,
        isOpen: open.isOpen,
        closedReason: open.reason,
      },
      items,
      subtotal,
      // Frais forfaitaires du restaurant ; ils passent à 0 si le client retire sur place.
      deliveryFee: restaurant.deliveryFee,
      total: subtotal + restaurant.deliveryFee,
      canCheckout: blockers.length === 0,
      blockers,
    };
  }
}
