import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Client Redis partagé (présence distribuée, adaptateur Socket.IO, verrous,
 * cache). Sans `REDIS_URL` (développement/test uniquement — la production
 * refuse de démarrer sans Redis, voir startup-validation.ts), `client` vaut
 * `null` et chaque consommateur retombe sur un repli mémoire mono-instance.
 *
 * `enableOfflineQueue: false` : si Redis est injoignable, les commandes
 * échouent immédiatement au lieu de s'empiler et de bloquer les requêtes.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn('REDIS_URL absent : présence et temps réel en mémoire (une seule instance).');
      this.client = null;
      return;
    }
    this.client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // Reconnexion progressive, plafonnée à 5 s.
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    });
    this.client.on('error', (error) => this.logger.warn(`Redis : ${error.message}`));
  }

  get isAvailable(): boolean {
    return this.client?.status === 'ready';
  }

  /**
   * Connexion dédiée (pub/sub de l'adaptateur Socket.IO), jamais partagée avec
   * le client principal. La file hors-ligne y est active : l'adaptateur
   * s'abonne dès sa création, avant que la connexion soit prête.
   */
  duplicate(): Redis | null {
    return this.client ? this.client.duplicate({ enableOfflineQueue: true }) : null;
  }

  /**
   * Verrou atomique (SET NX PX). `true` si le verrou a été acquis par cet appel.
   * Sert à l'appariement des livreurs (un seul processus dispatche une course).
   */
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    if (!this.client) return true;
    const result = await this.client.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.client?.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
