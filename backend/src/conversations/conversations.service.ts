import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConversationKind, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAvatarUrl } from '../profiles/avatar.util';
import { EventsGateway } from '../websocket/events.gateway';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { UpdateConversationMembershipDto } from './dto/update-conversation-membership.dto';

const DEFAULT_PAGE_SIZE = 30;

const CONVERSATION_INCLUDE = {
  members: {
    where: { leftAt: null },
    include: { user: { include: { profile: true } } },
  },
  // Résumé de la commande liée (numéro + statut) pour l'en-tête de la conversation.
  order: { select: { id: true, orderNumber: true, status: true, restaurant: { select: { name: true } } } },
  // Dernier message uniquement : la liste complète est paginée par MessagesModule.
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    // Nécessaire seulement pour type MEDIA_ALBUM (résumé "📷 3 médias").
    include: { attachments: { select: { type: true } } },
  },
} satisfies Prisma.ConversationInclude;

type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_INCLUDE;
}>;
type MemberWithUser = ConversationWithRelations['members'][number];

/**
 * Conversations du chat.
 *
 * Règle centrale : les conversations liées à une commande ou au support sont
 * créées UNIQUEMENT par le serveur (méthodes `ensure*` ci-dessous, appelées par
 * OrdersService / DeliveriesService) — jamais à la demande d'un client, qui ne
 * peut donc pas ouvrir de conversation avec un utilisateur arbitraire. Les
 * membres sont dérivés de la commande, jamais d'une liste envoyée par le client.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly events: EventsGateway,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Création — réservée au serveur
  // -------------------------------------------------------------------------

  /** Client ↔ restaurant, créée avec la commande. Idempotente. */
  async ensureOrderRestaurantConversation(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        clientId: true,
        restaurant: { select: { members: { select: { userId: true } } } },
      },
    });
    const restaurantUserIds = order.restaurant.members.map((member) => member.userId);
    return this.ensureOrderConversation(orderId, 'ORDER_RESTAURANT', [
      order.clientId,
      ...restaurantUserIds,
    ]);
  }

  /**
   * Client ↔ livreur et restaurant ↔ livreur, créées quand un livreur accepte
   * la course. Si la course est réattribuée, les anciens livreurs perdent
   * l'accès (voir replaceDriver).
   */
  async ensureDeliveryConversations(orderId: string, driverUserId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        clientId: true,
        restaurant: { select: { members: { select: { userId: true } } } },
      },
    });
    const restaurantUserIds = order.restaurant.members.map((member) => member.userId);

    await this.replaceDriver(orderId, driverUserId);
    const [clientDriver, restaurantDriver] = await Promise.all([
      this.ensureOrderConversation(orderId, 'ORDER_DELIVERY', [order.clientId, driverUserId]),
      this.ensureOrderConversation(orderId, 'ORDER_RESTAURANT_DRIVER', [
        driverUserId,
        ...restaurantUserIds,
      ]),
    ]);
    return { clientDriver, restaurantDriver };
  }

  /** Ouvre (ou retrouve) la conversation de support de l'utilisateur. */
  async ensureSupportConversation(userId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { kind: 'SUPPORT', closedAt: null, members: { some: { userId, leftAt: null } } },
      include: CONVERSATION_INCLUDE,
    });
    if (existing) return this.toDetail(existing, userId);

    const created = await this.prisma.conversation.create({
      data: {
        type: 'DIRECT',
        kind: 'SUPPORT',
        title: 'Support Riiberaka',
        members: { create: [{ userId }] },
      },
      include: CONVERSATION_INCLUDE,
    });
    return this.toDetail(created, userId);
  }

  /**
   * Passe en lecture seule toutes les conversations d'une commande (appelé
   * quand la commande est terminée, puis par le nettoyage planifié).
   */
  async closeOrderConversations(orderId: string): Promise<void> {
    await this.prisma.conversation.updateMany({
      where: { orderId, closedAt: null },
      data: { closedAt: new Date() },
    });
  }

  private async ensureOrderConversation(
    orderId: string,
    kind: ConversationKind,
    memberUserIds: string[],
  ) {
    const userIds = [...new Set(memberUserIds)];
    const include = CONVERSATION_INCLUDE;

    let conversation = await this.prisma.conversation.findUnique({
      where: { orderId_kind: { orderId, kind } },
      include,
    });

    if (!conversation) {
      try {
        conversation = await this.prisma.conversation.create({
          data: {
            type: 'DIRECT',
            kind,
            orderId,
            members: { create: userIds.map((userId) => ({ userId })) },
          },
          include,
        });
      } catch (error) {
        // Deux créations concurrentes : la contrainte unique (orderId, kind)
        // garantit qu'une seule gagne, l'autre relit la ligne existante.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
        conversation = await this.prisma.conversation.findUniqueOrThrow({
          where: { orderId_kind: { orderId, kind } },
          include,
        });
      }
      this.logger.log(`Conversation ${kind} créée pour la commande ${orderId}`);
    }

    // Réconcilie les membres (ajout d'un membre du restaurant, retour d'un membre parti).
    const missing = userIds.filter(
      (userId) => !conversation!.members.some((member) => member.userId === userId),
    );
    if (missing.length > 0) {
      await this.prisma.$transaction(
        missing.map((userId) =>
          this.prisma.conversationMember.upsert({
            where: { conversationId_userId: { conversationId: conversation!.id, userId } },
            create: { conversationId: conversation!.id, userId },
            update: { leftAt: null },
          }),
        ),
      );
      conversation = await this.prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include,
      });
    }

    this.events.emitToUsers(userIds, 'conversation:new', { id: conversation.id, kind, orderId });
    return { id: conversation.id, kind, orderId };
  }

  /** Retire un livreur des conversations de livraison (il se désiste avant le retrait). */
  async removeDriverFromOrder(orderId: string, driverUserId: string): Promise<void> {
    await this.prisma.conversationMember.updateMany({
      where: {
        userId: driverUserId,
        leftAt: null,
        conversation: { orderId, kind: { in: ['ORDER_DELIVERY', 'ORDER_RESTAURANT_DRIVER'] } },
      },
      data: { leftAt: new Date() },
    });
  }

  /** Retire l'accès des livreurs précédents aux conversations de livraison de cette commande. */
  private async replaceDriver(orderId: string, newDriverUserId: string): Promise<void> {
    const conversations = await this.prisma.conversation.findMany({
      where: { orderId, kind: { in: ['ORDER_DELIVERY', 'ORDER_RESTAURANT_DRIVER'] } },
      include: { members: { where: { leftAt: null }, include: { user: { select: { role: true } } } } },
    });
    const staleDriverMembers = conversations.flatMap((conversation) =>
      conversation.members.filter(
        (member) => member.user.role === 'LIVREUR' && member.userId !== newDriverUserId,
      ),
    );
    if (staleDriverMembers.length === 0) return;
    await this.prisma.conversationMember.updateMany({
      where: { id: { in: staleDriverMembers.map((member) => member.id) } },
      data: { leftAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Lecture
  // -------------------------------------------------------------------------

  async listMine(userId: string, query: ListConversationsQueryDto = {}) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;

    // Requête depuis ConversationMember pour pouvoir trier par le pin — une
    // préférence personnelle qui vit sur le lien membre.
    const membershipRows = await this.prisma.conversationMember.findMany({
      where: { userId, leftAt: null },
      include: { conversation: { include: CONVERSATION_INCLUDE } },
      orderBy: [
        { isPinned: 'desc' },
        { pinnedAt: 'desc' },
        { conversation: { updatedAt: 'desc' } },
      ],
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { conversationId_userId: { conversationId: query.cursor, userId } }, skip: 1 }
        : {}),
    });
    if (membershipRows.length === 0) return { items: [], nextCursor: null };

    const hasMore = membershipRows.length > limit;
    const page = hasMore ? membershipRows.slice(0, limit) : membershipRows;
    const nextCursor = hasMore ? (page[page.length - 1]?.conversationId ?? null) : null;

    // Suppression locale : une conversation masquée disparaît tant qu'aucun
    // message n'est arrivé depuis.
    const visible = page.filter(
      (m) => !(m.hiddenAt && m.conversation.updatedAt.getTime() <= m.hiddenAt.getTime()),
    );

    return {
      items: await Promise.all(visible.map((m) => this.toDetail(m.conversation, userId))),
      nextCursor,
    };
  }

  async findById(userId: string, conversationId: string) {
    const conversation = await this.loadForMember(userId, conversationId);
    return this.toDetail(conversation, userId);
  }

  async updateMembership(
    userId: string,
    conversationId: string,
    dto: UpdateConversationMembershipDto,
  ) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    // Vérification d'appartenance stricte : jamais de préférence sur une
    // conversation dont on n'est pas (ou plus) membre.
    if (!membership || membership.leftAt) {
      throw new NotFoundException('Conversation introuvable.');
    }

    await this.prisma.conversationMember.update({
      where: { id: membership.id },
      data: {
        isArchived: dto.isArchived,
        isMuted: dto.isMuted,
        ...(dto.isPinned !== undefined
          ? { isPinned: dto.isPinned, pinnedAt: dto.isPinned ? new Date() : null }
          : {}),
        ...(dto.markUnread ? { lastReadAt: null } : {}),
        ...(dto.hidden ? { hiddenAt: new Date() } : {}),
      },
    });

    const detail = await this.findById(userId, conversationId);
    // Synchronisation multi-appareils : préférence personnelle, émise
    // uniquement vers les autres appareils de CET utilisateur.
    this.events.emitToUser(userId, 'conversation:membership-updated', detail);
    return detail;
  }

  private async loadForMember(
    userId: string,
    conversationId: string,
  ): Promise<ConversationWithRelations> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });
    const isMember = conversation?.members.some((member) => member.userId === userId) ?? false;
    if (!conversation || !isMember) {
      // 404 (jamais 403) : ne rien révéler de l'existence d'une conversation à un non-membre.
      throw new NotFoundException('Conversation introuvable.');
    }
    return conversation;
  }

  private async toParticipant(member: MemberWithUser) {
    const presence = await this.presence.getPresence(member.user.id);
    return {
      id: member.user.id,
      username: member.user.username,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      role: member.user.role,
      avatarUrl: resolveAvatarUrl(member.user.profile, member.user.id),
      isOnline: presence.isOnline,
      lastSeenAt: presence.lastSeenAt,
    };
  }

  private async toDetail(conversation: ConversationWithRelations, currentUserId: string) {
    const myMembership = conversation.members.find((member) => member.userId === currentUserId);
    if (!myMembership) {
      throw new NotFoundException('Conversation introuvable.');
    }

    // N+1 assumé au MVP pour le compteur de non-lus : à optimiser si la liste grossit.
    const [unreadCount, members] = await Promise.all([
      this.prisma.message.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: currentUserId },
          createdAt: { gt: myMembership.lastReadAt ?? new Date(0) },
        },
      }),
      Promise.all(conversation.members.map((member) => this.toParticipant(member))),
    ]);

    const [lastMessage] = conversation.messages;
    const otherParticipants = members.filter((member) => member.id !== currentUserId);

    return {
      id: conversation.id,
      kind: conversation.kind,
      title: conversation.title,
      order: conversation.order
        ? {
            id: conversation.order.id,
            orderNumber: conversation.order.orderNumber,
            status: conversation.order.status,
            restaurantName: conversation.order.restaurant.name,
          }
        : null,
      // Lecture seule : commande terminée depuis plus de 24 h ou support clos.
      isClosed: conversation.closedAt !== null,
      closedAt: conversation.closedAt,
      // Conversation à deux : l'interlocuteur affiché. Conversation à
      // plusieurs (équipe restaurant) : le premier autre participant.
      otherParticipant: otherParticipants[0] ?? null,
      members,
      myMembership: {
        isArchived: myMembership.isArchived,
        isMuted: myMembership.isMuted,
        isPinned: myMembership.isPinned,
        lastReadAt: myMembership.lastReadAt,
      },
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            type: lastMessage.type,
            text: lastMessage.text,
            systemAction: lastMessage.systemAction,
            senderId: lastMessage.senderId,
            sentAt: lastMessage.sentAt,
            mediaCount: lastMessage.attachments?.length ?? null,
            mediaHasVideo: lastMessage.attachments?.some((a) => a.type === 'VIDEO') ?? null,
          }
        : null,
      unreadCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }
}

/** Levé si un utilisateur tente d'écrire dans une conversation close. */
export class ConversationClosedException extends ConflictException {
  constructor() {
    super('Cette conversation est fermée.');
  }
}
