import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DeliveryType, NotificationType, OrderStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../websocket/events.gateway';
import { ActorKind, findTransition, OrderAction } from './order-transitions';

export interface OrderActor {
  kind: ActorKind;
  /** Requis pour CLIENT, RESTAURANT, DRIVER et ADMIN ; absent pour SYSTEM. */
  userId?: string;
}

export interface ApplyOptions {
  reason?: string;
  ipAddress?: string;
}

/** Ce que reçoit un observateur (module livraison) après une transition réussie. */
export interface TransitionEvent {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  deliveryType: DeliveryType;
  actor: OrderActor;
}
export type TransitionHook = (event: TransitionEvent) => Promise<void>;

const NOTIFICATION_BY_STATUS: Partial<Record<OrderStatus, NotificationType>> = {
  ACCEPTED: 'ORDER_ACCEPTED',
  REJECTED: 'ORDER_REJECTED',
  PREPARING: 'ORDER_PREPARING',
  READY: 'ORDER_READY',
  ASSIGNED: 'ORDER_ASSIGNED',
  PICKED_UP: 'ORDER_PICKED_UP',
  ON_THE_WAY: 'ORDER_ON_THE_WAY',
  DELIVERED: 'ORDER_DELIVERED',
  CANCELLED: 'ORDER_CANCELLED',
};

const EVENT_BY_STATUS: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'order:accepted',
  REJECTED: 'order:rejected',
  PREPARING: 'order:preparing',
  READY: 'order:ready',
  ASSIGNED: 'order:assigned',
  PICKED_UP: 'order:picked-up',
  ON_THE_WAY: 'order:on-the-way',
  DELIVERED: 'order:delivered',
  CANCELLED: 'order:cancelled',
};

const LOAD = {
  restaurant: { select: { id: true, name: true, status: true, members: { select: { userId: true } } } },
  delivery: { select: { driver: { select: { userId: true } } } },
  items: { select: { menuItemId: true, quantity: true } },
} satisfies Prisma.OrderInclude;

/**
 * SEUL endroit qui écrit `Order.status`. Chaque changement passe par ici, avec :
 *  1. la règle de transition (acteur autorisé + état de départ valide),
 *  2. la vérification que l'acteur est bien PARTIE À CETTE COMMANDE,
 *  3. une mise à jour conditionnelle atomique (deux actions concurrentes sur le
 *     même état ne peuvent pas réussir toutes les deux),
 *  4. les effets de bord (stock, notifications, temps réel, audit).
 */
@Injectable()
export class OrderStateMachineService {
  private readonly logger = new Logger(OrderStateMachineService.name);
  private readonly hooks: TransitionHook[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsGateway,
    private readonly audit: AuditService,
  ) {}

  /**
   * Permet à un autre module (livraison) de réagir à une transition SANS que la
   * machine dépende de lui : créer la course quand la préparation commence,
   * annuler la course quand la commande est annulée, etc. Les observateurs
   * s'exécutent APRÈS la transition validée ; leur échec est journalisé et ne
   * remet jamais en cause le changement de statut.
   */
  onTransition(hook: TransitionHook): void {
    this.hooks.push(hook);
  }

