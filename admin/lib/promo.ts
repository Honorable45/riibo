/**
 * Validation du formulaire de code promo. Reprend les règles du backend
 * (CreatePromoDto, PromosService.create) et ajoute une règle de prudence du
 * backoffice : pas de code sans limite d'utilisation, sans date de fin ni,
 * pour un pourcentage, sans plafond — aucune remise illimitée.
 */

export interface PromoForm {
  code: string;
  description: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: string;
  maxDiscount: string;
  minOrderAmount: string;
  maxUses: string;
  maxUsesPerUser: string;
  startsAt: string; // AAAA-MM-JJ
  expiresAt: string; // AAAA-MM-JJ
  restaurantId: string;
}

export interface PromoBody {
  code: string;
  description?: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  maxDiscount?: number;
  minOrderAmount?: number;
  maxUses: number;
  maxUsesPerUser: number;
  startsAt?: string;
  expiresAt: string;
  restaurantId?: string;
}

const MAX = 1_000_000;

function int(raw: string): number | null {
  const t = raw.replace(/\s/g, '');
  return /^\d+$/.test(t) ? Number(t) : null;
}

export function validatePromo(form: PromoForm, today = new Date().toISOString().slice(0, 10)) {
  const errors: Partial<Record<keyof PromoForm, string>> = {};
  const code = form.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) errors.code = 'Code : 3 à 20 lettres, chiffres, - ou _.';

  const value = int(form.discountValue);
  if (value === null || value < 1) errors.discountValue = 'Valeur obligatoire (nombre entier positif).';
  else if (form.discountType === 'PERCENT' && value > 100) errors.discountValue = 'Un pourcentage ne peut pas dépasser 100.';
  else if (value > MAX) errors.discountValue = 'Valeur trop élevée.';

  const cap = form.maxDiscount.trim() ? int(form.maxDiscount) : null;
  if (form.discountType === 'PERCENT' && (cap === null || cap < 1 || cap > MAX)) {
    errors.maxDiscount = 'Plafond obligatoire pour un pourcentage.';
  }

  const min = form.minOrderAmount.trim() ? int(form.minOrderAmount) : 0;
  if (min === null || min > MAX) errors.minOrderAmount = 'Montant invalide.';
  if (form.discountType === 'FIXED' && value !== null && min !== null && min > 0 && value >= min) {
    errors.discountValue = 'La remise doit rester inférieure à la commande minimum.';
  }

  const uses = int(form.maxUses);
  if (uses === null || uses < 1 || uses > MAX) errors.maxUses = 'Nombre total d’utilisations obligatoire.';
  const perUser = int(form.maxUsesPerUser);
  if (perUser === null || perUser < 1 || perUser > 1000) errors.maxUsesPerUser = 'Entre 1 et 1000.';

  if (!form.expiresAt) errors.expiresAt = 'Date de fin obligatoire.';
  else if (form.expiresAt < today) errors.expiresAt = 'La date de fin est passée.';
  else if (form.startsAt && form.expiresAt <= form.startsAt) errors.expiresAt = 'La fin doit suivre le début.';

  if (Object.keys(errors).length) return { errors, body: null };
  return {
    errors,
    body: {
      code,
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      discountValue: value!,
      maxDiscount: form.discountType === 'PERCENT' ? cap! : undefined,
      minOrderAmount: min || undefined,
      maxUses: uses!,
      maxUsesPerUser: perUser!,
      startsAt: form.startsAt ? `${form.startsAt}T00:00:00.000Z` : undefined,
      // Fin de journée incluse (heure de Lomé = UTC).
      expiresAt: `${form.expiresAt}T23:59:59.000Z`,
      restaurantId: form.restaurantId || undefined,
    } satisfies PromoBody,
  };
}
