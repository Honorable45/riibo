/**
 * Configuration publique du site vitrine. Tout passe par des variables
 * NEXT_PUBLIC_* (lues à la compilation) : aucune URL de production ni
 * coordonnée n'est inventée. Une valeur absente masque l'élément concerné.
 * Aucun secret ne doit jamais être placé dans ces variables.
 */

function url(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? value.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function text(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

/** Numéro au format international, chiffres uniquement (pour wa.me et tel:). */
function phone(raw: string | undefined): string | null {
  const digits = raw?.replace(/[^\d+]/g, '') ?? '';
  return /^\+?\d{8,15}$/.test(digits) ? digits.replace(/^\+?/, '+') : null;
}

export const site = {
  name: 'Riiberaka',
  /** Domaine public du site (canonique, sitemap, Open Graph). */
  url: url(process.env.NEXT_PUBLIC_SITE_URL),
  /** Application client web, si elle est publiée. */
  clientAppUrl: url(process.env.NEXT_PUBLIC_CLIENT_APP_URL),
  androidAppUrl: url(process.env.NEXT_PUBLIC_ANDROID_APP_URL),
  iosAppUrl: url(process.env.NEXT_PUBLIC_IOS_APP_URL),
  /** Espace des restaurants déjà partenaires. */
  restaurantAppUrl: url(process.env.NEXT_PUBLIC_RESTAURANT_APP_URL),
  contact: {
    email: text(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
    phone: phone(process.env.NEXT_PUBLIC_CONTACT_PHONE),
    whatsapp: phone(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER),
  },
  social: {
    facebook: url(process.env.NEXT_PUBLIC_FACEBOOK_URL),
    instagram: url(process.env.NEXT_PUBLIC_INSTAGRAM_URL),
    tiktok: url(process.env.NEXT_PUBLIC_TIKTOK_URL),
  },
  legal: {
    publisher: text(process.env.NEXT_PUBLIC_LEGAL_PUBLISHER),
    address: text(process.env.NEXT_PUBLIC_LEGAL_ADDRESS),
    registration: text(process.env.NEXT_PUBLIC_LEGAL_REGISTRATION),
    director: text(process.env.NEXT_PUBLIC_LEGAL_DIRECTOR),
    host: text(process.env.NEXT_PUBLIC_LEGAL_HOST),
  },
} as const;

/**
 * Destination du bouton « Commander » : l'application client si elle est
 * publiée (web, puis Android, puis iOS) ; sinon la section qui explique
 * honnêtement comment obtenir l'application.
 */
export function orderHref(): { href: string; external: boolean } {
  const target = site.clientAppUrl ?? site.androidAppUrl ?? site.iosAppUrl;
  return target ? { href: target, external: true } : { href: '/#application', external: false };
}

export const hasAppLink = Boolean(site.clientAppUrl ?? site.androidAppUrl ?? site.iosAppUrl);
