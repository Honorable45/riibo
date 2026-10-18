import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStateMachineService, TransitionEvent } from './order-state-machine.service';

/**
 * Fait apparaître les grandes étapes de la commande dans la conversation
 * client ↔ restaurant (cartes « Votre commande est prête », « Un livreur a
 * accepté… »). Observateur de la machine à états : un échec ici est journalisé
 * et ne remet jamais en cause le changement de statut.
 */
@Injectable()
export class OrderChatEventsService implements OnModuleInit {
  private readonly logger = new Logger(OrderChatEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly machine: OrderStateMachineService,
    private readonly messages: MessagesService,
  ) {}

  onModuleInit(): void {
    this.machine.onTransition((event) => this.post(event));
  }

  private async post(event: TransitionEvent): Promise<void> {
    try {
      const action = this.actionFor(event);
      if (!action) return;

      const conversation = await this.prisma.conversation.findUnique({
        where: { orderId_kind: { orderId: event.orderId, kind: 'ORDER_RESTAURANT' } },
        select: { id: true, members: { where: { leftAt: null }, select: { userId: true } } },
      });
      if (!conversation) return;

      const order = await this.prisma.order.findUnique({
        where: { id: event.orderId },
        select: {
          clientId: true,
          rejectionReason: true,
          cancelReason: true,
          delivery: { select: { driver: { select: { user: { select: { firstName: true } } } } } },
        },
      });
      if (!order) return;

      const detail =
        action === 'ORDER_REJECTED'
          ? order.rejectionReason
          : action === 'ORDER_CANCELLED'
            ? order.cancelReason
            : action.startsWith('DRIVER_')
              ? order.delivery?.driver?.user.firstName
              : null;

      const sender =
        conversation.members.find((m) => m.userId !== order.clientId) ?? conversation.members[0];
      if (!sender) return;
      await this.messages.postSystem(conversation.id, sender.userId, action, detail ?? undefined);
    } catch (error) {
      this.logger.warn(
        `Message d'événement non posté : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private actionFor(event: TransitionEvent): string | null {
    switch (event.to) {
      case 'ACCEPTED':
        return 'ORDER_ACCEPTED';
      case 'PREPARING':
        return 'ORDER_PREPARING';
      case 'READY':
        return event.deliveryType === 'PICKUP' ? 'ORDER_READY_PICKUP' : 'ORDER_READY';
      case 'ASSIGNED':
        return 'DRIVER_ASSIGNED';
      case 'PICKED_UP':
        return 'DRIVER_PICKED_UP';
      case 'ON_THE_WAY':
        return 'DRIVER_ON_THE_WAY';
      case 'DELIVERED':
        return 'ORDER_DELIVERED';
      case 'REJECTED':
        return 'ORDER_REJECTED';
      case 'CANCELLED':
        return 'ORDER_CANCELLED';
      default:
        return null;
    }
  }
}
