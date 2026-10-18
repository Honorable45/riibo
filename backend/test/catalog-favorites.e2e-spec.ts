import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './utils/test-app';
import { createTestPrisma, resetDatabase } from './utils/test-db';
import { registerTestUser, TestUser } from './utils/test-users';

jest.setTimeout(30_000);

/**
 * Catalogue public de plats (accueil client), favoris de restaurants et vue
 * d'ensemble admin : ce que le client voit ne doit jamais fuir un plat non
 * vendable, et chaque compte ne voit que SES favoris.
 */
describe('Catalogue de plats, favoris et vue d’ensemble admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: TestUser;
  let client: TestUser;
  let otherClient: TestUser;
  let owner: TestUser;
  let approvedId: string;
  let pendingId: string;
  const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp();

    admin = await registerTestUser(app);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    client = await registerTestUser(app);
    otherClient = await registerTestUser(app);
    owner = await registerTestUser(app, { accountType: 'RESTAURANT', restaurantName: 'Chez Maman', restaurantAddress: 'Agoè' });
    const pendingOwner = await registerTestUser(app, { accountType: 'RESTAURANT', restaurantName: 'En attente', restaurantAddress: 'Bè' });

    approvedId = (await prisma.restaurantMember.findFirstOrThrow({ where: { userId: owner.id } })).restaurantId;
    pendingId = (await prisma.restaurantMember.findFirstOrThrow({ where: { userId: pendingOwner.id } })).restaurantId;
    await prisma.restaurant.update({ where: { id: approvedId }, data: { status: 'APPROVED' } });

    const cuisine = await prisma.restaurantCategory.create({ data: { slug: 'poulet', name: 'Poulet' } });
    await prisma.restaurant.update({ where: { id: approvedId }, data: { categories: { connect: { id: cuisine.id } } } });

    const item = (restaurantId: string, name: string, extra: Record<string, unknown> = {}) =>
      prisma.menuItem.create({ data: { restaurantId, name, price: 1500, ...extra } });
    await item(approvedId, 'Poulet braisé'); // stock illimité (null)
    await item(approvedId, 'Riz gras', { stock: 5 });
    await item(approvedId, 'Épuisé', { stock: 0 });
    await item(approvedId, 'Indisponible', { isAvailable: false });
    await item(approvedId, 'Supprimé', { deletedAt: new Date() });
    await item(pendingId, 'Plat du restaurant non validé');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /menu-items', () => {
    it('est public et ne renvoie que les plats vendables d’un restaurant approuvé', async () => {
      const res = await api().get('/api/v1/menu-items').expect(200);
      const names = res.body.items.map((i: { name: string }) => i.name).sort();
      // stock null (illimité) et stock > 0 : oui ; stock 0, indisponible, supprimé, restaurant non validé : non.
      expect(names).toEqual(['Poulet braisé', 'Riz gras']);
      expect(res.body.total).toBe(2);
      expect(res.body.items[0]).toEqual(
        expect.objectContaining({ restaurant: expect.objectContaining({ id: approvedId, name: 'Chez Maman' }) }),
      );
    });

    it('n’expose ni le stock exact ni des champs internes', async () => {
      const res = await api().get('/api/v1/menu-items').expect(200);
      for (const item of res.body.items) {
        expect(item).not.toHaveProperty('stock');
        expect(item).not.toHaveProperty('deletedAt');
      }
    });

    it('filtre par recherche (plat ou restaurant) et par catégorie de cuisine', async () => {
      const byDish = await api().get('/api/v1/menu-items').query({ q: 'riz' }).expect(200);
      expect(byDish.body.items.map((i: { name: string }) => i.name)).toEqual(['Riz gras']);

      const byRestaurant = await api().get('/api/v1/menu-items').query({ q: 'maman' }).expect(200);
      expect(byRestaurant.body.total).toBe(2);

      const byCategory = await api().get('/api/v1/menu-items').query({ category: 'poulet' }).expect(200);
      expect(byCategory.body.total).toBe(2);
      const noCategory = await api().get('/api/v1/menu-items').query({ category: 'pizza' }).expect(200);
      expect(noCategory.body.total).toBe(0);
    });

    it('pagine et refuse une page trop grande', async () => {
      const page = await api().get('/api/v1/menu-items').query({ limit: 1, page: 2 }).expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.hasMore).toBe(false);
      await api().get('/api/v1/menu-items').query({ limit: 500 }).expect(400);
    });
  });

  describe('Favoris', () => {
    it('exige un compte client', async () => {
      await api().get('/api/v1/favorites').expect(401);
      await api().post(`/api/v1/favorites/${approvedId}`).expect(401);
      await api().get('/api/v1/favorites').set(auth(owner)).expect(403);
    });

    it('ajoute, liste et retire un favori (idempotent)', async () => {
      await api().post(`/api/v1/favorites/${approvedId}`).set(auth(client)).expect(204);
      await api().post(`/api/v1/favorites/${approvedId}`).set(auth(client)).expect(204);

      const ids = await api().get('/api/v1/favorites/ids').set(auth(client)).expect(200);
      expect(ids.body).toEqual([approvedId]);
      const list = await api().get('/api/v1/favorites').set(auth(client)).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toEqual(expect.objectContaining({ id: approvedId, name: 'Chez Maman', isOpen: expect.any(Boolean) }));

      await api().delete(`/api/v1/favorites/${approvedId}`).set(auth(client)).expect(204);
      await api().delete(`/api/v1/favorites/${approvedId}`).set(auth(client)).expect(204);
      expect((await api().get('/api/v1/favorites/ids').set(auth(client)).expect(200)).body).toEqual([]);
    });

    it('refuse un restaurant inexistant ou non validé', async () => {
      await api().post(`/api/v1/favorites/${pendingId}`).set(auth(client)).expect(404);
      await api().post('/api/v1/favorites/inconnu').set(auth(client)).expect(404);
    });

    it('isole les favoris de chaque compte', async () => {
      await api().post(`/api/v1/favorites/${approvedId}`).set(auth(client)).expect(204);
      expect((await api().get('/api/v1/favorites/ids').set(auth(otherClient)).expect(200)).body).toEqual([]);
      // Retirer chez l'autre client ne touche pas les favoris du premier.
      await api().delete(`/api/v1/favorites/${approvedId}`).set(auth(otherClient)).expect(204);
      expect((await api().get('/api/v1/favorites/ids').set(auth(client)).expect(200)).body).toEqual([approvedId]);
    });

    it('un restaurant suspendu disparaît de la liste des favoris', async () => {
      await prisma.restaurant.update({ where: { id: approvedId }, data: { status: 'SUSPENDED' } });
      expect((await api().get('/api/v1/favorites').set(auth(client)).expect(200)).body).toEqual([]);
      await prisma.restaurant.update({ where: { id: approvedId }, data: { status: 'APPROVED' } });
    });
  });

  describe('GET /admin/overview', () => {
    it('est réservé aux administrateurs', async () => {
      await api().get('/api/v1/admin/overview').expect(401);
      await api().get('/api/v1/admin/overview').set(auth(client)).expect(403);
      await api().get('/api/v1/admin/overview').set(auth(owner)).expect(403);
    });

    it('agrège commandes, restaurants, livreurs et clients', async () => {
      const res = await api().get('/api/v1/admin/overview').set(auth(admin)).expect(200);
      expect(res.body.clients).toBe(2);
      expect(res.body.restaurants).toEqual({ APPROVED: 1, PENDING: 1 });
      expect(res.body.drivers.online).toBe(0);
      expect(res.body.orders).toEqual({ today: 0, delivered: 0, inProgress: 0, cancelled: 0, total: 0 });
      expect(res.body.revenueToday).toBe(0);
      expect(res.body.last7Days).toHaveLength(7);
    });
  });
});
