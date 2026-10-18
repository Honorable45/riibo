import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './utils/test-app';
import { createTestPrisma, resetDatabase } from './utils/test-db';
import { registerTestUser, TestUser } from './utils/test-users';

jest.setTimeout(30_000);

// JPEG minimal valide pour la validation de signature (octets FF D8 FF).
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(197, 5)]);

/** Tous les jours de 00:00 à 00:00 (24 h) : le test ne dépend jamais de l'heure d'exécution. */
const ALL_DAY = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
  dayOfWeek,
  opensAt: '00:00',
  closesAt: '00:00',
}));

describe('Restaurants, menu et approbation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: TestUser;
  let client: TestUser;
  let owner: TestUser;
  let staff: TestUser;
  let intruder: TestUser;
  let restaurantId: string;
  let otherRestaurantId: string;
  let cuisineId: string;
  const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp();

    admin = await registerTestUser(app);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    client = await registerTestUser(app);
    owner = await registerTestUser(app, {
      accountType: 'RESTAURANT',
      restaurantName: 'Chez Maman',
      restaurantAddress: 'Agoè',
    });
    intruder = await registerTestUser(app, {
      accountType: 'RESTAURANT',
      restaurantName: 'Le Concurrent',
      restaurantAddress: 'Bè',
    });
    staff = await registerTestUser(app, { accountType: 'RESTAURANT', restaurantName: 'Autre' });

    const mine = await prisma.restaurantMember.findFirstOrThrow({ where: { userId: owner.id } });
    restaurantId = mine.restaurantId;
    otherRestaurantId = (await prisma.restaurantMember.findFirstOrThrow({ where: { userId: intruder.id } }))
      .restaurantId;
    // `staff` devient simple membre STAFF du restaurant d'owner.
    await prisma.restaurant.deleteMany({ where: { members: { some: { userId: staff.id } } } });
    await prisma.restaurantMember.create({ data: { restaurantId, userId: staff.id, role: 'STAFF' } });

    const cuisine = await prisma.restaurantCategory.create({
      data: { slug: 'poulet', name: 'Poulet', icon: '🍗' },
    });
    cuisineId = cuisine.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('Catalogue public : un restaurant non approuvé est invisible', () => {
    it('ne figure ni dans la liste ni en détail (404) tant que son statut est PENDING', async () => {
      const list = await api().get('/api/v1/restaurants').expect(200);
      expect(list.body.items).toHaveLength(0);
      await api().get(`/api/v1/restaurants/${restaurantId}`).expect(404);
      await api().get(`/api/v1/restaurants/${restaurantId}/menu`).expect(404);
    });
  });

  describe('Espace restaurant : contrôle d\'accès', () => {
    it('refuse un CLIENT (403) et un visiteur (401)', async () => {
      await api().get(`/api/v1/restaurant/${restaurantId}`).set(auth(client)).expect(403);
      await api().get(`/api/v1/restaurant/${restaurantId}`).expect(401);
    });

    it("renvoie 404 (pas 403) à un restaurant qui n'est pas membre — rien n'est révélé", async () => {
      await api().get(`/api/v1/restaurant/${restaurantId}`).set(auth(intruder)).expect(404);
      await api()
        .patch(`/api/v1/restaurant/${restaurantId}`)
        .set(auth(intruder))
        .send({ name: 'Piraté' })
        .expect(404);
    });

    it('un STAFF peut mettre en pause mais pas modifier les informations du restaurant', async () => {
      await api().patch(`/api/v1/restaurant/${restaurantId}`).set(auth(staff)).send({ isPaused: true }).expect(200);
      await api().patch(`/api/v1/restaurant/${restaurantId}`).set(auth(staff)).send({ isPaused: false }).expect(200);
      await api().patch(`/api/v1/restaurant/${restaurantId}`).set(auth(staff)).send({ name: 'Autre nom' }).expect(403);
      await api().put(`/api/v1/restaurant/${restaurantId}/hours`).set(auth(staff)).send({ ranges: [] }).expect(403);
    });

    it('ne permet jamais de changer son propre statut (champ inconnu refusé)', async () => {
      await api()
        .patch(`/api/v1/restaurant/${restaurantId}`)
        .set(auth(owner))
        .send({ status: 'APPROVED' })
        .expect(400);
      const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
      expect(restaurant.status).toBe('PENDING');
    });
  });

  describe('Profil, horaires et fermetures', () => {
    it('met à jour le profil, les frais en FCFA et la cuisine', async () => {
      const res = await api()
        .patch(`/api/v1/restaurant/${restaurantId}`)
        .set(auth(owner))
        .send({
          description: 'Cuisine familiale',
          latitude: 6.2311,
          longitude: 1.1953,
          deliveryFee: 1000,
          minOrderAmount: 1000,
          prepTimeMin: 20,
          prepTimeMax: 35,
          cuisineCategoryIds: [cuisineId],
        })
        .expect(200);
      expect(res.body).toMatchObject({ deliveryFee: 1000, latitude: 6.2311 });
      expect(res.body.categories[0].slug).toBe('poulet');
    });

    it('refuse un délai minimum supérieur au maximum, et une latitude sans longitude', async () => {
      await api().patch(`/api/v1/restaurant/${restaurantId}`).set(auth(owner)).send({ prepTimeMin: 90, prepTimeMax: 30 }).expect(400);
      await api().patch(`/api/v1/restaurant/${restaurantId}`).set(auth(owner)).send({ latitude: 6.2 }).expect(400);
    });

    it('refuse des plages qui se chevauchent ou un format d\'heure invalide', async () => {
      await api()
        .put(`/api/v1/restaurant/${restaurantId}/hours`)
        .set(auth(owner))
        .send({ ranges: [
          { dayOfWeek: 1, opensAt: '08:00', closesAt: '12:00' },
          { dayOfWeek: 1, opensAt: '11:00', closesAt: '15:00' },
        ] })
        .expect(400);
      await api()
        .put(`/api/v1/restaurant/${restaurantId}/hours`)
        .set(auth(owner))
        .send({ ranges: [{ dayOfWeek: 1, opensAt: '8h', closesAt: '12:00' }] })
        .expect(400);
    });

    it('enregistre les horaires (24 h/24 pour ce test)', async () => {
      const res = await api()
        .put(`/api/v1/restaurant/${restaurantId}/hours`)
        .set(auth(owner))
        .send({ ranges: ALL_DAY })
        .expect(200);
      expect(res.body.hours).toHaveLength(7);
    });

    it('refuse une fermeture dont la fin précède le début', async () => {
      await api()
        .post(`/api/v1/restaurant/${restaurantId}/closures`)
        .set(auth(owner))
        .send({ startsAt: '2030-01-02T00:00:00Z', endsAt: '2030-01-01T00:00:00Z' })
        .expect(400);
    });
  });

  describe('Menu : catégories, plats, options', () => {
    let categoryId: string;
    let itemId: string;

    it('crée une catégorie et un plat', async () => {
      const category = await api()
        .post(`/api/v1/restaurant/${restaurantId}/menu/categories`)
        .set(auth(owner))
        .send({ name: 'Poulet' })
        .expect(201);
      categoryId = category.body.id as string;

      const item = await api()
        .post(`/api/v1/restaurant/${restaurantId}/menu/items`)
        .set(auth(staff)) // le STAFF gère aussi le menu
        .send({ name: 'Poulet braisé', description: 'Braisé au charbon', price: 2500, categoryId, stock: 10 })
        .expect(201);
      itemId = item.body.id as string;
      expect(item.body.price).toBe(2500);
    });

    it('refuse un prix négatif ou décimal', async () => {
      await api().post(`/api/v1/restaurant/${restaurantId}/menu/items`).set(auth(owner)).send({ name: 'X', price: -5 }).expect(400);
      await api().post(`/api/v1/restaurant/${restaurantId}/menu/items`).set(auth(owner)).send({ name: 'X', price: 12.5 }).expect(400);
    });

    it("refuse d'utiliser une catégorie d'un autre restaurant", async () => {
      const foreign = await prisma.menuCategory.create({ data: { restaurantId: otherRestaurantId, name: 'Secret' } });
      await api()
        .post(`/api/v1/restaurant/${restaurantId}/menu/items`)
        .set(auth(owner))
        .send({ name: 'Volé', price: 1000, categoryId: foreign.id })
        .expect(404);
    });

    it("refuse de modifier un plat d'un autre restaurant, même en connaissant son id", async () => {
      const foreignItem = await prisma.menuItem.create({
        data: { restaurantId: otherRestaurantId, name: 'Plat concurrent', price: 900 },
      });
      await api()
        .patch(`/api/v1/restaurant/${restaurantId}/menu/items/${foreignItem.id}`)
        .set(auth(owner))
        .send({ price: 1 })
        .expect(404);
      await api()
        .delete(`/api/v1/restaurant/${restaurantId}/menu/items/${foreignItem.id}`)
        .set(auth(owner))
        .expect(404);
      expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: foreignItem.id } })).price).toBe(900);
    });

    it('définit des options avec supplément et valide les bornes', async () => {
      await api()
        .put(`/api/v1/restaurant/${restaurantId}/menu/items/${itemId}/options`)
        .set(auth(owner))
        .send({ groups: [{ name: 'Accompagnement', minSelect: 3, maxSelect: 1, options: [{ name: 'Alloco' }] }] })
        .expect(400); // min > max
      await api()
        .put(`/api/v1/restaurant/${restaurantId}/menu/items/${itemId}/options`)
        .set(auth(owner))
        .send({ groups: [{ name: 'Accompagnement', minSelect: 2, maxSelect: 2, options: [{ name: 'Alloco' }] }] })
        .expect(400); // pas assez d'options pour le minimum

      const res = await api()
        .put(`/api/v1/restaurant/${restaurantId}/menu/items/${itemId}/options`)
        .set(auth(owner))
        .send({ groups: [{
          name: 'Accompagnement', minSelect: 1, maxSelect: 1,
          options: [{ name: 'Alloco' }, { name: 'Frites', priceDelta: 300 }],
        }] })
        .expect(200);
      expect(res.body.optionGroups[0].options.map((o: { name: string }) => o.name)).toEqual(['Alloco', 'Frites']);
    });

    it('téléverse une photo de plat (signature vérifiée) et refuse un faux fichier', async () => {
      const ok = await api()
        .post(`/api/v1/restaurant/${restaurantId}/menu/items/${itemId}/image`)
        .set(auth(owner))
        .attach('image', JPEG, { filename: 'poulet.jpg', contentType: 'image/jpeg' })
        .expect(201);
      expect(ok.body.imageUrl).toMatch(/\/api\/v1\/media\/menu\/[0-9a-f-]{36}\.jpg$/);

      // L'image est servie publiquement.
      const path = (ok.body.imageUrl as string);
      const served = await api().get(path).expect(200);
      expect(served.headers['content-type']).toBe('image/jpeg');

      await api()
        .post(`/api/v1/restaurant/${restaurantId}/menu/items/${itemId}/image`)
        .set(auth(owner))
        .attach('image', Buffer.from('<?php echo 1; ?>'), { filename: 'x.jpg', contentType: 'image/jpeg' })
        .expect(400);
    });

    it("l'accès au média refuse un nom hors liste blanche (pas de traversée de répertoire)", async () => {
      await api().get('/api/v1/media/menu/..%2F..%2F.env').expect(404);
      await api().get('/api/v1/media/private/anything.jpg').expect(404);
    });

    it('supprime logiquement un plat', async () => {
      const temp = await api()
        .post(`/api/v1/restaurant/${restaurantId}/menu/items`)
        .set(auth(owner))
        .send({ name: 'Éphémère', price: 500 })
        .expect(201);
      await api().delete(`/api/v1/restaurant/${restaurantId}/menu/items/${temp.body.id}`).set(auth(owner)).expect(204);
      const row = await prisma.menuItem.findUniqueOrThrow({ where: { id: temp.body.id as string } });
      expect(row.deletedAt).not.toBeNull();
    });
  });

  describe('Validation par un admin', () => {
    it('refuse la soumission tant que le dossier est incomplet, en listant ce qui manque', async () => {
      const res = await api().post(`/api/v1/restaurant/${restaurantId}/submit`).set(auth(owner)).expect(400);
      expect(JSON.stringify(res.body)).toContain('Pièce d\'identité');
      expect(JSON.stringify(res.body)).toContain('Photo de la devanture');
    });

    it("n'expose jamais les références de documents, seulement leur présence", async () => {
      await api()
        .post(`/api/v1/restaurant/${restaurantId}/documents/owner-id-card`)
        .set(auth(owner))
        .attach('document', JPEG, { filename: 'cni.jpg', contentType: 'image/jpeg' })
        .expect(201);
      const res = await api()
        .post(`/api/v1/restaurant/${restaurantId}/documents/storefront-photo`)
        .set(auth(owner))
        .attach('document', JPEG, { filename: 'devanture.jpg', contentType: 'image/jpeg' })
        .expect(201);
      expect(res.body.documents).toEqual({
        'owner-id-card': true,
        'business-registration': false,
        'storefront-photo': true,
      });
      expect(JSON.stringify(res.body)).not.toContain('local:');
    });

    it('un STAFF ne peut pas téléverser de pièce ni soumettre le dossier', async () => {
      await api()
        .post(`/api/v1/restaurant/${restaurantId}/documents/owner-id-card`)
        .set(auth(staff))
        .attach('document', JPEG, { filename: 'x.jpg', contentType: 'image/jpeg' })
        .expect(403);
      await api().post(`/api/v1/restaurant/${restaurantId}/submit`).set(auth(staff)).expect(403);
    });

    it('soumet le dossier : PENDING → IN_REVIEW, puis refuse une seconde soumission', async () => {
      const res = await api().post(`/api/v1/restaurant/${restaurantId}/submit`).set(auth(owner)).expect(200);
      expect(res.body.status).toBe('IN_REVIEW');
      await api().post(`/api/v1/restaurant/${restaurantId}/submit`).set(auth(owner)).expect(409);
    });

    it("l'espace admin est fermé aux non-admins", async () => {
      await api().get('/api/v1/admin/restaurants').set(auth(client)).expect(403);
      await api().get('/api/v1/admin/restaurants').set(auth(owner)).expect(403);
      await api()
        .patch(`/api/v1/admin/restaurants/${restaurantId}/status`)
        .set(auth(owner))
        .send({ action: 'APPROVE' })
        .expect(403);
    });

    it("l'admin liste les dossiers à vérifier et ouvre une pièce (consultation tracée)", async () => {
      const list = await api().get('/api/v1/admin/restaurants?status=IN_REVIEW').set(auth(admin)).expect(200);
      expect(list.body.items.map((r: { id: string }) => r.id)).toEqual([restaurantId]);
      expect(list.body.items[0].owner.phone).toBe(owner.phone);

      const doc = await api()
        .get(`/api/v1/admin/restaurants/${restaurantId}/documents/owner-id-card`)
        .set(auth(admin))
        .expect(200);
      expect(doc.headers['cache-control']).toBe('no-store');
      expect(doc.headers['content-type']).toBe('image/jpeg');

      const log = await prisma.auditLog.findFirst({ where: { action: 'RESTAURANT_DOCUMENT_VIEWED' } });
      expect(log).toMatchObject({ actorId: admin.id, targetId: restaurantId });
    });

    it('exige un motif pour refuser, et refuse une transition invalide', async () => {
      await api()
        .patch(`/api/v1/admin/restaurants/${restaurantId}/status`)
        .set(auth(admin))
        .send({ action: 'REJECT' })
        .expect(400);
      await api()
        .patch(`/api/v1/admin/restaurants/${restaurantId}/status`)
        .set(auth(admin))
        .send({ action: 'REACTIVATE' })
        .expect(409); // il n'est pas suspendu
    });

    it('approuve : IN_REVIEW → APPROVED, journalisé, propriétaire notifié', async () => {
      const res = await api()
        .patch(`/api/v1/admin/restaurants/${restaurantId}/status`)
        .set(auth(admin))
        .send({ action: 'APPROVE' })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.approvedAt).toBeTruthy();

      const audit = await prisma.auditLog.findFirst({ where: { action: 'RESTAURANT_APPROVE' } });
      expect(audit?.metadata).toMatchObject({ from: 'IN_REVIEW', to: 'APPROVED' });

      const notifications = await prisma.notification.findMany({ where: { type: 'ACCOUNT_APPROVED' } });
      expect(notifications.map((n) => n.userId).sort()).toEqual([owner.id, staff.id].sort());
    });
  });

  describe('Catalogue public une fois approuvé', () => {
    it('apparaît dans la liste, ouvert (24 h/24), avec sa distance et sa cuisine', async () => {
      const res = await api().get('/api/v1/restaurants?lat=6.2311&lng=1.1953').expect(200);
      expect(res.body.total).toBe(1);
      const card = res.body.items[0];
      expect(card).toMatchObject({
        name: 'Chez Maman',
        isOpen: true,
        deliveryFee: 1000,
        distanceKm: 0,
      });
      expect(card.categories[0]).toMatchObject({ slug: 'poulet', icon: '🍗' });
      // Aucune donnée sensible dans la carte publique.
      expect(JSON.stringify(card)).not.toMatch(/ownerId|paymentAccount|Url":"local:|passwordHash/);
    });

    it('filtre par catégorie, par recherche et par rayon', async () => {
      expect((await api().get('/api/v1/restaurants?category=poulet').expect(200)).body.total).toBe(1);
      expect((await api().get('/api/v1/restaurants?category=pizza').expect(200)).body.total).toBe(0);
      expect((await api().get('/api/v1/restaurants?q=maman').expect(200)).body.total).toBe(1);
      expect((await api().get('/api/v1/restaurants?q=inconnu').expect(200)).body.total).toBe(0);
      // Client à ~110 km : hors du rayon par défaut.
      expect((await api().get('/api/v1/restaurants?lat=7.2&lng=1.19&radiusKm=5').expect(200)).body.total).toBe(0);
    });

    it('pagine et borne limit (jamais toute la base)', async () => {
      await api().get('/api/v1/restaurants?limit=1000').expect(400);
      const res = await api().get('/api/v1/restaurants?limit=1&page=2').expect(200);
      expect(res.body.items).toHaveLength(0);
    });

    it('expose le menu avec options, sans le stock exact', async () => {
      const menu = await api().get('/api/v1/restaurants/chez-maman/menu').expect(200);
      const item = menu.body.categories[0].items[0];
      expect(item).toMatchObject({ name: 'Poulet braisé', price: 2500, isAvailable: true });
      expect(item.optionGroups[0].options[1]).toMatchObject({ name: 'Frites', priceDelta: 300 });
      expect(item).not.toHaveProperty('stock');
      expect(menu.body.categories[0].items.map((i: { name: string }) => i.name)).not.toContain('Éphémère');
    });

    it('un plat au stock épuisé apparaît indisponible', async () => {
      const item = await prisma.menuItem.findFirstOrThrow({ where: { name: 'Poulet braisé' } });
      await prisma.menuItem.update({ where: { id: item.id }, data: { stock: 0 } });
      const menu = await api().get(`/api/v1/restaurants/${restaurantId}/menu`).expect(200);
      expect(menu.body.categories[0].items[0].isAvailable).toBe(false);
    });

    it('la pause manuelle le rend fermé sans le retirer du catalogue', async () => {
      await api().patch(`/api/v1/restaurant/${restaurantId}`).set(auth(staff)).send({ isPaused: true }).expect(200);
      const res = await api().get('/api/v1/restaurants').expect(200);
      expect(res.body.items[0]).toMatchObject({ isOpen: false, closedReason: 'PAUSED' });
      expect((await api().get('/api/v1/restaurants?openNow=true').expect(200)).body.total).toBe(0);
      await api().patch(`/api/v1/restaurant/${restaurantId}`).set(auth(staff)).send({ isPaused: false }).expect(200);
    });

    it('une fermeture exceptionnelle en cours le rend fermé, puis se supprime', async () => {
      const start = new Date(Date.now() - 3_600_000).toISOString();
      const end = new Date(Date.now() + 3_600_000).toISOString();
      const withClosure = await api()
        .post(`/api/v1/restaurant/${restaurantId}/closures`)
        .set(auth(owner))
        .send({ startsAt: start, endsAt: end, reason: 'Congés' })
        .expect(201);
      expect((await api().get('/api/v1/restaurants').expect(200)).body.items[0].closedReason).toBe('CLOSURE');

      const closureId = withClosure.body.closures[0].id as string;
      await api().delete(`/api/v1/restaurant/${restaurantId}/closures/${closureId}`).set(auth(owner)).expect(200);
      expect((await api().get('/api/v1/restaurants').expect(200)).body.items[0].isOpen).toBe(true);
    });

    it('une suspension par un admin retire immédiatement le restaurant du catalogue', async () => {
      await api()
        .patch(`/api/v1/admin/restaurants/${restaurantId}/status`)
        .set(auth(admin))
        .send({ action: 'SUSPEND', reason: 'Plaintes clients' })
        .expect(200);
      expect((await api().get('/api/v1/restaurants').expect(200)).body.total).toBe(0);
      await api().get(`/api/v1/restaurants/${restaurantId}`).expect(404);

      const mine = await api().get(`/api/v1/restaurant/${restaurantId}`).set(auth(owner)).expect(200);
      expect(mine.body).toMatchObject({ status: 'SUSPENDED', statusReason: 'Plaintes clients' });

      await api()
        .patch(`/api/v1/admin/restaurants/${restaurantId}/status`)
        .set(auth(admin))
        .send({ action: 'REACTIVATE' })
        .expect(200);
      expect((await api().get('/api/v1/restaurants').expect(200)).body.total).toBe(1);
    });
  });
});
