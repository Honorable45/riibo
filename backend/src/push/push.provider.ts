import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export type PushUrgency = 'very-low' | 'low' | 'normal' | 'high';

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /**
   * Regroupe les notifications d'un même sujet : une nouvelle notification de
   * la commande #1842 REMPLACE la précédente à l'écran au lieu de s'empiler.
   */
  tag?: string;
  /** Durée pendant laquelle le service de push conserve le message si l'appareil est éteint. */
  ttlSeconds?: number;
  urgency?: PushUrgency;
}

/** Ces champs pilotent l'envoi, ils ne font pas partie de ce que reçoit le service worker. */
function splitMessage(message: PushMessage): {
  payload: string;
  options: { TTL: number; urgency: PushUrgency };
} {
  const { ttlSeconds, urgency, ...visible } = message;
  return {
    payload: JSON.stringify(visible),
    options: { TTL: ttlSeconds ?? DEFAULT_TTL_SECONDS, urgency: urgency ?? 'normal' },
  };
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export interface CallInvitePush {
  callId: string;
  conversationId: string;
  kind: 'AUDIO' | 'VIDEO';
  /** Jeton dédié (voir CallsService), permet de refuser l'appel depuis le
   * bouton d'action de la notification système sans qu'aucune page/onglet
   * ne soit ouvert — jamais un token de session. */
  rejectToken: string;
  /** Prénom et nom de l'appelant, affichés comme titre de la notification. */
  callerName?: string;
}

/**
 * Envoi de notifications Web Push (PWA — notifications hors de l'app),
 * même convention que les autres fournisseurs optionnels du projet
 * (CloudinaryProvider, les fournisseurs IA — section 38) : sans les 3
 * variables VAPID, chaque appelant retombe silencieusement sur "rien
 * n'est envoyé" plutôt que d'échouer — les notifications in-app/websocket
 * existantes continuent de fonctionner normalement.
 */
@Injectable()
export class PushProvider {
  private readonly logger = new Logger(PushProvider.name);
  private readonly configured: boolean;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    this.configured = Boolean(publicKey && privateKey && subject);
    if (this.configured) {
      webpush.setVapidDetails(subject!, publicKey!, privateKey!);
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT absents : notifications push désactivées (in-app/websocket non affectées).',
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY ?? null;
  }

  /**
   * Envoie vers tous les abonnements de l'utilisateur, en parallèle,
   * best-effort (jamais d'exception qui remonte à l'appelant — même
   * principe que CloudinaryProvider.delete/StorageService.delete). Un
   * abonnement expiré côté navigateur (404/410) est supprimé silencieusement
   * ; toute autre erreur est seulement loguée.
   */
  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    const { payload, options } = splitMessage(message);
    await this.dispatch(userId, payload, options);
  }

  /**
   * Notification d'appel entrant — jamais envoyée via le chemin générique
   * (NotificationsService.create exclut INCOMING_CALL, voir
   * PUSH_EXCLUDED_TYPES) : forme trop différente (actions "Répondre"/
   * "Refuser", `requireInteraction`, `tag` pour remplacer/annuler la
   * notification en cours plutôt que d'en empiler une nouvelle) pour
   * partager PushMessage. Cliquer "Répondre" ouvre l'app sur l'appel (voir
   * `url`, géré par sw.js) ; cliquer "Refuser" appelle POST
   * /calls/quick-reject directement depuis le service worker via
   * `rejectToken`, sans jamais avoir besoin d'ouvrir l'app.
   */
  async sendCallInvite(userId: string, call: CallInvitePush): Promise<void> {
    const payload = JSON.stringify({
      kind: 'call',
      title: call.callerName || 'Riiberaka',
      body: call.kind === 'VIDEO' ? '📹 Appel vidéo entrant' : '📞 Appel entrant',
      url: `/messages/${call.conversationId}?incomingCall=${call.callId}`,
      callId: call.callId,
      rejectToken: call.rejectToken,
    });
    // Un appel qui sonne n'a plus de sens au bout de 30 secondes.
    await this.dispatch(userId, payload, { TTL: 30, urgency: 'high' });
  }

  /**
   * Envoie un payload déjà sérialisé vers tous les abonnements de
   * l'utilisateur, en parallèle, best-effort (jamais d'exception qui
   * remonte à l'appelant — même principe que CloudinaryProvider.delete/
   * StorageService.delete). Un abonnement expiré côté navigateur (404/410)
   * est supprimé silencieusement ; toute autre erreur est seulement loguée.
   */
  private async dispatch(
    userId: string,
    payload: string,
    options: { TTL: number; urgency: PushUrgency },
  ): Promise<void> {
    if (!this.configured) return;

    // Uniquement les appareils dont la SESSION est encore active : après une
    // déconnexion (téléphone partagé), une révocation, une expiration ou la
    // suspension du compte, plus rien n'est envoyé — même si la ligne n'a pas
    // encore été supprimée.
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        userId,
        session: { revokedAt: null, expiresAt: { gt: new Date() }, user: { isActive: true } },
      },
    });
    if (subscriptions.length === 0) return;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            options,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription.deleteMany({
              where: { endpoint: subscription.endpoint },
            });
            return;
          }
          this.logger.warn(
            `Échec d'envoi push vers l'abonnement ${subscription.id} : ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
  }
}
