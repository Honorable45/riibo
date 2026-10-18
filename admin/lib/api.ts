/**
 * Client HTTP du backoffice. La session vit dans des cookies httpOnly posés
 * par le backend (relayé par Next sous /api/v1) : aucun jeton n'est lisible
 * ou stocké par le JavaScript de la page.
 */

export type ApiErrorKind =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'validation'
  | 'rateLimited'
  | 'server';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api/v1';

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
  413: 'validation',
  422: 'validation',
  429: 'rateLimited',
};

const FALLBACK: Record<ApiErrorKind, string> = {
  network: 'Connexion impossible au serveur. Vérifiez votre réseau puis réessayez.',
  unauthorized: 'Votre session a expiré. Reconnectez-vous.',
  forbidden: 'Action réservée aux administrateurs.',
  notFound: 'Élément introuvable.',
  conflict: 'Cet élément a changé entre-temps. Actualisez la page.',
  validation: 'Certaines informations sont invalides.',
  rateLimited: 'Trop de tentatives. Patientez une minute.',
  server: 'Le serveur a rencontré une erreur. Réessayez dans un instant.',
};

/** Extrait un message lisible des réponses NestJS (`message` texte ou liste). */
function messageOf(body: unknown, kind: ApiErrorKind): string {
  const raw = (body as { message?: unknown } | null)?.message;
  const inner = (raw as { message?: unknown } | undefined)?.message ?? raw;
  if (typeof inner === 'string' && inner.trim()) return inner;
  if (Array.isArray(inner) && inner.length) return inner.map(String).join(' · ');
  return FALLBACK[kind];
}

let refreshing: Promise<boolean> | null = null;

/** Un seul renouvellement à la fois, partagé par toutes les requêtes en échec. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | null | undefined | string[]>;
  body?: unknown;
  signal?: AbortSignal;
  /** Désactive le renouvellement automatique (connexion, refresh). */
  noRefresh?: boolean;
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const send = () =>
    fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      signal: options.signal,
      headers: options.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
    });

  let response: Response;
  try {
    response = await send();
    if (response.status === 401 && !options.noRefresh && (await refreshSession())) {
      response = await send();
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('network', FALLBACK.network);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const kind = KIND_BY_STATUS[response.status] ?? 'server';
    throw new ApiError(kind, kind === 'server' ? FALLBACK.server : messageOf(body, kind), response.status);
  }
  return body as T;
}

/** Envoi de fichier avec progression (fetch ne la fournit pas). */
export function upload<T>(path: string, form: FormData, onProgress: (ratio: number) => void): Promise<T> {
  const attempt = () =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}${path}`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new ApiError('network', FALLBACK.network));
      xhr.send(form);
    });
  return attempt().then(async (res) => {
    if (res.status === 401 && (await refreshSession())) res = await attempt();
    let body: unknown = null;
    try {
      body = res.text ? JSON.parse(res.text) : null;
    } catch {
      body = null;
    }
    if (res.status >= 400) {
      const kind = KIND_BY_STATUS[res.status] ?? 'server';
      throw new ApiError(kind, kind === 'server' ? FALLBACK.server : messageOf(body, kind), res.status);
    }
    return body as T;
  });
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
