import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Photos du catalogue de DÉMONSTRATION (développement uniquement).
 *
 *   SEED_DEMO=true npx ts-node prisma/seed-demo-images.ts
 *
 * Règles :
 *  - refuse de tourner en production ou sans SEED_DEMO=true ;
 *  - ne touche que les plats des restaurants de démonstration (slugs ci-dessous,
 *    créés par prisma/seed.ts), identifiés par leur nom exact ;
 *  - ne remplace JAMAIS une image existante (une vraie photo reste en place) ;
 *  - écrit toujours sur le disque local (STORAGE_LOCAL_PATH), même si Cloudinary
 *    est configuré : les images de démo ne doivent pas atterrir dans le compte
 *    média réel. Elles sont servies par GET /api/v1/media/menu/<fichier>.
 * Licences et auteurs : prisma/demo-images/ATTRIBUTIONS.md.
 */

const DEMO_SLUGS = ['chez-maman', 'le-roi-du-poulet', 'pizza-palace-tokoin'];
const IMAGES_DIR = join(__dirname, 'demo-images');
const URL_PREFIX = '/api/v1/media/menu/';

interface Manifest {
  items: Array<{ restaurantSlug: string; itemName: string; file: string }>;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Interdit en production.');
  if (process.env.SEED_DEMO !== 'true') {
    console.log('SEED_DEMO=true requis : rien n’a été modifié.');
    return;
  }
  const manifest = JSON.parse(await readFile(join(IMAGES_DIR, 'manifest.json'), 'utf8')) as Manifest;
  const target = join(resolve(process.env.STORAGE_LOCAL_PATH ?? './uploads'), 'public', 'menu');
  await mkdir(target, { recursive: true });

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
  // Une seule copie par photo source : deux plats identiques partagent le fichier.
  const copied = new Map<string, string>();
  let set = 0;
  let kept = 0;
  let missing = 0;
  try {
    for (const entry of manifest.items) {
      if (!DEMO_SLUGS.includes(entry.restaurantSlug)) continue;
      const item = await prisma.menuItem.findFirst({
        where: { name: entry.itemName, deletedAt: null, restaurant: { slug: entry.restaurantSlug } },
        select: { id: true, imageUrl: true },
      });
      if (!item) {
        missing += 1;
        console.log(`  absent : ${entry.restaurantSlug} / ${entry.itemName}`);
        continue;
      }
      if (item.imageUrl) {
        kept += 1;
        continue;
      }
      let url = copied.get(entry.file);
      if (!url) {
        const name = `${randomUUID()}.jpg`;
        await copyFile(join(IMAGES_DIR, entry.file), join(target, name));
        url = `${URL_PREFIX}${name}`;
        copied.set(entry.file, url);
      }
      // Conditionnel : n'écrase pas une image posée entre-temps.
      const updated = await prisma.menuItem.updateMany({ where: { id: item.id, imageUrl: null }, data: { imageUrl: url } });
      set += updated.count;
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`Images de démonstration : ${set} plat(s) illustré(s), ${kept} image(s) existante(s) conservée(s), ${missing} plat(s) introuvable(s).`);
}

main().catch((error: unknown) => {
  console.error('Échec du seed des images :', error);
  process.exit(1);
});
