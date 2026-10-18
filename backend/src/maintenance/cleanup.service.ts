import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../uploads/storage.service';

// Délai pendant lequel le client, le restaurant et le livreur peuvent encore
// s'écrire après la fin d'une commande (litige, objet oublié...).
const NOTIFICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ORDER_CHAT_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Purge périodique des données expirées (section 15/23/33). Rien ici ne
 * change le comportement observable de l'API : les lectures filtrent déjà
 * par expiration (vérification du token pour les sessions) — ce service ne fait que libérer l'espace de
 * stockage et la base une fois que ces données ne peuvent plus être lues
 * de toute façon.
 *
 * Chaque tâche est isolée par son propre try/catch : l'échec d'une purge ne
 * doit jamais empêcher les autres de s'exécuter, ni faire planter le
 * scheduler (même leçon que PresenceService — voir PHASES.md phase 6).
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const result = await this.prisma.userSession.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (result.count > 0) {
        this.logger.log(`${result.count} session(s) expirée(s) supprimée(s).`);
      }
    } catch (error) {
      this.logger.warn(
        `Échec du nettoyage des sessions expirées : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredPasswordResetTokens(): Promise<void> {
    try {
      const result = await this.prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (result.count > 0) {
        this.logger.log(`${result.count} jeton(s) de réinitialisation expiré(s) supprimé(s).`);
      }
    } catch (error) {
      this.logger.warn(
        `Échec du nettoyage des jetons de réinitialisation : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Les notifications de plus de 90 jours n'ont plus d'intérêt : on garde la base légère. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldNotifications(): Promise<void> {
    try {
      const result = await this.prisma.notification.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - NOTIFICATION_RETENTION_MS) } },
      });
      if (result.count > 0) {
        this.logger.log(`${result.count} notification(s) de plus de 90 jours supprimée(s).`);
      }
    } catch (error) {
      this.logger.warn(
        `Échec du nettoyage des notifications : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Passe en lecture seule les conversations d'une commande terminée depuis
   * plus de 24 h (livrée, annulée ou refusée) : on peut relire l'échange, plus
   * y écrire ni appeler.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async closeFinishedOrderConversations(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - ORDER_CHAT_GRACE_MS);
      const result = await this.prisma.conversation.updateMany({
        where: {
          closedAt: null,
          orderId: { not: null },
          order: { status: { in: ['DELIVERED', 'CANCELLED', 'REJECTED'] }, updatedAt: { lt: cutoff } },
        },
        data: { closedAt: new Date() },
      });
      if (result.count > 0) {
        this.logger.log(`${result.count} conversation(s) de commande passée(s) en lecture seule.`);
      }
    } catch (error) {
      this.logger.warn(
        `Échec de la fermeture des conversations de commande : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
