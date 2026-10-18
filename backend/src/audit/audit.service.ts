import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId: string | null;
  /** Verbe stable en MAJUSCULES : RESTAURANT_APPROVED, USER_SUSPENDED... */
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonObject;
  ipAddress?: string;
}

/**
 * Journal des actions sensibles (approbations, suspensions, accès admin...).
 * Best-effort par conception : un échec d'écriture est journalisé mais ne
 * bloque jamais l'action métier déjà réalisée.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: entry.metadata,
          ipAddress: entry.ipAddress,
        },
      });
    } catch (error) {
      this.logger.error(
        `Échec de l'écriture du journal d'audit (${entry.action}) : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
