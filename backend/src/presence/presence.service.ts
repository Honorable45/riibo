import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventsGateway } from '../websocket/events.gateway';
import {
  MemoryPresenceStore,
  PresenceStore,
  RedisPresenceStore,
} from './presence.store';

export interface PresenceInfo {
  isOnline: boolean;
  lastSeenAt: Date | null;
}

/**
 * Le statut "en ligne" est dérivé des sockets réellement connectés, stockés
 * dans Redis (partagé entre instances) ou, sans Redis, en mémoire — jamais
 * persisté en base, pour ne jamais afficher un état qui pourrait mentir après
 * un crash. Seule `lastSeenAt` (dernière déconnexion) est écrite en base.
 *
 * Toutes les lectures sont « best-effort » : une panne Redis ne doit jamais
 * faire échouer l'envoi d'un message. Dans le doute, l'utilisateur est
 * considéré hors ligne et n'a pas la conversation à l'écran — le message est
 * alors simplement notifié, ce qui est le comportement sûr.
 */
@Injectable()
export class PresenceService {
  private readonly store: PresenceStore;
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    redis: RedisService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly events: EventsGateway,
  ) {
    this.store = redis.client ? new RedisPresenceStore(redis.client) : new MemoryPresenceStore();
  }

  async handleSocketConnected(userId: string, socketId: string): Promise<void> {
    const isFirstSocket = await this.store.addSocket(userId, socketId);
    if (isFirstSocket) {
      await this.broadcastPresence(userId, true);
    }
  }

  async handleSocketDisconnected(userId: string, socketId: string): Promise<void> {
    const nowOffline = await this.store.removeSocket(userId, socketId);
    if (!nowOffline) return; // encore un autre appareil connecté

    try {
      await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
    } catch (error) {
      // Ne doit jamais faire tomber le gateway pour un simple horodatage.
      this.logger.warn(
        `Échec de l'enregistrement de lastSeenAt pour ${userId} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await this.broadcastPresence(userId, false);
  }

  /** Signe de vie d'un socket (événement `presence:ping`). */
  async heartbeat(userId: string, socketId: string): Promise<void> {
    await this.safely(() => this.store.touch(userId, socketId), undefined);
  }

  isOnline(userId: string): Promise<boolean> {
    return this.safely(() => this.store.isOnline(userId), false);
  }

  /** Vrai dès qu'au moins un de ces utilisateurs est en ligne (statut « livré » d'un message). */
  async isAnyOnline(userIds: string[]): Promise<boolean> {
    for (const userId of userIds) {
      if (await this.isOnline(userId)) return true;
    }
    return false;
  }

  /** Un socket ne peut regarder qu'une conversation à la fois ; `null` marque la fermeture. */
  async setOpenConversation(socketId: string, conversationId: string | null): Promise<void> {
    await this.safely(() => this.store.setOpenConversation(socketId, conversationId), undefined);
  }

  /**
   * Vrai dès qu'au moins un appareil connecté de cet utilisateur a cette
   * conversation à l'écran — voir NotificationsService.create().
   */
  isViewingConversation(userId: string, conversationId: string): Promise<boolean> {
    return this.safely(() => this.store.isViewing(userId, conversationId), false);
  }

  private async safely<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger.warn(
        `Présence indisponible : ${error instanceof Error ? error.message : String(error)}`,
      );
      return fallback;
    }
  }

  /**
   * Vue "présence" telle que la voit un autre utilisateur — respecte
   * `Profile.showOnlineStatus` / `showLastSeen` (section 22). Passer
   * `respectPrivacy: false` uniquement pour le propriétaire du compte
   * lui-même (ses propres réglages ne doivent jamais lui être cachés).
   */
  async getPresence(userId: string, respectPrivacy = true): Promise<PresenceInfo> {
    const [profile, user] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { lastSeenAt: true } }),
    ]);

    const hideOnlineStatus = respectPrivacy && profile?.showOnlineStatus === false;
    const hideLastSeen = respectPrivacy && profile?.showLastSeen === false;

    return {
      isOnline: hideOnlineStatus ? false : await this.isOnline(userId),
      lastSeenAt: hideLastSeen ? null : (user?.lastSeenAt ?? null),
    };
  }

  /**
   * Best-effort : une notification de présence manquée est sans conséquence
   * grave (le client la retrouvera à sa prochaine requête REST), donc une
   * panne base de données ici ne doit jamais remonter — sans ce garde-fou,
   * une connexion pourtant authentifiée serait rejetée (handleConnection) ou
   * pire, une erreur non rattrapée dans handleDisconnect ferait tomber tout
   * le process Node (vérifié en conditions réelles : voir PHASES.md).
   */
  private async broadcastPresence(userId: string, online: boolean): Promise<void> {
    try {
      const profile = await this.prisma.profile.findUnique({ where: { userId } });
      if (profile?.showOnlineStatus === false) return; // rien à diffuser si désactivé

      const peers = await this.getConversationPeers(userId);
      if (peers.length === 0) return;

      this.events.emitToUsers(peers, online ? 'user:online' : 'user:offline', {
        userId,
        lastSeenAt: online ? null : new Date(),
      });
    } catch (error) {
      this.logger.warn(
        `Échec de la diffusion de présence pour ${userId} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async getConversationPeers(userId: string): Promise<string[]> {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, leftAt: null },
      select: { conversationId: true },
    });
    const conversationIds = memberships.map((m) => m.conversationId);
    if (conversationIds.length === 0) return [];

    const others = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: conversationIds }, userId: { not: userId }, leftAt: null },
      select: { userId: true },
      distinct: ['userId'],
    });
    return others.map((o) => o.userId);
  }
}
