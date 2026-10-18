import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import { RedisService } from '../redis/redis.service';

/**
 * Adaptateur Socket.IO sur Redis : un événement émis depuis une instance
 * atteint les sockets connectés à n'importe quelle autre instance (Render peut
 * faire tourner plusieurs instances). Sans Redis, l'adaptateur mémoire par
 * défaut de Socket.IO reste en place (développement, une seule instance).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  connectToRedis(): void {
    const pub = this.redis.duplicate();
    if (!pub) return;
    const sub = pub.duplicate();
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
