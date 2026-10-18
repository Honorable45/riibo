import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { DRIVER_LOCATION_STORE } from '../deliveries/deliveries.tokens';
import type { DriverLocationStore } from '../deliveries/driver-location.store';
import { LOCATION_TTL_MS } from '../deliveries/delivery.constants';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryProvider } from '../uploads/cloudinary.provider';
import { ListAuditLogsQueryDto, ListPaymentsQueryDto } from './dto/admin-ops.dto';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PERIOD_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const IN_PROGRESS: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'ASSIGNED',
  'PICKED_UP',
  'ON_THE_WAY',
];

/**
 * Indicateurs du backoffice, tous calculés côté serveur à partir des modèles
 * existants. Définitions (aucune commission ni rémunération n'existe en base) :
 *  - « valeur des commandes » : somme de `Order.total` (repas − remise + frais) ;
 *  - « repas » : `subtotal` ; « remises » : `discountAmount` ;
 *  - « frais de livraison » : `deliveryFee` payé par le client ;
 *  - « encaissé » : paiements `PAID` (aujourd'hui : espèces confirmées à la remise).
 */
@Injectable()
export class AdminInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryProvider,
    @Inject(DRIVER_LOCATION_STORE) private readonly locations: DriverLocationStore,
  ) {}

  async finance(fromIso: string, toIso: string) {
    const { from, to } = period(fromIso, toIso);
    const created = { createdAt: { gte: from, lt: to } };
    const [byStatus, delivered, payments, daily, topRestaurants, promoUses] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: created, _count: { _all: true } }),
      this.prisma.order.aggregate({
        where: { ...created, status: 'DELIVERED' },
        _count: { _all: true },
        _sum: { subtotal: true, discountAmount: true, deliveryFee: true, total: true },
      }),
      this.prisma.payment.groupBy({
        by: ['status', 'method', 'provider'],
        where: created,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.$queryRaw<
        Array<{ day: Date; orders: bigint; delivered: bigint; value: bigint | null }>
      >`
        SELECT date_trunc('day', "createdAt") AS day,
               count(*) AS orders,
               count(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
               sum(total) FILTER (WHERE status = 'DELIVERED') AS value
        FROM orders
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.order.groupBy({
        by: ['restaurantId'],
        where: { ...created, status: 'DELIVERED' },
        _count: { _all: true },
        _sum: { subtotal: true, discountAmount: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 5,
      }),
      this.prisma.promoRedemption.count({ where: created }),
    ]);
    // Paiements restés « en attente » sur des commandes annulées ou refusées :
    // l'argent ne sera jamais encaissé (rien ne clôt ces paiements aujourd'hui).
    const stale = await this.prisma.payment.aggregate({
      where: {
        ...created,
        status: 'PENDING',
        order: { status: { in: ['CANCELLED', 'REJECTED'] } },
      },
      _count: { _all: true },
      _sum: { amount: true },
    });

    const count = (statuses: OrderStatus[]) =>
      byStatus.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r._count._all, 0);
    const names = new Map(
      (
        await this.prisma.restaurant.findMany({
          where: { id: { in: topRestaurants.map((r) => r.restaurantId) } },
          select: { id: true, name: true },
        })
      ).map((r) => [r.id, r.name]),
    );
    const sumPayments = (status: string) =>
      payments.filter((p) => p.status === status).reduce((s, p) => s + (p._sum.amount ?? 0), 0);

    const byDay = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), d]));
    const series: Array<{ date: string; orders: number; delivered: number; value: number }> = [];
    for (let t = startOfDay(from).getTime(); t < to.getTime(); t += DAY_MS) {
      const key = new Date(t).toISOString().slice(0, 10);
      const row = byDay.get(key);
      series.push({
        date: key,
        orders: Number(row?.orders ?? 0),
        delivered: Number(row?.delivered ?? 0),
        value: Number(row?.value ?? 0),
      });
    }

    const meals = delivered._sum.subtotal ?? 0;
    const discounts = delivered._sum.discountAmount ?? 0;
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      orders: {
        total: byStatus.reduce((s, r) => s + r._count._all, 0),
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
        inProgress: count(IN_PROGRESS),
        delivered: count(['DELIVERED']),
        cancelled: count(['CANCELLED']),
        rejected: count(['REJECTED']),
      },
      delivered: {
        count: delivered._count._all,
        orderValue: delivered._sum.total ?? 0,
        meals,
        discounts,
        mealsAfterDiscount: meals - discounts,
        deliveryFees: delivered._sum.deliveryFee ?? 0,
        averageOrder: delivered._count._all
          ? Math.round((delivered._sum.total ?? 0) / delivered._count._all)
          : 0,
      },
      payments: {
        paid: sumPayments('PAID'),
        // En attente sur des commandes encore valables (en cours ou terminées).
        pending: sumPayments('PENDING') - (stale._sum.amount ?? 0),
        pendingOnCancelled: { count: stale._count._all, amount: stale._sum.amount ?? 0 },
        failed: sumPayments('FAILED'),
        refunded: sumPayments('REFUNDED'),
        cancelled: sumPayments('CANCELLED'),
        breakdown: payments.map((p) => ({
          status: p.status,
          method: p.method,
          provider: p.provider,
          count: p._count._all,
          amount: p._sum.amount ?? 0,
        })),
      },
      promoRedemptions: promoUses,
      // Aucun modèle de commission / reversement en base : jamais inventé.
      commission: { configured: false },
      series,
      topRestaurants: topRestaurants.map((r) => ({
        id: r.restaurantId,
        name: names.get(r.restaurantId) ?? '—',
        orders: r._count._all,
        meals: (r._sum.subtotal ?? 0) - (r._sum.discountAmount ?? 0),
      })),
    };
  }

  async payments(query: ListPaymentsQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        provider: true,
        method: true,
        amount: true,
        currency: true,
        status: true,
        providerRef: true,
        paidAt: true,
        failedAt: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            restaurant: { select: { id: true, name: true } },
            client: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async restaurantInsights(restaurantId: string) {
    const exists = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Restaurant introuvable.');
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [byStatus, delivered30, items, recent] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { restaurantId },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { restaurantId, status: 'DELIVERED', createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { subtotal: true, discountAmount: true },
      }),
      this.prisma.menuItem.groupBy({
        by: ['isAvailable'],
        where: { restaurantId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
          deliveryType: true,
        },
      }),
    ]);
    const total = byStatus.reduce((s, r) => s + r._count._all, 0);
    const of = (s: OrderStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const finished = of('DELIVERED') + of('REJECTED') + of('CANCELLED');
    return {
      orders: {
        total,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      },
      // Part des commandes terminées qui ont été refusées par le restaurant.
      rejectionRate: finished ? of('REJECTED') / finished : null,
      last30Days: {
        delivered: delivered30._count._all,
        meals: (delivered30._sum.subtotal ?? 0) - (delivered30._sum.discountAmount ?? 0),
      },
      menu: {
        available: items.find((i) => i.isAvailable)?._count._all ?? 0,
        unavailable: items.find((i) => !i.isAvailable)?._count._all ?? 0,
      },
      recentOrders: recent,
    };
  }

  async driverInsights(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      select: { id: true, isOnline: true, totalOffers: true, acceptedOffers: true },
    });
    if (!driver) throw new NotFoundException('Livreur introuvable.');
    const [byStatus, current, recent, position] = await Promise.all([
      this.prisma.delivery.groupBy({ by: ['status'], where: { driverId }, _count: { _all: true } }),
      this.prisma.delivery.findFirst({
        where: {
          driverId,
          status: { in: ['ASSIGNED', 'AT_RESTAURANT', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED'] },
        },
        select: {
          id: true,
          status: true,
          assignedAt: true,
          order: {
            select: { id: true, orderNumber: true, restaurant: { select: { name: true } } },
          },
        },
      }),
      this.prisma.delivery.findMany({
        where: { driverId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          status: true,
          deliveryFee: true,
          deliveredAt: true,
          createdAt: true,
          order: {
            select: { id: true, orderNumber: true, restaurant: { select: { name: true } } },
          },
        },
      }),
      // Position : uniquement si le livreur est en ligne ET la mesure récente
      // (le stockage expire après LOCATION_TTL_MS) — jamais une vieille position.
      driver.isOnline ? this.locations.get(driverId) : Promise.resolve(null),
    ]);
    const fresh = position && Date.now() - position.at <= LOCATION_TTL_MS ? position : null;
    return {
      deliveries: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      acceptanceRate: driver.totalOffers ? driver.acceptedOffers / driver.totalOffers : null,
      current,
      recent,
      position: fresh
        ? {
            latitude: fresh.latitude,
            longitude: fresh.longitude,
            at: new Date(fresh.at).toISOString(),
          }
        : null,
      positionTtlSeconds: LOCATION_TTL_MS / 1000,
    };
  }

  async user(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastSeenAt: true,
        driverProfile: { select: { id: true, status: true } },
        restaurantMemberships: {
          select: { role: true, restaurant: { select: { id: true, name: true, status: true } } },
        },
        _count: { select: { addresses: true, favorites: true } },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    const [orders, byStatus, spent, reports] = await Promise.all([
      this.prisma.order.findMany({
        where: { clientId: userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
          restaurant: { select: { id: true, name: true } },
        },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { clientId: userId },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { clientId: userId, status: 'DELIVERED' },
        _sum: { total: true },
      }),
      this.prisma.report.count({ where: { targetType: 'USER', targetId: userId } }),
    ]);
    const { _count, ...rest } = user;
    return {
      ...rest,
      addresses: _count.addresses,
      favorites: _count.favorites,
      orders: {
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
        deliveredValue: spent._sum.total ?? 0,
        recent: orders,
      },
      reportsAgainst: reports,
    };
  }

  async auditLogs(query: ListAuditLogsQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: { startsWith: query.action.toUpperCase() } } : {}),
      ...(query.targetType ? { targetType: query.targetType.toUpperCase() } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        actor: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  /** Configuration NON secrète : uniquement des indicateurs « configuré / non configuré ». */
  config() {
    const env = process.env;
    const has = (...keys: string[]) => keys.every((k) => Boolean(env[k]?.trim()));
    return {
      environment: env.NODE_ENV ?? 'development',
      payments: {
        provider: env.PAYMENT_PROVIDER ?? 'cash',
        methods: { CASH_ON_DELIVERY: true, TMONEY: false, FLOOZ: false },
      },
      sms: {
        provider: env.SMS_PROVIDER ?? 'none',
        configured: (env.SMS_PROVIDER ?? 'none') !== 'none',
      },
      registrationOtp: env.REGISTRATION_OTP_ENABLED === 'true',
      mail: { provider: env.MAIL_PROVIDER ?? 'none' },
      media: {
        cloudinary: this.cloudinary.isConfigured(),
        storage: this.cloudinary.isConfigured() ? 'cloudinary' : 'local',
      },
      push: {
        webPush: has('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'),
        fcm: has('FIREBASE_SERVICE_ACCOUNT'),
      },
      realtime: { redis: has('REDIS_URL') },
      calls: { turn: has('TURN_URLS') },
      commission: { configured: false },
    };
  }
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function period(fromIso: string, toIso: string) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (!(from < to)) throw new BadRequestException('La fin de période doit suivre le début.');
  if (to.getTime() - from.getTime() > MAX_PERIOD_DAYS * DAY_MS) {
    throw new BadRequestException(`Période limitée à ${MAX_PERIOD_DAYS} jours.`);
  }
  return { from, to };
}
