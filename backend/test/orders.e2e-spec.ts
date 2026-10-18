import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './utils/test-app';
import { createTestPrisma, resetDatabase } from './utils/test-db';
import { registerTestUser, TestUser } from './utils/test-users';

jest.setTimeout(60_000);

const ALL_DAY = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, opensAt: '00:00', closesAt: '00:00' }));

describe('Panier, adresses et commandes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: TestUser;
  let client: TestUser;
  let client2: TestUser;
  let owner: TestUser;
  let staff: TestUser;
  let rival: TestUser; // restaurateur d'un autre restaurant
  let pending: TestUser; // restaurateur dont le restaurant n'est pas approuvé
  let restaurantId: string;
  let rivalRestaurantId: string;
  let pendingRestaurantId: string;
  let pouletId: string; // plat avec options obligatoires
  let colaId: string; // plat simple
  let rareId: string; // stock limité à 1
  let rivalItemId: string;
  let pendingItemId: string;
  let accompId: string;
  let optAlloco: string;
  let optFrites: string;
  const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });
  const api = () => request(app.getHttpServer());
  const addressBody = { deliveryType: 'DELIVERY', address: 'Agoè, près du marché', landmark: 'Portail bleu', paymentMethod: 'CASH_ON_DELIVERY' };

  async function fillCart(user: TestUser, menuItemId = colaId, quantity = 3) {
    return api().post('/api/v1/cart/items').set(auth(user)).send({ menuItemId, quantity });
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp();

    admin = await registerTestUser(app);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    client = await registerTestUser(app, { firstName: 'Jean' });
    client2 = await registerTestUser(app, { firstName: 'Ama' });
    owner = await registerTestUser(app, { accountType: 'RESTAURANT', restaurantName: 'Chez Maman', restaurantAddress: 'Agoè' });
    staff = await registerTestUser(app, { accountType: 'RESTAURANT', restaurantName: 'Temp', restaurantAddress: 'Agoè' });
    rival = await registerTestUser(app, { accountType: 'RESTAURANT', restaurantName: 'Rival', restaurantAddress: 'Bè' });
    pending = await registerTestUser(app, { accountType: 'RESTAURANT', restaurantName: 'Attente', restaurantAddress: 'Kodjoviakopé' });

    const ridOf = async (user: TestUser) =>
      (await prisma.restaurantMember.findFirstOrThrow({ where: { userId: user.id } })).restaurantId;
    restaurantId = await ridOf(owner);
    rivalRestaurantId = await ridOf(rival);
    pendingRestaurantId = await ridOf(pending);
    await prisma.restaurant.deleteMany({ where: { members: { some: { userId: staff.id } } } });
    await prisma.restaurantMember.create({ data: { restaurantId, userId: staff.id, role: 'STAFF' } });

    for (const id of [restaurantId, rivalRestaurantId]) {
      await prisma.restaurant.update({
        where: { id },
        data: { status: 'APPROVED', deliveryFee: 1000, minOrderAmount: 1000, latitude: 6.23, longitude: 1.19, hours: { create: ALL_DAY } },
      });
    }

    const poulet = await prisma.menuItem.create({
      data: {
        restaurantId, name: 'Poulet braisé', price: 2500,
        optionGroups: { create: [{ name: 'Accompagnement', minSelect: 1, maxSelect: 1, options: { create: [{ name: 'Alloco' }, { name: 'Frites', priceDelta: 300 }] } }] },
      },
      include: { optionGroups: { include: { options: true } } },
    });
    pouletId = poulet.id;
    accompId = poulet.optionGroups[0].id;
    optAlloco = poulet.optionGroups[0].options.find((o) => o.name === 'Alloco')!.id;
    optFrites = poulet.optionGroups[0].options.find((o) => o.name === 'Frites')!.id;
    colaId = (await prisma.menuItem.create({ data: { restaurantId, name: 'Coca-Cola', price: 500 } })).id;
    rareId = (await prisma.menuItem.create({ data: { restaurantId, name: 'Plat rare', price: 3000, stock: 1 } })).id;
    rivalItemId = (await prisma.menuItem.create({ data: { restaurantId: rivalRestaurantId, name: 'Burger', price: 1800 } })).id;
    pendingItemId = (await prisma.menuItem.create({ data: { restaurantId: pendingRestaurantId, name: 'Caché', price: 900 } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('Panier', () => {
    it('est réservé aux clients (401 visiteur, 403 restaurant)', async () => {
      await api().get('/api/v1/cart').expect(401);
      await api().get('/api/v1/cart').set(auth(owner)).expect(403);
    });

    it('un panier vide renvoie un aperçu vide, non commandable', async () => {
      const res = await api().get('/api/v1/cart').set(auth(client)).expect(200);
      expect(res.body).toMatchObject({ items: [], total: 0, canCheckout: false });
    });

    it('chiffre le panier depuis les prix de la base (plat + suppléments)', async () => {
      const res = await api()
        .post('/api/v1/cart/items')
        .set(auth(client))
        .send({ menuItemId: pouletId, quantity: 2, optionIds: [optFrites] })
        .expect(201);
      expect(res.body.items[0]).toMatchObject({ name: 'Poulet braisé', unitPrice: 2800, lineTotal: 5600, quantity: 2 });
      expect(res.body).toMatchObject({ subtotal: 5600, deliveryFee: 1000, total: 6600, canCheckout: true });
    });

    it('fusionne une même ligne, mais garde séparées les lignes aux options ou notes différentes', async () => {
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: pouletId, quantity: 1, optionIds: [optFrites] }).expect(201);
      const withOther = await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: pouletId, quantity: 1, optionIds: [optAlloco] }).expect(201);
      expect(withOther.body.items).toHaveLength(2);
      expect(withOther.body.items[0].quantity).toBe(3); // 2 + 1 fusionnées
      const withNote = await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: pouletId, quantity: 1, optionIds: [optAlloco], note: 'sans piment' }).expect(201);
      expect(withNote.body.items).toHaveLength(3);
      await api().delete('/api/v1/cart').set(auth(client)).expect(200);
    });

    it('refuse : option obligatoire manquante, option étrangère, quantité invalide, plat inconnu', async () => {
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: pouletId, quantity: 1 }).expect(400);
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: pouletId, quantity: 1, optionIds: ['option-inconnue'] }).expect(400);
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: colaId, quantity: 0 }).expect(400);
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: colaId, quantity: 99 }).expect(400);
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: 'plat-inconnu', quantity: 1 }).expect(404);
    });

    it("refuse un prix ou un total envoyé par le client (champ inconnu)", async () => {
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: colaId, quantity: 1, price: 1 }).expect(400);
    });

    it("ne montre pas un plat d'un restaurant non approuvé (404)", async () => {
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: pendingItemId, quantity: 1 }).expect(404);
    });

    it("un seul restaurant à la fois : 409 avec un code exploitable, puis remplacement explicite", async () => {
      await fillCart(client, colaId, 1);
      const conflict = await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: rivalItemId, quantity: 1 }).expect(409);
      expect(conflict.body.message.code).toBe('CART_OTHER_RESTAURANT');

      const replaced = await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: rivalItemId, quantity: 1, replaceCart: true }).expect(201);
      expect(replaced.body.restaurant.name).toBe('Rival');
      expect(replaced.body.items).toHaveLength(1);
      await api().delete('/api/v1/cart').set(auth(client)).expect(200);
    });

    it("ne permet pas de modifier ni supprimer la ligne du panier d'un autre client", async () => {
      const cart = await fillCart(client2, colaId, 1);
      const lineId = cart.body.items[0].id as string;
      await api().patch(`/api/v1/cart/items/${lineId}`).set(auth(client)).send({ quantity: 5 }).expect(404);
      await api().delete(`/api/v1/cart/items/${lineId}`).set(auth(client)).expect(404);
      await api().patch(`/api/v1/cart/items/${lineId}`).set(auth(client2)).send({ quantity: 2 }).expect(200);
      await api().delete(`/api/v1/cart/items/${lineId}`).set(auth(client2)).expect(200);
      expect((await api().get('/api/v1/cart').set(auth(client2)).expect(200)).body.restaurant).toBeNull();
    });

    it('signale le minimum non atteint et un plat devenu indisponible, sans planter', async () => {
      const cart = await fillCart(client, colaId, 1); // 500 F < minimum 1000 F
      expect(cart.body).toMatchObject({ canCheckout: false });
      expect(cart.body.blockers.join(' ')).toContain('Commande minimum');
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: colaId, quantity: 4 }).expect(201);
      await prisma.menuItem.update({ where: { id: colaId }, data: { isAvailable: false } });
      const stale = await api().get('/api/v1/cart').set(auth(client)).expect(200);
      expect(stale.body.items[0].issue).toMatch(/n'est plus disponible/);
      expect(stale.body.canCheckout).toBe(false);
      await prisma.menuItem.update({ where: { id: colaId }, data: { isAvailable: true } });
      await api().delete('/api/v1/cart').set(auth(client)).expect(200);
    });
  });

  describe('Adresses', () => {
    let firstId: string;
    let secondId: string;

    it('la première adresse devient la valeur par défaut, une seule par défaut à la fois', async () => {
      const first = await api().post('/api/v1/addresses').set(auth(client)).send({ label: 'MAISON', fullAddress: 'Agoè, rue 12', landmark: 'Portail bleu' }).expect(201);
      firstId = first.body.id as string;
      expect(first.body.isDefault).toBe(true);
      const second = await api().post('/api/v1/addresses').set(auth(client)).send({ label: 'TRAVAIL', fullAddress: 'Bè Kpota', latitude: 6.13, longitude: 1.22, isDefault: true }).expect(201);
      secondId = second.body.id as string;
      const list = await api().get('/api/v1/addresses').set(auth(client)).expect(200);
      expect(list.body.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
      expect(list.body[0].id).toBe(secondId);
    });

    it('refuse une latitude sans longitude, et cloisonne par utilisateur', async () => {
      await api().post('/api/v1/addresses').set(auth(client)).send({ fullAddress: 'Quelque part', latitude: 6.1 }).expect(400);
      await api().patch(`/api/v1/addresses/${firstId}`).set(auth(client2)).send({ fullAddress: 'Piraté' }).expect(404);
      await api().delete(`/api/v1/addresses/${firstId}`).set(auth(client2)).expect(404);
      expect((await api().get('/api/v1/addresses').set(auth(client2)).expect(200)).body).toHaveLength(0);
    });

    it("la suppression de l'adresse par défaut en désigne une autre", async () => {
      await api().delete(`/api/v1/addresses/${secondId}`).set(auth(client)).expect(204);
      const list = await api().get('/api/v1/addresses').set(auth(client)).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].isDefault).toBe(true);
    });
  });

  describe('Création de commande : le serveur ne fait confiance à rien', () => {
    it('refuse un panier vide, un moyen de paiement indisponible et tout contenu envoyé par le client', async () => {
      await api().post('/api/v1/orders').set(auth(client)).send(addressBody).expect(400);
      await fillCart(client);
      await api().post('/api/v1/orders').set(auth(client)).send({ ...addressBody, paymentMethod: 'TMONEY' }).expect(400);
      for (const forbidden of [{ items: [] }, { total: 1 }, { status: 'DELIVERED' }, { subtotal: 1 }, { restaurantId }]) {
        await api().post('/api/v1/orders').set(auth(client)).send({ ...addressBody, ...forbidden }).expect(400);
      }
    });

    it('exige un lieu pour une livraison', async () => {
      await api().post('/api/v1/orders').set(auth(client)).send({ deliveryType: 'DELIVERY', paymentMethod: 'CASH_ON_DELIVERY' }).expect(400);
    });

    it('refuse quand le restaurant est fermé (pause)', async () => {
      await prisma.restaurant.update({ where: { id: restaurantId }, data: { isPaused: true } });
      const res = await api().post('/api/v1/orders').set(auth(client)).send(addressBody).expect(409);
      expect(JSON.stringify(res.body)).toContain('fermé');
      await prisma.restaurant.update({ where: { id: restaurantId }, data: { isPaused: false } });
    });

    it('recalcule tout depuis la base : un prix modifié après la mise au panier est appliqué', async () => {
      await prisma.menuItem.update({ where: { id: colaId }, data: { price: 600 } });
      const res = await api().post('/api/v1/orders').set(auth(client)).send(addressBody).expect(201);
      // 3 × 600 = 1800 + 1000 de livraison, jamais l'ancien prix (3 × 500).
      expect(res.body).toMatchObject({ subtotal: 1800, deliveryFee: 1000, total: 2800, status: 'PENDING', paymentMethod: 'CASH_ON_DELIVERY' });
      expect(res.body.items[0]).toMatchObject({ name: 'Coca-Cola', unitPrice: 600, quantity: 3 });
      await prisma.menuItem.update({ where: { id: colaId }, data: { price: 500 } });
    });

    it('vide le panier, enregistre le paiement et crée la conversation client ↔ restaurant', async () => {
      const cart = await api().get('/api/v1/cart').set(auth(client)).expect(200);
      expect(cart.body.items).toEqual([]);

      const order = await prisma.order.findFirstOrThrow({ where: { clientId: client.id }, include: { payments: true, conversations: { include: { members: true } } } });
      expect(order.orderNumber).toBeGreaterThan(0);
      expect(order.payments[0]).toMatchObject({ provider: 'cash', method: 'CASH_ON_DELIVERY', amount: 2800, currency: 'XOF', status: 'PENDING' });
      expect(order.conversations).toHaveLength(1);
      expect(order.conversations[0].kind).toBe('ORDER_RESTAURANT');
      expect(order.conversations[0].members.map((m) => m.userId).sort()).toEqual([client.id, owner.id, staff.id].sort());
    });

    it('notifie tout le personnel du restaurant (ORDER_NEW)', async () => {
      const notes = await prisma.notification.findMany({ where: { type: 'ORDER_NEW' } });
      expect(notes.map((n) => n.userId).sort()).toEqual([owner.id, staff.id].sort());
    });

    it('les deux parties peuvent écrire dans la conversation créée, un tiers non', async () => {
      const order = await prisma.order.findFirstOrThrow({ where: { clientId: client.id }, include: { conversations: true } });
      const conversationId = order.conversations[0].id;
      await api().post('/api/v1/messages').set(auth(client)).send({ conversationId, text: 'Ma commande est-elle prête ?' }).expect(201);
      await api().post('/api/v1/messages').set(auth(owner)).send({ conversationId, text: 'Encore 10 minutes' }).expect(201);
      await api().post('/api/v1/messages').set(auth(client2)).send({ conversationId, text: 'intrusion' }).expect(404);
      await api().post('/api/v1/messages').set(auth(rival)).send({ conversationId, text: 'intrusion' }).expect(404);
    });
  });

  describe('Concurrence', () => {
    it('un double envoi de la même commande ne crée qu\'une seule commande', async () => {
      await fillCart(client2, colaId, 3);
      const before = await prisma.order.count({ where: { clientId: client2.id } });
      const results = await Promise.all([1, 2, 3].map(() => api().post('/api/v1/orders').set(auth(client2)).send(addressBody)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await prisma.order.count({ where: { clientId: client2.id } })).toBe(before + 1);
    });

    it('le dernier plat en stock ne peut être commandé que par un seul client, le stock ne devient jamais négatif', async () => {
      await prisma.menuItem.update({ where: { id: rareId }, data: { stock: 1 } });
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: rareId, quantity: 1 }).expect(201);
      await api().post('/api/v1/cart/items').set(auth(client2)).send({ menuItemId: rareId, quantity: 1 }).expect(201);
      const results = await Promise.all([client, client2].map((user) => api().post('/api/v1/orders').set(auth(user)).send(addressBody)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.find((r) => r.status !== 201)!.status).toBeGreaterThanOrEqual(400);
      expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: rareId } })).stock).toBe(0);
      await api().delete('/api/v1/cart').set(auth(client)).expect(200);
      await api().delete('/api/v1/cart').set(auth(client2)).expect(200);
    });
  });

  describe('Cycle de vie et cloisonnement', () => {
    let orderId: string;

    beforeAll(async () => {
      await prisma.menuItem.update({ where: { id: rareId }, data: { stock: 5 } });
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: rareId, quantity: 2 }).expect(201);
      await api().post('/api/v1/cart/items').set(auth(client)).send({ menuItemId: colaId, quantity: 1 }).expect(201);
      const res = await api().post('/api/v1/orders').set(auth(client)).send({ ...addressBody, notes: 'Sonner deux fois' }).expect(201);
      orderId = res.body.id as string;
    });

    it('un client ne peut appeler aucune route restaurant (403), ni un restaurant étranger (404)', async () => {
      await api().post(`/api/v1/restaurant/${restaurantId}/orders/${orderId}/accept`).set(auth(client)).expect(403);
      await api().post(`/api/v1/restaurant/${restaurantId}/orders/${orderId}/accept`).set(auth(rival)).expect(404);
      // Le rival appelle SA propre URL avec l'identifiant d'une commande d'un autre restaurant.
      await api().post(`/api/v1/restaurant/${rivalRestaurantId}/orders/${orderId}/accept`).set(auth(rival)).expect(404); // restaurant approuvé mais commande d'un AUTRE restaurant
    });

    it("un restaurant non approuvé n'a accès à aucune commande (403)", async () => {
      await api().get(`/api/v1/restaurant/${pendingRestaurantId}/orders`).set(auth(pending)).expect(403);
      await api().get(`/api/v1/restaurant/${pendingRestaurantId}/dashboard`).set(auth(pending)).expect(403);
    });

    it('le restaurant voit la commande : le prénom et le téléphone du client, pas son adresse exacte', async () => {
      const list = await api().get(`/api/v1/restaurant/${restaurantId}/orders?scope=active`).set(auth(owner)).expect(200);
      const found = list.body.items.find((o: { id: string }) => o.id === orderId);
      expect(found).toMatchObject({ status: 'PENDING', client: { firstName: 'Jean' }, notes: 'Sonner deux fois' });
      expect(JSON.stringify(list.body)).not.toContain('Portail bleu');

      const detail = await api().get(`/api/v1/orders/${orderId}`).set(auth(owner)).expect(200);
      expect(detail.body.deliveryTarget).toBeNull();
      expect(detail.body.client.firstName).toBe('Jean');
    });

    it('le client voit son adresse mais pas de fiche « client » ; un tiers reçoit 404, un admin voit tout', async () => {
      const mine = await api().get(`/api/v1/orders/${orderId}`).set(auth(client)).expect(200);
      expect(mine.body.client).toBeNull();
      expect(mine.body.deliveryTarget.landmark).toBe('Portail bleu');
      expect(mine.body.conversations).toHaveLength(1);
      await api().get(`/api/v1/orders/${orderId}`).set(auth(client2)).expect(404);
      await api().get(`/api/v1/orders/${orderId}`).set(auth(rival)).expect(404);
      await api().get(`/api/v1/orders/${orderId}`).set(auth(admin)).expect(200);
      await api().get(`/api/v1/orders/${orderId}`).expect(401);
    });

    it('impose l\'ordre des étapes : on ne peut ni sauter ni rejouer', async () => {
      const base = `/api/v1/restaurant/${restaurantId}/orders/${orderId}`;
      await api().post(`${base}/ready`).set(auth(owner)).expect(409); // PENDING → READY interdit
      await api().post(`${base}/start-preparing`).set(auth(owner)).expect(409);
      await api().post(`${base}/hand-over`).set(auth(owner)).expect(403); // commande en livraison
      await api().post(`${base}/accept`).set(auth(staff)).expect(200);
      await api().post(`${base}/accept`).set(auth(owner)).expect(409); // déjà acceptée
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).acceptedAt).not.toBeNull();
    });

    it('l\'acceptation apparaît comme carte d\'événement dans la conversation client ↔ restaurant', async () => {
      const conversation = await prisma.conversation.findFirstOrThrow({ where: { orderId, kind: 'ORDER_RESTAURANT' } });
      const events = await prisma.message.findMany({ where: { conversationId: conversation.id, type: 'SYSTEM' }, orderBy: { sentAt: 'asc' } });
      expect(events.map((m) => m.systemAction)).toEqual(['ORDER_ACCEPTED']);
      const list = await api().get(`/api/v1/conversations/${conversation.id}/messages`).set(auth(client)).expect(200);
      expect(list.body.items.map((m: { systemAction: string | null }) => m.systemAction)).toEqual(expect.arrayContaining(['ORDER_ACCEPTED']));
    });

    it('le client est notifié à chaque étape', async () => {
      const base = `/api/v1/restaurant/${restaurantId}/orders/${orderId}`;
      await api().post(`${base}/start-preparing`).set(auth(owner)).expect(200);
      await api().post(`${base}/ready`).set(auth(owner)).expect(200);
      const types = (await prisma.notification.findMany({ where: { userId: client.id } })).map((n) => n.type);
      expect(types).toEqual(expect.arrayContaining(['ORDER_ACCEPTED', 'ORDER_PREPARING', 'ORDER_READY']));
      expect(await prisma.notification.count({ where: { userId: owner.id, type: 'ORDER_ACCEPTED' } })).toBe(0); // pas de notif à l'acteur
    });

    it("le client ne peut plus annuler une commande prête, et ne peut jamais forcer un statut", async () => {
      await api().post(`/api/v1/orders/${orderId}/cancel`).set(auth(client)).send({}).expect(409);
      await api().patch(`/api/v1/orders/${orderId}`).set(auth(client)).send({ status: 'DELIVERED' }).expect(404);
      await api().post(`/api/v1/orders/${orderId}/deliver`).set(auth(client)).expect(404);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('READY');
    });

    it("refuser exige un motif, restitue le stock et prévient le client", async () => {
      await api().post('/api/v1/cart/items').set(auth(client2)).send({ menuItemId: rareId, quantity: 2 }).expect(201);
      await api().post('/api/v1/cart/items').set(auth(client2)).send({ menuItemId: colaId, quantity: 2 }).expect(201);
      const created = await api().post('/api/v1/orders').set(auth(client2)).send(addressBody).expect(201);
      const id = created.body.id as string;
      const stockAfterOrder = (await prisma.menuItem.findUniqueOrThrow({ where: { id: rareId } })).stock!;

      const base = `/api/v1/restaurant/${restaurantId}/orders/${id}`;
      await api().post(`${base}/reject`).set(auth(owner)).send({}).expect(400);
      await api().post(`${base}/reject`).set(auth(owner)).send({ reason: 'Rupture de poulet' }).expect(200);

      expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: rareId } })).stock).toBe(stockAfterOrder + 2);
      const detail = await api().get(`/api/v1/orders/${id}`).set(auth(client2)).expect(200);
      expect(detail.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'Rupture de poulet' });
      await api().post(`${base}/accept`).set(auth(owner)).expect(409); // état final
    });

    it("le client peut annuler tant que la cuisine n'a pas commencé, et le stock est restitué", async () => {
      await api().post('/api/v1/cart/items').set(auth(client2)).send({ menuItemId: rareId, quantity: 1 }).expect(201);
      await api().post('/api/v1/cart/items').set(auth(client2)).send({ menuItemId: colaId, quantity: 2 }).expect(201);
      const created = await api().post('/api/v1/orders').set(auth(client2)).send(addressBody).expect(201);
      const id = created.body.id as string;
      const stockBefore = (await prisma.menuItem.findUniqueOrThrow({ where: { id: rareId } })).stock!;

      await api().post(`/api/v1/orders/${id}/cancel`).set(auth(client)).send({}).expect(404); // pas SA commande
      await api().post(`/api/v1/orders/${id}/cancel`).set(auth(client2)).send({ reason: 'Erreur' }).expect(200);
      expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: rareId } })).stock).toBe(stockBefore + 1);
      // Le restaurant est prévenu de l'annulation.
      expect(await prisma.notification.count({ where: { userId: owner.id, type: 'ORDER_CANCELLED' } })).toBeGreaterThan(0);
    });

    it('le retrait sur place : pas de frais de livraison, remise par le restaurant → DELIVERED', async () => {
      await fillCart(client2, colaId, 3);
      const created = await api().post('/api/v1/orders').set(auth(client2)).send({ deliveryType: 'PICKUP', paymentMethod: 'CASH_ON_DELIVERY' }).expect(201);
      expect(created.body).toMatchObject({ deliveryFee: 0, total: 1500 });
      expect(created.body.deliveryTarget.address).toBeNull();
      const base = `/api/v1/restaurant/${restaurantId}/orders/${created.body.id}`;
      for (const step of ['accept', 'start-preparing', 'ready', 'hand-over']) {
        await api().post(`${base}/${step}`).set(auth(owner)).expect(200);
      }
      const done = await api().get(`/api/v1/orders/${created.body.id}`).set(auth(client2)).expect(200);
      expect(done.body.status).toBe('DELIVERED');
      expect(done.body.deliveredAt).toBeTruthy();
    });

    it("la route d'annulation client est fermée à l'admin (l'annulation admin aura sa propre route, journalisée)", async () => {
      await api().post(`/api/v1/orders/${orderId}/cancel`).set(auth(admin)).send({}).expect(403); // route client
      const { status } = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(status).toBe('READY');
    });

    it('« commander à nouveau » remplit le panier avec les plats encore disponibles', async () => {
      await prisma.menuItem.update({ where: { id: rareId }, data: { isAvailable: false } });
      const res = await api().post(`/api/v1/orders/${orderId}/reorder`).set(auth(client)).expect(200);
      expect(res.body.cart.items.map((i: { name: string }) => i.name)).toEqual(['Coca-Cola']);
      expect(res.body.skipped[0]).toMatchObject({ name: 'Plat rare' });
      await api().post(`/api/v1/orders/${orderId}/reorder`).set(auth(client2)).expect(404);
      await prisma.menuItem.update({ where: { id: rareId }, data: { isAvailable: true } });
      await api().delete('/api/v1/cart').set(auth(client)).expect(200);
    });

    it('la liste du client est paginée et filtrable (en cours / terminées)', async () => {
      const active = await api().get('/api/v1/orders?scope=active').set(auth(client)).expect(200);
      expect(active.body.items.every((o: { status: string }) => !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status))).toBe(true);
      const past = await api().get('/api/v1/orders?scope=past&limit=1').set(auth(client2)).expect(200);
      expect(past.body.items).toHaveLength(1);
      expect(past.body.nextCursor).toBeTruthy();
      await api().get('/api/v1/orders?limit=500').set(auth(client)).expect(400);
      // Chaque client ne voit que ses commandes.
      const ids = new Set((await api().get('/api/v1/orders').set(auth(client)).expect(200)).body.items.map((o: { id: string }) => o.id));
      const otherIds = (await api().get('/api/v1/orders').set(auth(client2)).expect(200)).body.items.map((o: { id: string }) => o.id);
      expect(otherIds.some((id: string) => ids.has(id))).toBe(false);
    });

    it('le tableau de bord compte les commandes du jour et le chiffre d\'affaires livré hors livraison', async () => {
      const res = await api().get(`/api/v1/restaurant/${restaurantId}/dashboard`).set(auth(owner)).expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(5);
      expect(res.body).toMatchObject({ completed: 1, revenue: 1500, ready: 1 });
      expect(res.body.cancelled).toBe(2); // 1 refusée + 1 annulée
      await api().get(`/api/v1/restaurant/${restaurantId}/dashboard`).set(auth(rival)).expect(404); // non membre : rien n'est révélé
    });
  });
});
