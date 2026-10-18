import type { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { parse as parseCookies } from 'cookie';
import type { Socket } from 'socket.io';
import { ACCESS_TOKEN_COOKIE_NAME } from '../auth/auth-cookies.util';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { assertSessionActive } from '../auth/session-validation.util';

/**
 * Authentifie une connexion WebSocket entrante à partir du token JWT d'accès
 * — même logique de bout en bout (token en `auth.token`, en en-tête
 * `Authorization`, ou dans le cookie httpOnly posé par login/refresh, même
 * secret) que EventsGateway, extraite ici pour être réutilisée telle quelle
 * par tout gateway supplémentaire (ex. CallsGateway, namespace "/calls")
 * sans risquer une divergence entre deux copies.
 *
 * Vérifie aussi en base que la session référencée par le token est toujours
 * active (voir assertSessionActive) — sans quoi un token signé resterait
 * accepté pour ouvrir de nouvelles connexions même après logout/révocation,
 * exactement comme pour les requêtes HTTP (voir JwtStrategy).
 *
 * Lève une erreur si aucun token n'est fourni ou s'il est invalide —
 * à charge de l'appelant de déconnecter le socket (voir handleConnection
 * des gateways concernés).
 */
export async function verifySocketUserId(
  client: Socket,
  jwt: JwtService,
  config: ConfigService,
  prisma: PrismaService,
): Promise<string> {
  const authToken = client.handshake.auth?.token as string | undefined;
  const header = client.handshake.headers.authorization;
  const headerToken = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : undefined;
  const cookieHeader = client.handshake.headers.cookie;
  const cookieToken =
    typeof cookieHeader === 'string'
      ? parseCookies(cookieHeader)[ACCESS_TOKEN_COOKIE_NAME]
      : undefined;
  const token = authToken ?? headerToken ?? cookieToken;
  if (!token) {
    throw new Error('Aucun token fourni pour la connexion WebSocket.');
  }
  const payload = await jwt.verifyAsync<JwtPayload>(token, {
    secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
  });
  await assertSessionActive(prisma, payload.sessionId, payload.sub);
  return payload.sub;
}

/**
 * Authentifie les sockets dans un middleware Socket.IO, AVANT que la connexion
 * soit établie côté client. Sans cela, `connect` se déclenche côté navigateur
 * alors que l'authentification serveur (requête en base) n'est pas terminée :
 * un événement émis dès la connexion (`conversation:opened`, `presence:ping`)
 * arrive sur un socket dont `data.userId` n'est pas encore posé, et est ignoré
 * en silence. Avec ce middleware, un socket n'est « connecté » qu'une fois
 * authentifié, et `client.data.userId` est toujours disponible dans les handlers.
 */
export function registerSocketAuthMiddleware(
  server: { use: (fn: (socket: Socket, next: (err?: Error) => void) => void) => unknown },
  deps: { jwt: JwtService; config: ConfigService; prisma: PrismaService; logger: Logger },
): void {
  server.use((socket, next) => {
    verifySocketUserId(socket, deps.jwt, deps.config, deps.prisma)
      .then((userId) => {
        (socket.data as { userId?: string }).userId = userId;
        next();
      })
      .catch((error: unknown) => {
        deps.logger.warn(
          `Connexion WebSocket refusée : ${error instanceof Error ? error.message : String(error)}`,
        );
        // Message volontairement générique : ne jamais détailler la cause au client.
        next(new Error('Non autorisé'));
      });
  });
}
