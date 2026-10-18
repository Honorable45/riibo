import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { CartsService } from '../carts/carts.service';
import { ConversationsService } from '../conversations/conversations.service';
import { resolveSelection } from '../menu/option-selection.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromosService } from '../promos/promos.service';
import { computeOpenStatus } from '../restaurants/restaurant-hours.util';
import { EventsGateway } from '../websocket/events.gateway';
import { CreateOrderDto, ListOrdersQueryDto } from './dto/order.dto';
import { OrderStateMachineService } from './order-state-machine.service';
import { FINAL_STATUSES } from './order-transitions';

const DEFAULT_PAGE_SIZE = 20;

const ORDER_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  restaurant: {
    select: {
      id: true, name: true, slug: true, logoUrl: true, phone: true, address: true,
      quarter: true, latitude: true, longitude: true,
      members: { select: { userId: true } },
    },
  },
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  delivery: {
    select: {
      status: true, pickupCode: true, deliveryCode: true,
      driver: { select: { userId: true, vehicleType: true, plateNumber: true, rating: true, user: { select: { firstName: true } } } },
    },
  },
  conversations: { select: { id: true, kind: true, closedAt: true, members: { select: { userId: true } } } },
  review: { select: { rating: true, comment: true, reply: true } },
} satisfies Prisma.OrderInclude;

