import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './utils/test-app';
import { createTestPrisma, resetDatabase } from './utils/test-db';
import { registerTestUser } from './utils/test-users';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/register', () => {
    const base = { firstName: 'Jean', password: 'un-mot-de-passe-solide' };
    let sharedPhone: string;

    it('crée un CLIENT réel en base et renvoie des tokens, jamais le hash du mot de passe', async () => {
      sharedPhone = '+22890111111';
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...base, accountType: 'CLIENT', phone: sharedPhone })
        .expect(201);

      expect(res.body.user.role).toBe('CLIENT');
      expect(res.body.user.username).toBe('user90111111'); // généré, jamais choisi
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user.passwordHash).toBeUndefined();

      const stored = await prisma.user.findUnique({ where: { phone: sharedPhone } });
      expect(stored?.passwordHash).not.toBe('un-mot-de-passe-solide');
      expect(stored?.phoneVerifiedAt).toBeNull(); // aucun code SMS contrôlé
    });

    it('crée un RESTAURANT avec un établissement PENDING dont il est OWNER', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          ...base,
          accountType: 'RESTAURANT',
          phone: '+22890111112',
          restaurantName: 'Chez Maman',
          restaurantAddress: 'Agoè, près du marché',
        })
        .expect(201);
      expect(res.body.user.role).toBe('RESTAURANT');

      const restaurant = await prisma.restaurant.findUnique({
        where: { slug: 'chez-maman' },
        include: { members: true },
      });
      expect(restaurant?.status).toBe('PENDING');
      expect(restaurant?.members[0]).toMatchObject({ userId: res.body.user.id, role: 'OWNER' });
    });

    it('crée un LIVREUR avec un profil PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...base, accountType: 'LIVREUR', phone: '+22890111113', vehicleType: 'MOTO' })
        .expect(201);
      expect(res.body.user.role).toBe('LIVREUR');

      const driver = await prisma.driverProfile.findUnique({ where: { userId: res.body.user.id } });
      expect(driver?.status).toBe('PENDING');
    });

    it("refuse ADMIN comme type de compte (400) : un admin ne s'obtient jamais par inscription", async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...base, accountType: 'ADMIN', phone: '+22890111114' })
        .expect(400);
      expect(await prisma.user.findUnique({ where: { phone: '+22890111114' } })).toBeNull();
    });

    it('refuse un champ "role" envoyé par le client (400, jamais ignoré silencieusement)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...base, accountType: 'CLIENT', role: 'ADMIN', phone: '+22890111115' })
        .expect(400);
      expect(await prisma.user.findUnique({ where: { phone: '+22890111115' } })).toBeNull();
    });

    it('refuse un numéro déjà utilisé (409)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...base, accountType: 'CLIENT', phone: sharedPhone })
        .expect(409);
    });

    it('refuse sans téléphone (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...base, accountType: 'CLIENT' })
        .expect(400);
    });

    it('refuse un restaurant sans nom ni adresse (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...base, accountType: 'RESTAURANT', phone: '+22890111116' })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('connecte avec le téléphone', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: '+22890111111', password: 'un-mot-de-passe-solide' })
        .expect(200);
      expect(res.body.user.role).toBe('CLIENT');
    });

    it('refuse un mauvais mot de passe avec un message générique', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: '+22890111111', password: 'mauvais-mot-de-passe' })
        .expect(401);
      expect(res.body.message.message).toBe('Identifiants invalides.');
    });

    it('refuse un identifiant inconnu avec exactement le même message générique', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'personne-nexiste-pas', password: 'peu-importe' })
        .expect(401);
      expect(res.body.message.message).toBe('Identifiants invalides.');
    });

    it('refuse un compte suspendu, avec le même message générique', async () => {
      await prisma.user.update({ where: { phone: '+22890111113' }, data: { isActive: false } });
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: '+22890111113', password: 'un-mot-de-passe-solide' })
        .expect(401);
      expect(res.body.message.message).toBe('Identifiants invalides.');
    });
  });

  describe('Le rôle est relu en base à chaque requête', () => {
    it('un compte suspendu perd immédiatement l\'accès avec son access token encore valide', async () => {
      const user = await registerTestUser(app);
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(401);
    });
  });

  describe('Routes protégées', () => {
    it('refuse sans token (401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });

    it('refuse avec un token invalide (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer ceci-nest-pas-un-jwt')
        .expect(401);
    });

    it('autorise avec un token valide', async () => {
      const user = await registerTestUser(app);
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body.id).toBe(user.id);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('renvoie de nouveaux tokens valides avec un refresh token valide', async () => {
      const user = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      expect(typeof res.body.accessToken).toBe('string');
      // Le nouveau token fonctionne réellement.
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('refuse un refresh token invalide (401)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'ceci-nest-pas-un-refresh-token' })
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('invalide bien la session : le refresh token ne fonctionne plus après', async () => {
      const user = await registerTestUser(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
    });

    it("invalide aussi immédiatement l'access token déjà émis (et pas seulement au prochain refresh)", async () => {
      const user = await registerTestUser(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(401);
    });
  });

  describe('DELETE /api/auth/sessions/:id', () => {
    it("révoque immédiatement l'access token de la session ciblée, pas seulement le refresh token", async () => {
      const password = 'un-mot-de-passe-solide';
      const owner = await registerTestUser(app, { password });
      const username = owner.username;

      // Deuxième "appareil" : connexion séparée pour le même compte, avec
      // sa propre session à révoquer depuis la première.
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: username, password })
        .expect(200);
      const otherAccessToken = loginRes.body.accessToken as string;

      const sessionsRes = await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const otherSession = (sessionsRes.body as Array<{ id: string; isCurrent: boolean }>).find(
        (s) => !s.isCurrent,
      );
      expect(otherSession).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/api/v1/auth/sessions/${otherSession!.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .expect(401);
    });
  });

  describe('PATCH /api/auth/change-password', () => {
    it('révoque les autres sessions : leur access token devient inutilisable', async () => {
      const password = 'un-mot-de-passe-solide';
      const owner = await registerTestUser(app, { password });
      const username = owner.username;

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: username, password })
        .expect(200);
      const otherAccessToken = loginRes.body.accessToken as string;

      await request(app.getHttpServer())
        .patch('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ currentPassword: password, newPassword: 'un-nouveau-mot-de-passe-solide' })
        .expect(204);

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .expect(401);
    });
  });

  describe('Cookies httpOnly (audit de sécurité, migration hors localStorage)', () => {
    function extractCookie(res: request.Response, name: string): string | undefined {
      const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
      return raw?.find((c) => c.startsWith(`${name}=`));
    }

    it('pose riiberaka_access et riiberaka_refresh (httpOnly) à la connexion', async () => {
      const password = 'un-mot-de-passe-solide';
      const owner = await registerTestUser(app, { password });
      const username = owner.username;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: username, password })
        .expect(200);

      const access = extractCookie(res, 'riiberaka_access');
      const refresh = extractCookie(res, 'riiberaka_refresh');
      expect(access).toBeDefined();
      expect(access).toContain('HttpOnly');
      expect(refresh).toBeDefined();
      expect(refresh).toContain('HttpOnly');
      expect(refresh).toContain('Path=/api/v1/auth/refresh');
    });

    it('authentifie une requête via le cookie riiberaka_access, sans en-tête Authorization', async () => {
      const user = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Cookie', `riiberaka_access=${user.accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(user.id);
    });

    it('accepte un refresh via le cookie riiberaka_refresh seul (sans corps)', async () => {
      const user = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `riiberaka_refresh=${user.refreshToken}`)
        .send({})
        .expect(200);

      expect(typeof res.body.accessToken).toBe('string');
    });

    it('efface les cookies à la déconnexion', async () => {
      const user = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);

      const access = extractCookie(res, 'riiberaka_access');
      expect(access).toContain('Expires=Thu, 01 Jan 1970');
    });
  });

  describe('POST /api/v1/auth/socket-token', () => {
    it('émet un jeton court utilisable pour la connexion WebSocket', async () => {
      const user = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/socket-token')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(typeof res.body.token).toBe('string');
      expect(res.body.expiresIn).toBe(120);
    });

    it('refuse sans authentification', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/socket-token').expect(401);
    });
  });
});