  async apply(orderId: string, action: OrderAction, actor: OrderActor, options: ApplyOptions = {}) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: LOAD });
    if (!order) throw new NotFoundException('Commande introuvable.');

    const restaurantUserIds = order.restaurant.members.map((member) => member.userId);
    const driverUserId = order.delivery?.driver?.userId ?? null;

    // 2. L'acteur doit être partie à la commande — 404, jamais 403 : on ne
    // révèle pas l'existence d'une commande à un tiers.
    const isParty =
      (actor.kind === 'CLIENT' && actor.userId === order.clientId) ||
      (actor.kind === 'RESTAURANT' &&
        !!actor.userId &&
        restaurantUserIds.includes(actor.userId) &&
        order.restaurant.status === 'APPROVED') ||
      (actor.kind === 'DRIVER' && !!actor.userId && actor.userId === driverUserId) ||
      actor.kind === 'ADMIN' ||
      actor.kind === 'SYSTEM';
    if (!isParty) throw new NotFoundException('Commande introuvable.');

    // 1. Règle de transition.
    const lookup = findTransition(action, actor.kind, order.status, order.deliveryType);
    if (!lookup.ok) {
      if (lookup.reason === 'FORBIDDEN') {
        throw new ForbiddenException("Vous ne pouvez pas effectuer cette action sur la commande.");
      }
      throw new ConflictException(
        `Action impossible : la commande est « ${order.status} ».`,
      );
    }
    const { to } = lookup.rule;

    const reason = options.reason?.trim();
    if ((to === 'REJECTED' || (to === 'CANCELLED' && actor.kind !== 'CLIENT')) && !reason) {
      throw new BadRequestException('Un motif est obligatoire.');
    }

    const now = new Date();
    const data: Prisma.OrderUncheckedUpdateManyInput = {
      status: to,
      ...(to === 'ACCEPTED' ? { acceptedAt: now } : {}),
      ...(to === 'PREPARING' ? { preparingAt: now } : {}),
      ...(to === 'READY' ? { readyAt: now } : {}),
      ...(to === 'DELIVERED' ? { deliveredAt: now } : {}),
      ...(to === 'REJECTED' ? { rejectionReason: reason } : {}),
      ...(to === 'CANCELLED'
        ? { cancelledAt: now, cancelReason: reason ?? null, cancelledById: actor.userId ?? null }
        : {}),
    };

    // 3. Transition atomique + restitution du stock si la commande est abandonnée.
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data,
      });
      if (updated.count === 0) {
        throw new ConflictException('La commande vient de changer, actualisez la page.');
      }
      // Paiement à la livraison : l'argent est encaissé au moment de la remise
      // (par le livreur, ou par le restaurant pour un retrait sur place).
      if (to === 'DELIVERED' && order.paymentMethod === 'CASH_ON_DELIVERY') {
        await tx.payment.updateMany({
          where: { orderId, method: 'CASH_ON_DELIVERY', status: 'PENDING' },
          data: { status: 'PAID', paidAt: now },
        });
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } });
      }
      if (to === 'CANCELLED' || to === 'REJECTED') {
        for (const item of order.items) {
          if (!item.menuItemId) continue;
          // Seuls les plats à stock limité sont recrédités (stock null = illimité).
          await tx.menuItem.updateMany({
            where: { id: item.menuItemId, stock: { not: null } },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    });

    // 4. Effets de bord : jamais bloquants, la transition est déjà validée.
    await this.afterTransition({
      orderId,
      orderNumber: order.orderNumber,
      restaurantName: order.restaurant.name,
      from: order.status,
      to,
      actor,
      clientId: order.clientId,
      restaurantUserIds,
      driverUserId,
      reason,
      ipAddress: options.ipAddress,
    });

    for (const hook of this.hooks) {
      try {
        await hook({ orderId, from: order.status, to, deliveryType: order.deliveryType, actor });
      } catch (error) {
        this.logger.error(
          `Observateur de transition en échec (${orderId} → ${to}) : ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { id: orderId, status: to };
  }

  private async afterTransition(input: {
    orderId: string;
    orderNumber: number;
    restaurantName: string;
    from: OrderStatus;
    to: OrderStatus;
    actor: OrderActor;
    clientId: string;
    restaurantUserIds: string[];
    driverUserId: string | null;
    reason?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      const everyone = [
        ...new Set([input.clientId, ...input.restaurantUserIds, ...(input.driverUserId ? [input.driverUserId] : [])]),
      ];

      // Temps réel : à tous les participants, y compris l'auteur (ses autres appareils).
      const event = EVENT_BY_STATUS[input.to];
      if (event) {
        this.events.emitToUsers(everyone, event, {
          orderId: input.orderId,
          orderNumber: input.orderNumber,
          status: input.to,
        });
      }

      // Notification : aux autres, pas à celui qui vient d'agir.
      const type = NOTIFICATION_BY_STATUS[input.to];
      if (type) {
        const targets = this.notificationTargets(input, everyone).filter(
          (userId) => userId !== input.actor.userId,
        );
        await Promise.all(
          targets.map((userId) =>
            this.notifications.create(userId, type, {
              orderId: input.orderId,
              orderNumber: input.orderNumber,
              restaurantName: input.restaurantName,
              status: input.to,
              ...(input.reason ? { body: input.reason } : {}),
            }),
          ),
        );
      }

      if (input.actor.kind === 'ADMIN') {
        await this.audit.log({
          actorId: input.actor.userId ?? null,
          action: `ORDER_${input.to}_BY_ADMIN`,
          targetType: 'ORDER',
          targetId: input.orderId,
          metadata: { from: input.from, to: input.to, reason: input.reason ?? null },
          ipAddress: input.ipAddress,
        });
      }
    } catch (error) {
      this.logger.error(
        `Effets de bord de la commande ${input.orderId} (${input.to}) en échec : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** À qui annoncer ce changement : le client presque toujours, le restaurant/livreur quand ça les concerne. */
  private notificationTargets(
    input: { to: OrderStatus; clientId: string; restaurantUserIds: string[]; driverUserId: string | null },
    everyone: string[],
  ): string[] {
    switch (input.to) {
      case 'ASSIGNED':
      case 'PICKED_UP':
      case 'DELIVERED':
        return [input.clientId, ...input.restaurantUserIds];
      case 'READY':
        return [input.clientId, ...(input.driverUserId ? [input.driverUserId] : [])];
      case 'CANCELLED':
        return everyone;
      default:
        return [input.clientId];
    }
  }
}
