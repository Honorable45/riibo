import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';

/**
 * Seed Riiberaka.
 *
 *  1. Données de référence (toujours) : catégories de cuisine.
 *  2. Compte admin, si SEED_ADMIN_PHONE et SEED_ADMIN_PASSWORD sont définis
 *     (le seul moyen de créer un ADMIN : aucun endpoint ne le permet).
 *  3. Données de démonstration, uniquement avec SEED_DEMO=true et JAMAIS en
 *     production. Faciles à retirer : les comptes de démonstration ont tous un
 *     numéro +22890100001 / +2289020000x / +22890300001, et les restaurants les
 *     slugs listés dans DEMO_RESTAURANTS.
 */

const CUISINE_CATEGORIES = [
  { slug: 'poulet', name: 'Poulet', icon: '🍗' },
  { slug: 'riz', name: 'Riz', icon: '🍚' },
  { slug: 'burger', name: 'Burger', icon: '🍔' },
  { slug: 'pizza', name: 'Pizza', icon: '🍕' },
  { slug: 'poisson', name: 'Poisson', icon: '🐟' },
  { slug: 'pates', name: 'Pâtes locales', icon: '🍲' },
  { slug: 'boissons', name: 'Boissons', icon: '🥤' },
  { slug: 'desserts', name: 'Desserts', icon: '🍰' },
];

interface DemoItem {
  name: string;
  description: string;
  price: number;
  category: string;
  options?: Array<{
    name: string;
    minSelect: number;
    maxSelect: number;
    choices: Array<{ name: string; priceDelta?: number }>;
  }>;
}

interface DemoRestaurant {
  name: string;
  slug: string;
  ownerPhone: string;
  ownerName: string;
  address: string;
  quarter: string;
  latitude: number;
  longitude: number;
  description: string;
  deliveryFee: number;
  cuisines: string[];
  closedOnSunday?: boolean;
  items: DemoItem[];
}

const DEMO_RESTAURANTS: DemoRestaurant[] = [
  {
    name: 'Chez Maman',
    slug: 'chez-maman',
    ownerPhone: '+22890200001',
    ownerName: 'Maman Akouvi',
    address: "Agoè, près du marché d'Agoè",
    quarter: 'Agoè',
    latitude: 6.2311,
    longitude: 1.1953,
    description: 'Cuisine familiale togolaise, poulet braisé et riz sauce.',
    deliveryFee: 1000,
    cuisines: ['poulet', 'riz', 'boissons'],
    items: [
      {
        name: 'Poulet braisé',
        description: 'Poulet entier mariné, braisé au charbon.',
        price: 2500,
        category: 'Poulet',
        options: [
          {
            name: 'Accompagnement',
            minSelect: 1,
            maxSelect: 1,
            choices: [{ name: 'Alloco' }, { name: 'Attiéké' }, { name: 'Frites', priceDelta: 300 }],
          },
          {
            name: 'Suppléments',
            minSelect: 0,
            maxSelect: 2,
            choices: [{ name: 'Piment' }, { name: 'Œuf', priceDelta: 200 }],
          },
        ],
      },
      { name: 'Demi-poulet', description: 'Un demi poulet braisé.', price: 1500, category: 'Poulet' },
      { name: 'Riz sauce tomate', description: 'Riz blanc, sauce tomate maison.', price: 1200, category: 'Riz' },
      { name: 'Riz au poisson', description: 'Riz gras au poisson fumé.', price: 1800, category: 'Riz' },
      { name: 'Coca-Cola', description: 'Bouteille 50 cl.', price: 500, category: 'Boissons' },
      { name: "Jus de gingembre", description: 'Fait maison, 50 cl.', price: 400, category: 'Boissons' },
    ],
  },
  {
    name: 'Le Roi du Poulet',
    slug: 'le-roi-du-poulet',
    ownerPhone: '+22890200002',
    ownerName: 'Kossi Mensah',
    address: 'Bè Kpota, rue du stade',
    quarter: 'Bè',
    latitude: 6.1375,
    longitude: 1.2273,
    description: 'Le meilleur poulet frit de Lomé.',
    deliveryFee: 800,
    cuisines: ['poulet', 'burger', 'boissons'],
    items: [
      { name: 'Poulet frit 4 morceaux', description: 'Croustillant, servi avec frites.', price: 2200, category: 'Poulet' },
      { name: 'Poulet frit 8 morceaux', description: 'Pour partager.', price: 4000, category: 'Poulet' },
      { name: 'Burger poulet', description: 'Pain, poulet pané, salade, sauce maison.', price: 1800, category: 'Burgers' },
      { name: 'Fanta', description: 'Bouteille 50 cl.', price: 500, category: 'Boissons' },
    ],
  },
  {
    name: 'Pizza Palace Tokoin',
    slug: 'pizza-palace-tokoin',
    ownerPhone: '+22890200003',
    ownerName: 'Marco Adjovi',
    address: 'Tokoin Wuiti, face à la pharmacie',
    quarter: 'Tokoin',
    latitude: 6.1611,
    longitude: 1.2229,
    description: 'Pizzas au feu de bois.',
    deliveryFee: 1200,
    cuisines: ['pizza', 'desserts', 'boissons'],
    closedOnSunday: true,
    items: [
      {
        name: 'Pizza Margherita',
        description: 'Tomate, mozzarella, basilic.',
        price: 3500,
        category: 'Pizzas',
        options: [
          {
            name: 'Taille',
            minSelect: 1,
            maxSelect: 1,
            choices: [{ name: 'Moyenne' }, { name: 'Grande', priceDelta: 1500 }],
          },
        ],
      },
      { name: 'Pizza 4 fromages', description: 'Mozzarella, chèvre, gorgonzola, parmesan.', price: 4500, category: 'Pizzas' },
      { name: 'Tiramisu', description: 'Fait maison.', price: 1500, category: 'Desserts' },
      { name: 'Eau minérale', description: '1,5 L.', price: 400, category: 'Boissons' },
    ],
  },
];

