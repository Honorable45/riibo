import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './utils/test-app';
import { createTestPrisma, resetDatabase } from './utils/test-db';
import { registerTestUser, TestUser } from './utils/test-users';

jest.setTimeout(60_000);

const ALL_DAY = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
  dayOfWeek,
  opensAt: '00:00',
  closesAt: '00:00',
}));
const DELIVERY = {
  deliveryType: 'DELIVERY',
  address: 'Agoè, près du marché',
  paymentMethod: 'CASH_ON_DELIVERY',
};

describe('Codes promo et avis (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: TestUser;
  let client: TestUser;
  let client2: TestUser;
  let owner: TestUser;
  let rival: TestUser;
  let restaurantId: string;
  let rivalRestaurantId: string;
  let itemId: string; // 1 500 F
  let rivalItemId: string;
  const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });
  const api = () => request(app.getHttpServer());

  const createPromo = (body: Record<string, unknown>) =>
    api().post('/api/v1/admin/promos').set(auth(admin)).send(body);
  /** Panier neuf à chaque appel (une même ligne fusionnerait sinon les quantités). */
  const fill = async (user: TestUser, menuItemId = itemId, quantity = 1) => {
    await api().delete('/api/v1/cart').set(auth(user)).expect(200);
    return api()
      .post('/api/v1/cart/items')
      .set(auth(user))
      .send({ menuItemId, quantity })
      .expect(201);
  };

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp();

    admin = await registerTestUser(app);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    client = await registerTestUser(app, { firstName: 'Jean', lastName: 'Secret' });
    client2 = await registerTestUser(app, { firstName: 'Ama' });
    owner = await registerTestUser(app, {
      accountType: 'RESTAURANT',
      restaurantName: 'Chez Maman',
      restaurantAddress: 'Agoè',
    });
    rival = await registerTestUser(app, {
      accountType: 'RESTAURANT',
      restaurantName: 'Rival',
      restaurantAddress: 'Bè',
    });
    const ridOf = async (user: TestUser) =>
      (await prisma.restaurantMember.findFirstOrThrow({ where: { userId: user.id } })).restaurantId;
    restaurantId = await ridOf(owner);
    rivalRestaurantId = await ridOf(rival);
    for (const id of [restaurantId, rivalRestaurantId]) {
      await prisma.restaurant.update({
        where: { id },
        data: {
          status: 'APPROVED',
          deliveryFee: 1000,
          minOrderAmount: 0,
          latitude: 6.23,
          longitude: 1.19,
          hours: { create: ALL_DAY },
        },
      });
    }
    itemId = (
      await prisma.menuItem.create({ data: { restaurantId, name: 'Riz gras', price: 1500 } })
    ).id;
    rivalItemId = (
      await prisma.menuItem.create({
        data: { restaurantId: rivalRestaurantId, name: 'Burger', price: 1800 },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('Administration des codes promo', () => {
    it('est réservée aux administrateurs', async () => {
      await api().get('/api/v1/admin/promos').expect(401);
      await api().get('/api/v1/admin/promos').set(auth(client)).expect(403);
      await createPromo({ code: 'NOPE', discountType: 'FIXED', discountValue: 100 })
        .set(auth(owner))
        .expect(403);
    });

    it('valide les données et refuse un doublon', async () => {
      await createPromo({ code: 'x', discountType: 'FIXED', discountValue: 100 }).expect(400);
      await createPromo({ code: 'TROPGROS', discountType: 'PERCENT', discountValue: 150 }).expect(
        400,
      );
      await createPromo({
        code: 'BIENVENUE10',
        discountType: 'PERCENT',
        discountValue: 10,
        maxDiscount: 100,
      }).expect(201);
      const dup = await createPromo({
        code: 'bienvenue10',
        discountType: 'FIXED',
        discountValue: 200,
      });
      expect(dup.status).toBe(409); // le code est normalisé en majuscules
      await createPromo({
        code: 'RESTO',
        discountType: 'FIXED',
        discountValue: 100,
        restaurantId: 'inconnu',
      }).expect(404);
    });
  });

  describe('Application au panier', () => {
    beforeAll(async () => {
      await createPromo({
        code: 'FIXE500',
        discountType: 'FIXED',
        discountValue: 500,
        maxUsesPerUser: 1,
      }).expect(201);
      await createPromo({
        code: 'RIVAL',
        discountType: 'FIXED',
        discountValue: 300,
        restaurantId: rivalRestaurantId,
      }).expect(201);
      await createPromo({
        code: 'GROS',
        discountType: 'FIXED',
        discountValue: 300,
        minOrderAmount: 5000,
      }).expect(201);
      await createPromo({ code: 'EXPIRE', discountType: 'FIXED', discountValue: 300 }).expect(201);
      await prisma.promoCode.update({
        where: { code: 'EXPIRE' },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      await createPromo({ code: 'ETEINT', discountType: 'FIXED', discountValue: 300 }).expect(201);
      await prisma.promoCode.update({ where: { code: 'ETEINT' }, data: { isActive: false } });
    });

    it('exige un panier non vide et un code valable', async () => {
      await api().delete('/api/v1/cart').set(auth(client)).expect(200);
      await api()
        .post('/api/v1/cart/promo')
        .set(auth(client))
        .send({ code: 'FIXE500' })
        .expect(400);
      await fill(client);
      for (const code of ['INCONNU', 'ETEINT', 'EXPIRE']) {
        await api().post('/api/v1/cart/promo').set(auth(client)).send({ code }).expect(400);
      }
      // « inconnu » et « désactivé » ne se distinguent pas (on ne révèle pas les codes existants).
      const a = await api().post('/api/v1/cart/promo').set(auth(client)).send({ code: 'INCONNU' });
      const b = await api().post('/api/v1/cart/promo').set(auth(client)).send({ code: 'ETEINT' });
      expect(a.body.message.message).toBe(b.body.message.message);
    });

    it('applique la remise sur le sous-total uniquement, pas sur la livraison', async () => {
      const res = await api()
        .post('/api/v1/cart/promo')
        .set(auth(client))
        .send({ code: ' fixe500 ' })
        .expect(201);
      expect(res.body).toMatchObject({
        subtotal: 1500,
        discount: 500,
        deliveryFee: 1000,
        total: 2000,
        promo: { code: 'FIXE500', discountAmount: 500 },
      });
      const removed = await api().delete('/api/v1/cart/promo').set(auth(client)).expect(200);
      expect(removed.body).toMatchObject({ discount: 0, promo: null, total: 2500 });
    });

    it('plafonne un pourcentage et ne dépasse jamais le sous-total', async () => {
      const res = await api()
        .post('/api/v1/cart/promo')
        .set(auth(client))
        .send({ code: 'BIENVENUE10' })
        .expect(201);
      expect(res.body.discount).toBe(100); // 10 % de 1 500 = 150, plafonné à 100
      await createPromo({ code: 'ENORME', discountType: 'FIXED', discountValue: 9000 }).expect(201);
      const big = await api()
        .post('/api/v1/cart/promo')
        .set(auth(client))
        .send({ code: 'ENORME' })
        .expect(201);
      expect(big.body).toMatchObject({ discount: 1500, total: 1000 }); // livraison seule à payer
    });

    it('respecte le minimum de commande et le restaurant visé', async () => {
      await api().post('/api/v1/cart/promo').set(auth(client)).send({ code: 'GROS' }).expect(400);
      await api().post('/api/v1/cart/promo').set(auth(client)).send({ code: 'RIVAL' }).expect(400);
      await fill(client, rivalItemId);
      await api().post('/api/v1/cart/promo').set(auth(client)).send({ code: 'RIVAL' }).expect(201);
      await fill(client, itemId);
    });
  });

  describe('Commande avec code promo', () => {
    it('recalcule la remise côté serveur, consomme le code et l’historise', async () => {
      await fill(client);
      await api()
        .post('/api/v1/cart/promo')
        .set(auth(client))
        .send({ code: 'FIXE500' })
        .expect(201);
      // Le client ne peut pas imposer un montant de remise.
      await api()
        .post('/api/v1/orders')
        .set(auth(client))
        .send({ ...DELIVERY, discountAmount: 9999 })
        .expect(400);

      const order = await api().post('/api/v1/orders').set(auth(client)).send(DELIVERY).expect(201);
      expect(order.body).toMatchObject({
        subtotal: 1500,
        discountAmount: 500,
        deliveryFee: 1000,
        total: 2000,
      });

      const promo = await prisma.promoCode.findUniqueOrThrow({ where: { code: 'FIXE500' } });
      expect(promo.usedCount).toBe(1);
      expect(
        await prisma.promoRedemption.count({
          where: { promoCodeId: promo.id, orderId: order.body.id },
        }),
      ).toBe(1);
      // Le panier a été vidé, code compris.
      expect((await api().get('/api/v1/cart').set(auth(client)).expect(200)).body).toMatchObject({
        items: [],
        promo: null,
      });
    });

    it('applique la limite par utilisateur puis la limite globale', async () => {
      await fill(client);
      await api()
        .post('/api/v1/cart/promo')
        .set(auth(client))
        .send({ code: 'FIXE500' })
        .expect(400); // déjà utilisé

      await createPromo({
        code: 'UNSEUL',
        discountType: 'FIXED',
        discountValue: 200,
        maxUses: 1,
      }).expect(201);
      await fill(client2);
      await api()
        .post('/api/v1/cart/promo')
        .set(auth(client2))
        .send({ code: 'UNSEUL' })
        .expect(201);
      await api().post('/api/v1/orders').set(auth(client2)).send(DELIVERY).expect(201);
      await fill(client);
      await api().post('/api/v1/cart/promo').set(auth(client)).send({ code: 'UNSEUL' }).expect(400); // épuisé
    });

    it('bloque la commande si le code est devenu invalide, sans facturer un autre prix', async () => {
      await createPromo({ code: 'FUGACE', discountType: 'FIXED', discountValue: 200 }).expect(201);
      await fill(client);
      await api().post('/api/v1/cart/promo').set(auth(client)).send({ code: 'FUGACE' }).expect(201);
      await prisma.promoCode.update({ where: { code: 'FUGACE' }, data: { isActive: false } });

      const cart = await api().get('/api/v1/cart').set(auth(client)).expect(200);
      expect(cart.body).toMatchObject({ discount: 0, promo: null, total: 2500 });
      expect(cart.body.promoIssue).toEqual(expect.any(String));
      const refused = await api()
        .post('/api/v1/orders')
        .set(auth(client))
        .send(DELIVERY)
        .expect(400);
      expect(JSON.stringify(refused.body)).toContain('FUGACE');
      await api().delete('/api/v1/cart/promo').set(auth(client)).expect(200);
      await api().post('/api/v1/orders').set(auth(client)).send(DELIVERY).expect(201); // sans code : passe au prix affiché
    });
  });

  describe('Avis', () => {
    let orderId: string;
    let otherOrderId: string;

    beforeAll(async () => {
      await fill(client2);
      orderId = (await api().post('/api/v1/orders').set(auth(client2)).send(DELIVERY).expect(201))
        .body.id;
      await fill(client);
      otherOrderId = (
        await api().post('/api/v1/orders').set(auth(client)).send(DELIVERY).expect(201)
      ).body.id;
    });

    it('n’est possible qu’une fois la commande livrée, par son client', async () => {
      await api().post(`/api/v1/orders/${orderId}/review`).expect(401);
      await api()
        .post(`/api/v1/orders/${orderId}/review`)
        .set(auth(owner))
        .send({ rating: 5 })
        .expect(403);
      await api()
        .post(`/api/v1/orders/${orderId}/review`)
        .set(auth(client2))
        .send({ rating: 5 })
        .expect(409); // pas livrée
      await prisma.order.updateMany({
        where: { id: { in: [orderId, otherOrderId] } },
        data: { status: 'DELIVERED' },
      });
      await api()
        .post(`/api/v1/orders/${orderId}/review`)
        .set(auth(client))
        .send({ rating: 5 })
        .expect(404); // pas SA commande
    });

    it('valide la note et le commentaire', async () => {
      for (const rating of [0, 6, 2.5, 'x']) {
        await api()
          .post(`/api/v1/orders/${orderId}/review`)
          .set(auth(client2))
          .send({ rating })
          .expect(400);
      }
      await api()
        .post(`/api/v1/orders/${orderId}/review`)
        .set(auth(client2))
        .send({ rating: 4, comment: 'x'.repeat(501) })
        .expect(400);
    });

    it('enregistre l’avis, met à jour les notes et refuse un second avis', async () => {
      const res = await api()
        .post(`/api/v1/orders/${orderId}/review`)
        .set(auth(client2))
        .send({ rating: 5, comment: '  Délicieux !  ' })
        .expect(201);
      expect(res.body).toMatchObject({ rating: 5, comment: 'Délicieux !', author: 'Ama' });
      await api()
        .post(`/api/v1/orders/${orderId}/review`)
        .set(auth(client2))
        .send({ rating: 1 })
        .expect(409);

      await api()
        .post(`/api/v1/orders/${otherOrderId}/review`)
        .set(auth(client))
        .send({ rating: 3 })
        .expect(201);
      const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
      expect(restaurant).toMatchObject({ rating: 4, reviewCount: 2 });
      const item = await prisma.menuItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item).toMatchObject({ rating: 4, reviewCount: 2 });

      const detail = await api().get(`/api/v1/orders/${orderId}`).set(auth(client2)).expect(200);
      expect(detail.body.review).toMatchObject({ rating: 5, comment: 'Délicieux !' });
      // Une notification prévient le restaurant.
      expect(
        await prisma.notification.count({ where: { userId: owner.id, type: 'REVIEW_RECEIVED' } }),
      ).toBe(2);
    });

    it('liste publiquement les avis sans révéler l’identité complète du client', async () => {
      const res = await api().get(`/api/v1/restaurants/${restaurantId}/reviews`).expect(200);
      expect(res.body.summary).toEqual({ rating: 4, reviewCount: 2 });
      expect(res.body.items).toHaveLength(2);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('Secret');
      expect(text).not.toContain(client.id);
      for (const item of res.body.items) expect(item).not.toHaveProperty('orderNumber');
    });

    it('permet au restaurant de répondre, et à lui seul', async () => {
      const list = await api()
        .get(`/api/v1/restaurant/${restaurantId}/reviews`)
        .set(auth(owner))
        .expect(200);
      const reviewId = list.body.items.find((r: { rating: number }) => r.rating === 5).id;
      expect(list.body.items[0]).toHaveProperty('orderNumber');

      await api()
        .post(`/api/v1/restaurant/${restaurantId}/reviews/${reviewId}/reply`)
        .set(auth(rival))
        .send({ reply: 'Merci' })
        .expect(404);
      await api()
        .post(`/api/v1/restaurant/${restaurantId}/reviews/${reviewId}/reply`)
        .set(auth(client))
        .send({ reply: 'Merci' })
        .expect(403);
      await api()
        .post(`/api/v1/restaurant/${restaurantId}/reviews/${reviewId}/reply`)
        .set(auth(owner))
        .send({ reply: '' })
        .expect(400);
      const ok = await api()
        .post(`/api/v1/restaurant/${restaurantId}/reviews/${reviewId}/reply`)
        .set(auth(owner))
        .send({ reply: 'Merci beaucoup !' })
        .expect(201);
      expect(ok.body.reply).toBe('Merci beaucoup !');
      const publicList = await api().get(`/api/v1/restaurants/${restaurantId}/reviews`).expect(200);
      expect(publicList.body.items.find((r: { id: string }) => r.id === reviewId).reply).toBe(
        'Merci beaucoup !',
      );
    });

    it('masque un avis signalé et recalcule les notes', async () => {
      const review = await prisma.review.findFirstOrThrow({ where: { rating: 3 } });
      const report = await prisma.report.create({
        data: {
          targetType: 'REVIEW',
          targetId: review.id,
          reporterId: owner.id,
          reason: 'Propos injurieux',
        },
      });
      await api()
        .patch(`/api/v1/admin/reports/${report.id}`)
        .set(auth(admin))
        .send({ action: 'REMOVE_CONTENT' })
        .expect(200);

      const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
      expect(restaurant).toMatchObject({ rating: 5, reviewCount: 1 });
      const publicList = await api().get(`/api/v1/restaurants/${restaurantId}/reviews`).expect(200);
      expect(publicList.body.items).toHaveLength(1);
    });
  });
});
