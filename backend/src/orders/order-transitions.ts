import type { DeliveryType, OrderStatus } from '@prisma/client';

/**
 * Table des transitions d'une commande — pure et testable. Personne n'écrit
 * `Order.status` ailleurs que dans OrderStateMachineService, qui s'appuie sur
 * cette table : aucun endpoint n'accepte un statut arbitraire du frontend.
 */
export type OrderAction =
  | 'ACCEPT'
  | 'REJECT'
  | 'START_PREPARING'
  | 'MARK_READY'
  | 'HAND_OVER' // retrait sur place : remise au client
  | 'CANCEL'
  | 'ASSIGN' // un livreur a accepté la course
  | 'UNASSIGN' // le livreur se désiste avant le retrait : la commande redevient « prête »
  | 'PICK_UP'
  | 'ON_THE_WAY'
  | 'DELIVER';

export type ActorKind = 'CLIENT' | 'RESTAURANT' | 'DRIVER' | 'ADMIN' | 'SYSTEM';

export interface TransitionRule {
  action: OrderAction;
  actors: ActorKind[];
  from: OrderStatus[];
  to: OrderStatus;
  /** Restreint la règle à un type de commande (retrait vs livraison). */
  deliveryType?: DeliveryType;
}

const NON_FINAL: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'ASSIGNED',
  'PICKED_UP',
  'ON_THE_WAY',
];

export const TRANSITIONS: readonly TransitionRule[] = [
  { action: 'ACCEPT', actors: ['RESTAURANT'], from: ['PENDING'], to: 'ACCEPTED' },
  { action: 'REJECT', actors: ['RESTAURANT'], from: ['PENDING'], to: 'REJECTED' },
  { action: 'START_PREPARING', actors: ['RESTAURANT'], from: ['ACCEPTED'], to: 'PREPARING' },
  { action: 'MARK_READY', actors: ['RESTAURANT'], from: ['PREPARING'], to: 'READY' },
  // Retrait sur place : le restaurant remet la commande, elle est terminée.
  { action: 'HAND_OVER', actors: ['RESTAURANT'], from: ['READY'], to: 'DELIVERED', deliveryType: 'PICKUP' },

  // Annulation : le client tant que la cuisine n'a pas commencé ; le restaurant
  // jusqu'à la préparation incluse (rupture d'ingrédient) ; l'admin à tout moment.
  { action: 'CANCEL', actors: ['CLIENT'], from: ['PENDING', 'ACCEPTED'], to: 'CANCELLED' },
  { action: 'CANCEL', actors: ['RESTAURANT'], from: ['ACCEPTED', 'PREPARING'], to: 'CANCELLED' },
  { action: 'CANCEL', actors: ['ADMIN'], from: NON_FINAL, to: 'CANCELLED' },

  // Livraison (pilotée par le module livraison / le livreur).
  { action: 'ASSIGN', actors: ['SYSTEM'], from: ['READY'], to: 'ASSIGNED', deliveryType: 'DELIVERY' },
  { action: 'UNASSIGN', actors: ['SYSTEM'], from: ['ASSIGNED'], to: 'READY', deliveryType: 'DELIVERY' },
  { action: 'PICK_UP', actors: ['DRIVER'], from: ['ASSIGNED'], to: 'PICKED_UP', deliveryType: 'DELIVERY' },
  { action: 'ON_THE_WAY', actors: ['DRIVER'], from: ['PICKED_UP'], to: 'ON_THE_WAY', deliveryType: 'DELIVERY' },
  { action: 'DELIVER', actors: ['DRIVER'], from: ['ON_THE_WAY'], to: 'DELIVERED', deliveryType: 'DELIVERY' },
];

export type RuleLookup =
  | { ok: true; rule: TransitionRule }
  | { ok: false; reason: 'FORBIDDEN' | 'WRONG_STATE' };

/** Cherche la règle applicable ; distingue « pas le droit » de « mauvais état ». */
export function findTransition(
  action: OrderAction,
  actor: ActorKind,
  from: OrderStatus,
  deliveryType: DeliveryType,
): RuleLookup {
  const candidates = TRANSITIONS.filter(
    (rule) =>
      rule.action === action && (rule.deliveryType === undefined || rule.deliveryType === deliveryType),
  );
  const forActor = candidates.filter((rule) => rule.actors.includes(actor));
  if (forActor.length === 0) return { ok: false, reason: 'FORBIDDEN' };
  const rule = forActor.find((candidate) => candidate.from.includes(from));
  return rule ? { ok: true, rule } : { ok: false, reason: 'WRONG_STATE' };
}

/** États terminaux : plus aucune transition (hors admin qui n'agit pas sur eux). */
export const FINAL_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'CANCELLED', 'REJECTED'];
