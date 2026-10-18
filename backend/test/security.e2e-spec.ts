import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp } from './utils/test-app';
import { createTestPrisma, resetDatabase } from './utils/test-db';
import { registerTestUser, TestUser } from './utils/test-users';

const PASSWORD = 'un-mot-de-passe-solide';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(197, 5)]);

describe('Sécurité : validité des jetons et uploads (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const http = () => request(app.getHttpServer());
  const me = (u: TestUser) =>
    http().get('/api/v1/users/me').set('Authorization', `Bearer ${u.accessToken}`);

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('un access token encore signé et non expiré est refusé quand la session ne l’est plus', () => {
    it('après logout', async () => {
      const u = await registerTestUser(app);
      await me(u).expect(200);
      await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .expect(204);
      await me(u).expect(401);
    });

    it('après réinitialisation du mot de passe (toutes les sessions révoquées)', async () => {
      const u = await registerTestUser(app);
      await me(u).expect(200);
      const rawToken = 'jeton-de-reinitialisation-de-test';
      await prisma.passwordResetToken.create({
        data: {
          userId: u.id,
          tokenHash: await bcrypt.hash(rawToken, 4),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await http()
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'nouveau-mot-de-passe-solide' })
        .expect(204);
      await me(u).expect(401);
      await http().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
    });

    it('après changement du mot de passe : les AUTRES sessions tombent, la courante reste', async () => {
      const u = await registerTestUser(app);
      const other = await http()
        .post('/api/v1/auth/login')
        .send({ identifier: u.username, password: PASSWORD })
        .expect(200);
      await http()
        .patch('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: 'encore-un-mot-de-passe-solide' })
        .expect(204);
      await me(u).expect(200);
      await http()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${other.body.accessToken}`)
        .expect(401);
    });

    it('après désactivation du compte', async () => {
      const u = await registerTestUser(app);
      await me(u).expect(200);
      await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
      await me(u).expect(401);
    });

    it('après suppression du compte', async () => {
      const u = await registerTestUser(app);
      await me(u).expect(200);
      await prisma.user.delete({ where: { id: u.id } });
      await me(u).expect(401);
    });

    it('un changement de rôle prend effet à la requête suivante (le rôle n’est jamais lu dans le jeton)', async () => {
      const u = await registerTestUser(app);
      await http().get('/api/v1/cart').set('Authorization', `Bearer ${u.accessToken}`).expect(200);
      await prisma.user.update({ where: { id: u.id }, data: { role: 'RESTAURANT' } });
      await http().get('/api/v1/cart').set('Authorization', `Bearer ${u.accessToken}`).expect(403);
    });

    it('un jeton falsifié ou absent est refusé', async () => {
      await http().get('/api/v1/users/me').expect(401);
      await http().get('/api/v1/users/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    });
  });

  describe('POST /users/me/avatar (upload)', () => {
    let u: TestUser;
    const upload = () =>
      http().post('/api/v1/users/me/avatar').set('Authorization', `Bearer ${u.accessToken}`);

    beforeAll(async () => {
      u = await registerTestUser(app);
    });

    it('exige un fichier', async () => {
      await upload().expect(400);
    });

    it('refuse un fichier trop volumineux', async () => {
      const big = Buffer.concat([JPEG, Buffer.alloc(9 * 1024 * 1024, 7)]);
      const res = await upload().attach('avatar', big, {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      });
      expect([400, 413]).toContain(res.status);
    });

    it('refuse un type MIME non autorisé', async () => {
      await upload()
        .attach('avatar', Buffer.from('<?php echo 1; ?>'), {
          filename: 'x.php',
          contentType: 'application/x-php',
        })
        .expect(400);
      await upload()
        .attach('avatar', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
          filename: 'x.svg',
          contentType: 'image/svg+xml',
        })
        .expect(400);
    });

    it('refuse un contenu qui ne correspond pas au type déclaré', async () => {
      await upload()
        .attach('avatar', Buffer.from("ceci n'est pas une image"), {
          filename: 'fake.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);
    });

    it('accepte une vraie image', async () => {
      await upload()
        .attach('avatar', JPEG, { filename: 'ok.jpg', contentType: 'image/jpeg' })
        .expect(201);
    });
  });

  describe('contrôle des rôles', () => {
    it('un client ne peut appeler ni une route admin ni une route restaurant, un visiteur reçoit 401', async () => {
      const client = await registerTestUser(app);
      await http()
        .get('/api/v1/admin/promos')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .expect(403);
      await http()
        .post('/api/v1/admin/promos')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({})
        .expect(403);
      await http().get('/api/v1/admin/promos').expect(401);
    });
  });
});
