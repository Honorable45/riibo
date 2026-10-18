import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_PREFIX } from './common/api-prefix';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validateStartupConfig } from './config/startup-validation';
import { RedisService } from './redis/redis.service';
import { RedisIoAdapter } from './websocket/redis-io.adapter';

async function bootstrap() {
  // Avant même de construire l'application : un secret faible/par défaut ou
  // une inscription jamais réellement vérifiée en production sont des
  // erreurs de configuration, pas des états qu'il faut laisser démarrer
  // (voir startup-validation.ts, audit de sécurité).
  validateStartupConfig(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Derrière Render (et Vercel qui relaie /api/v1) l'IP TCP est celle d'un
  // proxy : sans ceci, limitation de débit et journaux verraient tous les
  // clients comme un seul. TRUST_PROXY_HOPS = nombre de proxys de confiance
  // devant l'API (Vercel → Render = 2). 0 (défaut) = aucun.
  const proxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10);
  if (proxyHops > 0) app.set('trust proxy', proxyHops);

  // En-têtes de sécurité de base (section 23). CSP désactivée explicitement
  // plutôt que laissée au défaut de helmet : le défaut casserait la page
  // Swagger (/api/v1/docs, scripts/styles inline) sans apporter grand-chose ici
  // — cette API ne sert pas de HTML applicatif. Une CSP dédiée au frontend
  // reste à affiner côté Next.js si besoin.
  // Temps réel multi-instances : les événements Socket.IO transitent par Redis.
  const ioAdapter = new RedisIoAdapter(app, app.get(RedisService));
  ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  app.use(helmet({ contentSecurityPolicy: false }));

  // Nécessaire pour lire les cookies httpOnly d'authentification (audit de
  // sécurité, voir auth-cookies.util.ts) — non signés : leur contenu est un
  // JWT, déjà signé et vérifié séparément (JwtStrategy), signer le cookie
  // lui-même n'apporterait rien de plus.
  app.use(cookieParser());

  app.setGlobalPrefix(API_PREFIX.slice(1));
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Jamais exposé en production (audit de sécurité) : Swagger documente
  // toute la surface de l'API, y compris des détails utiles à un attaquant,
  // sans authentification pour le consulter.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Riiberaka API')
      .setDescription(
        'API Riiberaka — restaurants, menus, commandes, livraison, paiement et chat temps réel (client, restaurant, livreur, admin).',
      )
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${API_PREFIX.slice(1)}/docs`, app, document);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  await app.listen(port);

  console.log(`Riiberaka API listening on http://localhost:${port}/api/v1`);
}

bootstrap().catch((error: unknown) => {
  console.error('Riiberaka API failed to start:', error);
  process.exit(1);
});
