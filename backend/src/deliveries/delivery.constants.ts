import type { DeliveryStatus } from '@prisma/client';

/** Paramètres d'appariement des livreurs (éprouvés sur le backend food, rayon supplémentaire). */
export const OFFER_BATCH_SIZE = 3; // livreurs sollicités par tour
export const OFFER_TTL_MS = 30_000; // durée pendant laquelle une offre reste acceptable
export const SEARCH_RADII_KM = [3, 5, 8, 12]; // rayon élargi à chaque tour
export const MAX_SEARCH_ATTEMPTS = SEARCH_RADII_KM.length;
/** Délai minimal entre deux tours de recherche pour une même course. */
export const ROUND_SPACING_MS = 15_000;
/** Un livreur sans position depuis ce délai n'est plus considéré comme joignable. */
export const LOCATION_TTL_MS = 90_000;
/** Codes anti-fraude (retrait / remise) : 6 chiffres, 5 essais ratés puis blocage temporaire. */
export const CODE_LENGTH = 6;
export const CODE_MAX_FAILURES = 5;
export const CODE_LOCK_SECONDS = 15 * 60;
/** Vitesse moyenne retenue pour estimer l'arrivée (km/h). */
export const AVERAGE_SPEED_KMH: Record<string, number> = { MOTO: 25, VELO: 12, VOITURE: 22 };

/** Statuts d'une course en cours d'exécution par un livreur (assigné, pas encore terminée). */
export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  'ASSIGNED',
  'AT_RESTAURANT',
  'PICKED_UP',
  'ON_THE_WAY',
  'ARRIVED',
];
