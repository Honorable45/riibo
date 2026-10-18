import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_COOKIE_NAME } from '../auth/auth-cookies.util';

const jwt = new JwtService();

interface TrackedRequest {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
}

/**
 * Clé de limitation de débit : l'UTILISATEUR quand la requête porte un jeton d'accès dont la signature est
 * valide, sinon l'adresse IP. Sans cela, tous les appareils derrière une même IP (Wi-Fi d'un restaurant, réseau
 * mobile partagé) se partageraient un seul quota et se bloqueraient mutuellement.
 * La signature est vérifiée (jamais lue « à l'aveugle ») : un attaquant ne peut pas fabriquer d'identités pour
 * échapper aux limites. Les routes sensibles (connexion, inscription, OTP) sont anonymes, donc toujours par IP.
 */
export function throttleTracker(req: TrackedRequest): Promise<string> {
  const header = req.headers?.authorization;
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token = bearer ?? req.cookies?.[ACCESS_TOKEN_COOKIE_NAME];
  const secret = process.env.JWT_ACCESS_SECRET;
  if (token && secret) {
    try {
      const payload = jwt.verify<{ sub?: string }>(token, { secret });
      if (payload.sub) return Promise.resolve(`user:${payload.sub}`);
    } catch {
      /* jeton invalide ou expiré : on retombe sur l'IP */
    }
  }
  return Promise.resolve(`ip:${req.ip ?? 'unknown'}`);
}
