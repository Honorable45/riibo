import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Services Web Push connus (navigateurs). Le serveur enverra une requête HTTP à
 * l'`endpoint` fourni par le client : sans liste blanche, n'importe quel
 * utilisateur authentifié pourrait faire appeler par le serveur une adresse
 * arbitraire, y compris interne (SSRF : localhost, réseau privé, métadonnées
 * cloud). On n'accepte donc que les hôtes des services de push officiels.
 */
const ALLOWED_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge, Opera, navigateurs Android
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari / PWA iOS
  'notify.windows.com', // Windows (WNS)
];

const MAX_ENDPOINT_LENGTH = 2048;

function extraAllowedHosts(): string[] {
  return (process.env.PUSH_ENDPOINT_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedPushEndpoint(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false; // « https://fcm.googleapis.com@evil.com »
  if (url.port && url.port !== '443') return false;

  const host = url.hostname.toLowerCase();
  return [...ALLOWED_HOST_SUFFIXES, ...extraAllowedHosts()].some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function IsPushEndpoint(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isPushEndpoint',
      target: object.constructor,
      propertyName,
      options: {
        message: "L'adresse d'abonnement push n'est pas celle d'un service de notification connu.",
        ...options,
      },
      validator: { validate: (value: unknown) => isAllowedPushEndpoint(value) },
    });
}
