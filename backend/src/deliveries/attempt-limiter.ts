import type Redis from 'ioredis';

/**
 * Compteur d'échecs avec verrouillage temporaire — protège les codes à
 * saisir (retrait, remise) contre l'essai de toutes les combinaisons.
 * Redis en production (partagé entre instances), mémoire sinon.
 */
export class AttemptLimiter {
  private readonly memory = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly redis: Redis | null,
    private readonly maxFailures: number,
    private readonly lockSeconds: number,
  ) {}

  async isLocked(key: string): Promise<boolean> {
    if (this.redis) {
      try {
        return Number((await this.redis.get(`attempts:${key}`)) ?? 0) >= this.maxFailures;
      } catch {
        return false; // panne Redis : on ne bloque pas un livreur en pleine livraison
      }
    }
    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt < Date.now()) return false;
    return entry.count >= this.maxFailures;
  }

  async recordFailure(key: string): Promise<void> {
    if (this.redis) {
      try {
        const redisKey = `attempts:${key}`;
        const count = await this.redis.incr(redisKey);
        if (count === 1) await this.redis.expire(redisKey, this.lockSeconds);
      } catch {
        /* best-effort */
      }
      return;
    }
    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.memory.set(key, { count: 1, expiresAt: Date.now() + this.lockSeconds * 1000 });
    } else {
      entry.count += 1;
    }
  }

  async reset(key: string): Promise<void> {
    if (this.redis) await this.redis.del(`attempts:${key}`).catch(() => undefined);
    else this.memory.delete(key);
  }
}
