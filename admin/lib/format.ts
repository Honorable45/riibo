/** Formats et libellés partagés — alignés sur les applications mobiles. */

const money = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Montant en francs CFA (entiers en base). */
export function fcfa(amount: number | null | undefined): string {
  return `${money.format(amount ?? 0)} F`;
}

export function count(n: number | null | undefined): string {
  return money.format(n ?? 0);
}

/** « 1 dossier », « 3 dossiers » (0 et 1 au singulier, usage français). */
export function plural(n: number, one: string, many: string): string {
  return `${count(n)} ${Math.abs(n) < 2 ? one : many}`;
}

export function percent(ratio: number | null | undefined): string {
  return ratio === null || ratio === undefined ? '—' : `${Math.round(ratio * 100)} %`;
}

// Lomé = UTC+0 toute l'année : on affiche explicitement ce fuseau.
const TZ = 'Africa/Lome';
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: TZ });
const time = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short', timeZone: TZ });
const dayShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: TZ });

export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—');
export const formatDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : '—');
export const formatTime = (iso: string | null | undefined) => (iso ? time.format(new Date(iso)) : '—');
export const formatDay = (iso: string) => dayShort.format(new Date(iso));

export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return formatDate(iso);
}

export function personName(p: { firstName?: string | null; lastName?: string | null } | null | undefined) {
  if (!p) return '—';
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—';
}

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand';

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Nouvelle', tone: 'warning' },
  ACCEPTED: { label: 'Acceptée', tone: 'brand' },
  PREPARING: { label: 'En préparation', tone: 'brand' },
  READY: { label: 'Prête', tone: 'info' },
  ASSIGNED: { label: 'Livreur en route', tone: 'info' },
  PICKED_UP: { label: 'Récupérée', tone: 'info' },
  ON_THE_WAY: { label: 'En livraison', tone: 'info' },
  DELIVERED: { label: 'Terminée', tone: 'success' },
  CANCELLED: { label: 'Annulée', tone: 'danger' },
  REJECTED: { label: 'Refusée', tone: 'danger' },
};

export const ORDER_STATUS_ORDER = Object.keys(ORDER_STATUS);
export const FINAL_ORDER_STATUSES = ['DELIVERED', 'CANCELLED', 'REJECTED'];

export const DELIVERY_STATUS: Record<string, string> = {
  SEARCHING: 'Recherche d’un livreur',
  ASSIGNED: 'Livreur affecté',
  AT_RESTAURANT: 'Au restaurant',
  PICKED_UP: 'Récupérée',
  ON_THE_WAY: 'En route',
  ARRIVED: 'Arrivé chez le client',
  DELIVERED: 'Livrée',
  NO_DRIVER_FOUND: 'Aucun livreur trouvé',
  CANCELLED: 'Annulée',
};

export const APPROVAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Dossier à compléter', tone: 'neutral' },
  IN_REVIEW: { label: 'En vérification', tone: 'warning' },
  APPROVED: { label: 'Validé', tone: 'success' },
  REJECTED: { label: 'Refusé', tone: 'danger' },
  SUSPENDED: { label: 'Suspendu', tone: 'danger' },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'En attente', tone: 'warning' },
  PAID: { label: 'Encaissé', tone: 'success' },
  FAILED: { label: 'Échoué', tone: 'danger' },
  CANCELLED: { label: 'Annulé', tone: 'neutral' },
  REFUNDED: { label: 'Remboursé', tone: 'info' },
};

export const PAYMENT_METHOD: Record<string, string> = {
  CASH_ON_DELIVERY: 'Espèces à la livraison',
  TMONEY: 'TMoney',
  FLOOZ: 'Flooz',
};

export const DELIVERY_TYPE: Record<string, string> = { DELIVERY: 'Livraison', PICKUP: 'À emporter' };

export const ROLE: Record<string, string> = {
  CLIENT: 'Client',
  RESTAURANT: 'Restaurant',
  LIVREUR: 'Livreur',
  ADMIN: 'Administrateur',
};

export const VEHICLE: Record<string, string> = { MOTO: 'Moto', VELO: 'Vélo', VOITURE: 'Voiture' };

export const ITEM_ISSUE: Record<string, string> = {
  NO_IMAGE: 'Sans image',
  NO_DESCRIPTION: 'Sans description',
  NO_CATEGORY: 'Sans catégorie',
  UNAVAILABLE: 'Indisponible',
  SOLD_OUT: 'Épuisé',
  INVALID_PRICE: 'Prix invalide',
  BROKEN_IMAGE: 'Image introuvable',
};

/** Libellés lisibles des actions du journal d'audit (repli : code brut). */
export const AUDIT_ACTION: Record<string, string> = {
  ORDER_CANCELLED_BY_ADMIN: 'Commande annulée',
  RESTAURANT_START_REVIEW: 'Vérification du restaurant démarrée',
  RESTAURANT_APPROVE: 'Restaurant validé',
  RESTAURANT_REJECT: 'Restaurant refusé',
  RESTAURANT_SUSPEND: 'Restaurant suspendu',
  RESTAURANT_REACTIVATE: 'Restaurant réactivé',
  RESTAURANT_SUBMITTED: 'Dossier restaurant envoyé',
  RESTAURANT_DOCUMENT_VIEWED: 'Pièce restaurant consultée',
  DRIVER_START_REVIEW: 'Vérification du livreur démarrée',
  DRIVER_APPROVE: 'Livreur validé',
  DRIVER_REJECT: 'Livreur refusé',
  DRIVER_SUSPEND: 'Livreur suspendu',
  DRIVER_REACTIVATE: 'Livreur réactivé',
  DRIVER_SUBMITTED: 'Dossier livreur envoyé',
  DRIVER_DOCUMENT_VIEWED: 'Pièce livreur consultée',
  USER_SUSPENDED: 'Compte suspendu',
  USER_REACTIVATED: 'Compte réactivé',
  PROMO_CREATED: 'Code promo créé',
  PROMO_UPDATED: 'Code promo modifié',
  MENU_ITEM_DISABLED_BY_ADMIN: 'Plat retiré de la vente',
  MENU_ITEM_ENABLED_BY_ADMIN: 'Plat remis en vente',
  MENU_ITEM_IMAGE_ADDED_BY_ADMIN: 'Image de plat ajoutée',
  MENU_ITEM_IMAGE_REPLACED_BY_ADMIN: 'Image de plat remplacée',
  MENU_ITEM_IMAGE_REMOVED_BY_ADMIN: 'Image de plat supprimée',
};

export const auditLabel = (action: string) => AUDIT_ACTION[action] ?? action.replaceAll('_', ' ').toLowerCase();