type OrderDetail = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export interface Viewer {
  userId: string;
  role: Role;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartsService,
    private readonly machine: OrderStateMachineService,
    private readonly conversations: ConversationsService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsGateway,
    private readonly promos: PromosService,
  ) {}

  // ---------------------------------------------------------------------------
  // Création
  // ---------------------------------------------------------------------------

  async create(userId: string, dto: CreateOrderDto) {
    // Seul le paiement à la livraison existe pour l'instant : le paiement mobile
    // (TMoney/Flooz) arrive avec le module de paiement, jamais simulé ici.
    if (dto.paymentMethod !== 'CASH_ON_DELIVERY') {
      throw new BadRequestException("Ce moyen de paiement n'est pas encore disponible.");
    }

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        restaurant: { include: { hours: true, closures: { where: { endsAt: { gt: new Date() } } } } },
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            menuItem: {
              include: { optionGroups: { include: { options: true } } },
            },
          },
        },
      },
    });
    if (!cart || !cart.restaurant || cart.items.length === 0) {
      throw new BadRequestException('Votre panier est vide.');
    }
    const restaurant = cart.restaurant;

    if (restaurant.status !== 'APPROVED') {
      throw new ConflictException("Ce restaurant n'accepte pas de commandes pour le moment.");
    }
    const open = computeOpenStatus(
      { isPaused: restaurant.isPaused, hours: restaurant.hours, closures: restaurant.closures },
      new Date(),
    );
    if (!open.isOpen) throw new ConflictException(`${restaurant.name} est fermé pour le moment.`);

    const delivery = await this.resolveDeliveryTarget(userId, dto);

    // Chaque ligne est revalidée et rechiffrée depuis la base.
    const wantedByItem = new Map<string, { name: string; quantity: number; stock: number | null }>();
    const lines = cart.items.map((line) => {
      const resolved = resolveSelection(line.menuItem, line.optionIds, line.quantity);
      const entry = wantedByItem.get(line.menuItemId) ?? {
        name: line.menuItem.name,
        quantity: 0,
        stock: line.menuItem.stock,
      };
      entry.quantity += line.quantity;
      wantedByItem.set(line.menuItemId, entry);
      return { line, resolved };
    });
    for (const [, entry] of wantedByItem) {
      if (entry.stock !== null && entry.quantity > entry.stock) {
        throw new BadRequestException(`« ${entry.name} » : il n'en reste que ${entry.stock}.`);
      }
    }

    const subtotal = lines.reduce((sum, { resolved }) => sum + resolved.lineTotal, 0);
    if (subtotal < restaurant.minOrderAmount) {
      throw new BadRequestException(`Commande minimum : ${restaurant.minOrderAmount} F.`);
    }
    const deliveryFee = dto.deliveryType === 'DELIVERY' ? restaurant.deliveryFee : 0;
    // Remise recalculée ici par le serveur (jamais lue de la requête) ; un code devenu invalide
    // bloque la commande plutôt que de facturer un autre prix que celui affiché.
    let promoEvaluation: Awaited<ReturnType<PromosService['evaluate']>> | null = null;
    if (cart.promoCode) {
      try {
        promoEvaluation = await this.promos.evaluate(cart.promoCode, userId, restaurant.id, subtotal);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw new BadRequestException(`Code promo « ${cart.promoCode} » : ${(error.getResponse() as { message?: string }).message ?? 'invalide'} Retirez-le pour commander.`);
        }
        throw error;
      }
    }
    const discountAmount = promoEvaluation?.discount ?? 0;
    const total = subtotal - discountAmount + deliveryFee;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
    const contactPhone = dto.contactPhone ?? user.phone;

    const order = await this.prisma.$transaction(async (tx) => {
      // Verrou anti-double envoi : on « consomme » les lignes du panier. Si deux
      // requêtes arrivent ensemble, la seconde n'en trouve plus et échoue.
      const consumed = await tx.cartItem.deleteMany({
        where: { id: { in: cart.items.map((item) => item.id) } },
      });
      if (consumed.count !== cart.items.length) {
        throw new ConflictException('Cette commande vient déjà d\'être envoyée.');
      }
      await tx.cart.update({ where: { id: cart.id }, data: { restaurantId: null, promoCode: null } });

      // Décrément conditionnel : jamais de stock négatif, même si deux clients
      // commandent le dernier plat au même instant.
      for (const [menuItemId, entry] of wantedByItem) {
        if (entry.stock === null) continue;
        const decremented = await tx.menuItem.updateMany({
          where: { id: menuItemId, stock: { gte: entry.quantity } },
          data: { stock: { decrement: entry.quantity } },
        });
        if (decremented.count === 0) {
          throw new ConflictException(`« ${entry.name} » vient d'être épuisé.`);
        }
      }

      const created = await tx.order.create({
        data: {
          clientId: userId,
          restaurantId: restaurant.id,
          deliveryType: dto.deliveryType,
          subtotal,
          deliveryFee,
          discountAmount,
          promoCodeId: promoEvaluation?.promo.id,
          total,
          addressId: delivery.addressId,
          deliveryAddress: delivery.address,
          deliveryLandmark: delivery.landmark,
          latitude: delivery.latitude,
          longitude: delivery.longitude,
          contactPhone,
          notes: dto.notes?.trim() || null,
          paymentMethod: dto.paymentMethod,
          items: {
            create: lines.map(({ line, resolved }) => ({
              menuItemId: line.menuItemId,
              name: line.menuItem.name,
              unitPrice: resolved.unitPrice,
              quantity: line.quantity,
              options: resolved.options,
              note: line.note,
              lineTotal: resolved.lineTotal,
            })),
          },
          payments: {
            create: {
              provider: 'cash',
              method: dto.paymentMethod,
              amount: total,
              currency: 'XOF',
            },
          },
        },
        select: { id: true, orderNumber: true },
      });
      if (promoEvaluation) await this.promos.consume(tx, promoEvaluation.promo, userId, created.id, promoEvaluation.discount);
      return created;
    });

    await this.afterCreate(order.id, order.orderNumber, restaurant.id, restaurant.name, userId);
    return this.getOne({ userId, role: 'CLIENT' }, order.id);
  }

  private async resolveDeliveryTarget(userId: string, dto: CreateOrderDto) {
    if (dto.deliveryType === 'PICKUP') {
      return { addressId: null, address: null, landmark: null, latitude: null, longitude: null };
    }
    if (dto.addressId) {
      const saved = await this.prisma.address.findFirst({ where: { id: dto.addressId, userId } });
      if (!saved) throw new NotFoundException('Adresse introuvable.');
      return {
        addressId: saved.id,
        address: saved.quarter ? `${saved.fullAddress} (${saved.quarter})` : saved.fullAddress,
        landmark: saved.landmark,
        latitude: saved.latitude,
        longitude: saved.longitude,
      };
    }
    if (dto.address || (dto.latitude !== undefined && dto.longitude !== undefined)) {
      return {
        addressId: null,
        address: dto.address?.trim() ?? 'Position partagée',
        landmark: dto.landmark?.trim() ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
      };
    }
    throw new BadRequestException('Indiquez où vous livrer.');
  }

  /** Conversation, notification et temps réel : la commande est déjà enregistrée, rien ici ne peut la faire échouer. */
  private async afterCreate(
    orderId: string,
    orderNumber: number,
    restaurantId: string,
    restaurantName: string,
    clientId: string,
  ): Promise<void> {
    try {
      await this.conversations.ensureOrderRestaurantConversation(orderId);
      const members = await this.prisma.restaurantMember.findMany({
        where: { restaurantId },
        select: { userId: true },
      });
      const restaurantUserIds = members.map((member) => member.userId);
      this.events.emitToUsers([clientId, ...restaurantUserIds], 'order:new', {
        orderId,
        orderNumber,
        status: 'PENDING',
      });
      await Promise.all(
        restaurantUserIds.map((userId) =>
          this.notifications.create(userId, 'ORDER_NEW', { orderId, orderNumber, restaurantName }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Suites de la commande ${orderId} en échec : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  async listMine(userId: string, query: ListOrdersQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.OrderWhereInput = {
      clientId: userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.scope === 'active' ? { status: { notIn: [...FINAL_STATUSES] } } : {}),
      ...(query.scope === 'past' ? { status: { in: [...FINAL_STATUSES] } } : {}),
    };
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true, orderNumber: true, status: true, total: true, deliveryType: true, createdAt: true,
        restaurant: { select: { id: true, name: true, logoUrl: true } },
        items: { select: { name: true, quantity: true }, take: 3, orderBy: { id: 'asc' } },
        _count: { select: { items: true } },
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(({ _count, ...order }) => ({ ...order, itemCount: _count.items })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  /** Détail d'une commande, filtré selon QUI regarde (client, restaurant, livreur assigné, admin). */
  async getOne(viewer: Viewer, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Commande introuvable.');

    const relation = this.relationOf(viewer, order);
    if (!relation) throw new NotFoundException('Commande introuvable.');
    return this.toDetail(order, relation, viewer.userId);
  }

  private relationOf(viewer: Viewer, order: OrderDetail): 'CLIENT' | 'RESTAURANT' | 'DRIVER' | 'ADMIN' | null {
    if (viewer.role === 'ADMIN') return 'ADMIN';
    if (order.clientId === viewer.userId) return 'CLIENT';
    if (order.restaurant.members.some((member) => member.userId === viewer.userId)) return 'RESTAURANT';
    if (order.delivery?.driver?.userId === viewer.userId) return 'DRIVER';
    return null;
  }

  private toDetail(order: OrderDetail, relation: 'CLIENT' | 'RESTAURANT' | 'DRIVER' | 'ADMIN', viewerId: string) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryType: order.deliveryType,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discountAmount: order.discountAmount,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      review: order.review,
      notes: order.notes,
      rejectionReason: order.rejectionReason,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt,
      acceptedAt: order.acceptedAt,
      readyAt: order.readyAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        options: item.options,
        note: item.note,
      })),
      restaurant: {
        id: order.restaurant.id,
        name: order.restaurant.name,
        slug: order.restaurant.slug,
        logoUrl: order.restaurant.logoUrl,
        phone: order.restaurant.phone,
        address: order.restaurant.address,
        quarter: order.restaurant.quarter,
        latitude: order.restaurant.latitude,
        longitude: order.restaurant.longitude,
      },
      // Le restaurant voit qui commande (pour l'appeler) mais PAS l'adresse
      // exacte : minimisation des données, le livreur en a besoin, pas la cuisine.
      client:
        relation === 'CLIENT'
          ? null
          : { id: order.client.id, firstName: order.client.firstName, phone: order.contactPhone ?? order.client.phone },
      deliveryTarget:
        relation === 'RESTAURANT'
          ? null
          : {
              address: order.deliveryAddress,
              landmark: order.deliveryLandmark,
              latitude: order.latitude,
              longitude: order.longitude,
              contactPhone: order.contactPhone,
            },
      // Course : le livreur (prénom, véhicule) est visible de tous ; les CODES anti-fraude
      // ne le sont que de la bonne partie — le restaurant lit le code de retrait au livreur,
      // le client lit le code de remise au livreur. Le livreur ne voit JAMAIS les deux.
      delivery: order.delivery
        ? {
            status: order.delivery.status,
            driver: order.delivery.driver
              ? {
                  firstName: order.delivery.driver.user.firstName,
                  vehicleType: order.delivery.driver.vehicleType,
                  plateNumber: order.delivery.driver.plateNumber,
                  rating: order.delivery.driver.rating,
                }
              : null,
            pickupCode: relation === 'RESTAURANT' ? order.delivery.pickupCode : null,
            deliveryCode: relation === 'CLIENT' ? order.delivery.deliveryCode : null,
          }
        : null,
      // Conversations auxquelles CE viewer a accès (un admin voit les siennes seulement).
      conversations: order.conversations
        .filter((conversation) => conversation.members.some((member) => member.userId === viewerId))
        .map(({ id, kind, closedAt }) => ({ id, kind, isClosed: closedAt !== null })),
    };
  }

  // ---------------------------------------------------------------------------
  // Actions client
  // ---------------------------------------------------------------------------

  cancel(userId: string, orderId: string, reason?: string) {
    return this.machine.apply(orderId, 'CANCEL', { kind: 'CLIENT', userId }, { reason });
  }

  /** « Commander à nouveau » : remplit le panier avec les plats encore disponibles, signale les autres. */
  async reorder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, clientId: userId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');

    await this.carts.clear(userId);
    const skipped: Array<{ name: string; reason: string }> = [];
    for (const item of order.items) {
      if (!item.menuItemId) {
        skipped.push({ name: item.name, reason: "Ce plat n'existe plus." });
        continue;
      }
      const optionIds = (item.options as Array<{ id?: string }>).flatMap((option) => (option.id ? [option.id] : []));
      try {
        await this.carts.addItem(userId, {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          optionIds,
          note: item.note ?? undefined,
        });
      } catch (error) {
        const body = error instanceof Error && 'getResponse' in error ? (error as { getResponse(): unknown }).getResponse() : null;
        const message = typeof body === 'object' && body !== null && 'message' in body ? String((body as { message: unknown }).message) : 'Indisponible.';
        skipped.push({ name: item.name, reason: message });
      }
    }
    return { cart: await this.carts.getCart(userId), skipped };
  }
}
