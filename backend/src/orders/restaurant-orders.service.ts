import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStateMachineService } from './order-state-machine.service';
import { OrderAction } from './order-transitions';

const ACTIVE: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'ON_THE_WAY'];
const DEFAULT_PAGE_SIZE = 30;

/** Début de la journée dans le fuseau du restaurant (Africa/Lome = UTC+0, sans changement d'heure). */
function startOfTodayLome(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class RestaurantOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly machine: OrderStateMachineService,
  ) {}

  async list(
    restaurantId: string,
    query: { status?: OrderStatus; scope?: 'active' | 'past'; cursor?: string; limit?: number },
  ) {
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, 100);
    const where: Prisma.OrderWhereInput = {
      restaurantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.scope === 'active' ? { status: { in: ACTIVE } } : {}),
      ...(query.scope === 'past' ? { status: { notIn: ACTIVE } } : {}),
    };
    const rows = await this.prisma.order.findMany({
      where,
      // Les plus anciennes d'abord pour les commandes en cours (file d'attente),
      // les plus récentes d'abord pour l'historique.
      orderBy:
        query.scope === 'active'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true, orderNumber: true, status: true, deliveryType: true, total: true, subtotal: true,
        paymentMethod: true, paymentStatus: true, notes: true, createdAt: true, acceptedAt: true, readyAt: true,
        client: { select: { firstName: true } },
        contactPhone: true,
        items: { orderBy: { id: 'asc' }, select: { name: true, quantity: true, options: true, note: true, lineTotal: true } },
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(({ client, contactPhone, ...order }) => ({
        ...order,
        client: { firstName: client.firstName, phone: contactPhone },
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async assertBelongsToRestaurant(orderId: string, restaurantId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, restaurantId }, select: { id: true } });
    if (!order) throw new NotFoundException('Commande introuvable.');
  }

  /** Chaque action est vérifiée par la machine : appartenance au restaurant, état de départ, atomicité. */
  act(restaurantUserId: string, orderId: string, action: OrderAction, reason?: string, ipAddress?: string) {
    return this.machine.apply(orderId, action, { kind: 'RESTAURANT', userId: restaurantUserId }, { reason, ipAddress });
  }

  /** Chiffres du jour (fuseau du restaurant). Le chiffre d'affaires ne compte que les commandes livrées, hors frais de livraison. */
  async dashboard(restaurantId: string) {
    const since = startOfTodayLome();
    const [byStatus, revenue] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { restaurantId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { restaurantId, status: 'DELIVERED', createdAt: { gte: since } },
        _sum: { subtotal: true, discountAmount: true },
      }),
    ]);
    const count = (...statuses: OrderStatus[]) =>
      byStatus.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);

    return {
      date: since.toISOString().slice(0, 10),
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      pending: count('PENDING'),
      preparing: count('ACCEPTED', 'PREPARING'),
      ready: count('READY'),
      inDelivery: count('ASSIGNED', 'PICKED_UP', 'ON_THE_WAY'),
      completed: count('DELIVERED'),
      cancelled: count('CANCELLED', 'REJECTED'),
      revenue: (revenue._sum.subtotal ?? 0) - (revenue._sum.discountAmount ?? 0),
    };
  }
}
