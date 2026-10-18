import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { NotificationsService } from '../src/notifications/notifications.service';
import { createTestApp } from './utils/test-app';
import { createTestPrisma, resetDatabase } from './utils/test-db';
import { registerTestUser, TestUser } from './utils/test-users';

jest.setTimeout(60_000);

const KEYS = { p256dh: `B${'a'.repeat(86)}`, auth: 'a'.repeat(22) };
const endpoint = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;

describe('Notifications et Web Push (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let baseUrl: string;
  let a: TestUser;
  let b: TestUser;
  const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });
  const api = () => request(app.getHttpServer());

  const login = async (user: TestUser) =>
    (await api().post('/api/v1/auth/login').send({ identifier: user.phone, password: 'un-mot-de-passe-solide' }).expect(200))
      .body as { accessToken: string; refreshToken: string };

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    a = await registerTestUser(app);
    b = await registerTestUser(app);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('Notifications', () => {
    let ids: string[];

    beforeAll(async () => {
      const service = app.get(NotificationsService);
      ids = [];
      for (let i = 1; i <= 5; i += 1) {
        const created = await service.create(a.id, 'ORDER_READY', { orderId: `o${i}`, orderNumber: i });
        ids.push(created!.id);
      }
      await service.create(b.id, 'SYSTEM', { body: 'Pour B uniquement' });
    });

    it('exige une authentification', async () => {
      await api().get('/api/v1/notifications').expect(401);
      await api().get('/api/v1/notifications/unread-count').expect(401);
    });

    it("liste les notifications de l'utilisateur, plus récentes d'abord, paginées par curseur", async () => {
      const page1 = await api().get('/api/v1/notifications?limit=2').set(auth(a)).expect(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.items[0].id).toBe(ids[4]);
      expect(page1.body.nextCursor).toBeTruthy();

      const page2 = await api().get(`/api/v1/notifications?limit=2&cursor=${page1.body.nextCursor}`).set(auth(a)).expect(200);
      expect(page2.body.items.map((n: { id: string }) => n.id)).toEqual([ids[2], ids[1]]);

      const last = await api().get(`/api/v1/notifications?limit=2&cursor=${page2.body.nextCursor}`).set(auth(a)).expect(200);
      expect(last.body.items).toHaveLength(1);
      expect(last.body.nextCursor).toBeNull();
      await api().get('/api/v1/notifications?limit=500').set(auth(a)).expect(400);
    });

    it("ne montre jamais les notifications d'un autre utilisateur", async () => {
      const mine = await api().get('/api/v1/notifications').set(auth(b)).expect(200);
      expect(mine.body.items).toHaveLength(1);
      expect(JSON.stringify(mine.body)).not.toContain('"orderId"');
      const other = await api().get('/api/v1/notifications').set(auth(a)).expect(200);
      expect(JSON.stringify(other.body)).not.toContain('Pour B uniquement');
    });

    it('compte les non lues, marque une notification lue (idempotent), et refuse celle d\'un autre (404)', async () => {
      expect((await api().get('/api/v1/notifications/unread-count').set(auth(a)).expect(200)).body).toEqual({ count: 5 });

      await api().patch(`/api/v1/notifications/${ids[0]}/read`).set(auth(b)).expect(404);
      expect((await api().get('/api/v1/notifications/unread-count').set(auth(a)).expect(200)).body.count).toBe(5);

      const first = await api().patch(`/api/v1/notifications/${ids[0]}/read`).set(auth(a)).expect(200);
      const again = await api().patch(`/api/v1/notifications/${ids[0]}/read`).set(auth(a)).expect(200);
      expect(again.body.readAt).toBe(first.body.readAt);
      expect((await api().get('/api/v1/notifications/unread-count').set(auth(a)).expect(200)).body.count).toBe(4);
    });

    it('« tout marquer comme lu » ne touche que les notifications de son propriétaire', async () => {
      const res = await api().patch('/api/v1/notifications/read-all').set(auth(a)).expect(200);
      expect(res.body.count).toBe(4);
      expect((await api().get('/api/v1/notifications/unread-count').set(auth(a)).expect(200)).body.count).toBe(0);
      expect((await api().get('/api/v1/notifications/unread-count').set(auth(b)).expect(200)).body.count).toBe(1);
    });

    it('désactiver les notifications dans son profil empêche d\'en créer (et de pousser)', async () => {
      await api().patch('/api/v1/users/me/profile').set(auth(b)).send({ notificationsEnabled: false }).expect(200);
      const service = app.get(NotificationsService);
      expect(await service.create(b.id, 'ORDER_READY', { orderId: 'o9' })).toBeNull();
      expect((await api().get('/api/v1/notifications/unread-count').set(auth(b)).expect(200)).body.count).toBe(1);
      await api().patch('/api/v1/users/me/profile').set(auth(b)).send({ notificationsEnabled: true }).expect(200);
    });

    it('une nouvelle notification arrive en temps réel (notification:new), seulement à son destinataire', async () => {
      const connect = (user: TestUser) =>
        new Promise<Socket>((resolve, reject) => {
          const socket = io(baseUrl, { auth: { token: user.accessToken }, reconnection: false, forceNew: true, transports: ['websocket'] });
          socket.on('connect', () => resolve(socket));
          socket.on('connect_error', reject);
        });
      const socketA = await connect(a);
      const socketB = await connect(b);
      let leaked = false;
      socketB.on('notification:new', () => { leaked = true; });
      const received = new Promise<{ type: string; payload: { orderNumber: number } }>((resolve) => socketA.once('notification:new', resolve));

      await app.get(NotificationsService).create(a.id, 'ORDER_DELIVERED', { orderId: 'o1', orderNumber: 1842 });

      await expect(received).resolves.toMatchObject({ type: 'ORDER_DELIVERED', payload: { orderNumber: 1842 } });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(leaked).toBe(false);
      socketA.close();
      socketB.close();
    });
  });

  describe('Web Push : abonnement', () => {
    it("la clé publique n'est pas servie tant que VAPID n'est pas configuré (503, jamais une fausse clé)", async () => {
      await api().get('/api/v1/push/public-key').expect(503);
    });

    it('exige une authentification', async () => {
      await api().post('/api/v1/push/subscribe').send({ endpoint: endpoint('x'), keys: KEYS }).expect(401);
    });

    it("refuse toute adresse qui n'est pas celle d'un service de push officiel (protection SSRF)", async () => {
      const forbidden = [
        'http://fcm.googleapis.com/fcm/send/x', // non chiffré
        'https://localhost/x',
        'https://127.0.0.1:3000/admin',
        'https://169.254.169.254/latest/meta-data/', // métadonnées cloud
        'https://10.0.0.5/x',
        'https://evil.example.com/fcm/send/x',
        'https://fcm.googleapis.com.evil.com/x',
        'https://fcm.googleapis.com@evil.com/x',
        'file:///etc/passwd',
        'pas une url',
      ];
      for (const bad of forbidden) {
        await api().post('/api/v1/push/subscribe').set(auth(a)).send({ endpoint: bad, keys: KEYS }).expect(400);
      }
      expect(await prisma.pushSubscription.count()).toBe(0);
    });

    it('refuse des clés de forme invalide', async () => {
      const bad = [{ p256dh: 'x', auth: KEYS.auth }, { p256dh: KEYS.p256dh, auth: 'x' }, { p256dh: `${KEYS.p256dh}!!`, auth: KEYS.auth }];
      for (const keys of bad) {
        await api().post('/api/v1/push/subscribe').set(auth(a)).send({ endpoint: endpoint('k'), keys }).expect(400);
      }
    });

    it('enregistre un abonnement valide, lié à la SESSION, sans doublon en cas de réabonnement', async () => {
      await api().post('/api/v1/push/subscribe').set(auth(a)).send({ endpoint: endpoint('one'), keys: KEYS, expirationTime: null }).expect(204);
      await api().post('/api/v1/push/subscribe').set(auth(a)).send({ endpoint: endpoint('one'), keys: KEYS }).expect(204);
      const rows = await prisma.pushSubscription.findMany({ where: { userId: a.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].sessionId).toBeTruthy();
    });

    it("plafonne à 10 abonnements par utilisateur en gardant les plus récents", async () => {
      for (let i = 0; i < 12; i += 1) {
        await api().post('/api/v1/push/subscribe').set(auth(b)).send({ endpoint: endpoint(`cap-${i}`), keys: KEYS }).expect(204);
      }
      const rows = await prisma.pushSubscription.findMany({ where: { userId: b.id }, orderBy: { createdAt: 'asc' } });
      expect(rows).toHaveLength(10);
      expect(rows.map((r) => r.endpoint)).not.toContain(endpoint('cap-0'));
      expect(rows.map((r) => r.endpoint)).toContain(endpoint('cap-11'));
      await prisma.pushSubscription.deleteMany({ where: { userId: b.id } });
    });

    it("on ne peut pas se désabonner de l'appareil d'un autre (404), mais bien du sien (204)", async () => {
      await api().delete('/api/v1/push/subscribe').set(auth(b)).send({ endpoint: endpoint('one') }).expect(404);
      expect(await prisma.pushSubscription.count({ where: { endpoint: endpoint('one') } })).toBe(1);
      await api().delete('/api/v1/push/subscribe').set(auth(a)).send({ endpoint: endpoint('one') }).expect(204);
      expect(await prisma.pushSubscription.count({ where: { endpoint: endpoint('one') } })).toBe(0);
    });
  });

  describe('Web Push : cycle de vie lié aux sessions (téléphones partagés)', () => {
    const subscribeFrom = async (token: string, id: string) =>
      api().post('/api/v1/push/subscribe').set({ Authorization: `Bearer ${token}` }).send({ endpoint: endpoint(id), keys: KEYS }).expect(204);

    it("la déconnexion supprime l'abonnement de CET appareil seulement", async () => {
      const phone = await login(a);
      const laptop = await login(a);
      await subscribeFrom(phone.accessToken, 'phone');
      await subscribeFrom(laptop.accessToken, 'laptop');

      await api().post('/api/v1/auth/logout').set({ Authorization: `Bearer ${phone.accessToken}` }).expect(204);

      const remaining = (await prisma.pushSubscription.findMany({ where: { userId: a.id } })).map((r) => r.endpoint);
      expect(remaining).toEqual([endpoint('laptop')]);
      await prisma.pushSubscription.deleteMany({ where: { userId: a.id } });
    });

    it("révoquer une session depuis « appareils connectés » coupe aussi ses notifications", async () => {
      const current = await login(a);
      const other = await login(a);
      await subscribeFrom(other.accessToken, 'other-device');
      const sessions = await api().get('/api/v1/auth/sessions').set({ Authorization: `Bearer ${current.accessToken}` }).expect(200);
      const otherSession = await prisma.pushSubscription.findFirstOrThrow({ where: { endpoint: endpoint('other-device') } });

      await api().delete(`/api/v1/auth/sessions/${otherSession.sessionId}`).set({ Authorization: `Bearer ${current.accessToken}` }).expect(204);

      expect(sessions.body.length).toBeGreaterThan(1);
      expect(await prisma.pushSubscription.count({ where: { endpoint: endpoint('other-device') } })).toBe(0);
    });

    it("« déconnecter tous les autres appareils » ne garde que l'abonnement de la session courante", async () => {
      const current = await login(a);
      const other = await login(a);
      await subscribeFrom(current.accessToken, 'keep');
      await subscribeFrom(other.accessToken, 'drop');

      await api().post('/api/v1/auth/logout-all').set({ Authorization: `Bearer ${current.accessToken}` }).expect(204);

      const remaining = (await prisma.pushSubscription.findMany({ where: { userId: a.id } })).map((r) => r.endpoint);
      expect(remaining).toContain(endpoint('keep'));
      expect(remaining).not.toContain(endpoint('drop'));
    });

    it("un appareil repris par un autre compte bascule sur ce compte (jamais partagé entre deux comptes)", async () => {
      const tokenA = await login(a);
      const tokenB = await login(b);
      await subscribeFrom(tokenA.accessToken, 'shared-phone');
      await subscribeFrom(tokenB.accessToken, 'shared-phone');
      const rows = await prisma.pushSubscription.findMany({ where: { endpoint: endpoint('shared-phone') } });
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(b.id);
    });
  });
});
