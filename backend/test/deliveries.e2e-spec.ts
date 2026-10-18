import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { DispatchService } from '../src/deliveries/dispatch.service';
import { DRIVER_LOCATION_STORE } from '../src/deliveries/deliveries.tokens';
import type { DriverLocationStore } from '../src/deliveries/driver-location.store';
import { createTestApp } from './utils/test-app';
import { createTestPrisma, resetDatabase } from './utils/test-db';
import { registerTestUser, TestUser } from './utils/test-users';

jest.setTimeout(90_000);

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(197, 5)]);
const ALL_DAY = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, opensAt: '00:00', closesAt: '00:00' }));
const RESTO = { latitude: 6.2311, longitude: 1.1953 };
const AT = {
  near: { latitude: RESTO.latitude + 0.005, longitude: RESTO.longitude }, // ~0,5 km
  mid: { latitude: RESTO.latitude + 0.04, longitude: RESTO.longitude }, // ~4,4 km
  far: { latitude: RESTO.latitude + 0.2, longitude: RESTO.longitude }, // ~22 km
};

describe('Livraison (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let dispatch: DispatchService;
  let locations: DriverLocationStore;
  let baseUrl: string;
  let admin: TestUser;
  let client: TestUser;
  let client2: TestUser;
  let owner: TestUser;
  let d1: TestUser;
  let d2: TestUser;
  let d3: TestUser;
  let restaurantId: string;
  let colaId: string;
  const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });
  const api = () => request(app.getHttpServer());
  const profileOf = (user: TestUser) => prisma.driverProfile.findUniqueOrThrow({ where: { userId: user.id } });

  /** Le balayeur n'attend pas 15 s en test : on « vieillit » la course pour qu'un nouveau tour soit dû. */
  async function ageDelivery(deliveryId: string) {
    await prisma.$executeRaw`UPDATE deliveries SET "updatedAt" = now() - interval '1 minute' WHERE id = ${deliveryId}`;
  }

  async function goOnline(user: TestUser, position: { latitude: number; longitude: number }) {
    await api().put('/api/v1/driver/me/availability').set(auth(user)).send({ online: true }).expect(200);
    await api().post('/api/v1/driver/location').set(auth(user)).send(position).expect(200);
  }

  /** Commande livraison passée par `who`, acceptée puis en préparation (déclenche la course). */
  async function orderInPreparation(who: TestUser = client) {
    await api().post('/api/v1/cart/items').set(auth(who)).send({ menuItemId: colaId, quantity: 3 }).expect(201);
    const created = await api()
      .post('/api/v1/orders')
      .set(auth(who))
      .send({ deliveryType: 'DELIVERY', address: 'Agoè, rue 12', landmark: 'Portail bleu', latitude: 6.24, longitude: 1.2, paymentMethod: 'CASH_ON_DELIVERY' })
      .expect(201);
    const orderId = created.body.id as string;
    const base = `/api/v1/restaurant/${restaurantId}/orders/${orderId}`;
    await api().post(`${base}/accept`).set(auth(owner)).expect(200);
    await api().post(`${base}/start-preparing`).set(auth(owner)).expect(200);
    const delivery = await prisma.delivery.findUniqueOrThrow({ where: { orderId } });
    return { orderId, deliveryId: delivery.id, base };
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    dispatch = app.get(DispatchService);
    locations = app.get<DriverLocationStore>(DRIVER_LOCATION_STORE);

    admin = await registerTestUser(app);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    client = await registerTestUser(app, { firstName: 'Jean' });
    client2 = await registerTestUser(app, { firstName: 'Ama' });
    owner = await registerTestUser(app, { accountType: 'RESTAURANT', restaurantName: 'Chez Maman', restaurantAddress: 'Agoè' });
    d1 = await registerTestUser(app, { accountType: 'LIVREUR', firstName: 'Kofi' });
    d2 = await registerTestUser(app, { accountType: 'LIVREUR', firstName: 'Yao' });
    d3 = await registerTestUser(app, { accountType: 'LIVREUR', firstName: 'Edem' });

    restaurantId = (await prisma.restaurantMember.findFirstOrThrow({ where: { userId: owner.id } })).restaurantId;
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { status: 'APPROVED', deliveryFee: 1000, minOrderAmount: 1000, ...RESTO, hours: { create: ALL_DAY } },
    });
    colaId = (await prisma.menuItem.create({ data: { restaurantId, name: 'Coca-Cola', price: 500 } })).id;
    // d2 et d3 approuvés directement ; d1 passe par le parcours complet (voir « Onboarding »).
    await prisma.driverProfile.updateMany({ where: { userId: { in: [d2.id, d3.id] } }, data: { status: 'APPROVED' } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('Onboarding et validation du livreur', () => {
    it('un livreur en attente peut consulter son dossier mais ne reçoit ni offre ni disponibilité (403)', async () => {
      const me = await api().get('/api/v1/driver/me').set(auth(d1)).expect(200);
      expect(me.body).toMatchObject({ status: 'PENDING', isOnline: false });
      await api().get('/api/v1/driver/offers').set(auth(d1)).expect(403);
      await api().put('/api/v1/driver/me/availability').set(auth(d1)).send({ online: true }).expect(403);
      await api().post('/api/v1/driver/location').set(auth(d1)).send(AT.near).expect(403);
    });

    it('les espaces livreur sont fermés aux clients, aux restaurants et aux visiteurs', async () => {
      await api().get('/api/v1/driver/me').set(auth(client)).expect(403);
      await api().get('/api/v1/driver/me').set(auth(owner)).expect(403);
      await api().get('/api/v1/driver/me').expect(401);
    });

    it('la soumission exige les pièces, liste ce qui manque, puis passe en vérification', async () => {
      const incomplete = await api().post('/api/v1/driver/me/submit').set(auth(d1)).expect(400);
      expect(JSON.stringify(incomplete.body)).toContain("Pièce d'identité");
      await api().patch('/api/v1/driver/me').set(auth(d1)).send({ vehicleType: 'MOTO', plateNumber: 'tg-1234-ab', vehicleBrand: 'Haojue' }).expect(200);
      for (const type of ['id-card', 'selfie-with-id']) {
        await api().post(`/api/v1/driver/me/documents/${type}`).set(auth(d1)).attach('document', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' }).expect(201);
      }
      await api().post('/api/v1/driver/me/documents/id-card').set(auth(d1)).attach('document', Buffer.from('faux'), { filename: 'x.jpg', contentType: 'image/jpeg' }).expect(400);
      const me = await api().post('/api/v1/driver/me/submit').set(auth(d1)).expect(200);
      expect(me.body.status).toBe('IN_REVIEW');
      expect(me.body.plateNumber).toBe('TG-1234-AB');
      expect(me.body.documents).toMatchObject({ 'id-card': true, 'driving-license': false });
      expect(JSON.stringify(me.body)).not.toContain('local:');
    });

    it("l'admin valide (motif obligatoire pour refuser), la consultation d'une pièce est tracée, le livreur est notifié", async () => {
      await api().get('/api/v1/admin/drivers').set(auth(client)).expect(403);
      const list = await api().get('/api/v1/admin/drivers?status=IN_REVIEW').set(auth(admin)).expect(200);
      const driverId = list.body.items[0].id as string;
      expect(list.body.items[0].user.phone).toBe(d1.phone);

      await api().get(`/api/v1/admin/drivers/${driverId}/documents/id-card`).set(auth(admin)).expect(200);
      expect(await prisma.auditLog.count({ where: { action: 'DRIVER_DOCUMENT_VIEWED', targetId: driverId } })).toBe(1);

      await api().patch(`/api/v1/admin/drivers/${driverId}/status`).set(auth(admin)).send({ action: 'REJECT' }).expect(400);
      await api().patch(`/api/v1/admin/drivers/${driverId}/status`).set(auth(admin)).send({ action: 'REACTIVATE' }).expect(409);
      const approved = await api().patch(`/api/v1/admin/drivers/${driverId}/status`).set(auth(admin)).send({ action: 'APPROVE' }).expect(200);
      expect(approved.body.status).toBe('APPROVED');
      expect(await prisma.notification.count({ where: { userId: d1.id, type: 'ACCOUNT_APPROVED' } })).toBe(1);
    });
  });

  describe('Disponibilité et position (Redis uniquement)', () => {
    it('la position est refusée hors ligne, validée, et vit dans le store — jamais en base', async () => {
      await api().post('/api/v1/driver/location').set(auth(d1)).send(AT.near).expect(409);
      await api().put('/api/v1/driver/me/availability').set(auth(d1)).send({ online: true }).expect(200);
      await api().post('/api/v1/driver/location').set(auth(d1)).send({ latitude: 95, longitude: 1 }).expect(400);
      await api().post('/api/v1/driver/location').set(auth(d1)).send({ latitude: 'x', longitude: 1 }).expect(400);
      await api().post('/api/v1/driver/location').set(auth(d1)).send(AT.near).expect(200);

      const profile = await profileOf(d1);
      expect(await locations.get(profile.id)).toMatchObject(AT.near);
      // Le schéma ne comporte aucune colonne de position pour le livreur.
      expect(Object.keys(profile)).not.toEqual(expect.arrayContaining(['latitude', 'longitude']));
    });

    it('se mettre hors ligne efface la position', async () => {
      const profile = await profileOf(d1);
      await api().put('/api/v1/driver/me/availability').set(auth(d1)).send({ online: false }).expect(200);
      expect(await locations.get(profile.id)).toBeNull();
      await api().post('/api/v1/driver/location').set(auth(d1)).send(AT.near).expect(409);
    });
  });

  describe('Appariement par tours', () => {
    let orderId: string;
    let deliveryId: string;

    beforeAll(async () => {
      await goOnline(d1, AT.near);
      await goOnline(d2, AT.mid);
      await goOnline(d3, AT.far);
      ({ orderId, deliveryId } = await orderInPreparation());
    });

    it("la course naît avec la préparation, avec deux codes distincts à 6 chiffres", async () => {
      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(delivery.pickupCode).toMatch(/^\d{6}$/);
      expect(delivery.deliveryCode).toMatch(/^\d{6}$/);
      expect(delivery.pickupCode).not.toBe(delivery.deliveryCode);
      expect(delivery.deliveryFee).toBe(1000);
      expect(delivery.status).toBe('SEARCHING');
    });

    it("tour 1 (3 km) : seul le livreur proche reçoit l'offre, sans l'adresse exacte du client", async () => {
      const offers = await prisma.deliveryOffer.findMany({ where: { deliveryId } });
      expect(offers).toHaveLength(1);
      expect(offers[0].driverId).toBe((await profileOf(d1)).id);

      const seen = await api().get('/api/v1/driver/offers').set(auth(d1)).expect(200);
      expect(seen.body).toHaveLength(1);
      expect(seen.body[0]).toMatchObject({ deliveryFee: 1000, restaurant: { name: 'Chez Maman' } });
      expect(JSON.stringify(seen.body)).not.toContain('Portail bleu');
      expect((await api().get('/api/v1/driver/offers').set(auth(d2)).expect(200)).body).toHaveLength(0);
      expect(await prisma.notification.count({ where: { userId: d1.id, type: 'DELIVERY_OFFER' } })).toBe(1);
    });

    it('un refus exclut ce livreur ; le tour suivant élargit le rayon (5 km) et sollicite le suivant', async () => {
      await api().post(`/api/v1/driver/offers/${deliveryId}/reject`).set(auth(d1)).expect(204);
      await api().post(`/api/v1/driver/offers/${deliveryId}/reject`).set(auth(d1)).expect(404); // déjà répondu
      await ageDelivery(deliveryId);
      await dispatch.tick();

      const offers = await prisma.deliveryOffer.findMany({ where: { deliveryId }, include: { driver: true } });
      expect(offers.map((o) => o.driver.userId).sort()).toEqual([d1.id, d2.id].sort());
      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(delivery).toMatchObject({ searchAttempts: 2, searchRadiusKm: 5 });
      // d3 (22 km) n'est jamais sollicité.
      expect((await api().get('/api/v1/driver/offers').set(auth(d3)).expect(200)).body).toHaveLength(0);
    });

    it("un livreur ne peut accepter que sa propre offre, encore valable", async () => {
      await api().post(`/api/v1/driver/offers/${deliveryId}/accept`).set(auth(d3)).expect(409);
      await api().post(`/api/v1/driver/offers/${deliveryId}/accept`).set(auth(d1)).expect(409); // il l'a refusée
      await api().post(`/api/v1/driver/offers/${deliveryId}/accept`).set(auth(client)).expect(403);
    });

    it("l'acceptation attribue la course, crée les deux conversations et prévient le restaurant (commande encore en préparation)", async () => {
      const accepted = await api().post(`/api/v1/driver/offers/${deliveryId}/accept`).set(auth(d2)).expect(200);
      expect(accepted.body).toMatchObject({ status: 'ASSIGNED', deliveryFee: 1000 });
      // Une fois acceptée, le livreur voit l'adresse exacte, le contact et l'espèce à encaisser.
      expect(accepted.body.destination).toMatchObject({ landmark: 'Portail bleu', firstName: 'Jean' });
      expect(accepted.body.order.amountToCollect).toBe(2500);
      expect(JSON.stringify(accepted.body)).not.toMatch(/pickupCode|deliveryCode/);

      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PREPARING');
      const conversations = await prisma.conversation.findMany({ where: { orderId }, include: { members: true } });
      const byKind = Object.fromEntries(conversations.map((c) => [c.kind, c.members.map((m) => m.userId).sort()]));
      expect(byKind.ORDER_DELIVERY).toEqual([client.id, d2.id].sort());
      expect(byKind.ORDER_RESTAURANT_DRIVER).toEqual([owner.id, d2.id].sort());
      expect(await prisma.notification.count({ where: { userId: owner.id, type: 'ORDER_ASSIGNED' } })).toBe(1);
    });

    it('la course est prise : les autres offres expirent, et un second livreur ne peut plus l\'accepter', async () => {
      const offers = await prisma.deliveryOffer.findMany({ where: { deliveryId } });
      expect(offers.find((o) => o.status === 'ACCEPTED')).toBeDefined();
      expect(offers.filter((o) => o.status === 'SENT')).toHaveLength(0);
      await api().post(`/api/v1/driver/offers/${deliveryId}/accept`).set(auth(d3)).expect(409);
      expect((await profileOf(d2)).isAvailable).toBe(false); // une course à la fois
    });

    it('client et livreur peuvent discuter dans la conversation de livraison ; un tiers non', async () => {
      const conv = await prisma.conversation.findFirstOrThrow({ where: { orderId, kind: 'ORDER_DELIVERY' } });
      await api().post('/api/v1/messages').set(auth(client)).send({ conversationId: conv.id, text: 'Sonnez deux fois' }).expect(201);
      await api().post('/api/v1/messages').set(auth(d2)).send({ conversationId: conv.id, text: 'Bien reçu' }).expect(201);
      await api().post('/api/v1/messages').set(auth(client2)).send({ conversationId: conv.id, text: 'x' }).expect(404);
      await api().post('/api/v1/messages').set(auth(d1)).send({ conversationId: conv.id, text: 'x' }).expect(404);
      await api().post('/api/v1/messages').set(auth(owner)).send({ conversationId: conv.id, text: 'x' }).expect(404); // restaurant hors conversation client↔livreur
    });
  });

  describe('Déroulé de la livraison avec les codes anti-fraude', () => {
    let orderId: string;
    let deliveryId: string;
    let pickupCode: string;
    let deliveryCode: string;
    const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

    beforeAll(async () => {
      const found = await prisma.delivery.findFirstOrThrow({ where: { status: 'ASSIGNED' } });
      deliveryId = found.id;
      orderId = found.orderId;
    });

    it('chaque partie ne voit que SON code : le restaurant le code de retrait, le client celui de remise, le livreur aucun', async () => {
      const asOwner = await api().get(`/api/v1/orders/${orderId}`).set(auth(owner)).expect(200);
      const asClient = await api().get(`/api/v1/orders/${orderId}`).set(auth(client)).expect(200);
      const asDriver = await api().get(`/api/v1/orders/${orderId}`).set(auth(d2)).expect(200);
      pickupCode = asOwner.body.delivery.pickupCode as string;
      deliveryCode = asClient.body.delivery.deliveryCode as string;

      expect(pickupCode).toMatch(/^\d{6}$/);
      expect(asOwner.body.delivery.deliveryCode).toBeNull();
      expect(asClient.body.delivery.pickupCode).toBeNull();
      expect(asDriver.body.delivery.pickupCode).toBeNull();
      expect(asDriver.body.delivery.deliveryCode).toBeNull();
      expect(asClient.body.delivery.driver).toMatchObject({ firstName: 'Yao', vehicleType: 'MOTO' });
    });

    it("on ne récupère pas une commande qui n'est pas prête, même avec le bon code", async () => {
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(d2)).send({ code: pickupCode }).expect(409);
    });

    it('« je suis au restaurant » prévient le cuisinier', async () => {
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/at-restaurant`).set(auth(d2)).expect(200);
      expect((await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).status).toBe('AT_RESTAURANT');
      expect(await prisma.notification.count({ where: { userId: owner.id, type: 'SYSTEM' } })).toBeGreaterThan(0);
    });

    it('quand le plat est prêt, la commande passe automatiquement à ASSIGNÉE et le client est prévenu', async () => {
      await api().post(`/api/v1/restaurant/${restaurantId}/orders/${orderId}/ready`).set(auth(owner)).expect(200);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('ASSIGNED');
      const types = (await prisma.notification.findMany({ where: { userId: client.id } })).map((n) => n.type);
      expect(types).toEqual(expect.arrayContaining(['ORDER_READY', 'ORDER_ASSIGNED']));
    });

    it('un autre livreur, un client ou un restaurant ne peuvent piloter cette course (404 / 403)', async () => {
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(d3)).send({ code: pickupCode }).expect(404);
      await api().get(`/api/v1/driver/deliveries/${deliveryId}`).set(auth(d3)).expect(404);
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/deliver`).set(auth(client)).send({ code: deliveryCode }).expect(403);
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(owner)).send({ code: pickupCode }).expect(403);
    });

    it('refuse un code incorrect, mal formé ou absent ; un code juste réinitialise les échecs', async () => {
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(d2)).send({ code: wrong(pickupCode) }).expect(400);
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(d2)).send({ code: '12' }).expect(400);
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(d2)).send({}).expect(400);
      // Le code de REMISE ne permet pas de récupérer : les deux ne sont pas interchangeables.
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(d2)).send({ code: deliveryCode }).expect(400);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('ASSIGNED');
    });

    it('avec le code de retrait : la commande passe à EN ROUTE et le client est notifié', async () => {
      const res = await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(d2)).send({ code: pickupCode }).expect(200);
      expect(res.body.status).toBe('ON_THE_WAY');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('ON_THE_WAY');
      const types = (await prisma.notification.findMany({ where: { userId: client.id } })).map((n) => n.type);
      expect(types).toEqual(expect.arrayContaining(['ORDER_PICKED_UP', 'ORDER_ON_THE_WAY']));
      // Plus de désistement après le retrait.
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/release`).set(auth(d2)).send({}).expect(409);
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/at-restaurant`).set(auth(d2)).expect(409);
    });

    it('le suivi : le client voit le livreur, sa position et une estimation ; le restaurant pas la position ; un tiers 404', async () => {
      await api().post('/api/v1/driver/location').set(auth(d2)).send({ latitude: 6.235, longitude: 1.198 }).expect(200);
      const asClient = await api().get(`/api/v1/orders/${orderId}/tracking`).set(auth(client)).expect(200);
      expect(asClient.body).toMatchObject({
        orderStatus: 'ON_THE_WAY',
        deliveryStatus: 'ON_THE_WAY',
        driver: { firstName: 'Yao', vehicleType: 'MOTO' },
        driverLocation: { latitude: 6.235, longitude: 1.198 },
      });
      expect(asClient.body.etaMinutes).toBeGreaterThanOrEqual(1);
      expect(asClient.body.driver).not.toHaveProperty('phone');

      const asOwner = await api().get(`/api/v1/orders/${orderId}/tracking`).set(auth(owner)).expect(200);
      expect(asOwner.body.driverLocation).toBeNull();
      expect(asOwner.body.destination).toBeNull();
      await api().get(`/api/v1/orders/${orderId}/tracking`).set(auth(client2)).expect(404);
      await api().get(`/api/v1/orders/${orderId}/tracking`).set(auth(d3)).expect(404);
      await api().get(`/api/v1/orders/${orderId}/tracking`).expect(401);
    });

    it('le client reçoit la position en temps réel (delivery:location) et rien ne fuit vers un autre client', async () => {
      const connect = (user: TestUser) =>
        new Promise<Socket>((resolve, reject) => {
          const socket = io(baseUrl, { auth: { token: user.accessToken }, reconnection: false, forceNew: true, transports: ['websocket'] });
          socket.on('connect', () => resolve(socket));
          socket.on('connect_error', reject);
        });
      const clientSocket = await connect(client);
      const otherSocket = await connect(client2);
      let leaked = false;
      otherSocket.on('delivery:location', () => { leaked = true; });
      const received = new Promise<{ latitude: number; orderId: string }>((resolve) => clientSocket.once('delivery:location', resolve));

      await api().post('/api/v1/driver/location').set(auth(d2)).send({ latitude: 6.238, longitude: 1.199 }).expect(200);

      await expect(received).resolves.toMatchObject({ latitude: 6.238, orderId });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(leaked).toBe(false);
      clientSocket.close();
      otherSocket.close();
    });

    it('« je suis arrivé » prévient le client', async () => {
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/arrived`).set(auth(d2)).expect(200);
      expect((await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).status).toBe('ARRIVED');
      expect(await prisma.notification.count({ where: { userId: client.id, type: 'ORDER_ON_THE_WAY' } })).toBeGreaterThan(1);
    });

    it('la remise exige le code du client ; celui du restaurant est refusé', async () => {
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/deliver`).set(auth(d2)).send({ code: pickupCode }).expect(400);
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/deliver`).set(auth(d2)).send({ code: wrong(deliveryCode) }).expect(400);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('ON_THE_WAY');
    });

    it("avec le bon code : livrée, espèces encaissées, livreur de nouveau disponible, gains du jour à jour", async () => {
      const res = await api().post(`/api/v1/driver/deliveries/${deliveryId}/deliver`).set(auth(d2)).send({ code: deliveryCode }).expect(200);
      expect(res.body.status).toBe('DELIVERED');

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
      expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' });
      expect(order.payments[0]).toMatchObject({ status: 'PAID' });
      expect(order.deliveredAt).not.toBeNull();

      const profile = await profileOf(d2);
      expect(profile).toMatchObject({ isAvailable: true, totalDeliveries: 1 });
      const me = await api().get('/api/v1/driver/me').set(auth(d2)).expect(200);
      expect(me.body.today).toEqual({ deliveries: 1, earnings: 1000 });
      expect(me.body.activeDeliveryId).toBeNull();

      const history = await api().get('/api/v1/driver/deliveries').set(auth(d2)).expect(200);
      expect(history.body.items[0]).toMatchObject({ id: deliveryId, status: 'DELIVERED', deliveryFee: 1000 });
      expect((await api().get('/api/v1/driver/deliveries/current').set(auth(d2)).expect(200)).body).toEqual({ delivery: null });
      // Rejouer la remise est impossible.
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/deliver`).set(auth(d2)).send({ code: deliveryCode }).expect(409);
    });

    it('les étapes de la livraison apparaissent comme cartes dans la conversation client ↔ restaurant, dans l\'ordre, avec le prénom du livreur', async () => {
      const conversation = await prisma.conversation.findFirstOrThrow({ where: { orderId, kind: 'ORDER_RESTAURANT' } });
      const events = await prisma.message.findMany({ where: { conversationId: conversation.id, type: 'SYSTEM' }, orderBy: { sentAt: 'asc' } });
      const actions = events.map((m) => m.systemAction);
      for (const expected of ['DRIVER_ASSIGNED', 'DRIVER_PICKED_UP', 'DRIVER_ON_THE_WAY', 'ORDER_DELIVERED']) expect(actions).toContain(expected);
      expect(actions.indexOf('DRIVER_ASSIGNED')).toBeLessThan(actions.indexOf('DRIVER_PICKED_UP'));
      expect(actions.indexOf('DRIVER_PICKED_UP')).toBeLessThan(actions.indexOf('ORDER_DELIVERED'));
      const assigned = events.find((m) => m.systemAction === 'DRIVER_ASSIGNED');
      const driver = await prisma.user.findUniqueOrThrow({ where: { id: d2.id } });
      expect(assigned?.text).toBe(driver.firstName);
    });
  });

  describe('Blocage des codes, désistement, annulation, expiration', () => {
    it('après 5 codes faux, le retrait est verrouillé — même avec le bon code', async () => {
      const { orderId, deliveryId, base } = await orderInPreparation();
      await api().post(`/api/v1/driver/offers/${deliveryId}/accept`).set(auth(d1)).expect(200);
      await api().post(`${base}/ready`).set(auth(owner)).expect(200);
      const goodCode = (await api().get(`/api/v1/orders/${orderId}`).set(auth(owner)).expect(200)).body.delivery.pickupCode as string;
      const bad = goodCode === '999999' ? '888888' : '999999';

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(d1)).send({ code: bad }).expect(400);
      }
      await api().post(`/api/v1/driver/deliveries/${deliveryId}/pick-up`).set(auth(d1)).send({ code: goodCode }).expect(429);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('ASSIGNED');

      // Le restaurant ne peut plus annuler une commande prête : la course reste assignée (utilisée par le test suivant).
      await api().post(`${base}/cancel`).set(auth(owner)).send({ reason: 'Trop tard' }).expect(409);
    });

    it("le désistement avant le retrait relance la recherche, sans ce livreur, et le retire de la conversation", async () => {
      const inFlight = await prisma.delivery.findFirstOrThrow({ where: { status: 'ASSIGNED' } });
      const deliveryId = inFlight.id;
      expect((await prisma.order.findUniqueOrThrow({ where: { id: inFlight.orderId } })).status).toBe('ASSIGNED');

      await api().post(`/api/v1/driver/deliveries/${deliveryId}/release`).set(auth(d1)).send({ reason: 'Panne de moto' }).expect(200);

      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(delivery).toMatchObject({ status: 'SEARCHING', driverId: null });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: inFlight.orderId } })).status).toBe('READY');
      expect((await profileOf(d1)).isAvailable).toBe(true);

      const member = await prisma.conversationMember.findFirst({ where: { userId: d1.id, conversation: { orderId: inFlight.orderId, kind: 'ORDER_DELIVERY' } } });
      expect(member?.leftAt).not.toBeNull();
      // d1 ne reçoit plus d'offre pour cette course.
      await ageDelivery(deliveryId);
      await dispatch.tick();
      const offers = await prisma.deliveryOffer.findMany({ where: { deliveryId, status: 'SENT' }, include: { driver: true } });
      expect(offers.map((o) => o.driver.userId)).not.toContain(d1.id);
      expect(offers.length).toBeGreaterThan(0);
    });

    it("l'annulation de la commande libère le livreur assigné, clôt la course et le prévient", async () => {
      const inFlight = await prisma.delivery.findFirstOrThrow({ where: { status: 'SEARCHING' }, include: { order: true } });
      // d3 (22 km) n'a pas d'offre : c'est un livreur proche qui accepte.
      const offer = await prisma.deliveryOffer.findFirstOrThrow({ where: { deliveryId: inFlight.id, status: 'SENT' }, include: { driver: true } });
      const driverUser = [d1, d2, d3].find((u) => u.id === offer.driver.userId)!;
      await api().post(`/api/v1/driver/offers/${inFlight.id}/accept`).set(auth(driverUser)).expect(200);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: inFlight.orderId } })).status).toBe('ASSIGNED');

      // Le restaurant ne peut plus annuler une commande prête ; l'annulation se fait via l'admin (Phase 13) :
      // ici on force l'état comme le ferait la machine avec un acteur ADMIN.
      const machine = app.get((await import('../src/orders/order-state-machine.service')).OrderStateMachineService);
      await machine.apply(inFlight.orderId, 'CANCEL', { kind: 'ADMIN', userId: admin.id }, { reason: 'Client injoignable' });

      expect((await prisma.delivery.findUniqueOrThrow({ where: { id: inFlight.id } })).status).toBe('CANCELLED');
      expect((await profileOf(driverUser)).isAvailable).toBe(true);
      expect(await prisma.notification.count({ where: { userId: driverUser.id, type: 'ORDER_CANCELLED' } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'ORDER_CANCELLED_BY_ADMIN' } })).toBe(1);
      expect((await api().get('/api/v1/driver/deliveries/current').set(auth(driverUser)).expect(200)).body).toEqual({ delivery: null });
    });

    it('une offre non répondue expire, puis sans aucun livreur la course passe en « aucun livreur trouvé », relançable par le restaurant', async () => {
      // Plus aucun livreur en ligne.
      for (const user of [d1, d2, d3]) await api().put('/api/v1/driver/me/availability').set(auth(user)).send({ online: false }).expect(200);
      const { deliveryId } = await orderInPreparation(client2);

      for (let round = 0; round < 5; round += 1) {
        await ageDelivery(deliveryId);
        await dispatch.tick();
      }
      expect((await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).status).toBe('NO_DRIVER_FOUND');
      expect(await prisma.notification.count({ where: { userId: owner.id, type: 'SYSTEM', payload: { path: ['body'], string_contains: 'aucun livreur' } } })).toBeGreaterThan(0);

      // Un client ou un livreur ne relancent pas ; le restaurant oui, avec quelqu'un en ligne.
      const retryOrderId = (await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).orderId;
      await api().post(`/api/v1/restaurant/${restaurantId}/orders/${retryOrderId}/retry-delivery`).set(auth(client2)).expect(403);
      await goOnline(d1, AT.near);
      const orderId = (await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).orderId;
      await api().post(`/api/v1/restaurant/${restaurantId}/orders/${orderId}/retry-delivery`).set(auth(owner)).expect(200);
      await api().post(`/api/v1/restaurant/${restaurantId}/orders/${orderId}/retry-delivery`).set(auth(owner)).expect(409); // déjà relancée
      const offer = await prisma.deliveryOffer.findFirstOrThrow({ where: { deliveryId, status: 'SENT' } });

      // Elle expire faute de réponse : le livreur en est informé et le statut passe à EXPIRED.
      await prisma.deliveryOffer.update({ where: { id: offer.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await dispatch.tick();
      expect((await prisma.deliveryOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe('EXPIRED');
      await api().post(`/api/v1/driver/offers/${deliveryId}/accept`).set(auth(d1)).expect(409);
    });

    it('un livreur suspendu par un admin est retiré (hors ligne, sans position), sauf en pleine livraison', async () => {
      const profile = await profileOf(d1);
      await goOnline(d1, AT.near);
      const res = await api().patch(`/api/v1/admin/drivers/${profile.id}/status`).set(auth(admin)).send({ action: 'SUSPEND', reason: 'Plaintes' }).expect(200);
      expect(res.body.status).toBe('SUSPENDED');
      expect(await locations.get(profile.id)).toBeNull();
      expect(await profileOf(d1)).toMatchObject({ isOnline: false, isAvailable: false });
      await api().get('/api/v1/driver/offers').set(auth(d1)).expect(403);
      expect(await prisma.notification.count({ where: { userId: d1.id, type: 'ACCOUNT_SUSPENDED' } })).toBe(1);
    });
  });
});
