import type Redis from 'ioredis';

/** Durée de vie d'un socket sans signe de vie (heartbeat `presence:ping` toutes les ~45 s côté client). */
export const SOCKET_TTL_MS = 120_000;

/**
 * Stockage de la présence : quels sockets sont connectés pour chaque
 * utilisateur, et quelle conversation chacun affiche. Deux implémentations —
 * Redis (production, plusieurs instances) et mémoire (développement, une seule
 * instance). Le statut « en ligne » n'est jamais écrit en base.
 */
export interface PresenceStore {
  /** Enregistre un socket. `true` si c'est le premier socket vivant de l'utilisateur. */
  addSocket(userId: string, socketId: string): Promise<boolean>;
  /** Retire un socket. `true` si l'utilisateur n'a plus aucun socket vivant. */
  removeSocket(userId: string, socketId: string): Promise<boolean>;
  /** Signe de vie : prolonge la durée de vie du socket. */
  touch(userId: string, socketId: string): Promise<void>;
  isOnline(userId: string): Promise<boolean>;
  setOpenConversation(socketId: string, conversationId: string | null): Promise<void>;
  isViewing(userId: string, conversationId: string): Promise<boolean>;
}

export class MemoryPresenceStore implements PresenceStore {
  private readonly sockets = new Map<string, Map<string, number>>(); // userId → socketId → expiresAt
  private readonly open = new Map<string, string>();

  private alive(userId: string): string[] {
    const entries = this.sockets.get(userId);
    if (!entries) return [];
    const now = Date.now();
    for (const [socketId, expiresAt] of entries) {
      if (expiresAt <= now) entries.delete(socketId);
    }
    return [...entries.keys()];
  }

  async addSocket(userId: string, socketId: string): Promise<boolean> {
    const wasOffline = this.alive(userId).length === 0;
    const entries = this.sockets.get(userId) ?? new Map<string, number>();
    entries.set(socketId, Date.now() + SOCKET_TTL_MS);
    this.sockets.set(userId, entries);
    return wasOffline;
  }

  async removeSocket(userId: string, socketId: string): Promise<boolean> {
    this.open.delete(socketId);
    this.sockets.get(userId)?.delete(socketId);
    const offline = this.alive(userId).length === 0;
    if (offline) this.sockets.delete(userId);
    return offline;
  }

  async touch(userId: string, socketId: string): Promise<void> {
    const entries = this.sockets.get(userId);
    if (entries?.has(socketId)) entries.set(socketId, Date.now() + SOCKET_TTL_MS);
  }

  async isOnline(userId: string): Promise<boolean> {
    return this.alive(userId).length > 0;
  }

  async setOpenConversation(socketId: string, conversationId: string | null): Promise<void> {
    if (conversationId) this.open.set(socketId, conversationId);
    else this.open.delete(socketId);
  }

  async isViewing(userId: string, conversationId: string): Promise<boolean> {
    return this.alive(userId).some((socketId) => this.open.get(socketId) === conversationId);
  }
}

/**
 * Un ensemble trié par utilisateur : membre = socketId, score = instant
 * d'expiration. L'expiration est par socket : les sockets d'une instance qui
 * plante disparaissent seuls, sans jamais laisser d'utilisateur « fantôme ».
 */
export class RedisPresenceStore implements PresenceStore {
  constructor(private readonly redis: Redis) {}

  private userKey(userId: string): string {
    return `presence:user:${userId}`;
  }

  private openKey(socketId: string): string {
    return `presence:open:${socketId}`;
  }

  private async aliveSockets(userId: string): Promise<string[]> {
    const key = this.userKey(userId);
    await this.redis.zremrangebyscore(key, '-inf', String(Date.now()));
    return this.redis.zrange(key, '0', '-1');
  }

  async addSocket(userId: string, socketId: string): Promise<boolean> {
    const wasOffline = (await this.aliveSockets(userId)).length === 0;
    const key = this.userKey(userId);
    await this.redis
      .multi()
      .zadd(key, Date.now() + SOCKET_TTL_MS, socketId)
      .pexpire(key, SOCKET_TTL_MS * 2)
      .exec();
    return wasOffline;
  }

  async removeSocket(userId: string, socketId: string): Promise<boolean> {
    await this.redis.multi().zrem(this.userKey(userId), socketId).del(this.openKey(socketId)).exec();
    return (await this.aliveSockets(userId)).length === 0;
  }

  async touch(userId: string, socketId: string): Promise<void> {
    const key = this.userKey(userId);
    await this.redis
      .multi()
      .zadd(key, 'XX', Date.now() + SOCKET_TTL_MS, socketId)
      .pexpire(key, SOCKET_TTL_MS * 2)
      .pexpire(this.openKey(socketId), SOCKET_TTL_MS * 2)
      .exec();
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.aliveSockets(userId)).length > 0;
  }

  async setOpenConversation(socketId: string, conversationId: string | null): Promise<void> {
    if (conversationId) await this.redis.set(this.openKey(socketId), conversationId, 'PX', SOCKET_TTL_MS * 2);
    else await this.redis.del(this.openKey(socketId));
  }

  async isViewing(userId: string, conversationId: string): Promise<boolean> {
    const sockets = await this.aliveSockets(userId);
    if (sockets.length === 0) return false;
    const opened = await this.redis.mget(sockets.map((socketId) => this.openKey(socketId)));
    return opened.some((value) => value === conversationId);
  }
}
