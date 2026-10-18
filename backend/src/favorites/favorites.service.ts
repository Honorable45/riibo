import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CARD_INCLUDE, toRestaurantCard } from '../restaurants/restaurants.service';

/** Restaurants (jamais des plats) mis de côté par le client — liste courte, sans pagination. */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const now = new Date();
    const favorites = await this.prisma.favorite.findMany({
      where: { userId, restaurant: { status: 'APPROVED' } },
      orderBy: { createdAt: 'desc' },
      include: { restaurant: { include: { ...CARD_INCLUDE, closures: { where: { endsAt: { gt: now } } } } } },
    });
    return favorites.map((favorite) => toRestaurantCard(favorite.restaurant, null, now));
  }

  /** Juste les ids : de quoi cocher les cœurs sur les listes déjà chargées, sans re-fetch. */
  async ids(userId: string) {
    const favorites = await this.prisma.favorite.findMany({ where: { userId }, select: { restaurantId: true } });
    return favorites.map((favorite) => favorite.restaurantId);
  }

  async add(userId: string, restaurantId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, status: 'APPROVED' },
      select: { id: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant introuvable.');
    await this.prisma.favorite.upsert({
      where: { userId_restaurantId: { userId, restaurantId } },
      create: { userId, restaurantId },
      update: {},
    });
  }

  async remove(userId: string, restaurantId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, restaurantId } });
  }
}
