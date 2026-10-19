/**
 * Photographies éditoriales de la vitrine (CC0, sources et auteurs dans
 * public/images/plats/CREDITS.md). Ce sont des photos d'illustration : elles ne
 * représentent pas un restaurant partenaire et ne portent aucun prix.
 */
export interface Photo {
  src: string;
  alt: string;
  /** Légende exacte de ce que montre la photo. */
  caption: string;
  width: number;
  height: number;
}

export const photos = {
  tilapia: {
    src: '/images/plats/tilapia-braise-frites.jpg',
    alt: 'Tilapia entier braisé, servi avec des frites, du citron vert et du piment',
    caption: 'Tilapia braisé, frites et piment',
    width: 1800,
    height: 1350,
  },
  brochettes: {
    src: '/images/plats/brochettes-sur-la-braise.jpg',
    alt: 'Brochettes de viande qui grillent sur la braise',
    caption: 'Brochettes sur la braise',
    width: 1024,
    height: 683,
  },
  pouletRiz: {
    src: '/images/plats/poulet-grille-riz.jpg',
    alt: 'Cuisse de poulet grillée servie avec du riz blanc',
    caption: 'Poulet grillé et riz',
    width: 1536,
    height: 2048,
  },
  pouletService: {
    src: '/images/plats/poulet-grille-servi.jpg',
    alt: 'Une main tient une assiette de poulet grillé à côté du grill',
    caption: 'Poulet grillé, tout juste servi',
    width: 960,
    height: 731,
  },
  burger: {
    src: '/images/plats/burger.jpg',
    alt: 'Burger au steak, oignons rouges et salade sur une assiette',
    caption: 'Burger maison',
    width: 960,
    height: 721,
  },
  pizza: {
    src: '/images/plats/pizza-a-emporter.jpg',
    alt: 'Pizza garnie de tomates, maïs et olives dans sa boîte',
    caption: 'Pizza dans sa boîte',
    width: 960,
    height: 643,
  },
} satisfies Record<string, Photo>;
