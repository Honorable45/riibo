import type { NotificationType, Role } from '@prisma/client';
import type { PushUrgency } from '../push/push.provider';

export interface PushText {
  title: string;
  body: string;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

// Types dont le texte pousserait autrement un aperçu du contenu échangé — les
// autres ne révèlent qu'une action, donc restent inchangés même quand
// hideContent est actif.
const CONTENT_BEARING_TYPES = new Set<NotificationType>(['NEW_MESSAGE', 'NEW_VOICE_MESSAGE']);

const APP_NAME = 'Riiberaka';

/**
 * Construit le titre/corps d'une notification push à partir de son type et de
 * son payload. Fonction pure : ne dépend pas de Prisma. `payload.actorName` est
 * déjà résolu et gravé dans le payload par NotificationsService.create().
 * Les textes sont volontairement courts : la cible n'est pas toujours à l'aise
 * avec la lecture.
 */
export function buildPushText(
  type: NotificationType,
  payload: Record<string, unknown>,
  // Préférence du destinataire (Profile.hideNotificationContent) : ne touche
  // que le texte poussé, jamais la notification in-app stockée en base.
  hideContent = false,
): PushText {
  if (hideContent && CONTENT_BEARING_TYPES.has(type)) {
    return { title: APP_NAME, body: 'Nouveau message' };
  }
  const title = str(payload.actorName) ?? APP_NAME;
  const orderNumber = num(payload.orderNumber);
  const order = orderNumber !== null ? `Commande #${orderNumber}` : 'Commande';

  switch (type) {
    case 'NEW_MESSAGE':
      return { title, body: str(payload.preview) ?? 'Nouveau message' };
    case 'NEW_VOICE_MESSAGE':
      return { title, body: '🎤 Message vocal' };
    case 'INCOMING_CALL':
      return { title, body: '📞 Appel entrant' };
    case 'MISSED_CALL':
      return { title, body: '📞 Appel manqué' };
    case 'REACTION':
      return { title, body: 'A réagi à votre message' };
    case 'MENTION':
      return { title, body: 'Vous a mentionné(e)' };
    case 'ORDER_NEW':
      return { title: `🔔 ${order}`, body: 'Nouvelle commande' };
    case 'ORDER_ACCEPTED':
      return { title: order, body: '✅ Acceptée par le restaurant' };
    case 'ORDER_REJECTED':
      return { title: order, body: '❌ Refusée par le restaurant' };
    case 'ORDER_PREPARING':
      return { title: order, body: '👨‍🍳 En préparation' };
    case 'ORDER_READY':
      return { title: order, body: '🛍️ Prête' };
    case 'ORDER_ASSIGNED':
      return { title: order, body: '🛵 Un livreur est en route' };
    case 'ORDER_PICKED_UP':
      return { title: order, body: '📦 Récupérée par le livreur' };
    case 'ORDER_ON_THE_WAY':
      return { title: order, body: '🛵 En route vers vous' };
    case 'ORDER_DELIVERED':
      return { title: order, body: '🎉 Livrée' };
    case 'ORDER_CANCELLED':
      return { title: order, body: 'Annulée' };
    case 'DELIVERY_OFFER':
      return { title: '🛵 Nouvelle livraison', body: str(payload.restaurantName) ?? order };
    case 'PAYMENT_CONFIRMED':
      return { title: order, body: '💰 Paiement reçu' };
    case 'PAYMENT_FAILED':
      return { title: order, body: 'Paiement échoué' };
    case 'REVIEW_RECEIVED':
      return { title: 'Nouvel avis', body: '⭐ Un client a laissé un avis' };
    case 'PROMOTION':
      return { title: str(payload.title) ?? '🎁 Promotion', body: str(payload.body) ?? '' };
    case 'ACCOUNT_APPROVED':
      return { title: APP_NAME, body: '✅ Votre compte est validé' };
    case 'ACCOUNT_SUSPENDED':
      return { title: APP_NAME, body: 'Votre compte est suspendu' };
    default:
      return { title, body: str(payload.body) ?? 'Nouvelle notification' };
  }
}

/**
 * Chemin à ouvrir au clic sur la notification système. Chaque rôle a sa propre
 * PWA (origine distincte, service worker distinct) : le chemin est relatif à
 * l'application du destinataire.
 */
export function buildPushUrl(payload: Record<string, unknown>, role: Role): string {
  const conversationId = str(payload.conversationId);
  if (conversationId) return `/messages/${conversationId}`;

  const orderId = str(payload.orderId);
  if (role === 'LIVREUR') {
    const deliveryId = str(payload.deliveryId);
    return deliveryId ? `/deliveries/${deliveryId}` : '/';
  }
  if (orderId) return `/orders/${orderId}`;
  return '/';
}

export interface PushOptions {
  tag?: string;
  ttlSeconds: number;
  urgency: PushUrgency;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * Durée de vie, urgence et regroupement d'une notification push selon son type.
 * Une offre de course de 30 secondes n'a aucun intérêt livrée deux heures plus
 * tard ; une mise à jour de commande doit remplacer la précédente à l'écran.
 */
export function buildPushOptions(type: NotificationType, payload: Record<string, unknown>): PushOptions {
  const orderId = str(payload.orderId);
  const conversationId = str(payload.conversationId);

  switch (type) {
    case 'DELIVERY_OFFER':
      return { ttlSeconds: 30, urgency: 'high', tag: `offer-${str(payload.deliveryId) ?? orderId ?? 'x'}` };
    case 'ORDER_NEW':
      return { ttlSeconds: 10 * MINUTE, urgency: 'high', tag: orderId ? `order-${orderId}` : undefined };
    case 'ORDER_ACCEPTED':
    case 'ORDER_REJECTED':
    case 'ORDER_PREPARING':
    case 'ORDER_READY':
    case 'ORDER_ASSIGNED':
    case 'ORDER_PICKED_UP':
    case 'ORDER_ON_THE_WAY':
    case 'ORDER_DELIVERED':
    case 'ORDER_CANCELLED':
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_FAILED':
      return { ttlSeconds: HOUR, urgency: 'high', tag: orderId ? `order-${orderId}` : undefined };
    case 'NEW_MESSAGE':
    case 'NEW_VOICE_MESSAGE':
    case 'MENTION':
      return { ttlSeconds: 24 * HOUR, urgency: 'normal', tag: conversationId ? `chat-${conversationId}` : undefined };
    case 'MISSED_CALL':
      return { ttlSeconds: 24 * HOUR, urgency: 'normal', tag: conversationId ? `chat-${conversationId}` : undefined };
    case 'PROMOTION':
      return { ttlSeconds: 24 * HOUR, urgency: 'low' };
    default:
      return { ttlSeconds: 24 * HOUR, urgency: 'normal' };
  }
}
