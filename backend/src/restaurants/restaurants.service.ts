import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { boundingBox, haversineKm } from '../common/geo.util';
import { PrismaService } from '../prisma/prisma.service';
import { ListRestaurantsQueryDto } from './dto/list-restaurants-query.dto';
import { computeOpenStatus } from './restaurant-hours.util';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_RADIUS_KM = 20;
/**
 * Plafond de candidats examinés par requête : « ouvert maintenant » et la
 * distance se calculent en mémoire. Au-delà, il faudra les pousser en SQL
 * (PostGIS) — jamais charger tout le catalogue.
 */
const CANDIDATE_CAP = 300;

export const CARD_INCLUDE = {
  categories: { select: { slug: true, name: true, icon: true }, orderBy: { position: 'asc' } },
  hours: true,
  // Seules les fermetures encore à venir ou en cours comptent.
  closures: true,
} satisfies Prisma.RestaurantInclude;

export type RestaurantWithCard = Prisma.RestaurantGetPayload<{ include: typeof CARD_INCLUDE }>;

export function toRestaurantCard(
  restaurant: RestaurantWithCard,
  origin: { latitude: number; longitude: number } | null,
  now: Date,
) {
  const openStatus = computeOpenStatus(
    {
      isPaused: restaurant.isPaused,
      hours: restaurant.hours,
      closures: restaurant.closures,
    },
    now,
  );
  const distanceKm =
    origin && restaurant.latitude !== null && restaurant.longitude !== null
      ? Math.round(
          haversineKm(origin, { latitude: restaurant.latitude, longitude: restaurant.longitude }) * 10,
        ) / 10
      : null;

  return {
    id: restaurant.id,
    slug: restaurant.slug,
    name: restaurant.name,
    description: restaurant.description,
    logoUrl: restaurant.logoUrl,
    coverUrl: restaurant.coverUrl,
    city: restaurant.city,
    quarter: restaurant.quarter,
    categories: restaurant.categories,
    rating: restaurant.rating,
    reviewCount: restaurant.reviewCount,
    deliveryFee: restaurant.deliveryFee,
    minOrderAmount: restaurant.minOrderAmount,
    prepTimeMin: restaurant.prepTimeMin,
    prepTimeMax: restaurant.prepTimeMax,
    distanceKm,
    isOpen: openStatus.isOpen,
    closedReason: openStatus.reason,
    closesAt: openStatus.closesAt,
  };
}

@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.restaurantCategory.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
      select: { id: true, slug: true, name: true, icon: true },
    });
  }

  async list(query: ListRestaurantsQueryDto) {
    const now = new Date();
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const origin =
      query.lat !== undefined && query.lng !== undefined
        ? { latitude: query.lat, longitude: query.lng }
        : null;

    const where: Prisma.RestaurantWhereInput = {
      // Jamais un restaurant non approuvé ou suspendu dans le catalogue.
      status: 'APPROVED',
      ...(query.q ? { name: { contains: query.q.trim(), mode: 'insensitive' } } : {}),
      ...(query.category ? { categories: { some: { slug: query.category } } } : {}),
    };
    if (origin) {
      const box = boundingBox(origin, query.radiusKm ?? DEFAULT_RADIUS_KM);
      where.latitude = { gte: box.minLat, lte: box.maxLat };
      where.longitude = { gte: box.minLng, lte: box.maxLng };
    }

    const candidates = await this.prisma.restaurant.findMany({
      where,
      include: { ...CARD_INCLUDE, closures: { where: { endsAt: { gt: now } } } },
      orderBy: [{ rating: 'desc' }, { name: 'asc' }],
      take: CANDIDATE_CAP,
    });

    let cards = candidates.map((restaurant) => toRestaurantCard(restaurant, origin, now));
    if (query.openNow) cards = cards.filter((card) => card.isOpen);

    const sort = query.sort ?? (origin ? 'nearest' : 'rating');
    cards.sort((a, b) => {
      // Les restaurants ouverts d'abord, quel que soit le tri demandé.
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      if (sort === 'nearest' && a.distanceKm !== null && b.distanceKm !== null) {
        return a.distanceKm - b.distanceKm;
      }
      if (sort === 'popular') return b.reviewCount - a.reviewCount || b.rating - a.rating;
      return b.rating - a.rating || a.name.localeCompare(b.name);
    });

    const total = cards.length;
    return {
      items: cards.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  /** Détail public : par identifiant ou slug. 404 si non approuvé. */
  async getOne(idOrSlug: string, origin?: { latitude: number; longitude: number }) {
    const now = new Date();
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { status: 'APPROVED', OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { ...CARD_INCLUDE, closures: { where: { endsAt: { gt: now } } } },
    });
    if (!restaurant) throw new NotFoundException('Restaurant introuvable.');

    return {
      ...toRestaurantCard(restaurant, origin ?? null, now),
      address: restaurant.address,
      phone: restaurant.phone,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      hours: restaurant.hours
        .map(({ dayOfWeek, opensAt, closesAt }) => ({ dayOfWeek, opensAt, closesAt }))
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt)),
      upcomingClosures: restaurant.closures.map(({ id, startsAt, endsAt, reason }) => ({
        id,
        startsAt,
        endsAt,
        reason,
      })),
    };
  }
}
