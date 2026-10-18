import type { Response } from 'express';
import { API_PREFIX } from '../common/api-prefix';

/**
 * Cookies d'authentification des PWA (audit de sécurité : jamais de token dans
 * `localStorage`). En plus du corps JSON (qu'un futur client mobile natif lira
 * via l'en-tête Authorization), login/register/refresh posent ces deux cookies
 * httpOnly — inaccessibles au JS, donc jamais exfiltrables par une XSS.
 *
 * Chaque PWA (client, restaurant, livreur, admin) a sa propre origine, donc sa
 * propre session : elle proxifie `/api/v1/*` vers ce backend (rewrites Next.js)
 * pour que les cookies restent « same-site ». `riiberaka_refresh` est scopé à
 * `/api/v1/auth/refresh` uniquement (moindre exposition).
 */
export const ACCESS_TOKEN_COOKIE_NAME = 'riiberaka_access';
export const REFRESH_TOKEN_COOKIE_NAME = 'riiberaka_refresh';
const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth/refresh`;

// Alignées sur les valeurs par défaut de JWT_ACCESS_EXPIRES_IN/
// JWT_REFRESH_EXPIRES_IN (voir .env.example) — un simple plafond de
// rétention côté navigateur, jamais la frontière de sécurité réelle : le
// token reste de toute façon revérifié (signature + expiration + session
// active en base, voir session-validation.util.ts) à chaque requête, quelle
// que soit la durée de vie du cookie qui le transporte.
const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export interface CookieTokens {
  accessToken: string;
  refreshToken: string;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function setAuthCookies(res: Response, tokens: CookieTokens): void {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: API_PREFIX,
    maxAge: ACCESS_COOKIE_MAX_AGE_MS,
  });
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, { path: API_PREFIX });
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}
