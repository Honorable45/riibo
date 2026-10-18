import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';

const PAGE = 20;

const PUBLIC_SELECT = {
  id: true,
  rating: true,
  comment: true,
  reply: true,
  repliedAt: true,
  createdAt: true,
  client: { select: { firstName: true } },
} satisfies Prisma.ReviewSelect;

type PublicRow = Prisma.ReviewGetPayload<{ select: typeof PUBLIC_SELECT }>;
const toPublic = ({ client, ...review }: PublicRow) => ({ ...review, author: client.firstName });

/**
 * Un avis par commande LIVRÉE, écrit par son client : impossible sans commande réelle.
 * Les notes du restaurant et des plats sont toujours recalculées depuis les avis visibles.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, orderId: string, dto: CreateReviewDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, clientId: userId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        restaurantId: true,
        items: { select: { menuItemId: true } },
        review: { select: { id: true } },
        restaurant: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (order.status !== 'DELIVERED')
      throw new ConflictException('Vous pourrez donner votre avis une fois la commande livrée.');
    if (order.review)
      throw new ConflictException('Vous avez déjà donné votre avis sur cette commande.');

    const menuItemIds = [
      ...new Set(order.items.map((i) => i.menuItemId).filter((id): id is string => !!id)),
    ];
    let review;
    try {
      review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: {
            orderId,
            clientId: userId,
            restaurantId: order.restaurantId,
            rating: dto.rating,
            comment: dto.comment || null,
          },
          select: PUBLIC_SELECT,
        });
        await this.recompute(tx, order.restaurantId, menuItemIds);
        return created;
      });
    } catch (error) {
      // Deux envois simultanés : l'unicité de orderId tranche.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Vous avez déjà donné votre avis sur cette commande.');
      }
      throw error;
    }

    await Promise.all(
      order.restaurant.members.map((m) =>
        this.notifications.create(m.userId, 'REVIEW_RECEIVED', {
          orderId,
          orderNumber: order.orderNumber,
          body: `Nouvel avis ${dto.rating}/5 sur la commande #${order.orderNumber}.`,
        }),
      ),
    );
    return toPublic(review);
  }

  async listForRestaurant(restaurantId: string, cursor?: string, limit = PAGE) {
    const rows = await this.prisma.review.findMany({
      where: { restaurantId, isHidden: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { ...PUBLIC_SELECT, order: { select: { orderNumber: true } } },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(({ order, ...row }) => ({
        ...toPublic(row),
        orderNumber: order.orderNumber,
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async listPublic(idOrSlug: string, cursor?: string, limit = PAGE) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { status: 'APPROVED', OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true, rating: true, reviewCount: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant introuvable.');
    const { items, nextCursor } = await this.listForRestaurant(restaurant.id, cursor, limit);
    return {
      summary: { rating: restaurant.rating, reviewCount: restaurant.reviewCount },
      items: items.map(({ orderNumber: _orderNumber, ...review }) => review),
      nextCursor,
    };
  }

  async reply(restaurantId: string, reviewId: string, reply: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, restaurantId },
      select: { id: true },
    });
    if (!review) throw new NotFoundException('Avis introuvable.');
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { reply, repliedAt: new Date() },
      select: PUBLIC_SELECT,
    });
    return toPublic(updated);
  }

  /** Modération : masque (ou rétablit) un avis puis recalcule les notes. */
  async setHidden(reviewId: string, hidden: boolean) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        restaurantId: true,
        order: { select: { items: { select: { menuItemId: true } } } },
      },
    });
    if (!review) throw new NotFoundException('Avis introuvable.');
    const menuItemIds = [
      ...new Set(review.order.items.map((i) => i.menuItemId).filter((id): id is string => !!id)),
    ];
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id: reviewId }, data: { isHidden: hidden } });
      await this.recompute(tx, review.restaurantId, menuItemIds);
    });
    return { id: reviewId, isHidden: hidden };
  }

  private async recompute(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    menuItemIds: string[],
  ) {
    const restaurant = await tx.review.aggregate({
      where: { restaurantId, isHidden: false },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: { rating: round1(restaurant._avg.rating), reviewCount: restaurant._count._all },
    });
    for (const menuItemId of menuItemIds) {
      const item = await tx.review.aggregate({
        where: { isHidden: false, order: { items: { some: { menuItemId } } } },
        _avg: { rating: true },
        _count: { _all: true },
      });
      await tx.menuItem.update({
        where: { id: menuItemId },
        data: { rating: round1(item._avg.rating), reviewCount: item._count._all },
      });
    }
  }
}

const round1 = (value: number | null) => Math.round((value ?? 0) * 10) / 10;