/** Identique à src/auth/phone-hash.util.ts (SHA-256 du numéro tel quel). */
function hashPhone(phone: string): string {
  return createHash('sha256').update(phone).digest('hex');
}

function usernameFromPhone(phone: string): string {
  return `user${phone.replace(/[^0-9]/g, '').slice(-8)}`;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL ?? ''),
  });

  try {
    // ---- 1. Catégories de cuisine -------------------------------------------------
    for (const [position, category] of CUISINE_CATEGORIES.entries()) {
      await prisma.restaurantCategory.upsert({
        where: { slug: category.slug },
        update: { name: category.name, icon: category.icon, position },
        create: { ...category, position },
      });
    }
    console.log(`Catégories de cuisine : ${CUISINE_CATEGORIES.length}.`);

    const createUser = async (input: {
      phone: string;
      firstName: string;
      lastName?: string;
      role: 'CLIENT' | 'RESTAURANT' | 'LIVREUR' | 'ADMIN';
      password: string;
    }) => {
      const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
      if (existing) return existing;
      return prisma.user.create({
        data: {
          username: usernameFromPhone(input.phone),
          phone: input.phone,
          phoneHash: hashPhone(input.phone),
          passwordHash: await bcrypt.hash(input.password, 12),
          firstName: input.firstName,
          lastName: input.lastName ?? '',
          role: input.role,
          profile: { create: {} },
        },
      });
    };

    // ---- 2. Admin -----------------------------------------------------------------
    const adminPhone = process.env.SEED_ADMIN_PHONE;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (adminPhone && adminPassword) {
      const admin = await createUser({
        phone: adminPhone,
        firstName: 'Admin',
        lastName: 'Riiberaka',
        role: 'ADMIN',
        password: adminPassword,
      });
      if (admin.role !== 'ADMIN') {
        await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
      }
      console.log(`Compte admin prêt : ${adminPhone}.`);
    } else {
      console.log('Aucun admin créé (SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD absents).');
    }

    // ---- 3. Démonstration ---------------------------------------------------------
    if (process.env.SEED_DEMO !== 'true') return;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SEED_DEMO est interdit en production.');
    }

    const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'demo12345';
    const categoryBySlug = new Map(
      (await prisma.restaurantCategory.findMany()).map((category) => [category.slug, category.id]),
    );

    for (const demo of DEMO_RESTAURANTS) {
      const owner = await createUser({
        phone: demo.ownerPhone,
        firstName: demo.ownerName,
        role: 'RESTAURANT',
        password: demoPassword,
      });

      let restaurant = await prisma.restaurant.findUnique({ where: { slug: demo.slug } });
      if (restaurant) continue; // déjà seedé

      restaurant = await prisma.restaurant.create({
        data: {
          slug: demo.slug,
          name: demo.name,
          description: demo.description,
          phone: demo.ownerPhone,
          address: demo.address,
          quarter: demo.quarter,
          latitude: demo.latitude,
          longitude: demo.longitude,
          status: 'APPROVED',
          approvedAt: new Date(),
          deliveryFee: demo.deliveryFee,
          minOrderAmount: 1000,
          categories: {
            connect: demo.cuisines.flatMap((slug) => {
              const id = categoryBySlug.get(slug);
              return id ? [{ id }] : [];
            }),
          },
          members: { create: { userId: owner.id, role: 'OWNER' } },
          // 8 h – 22 h tous les jours (dimanche fermé pour certains).
          hours: {
            create: [1, 2, 3, 4, 5, 6, 7]
              .filter((day) => !(demo.closedOnSunday && day === 7))
              .map((dayOfWeek) => ({ dayOfWeek, opensAt: '08:00', closesAt: '22:00' })),
          },
        },
      });

      const menuCategoryIds = new Map<string, string>();
      let position = 0;
      for (const item of demo.items) {
        if (!menuCategoryIds.has(item.category)) {
          const created = await prisma.menuCategory.create({
            data: { restaurantId: restaurant.id, name: item.category, position: menuCategoryIds.size },
          });
          menuCategoryIds.set(item.category, created.id);
        }
        await prisma.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: menuCategoryIds.get(item.category),
            name: item.name,
            description: item.description,
            price: item.price,
            position: position++,
            optionGroups: {
              create: (item.options ?? []).map((group, groupPosition) => ({
                name: group.name,
                minSelect: group.minSelect,
                maxSelect: group.maxSelect,
                position: groupPosition,
                options: {
                  create: group.choices.map((choice, choicePosition) => ({
                    name: choice.name,
                    priceDelta: choice.priceDelta ?? 0,
                    position: choicePosition,
                  })),
                },
              })),
            },
          },
        });
      }
    }
    console.log(`Restaurants de démonstration : ${DEMO_RESTAURANTS.length}.`);

    await createUser({
      phone: '+22890100001',
      firstName: 'Jean',
      lastName: 'Client',
      role: 'CLIENT',
      password: demoPassword,
    });

    const driverUser = await createUser({
      phone: '+22890300001',
      firstName: 'Kofi',
      lastName: 'Livreur',
      role: 'LIVREUR',
      password: demoPassword,
    });
    await prisma.driverProfile.upsert({
      where: { userId: driverUser.id },
      update: {},
      create: {
        userId: driverUser.id,
        status: 'APPROVED',
        vehicleType: 'MOTO',
        plateNumber: 'TG-1234-AB',
      },
    });

    await prisma.promoCode.upsert({
      where: { code: 'BIENVENUE10' },
      update: {},
      create: {
        code: 'BIENVENUE10',
        description: '10 % sur votre commande',
        discountType: 'PERCENT',
        discountValue: 10,
        maxDiscount: 1500,
        minOrderAmount: 5000,
        maxUsesPerUser: 1,
      },
    });

    console.log(
      `Démo prête. Mot de passe de tous les comptes de démonstration : ${demoPassword}\n` +
        '  client   +22890100001\n' +
        '  livreur  +22890300001\n' +
        '  restos   +22890200001 / +22890200002 / +22890200003\n' +
        '  code promo BIENVENUE10 (−10 %, min. 5 000 F)',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Échec du seed :', error);
  process.exit(1);
});
