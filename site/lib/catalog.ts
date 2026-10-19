/**
 * Catalogue public du backend (routes sans compte : /restaurants,
 * /menu-items). Lu côté serveur avec mise en cache courte ; en cas d'échec,
 * la page s'affiche sans ces sections plutôt que de montrer des données
 * inventées.
 */

export interface PublicDish {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  restaurant: { id: string; slug: string; name: string; isOpen: boolean };
}

export interface PublicRestaurant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  city: string;
  quarter: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  categories: Array<{ slug: string; name: string }>;
}

const backend = () => (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '');

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${backend()}/api/v1${path}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * URL d'image affichable : une URL absolue (Cloudinary) est conservée ; un
 * chemin du stockage local (/api/v1/media/...) est résolu sur le backend,
 * hôte autorisé pour l'optimiseur d'images (voir next.config.ts).
 */
export function mediaSrc(raw: string | null): string | null {
  if (!raw) return null;
  if (/^https:\/\//.test(raw)) return raw;
  if (raw.startsWith('/api/v1/media/')) return `${backend()}${raw}`;
  return null;
}

/** Plats avec photo uniquement : la vitrine ne montre pas de vignette vide (limit ≤ 30 côté serveur). */
export async function featuredDishes(limit = 8): Promise<PublicDish[] | null> {
  const data = await getJson<{ items: PublicDish[] }>(`/menu-items?limit=30`);
  if (!data) return null;
  return data.items.filter((d) => mediaSrc(d.imageUrl)).slice(0, limit);
}

export async function partnerRestaurants(limit = 12): Promise<PublicRestaurant[] | null> {
  const data = await getJson<{ items: PublicRestaurant[] }>(`/restaurants?limit=${limit}`);
  return data ? data.items : null;
}

const fcfaFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const fcfa = (n: number) => `${fcfaFormat.format(n)} FCFA`;
