/**
 * Préfixe global de l'API (versionné : un futur client mobile natif pourra
 * continuer d'appeler /api/v1 pendant qu'une /api/v2 apparaît). Source unique :
 * main.ts, les URLs de médias renvoyées aux clients, les chemins de cookies et
 * les tests l'importent au lieu de le réécrire.
 */
export const API_PREFIX = '/api/v1';
