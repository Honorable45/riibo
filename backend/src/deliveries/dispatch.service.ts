import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventsGateway } from '../websocket/events.gateway';
import { DRIVER_LOCATION_STORE } from './deliveries.tokens';
import {
  MAX_SEARCH_ATTEMPTS,
  OFFER_BATCH_SIZE,
  OFFER_TTL_MS,
  ROUND_SPACING_MS,
  SEARCH_RADII_KM,
} from './delivery.constants';
import type { DriverLocationStore } from './driver-location.store';

/**
 * Appariement des courses aux livreurs, par tours : à chaque tour, les
 * OFFER_BATCH_SIZE livreurs disponibles les plus proches reçoivent une offre
 * de OFFER_TTL_MS ; si personne n'accepte, le rayon s'élargit au tour suivant ;
 * après MAX_SEARCH_ATTEMPTS tours, la course passe en NO_DRIVER_FOUND.
 *
 * Le rythme est donné par un balayeur planifié (et non par des minuteurs en
 * mémoire) : un redémarrage du serveur n'oublie aucune course, et un verrou
 * Redis évite que plusieurs instances traitent la même course.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsGateway,
    private readonly redis: RedisService,
    @Inject(DRIVER_LOCATION_STORE) private readonly locations: DriverLocationStore,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async scheduledTick(): Promise<void> {
    // Coupé pendant les tests e2e (déterministes) : ils appellent tick() eux-mêmes.
    if (process.env.DISPATCH_CRON_ENABLED === 'false') return;
    await this.tick();
  }

  async tick(): Promise<void> {
    if (!(await this.redis.acquireLock('lock:dispatch:tick', 9_000))) return;
    try {
      await this.expireOffers();
      const due = await this.prisma.delivery.findMany({
        where: {
          status: 'SEARCHING',
          driverId: null,
          OR: [{ searchAttempts: 0 }, { updatedAt: { lt: new Date(Date.now() - ROUND_SPACING_MS) } }],
        },
        select: { id: true },
        take: 50,
      });
      for (const delivery of due) await this.runRound(delivery.id);
    } catch (error) {
      this.logger.error(`Tour d'appariement en échec : ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await this.redis.releaseLock('lock:dispatch:tick');
    }
  }

  /** Les offres non répondues à temps expirent, et le livreur en est informé. */
  private async expireOffers(): Promise<void> {
    const expired = await this.prisma.deliveryOffer.findMany({
      where: { status: 'SENT', expiresAt: { lt: new Date() } },
      select: { id: true, deliveryId: true, driver: { select: { userId: true } } },
    });
    if (expired.length === 0) return;
    await this.prisma.deliveryOffer.updateMany({
      where: { id: { in: expired.map((offer) => offer.id) }, status: 'SENT' },
      data: { status: 'EXPIRED' },
    });
    for (const offer of expired) {
      this.events.emitToUser(offer.driver.userId, 'delivery:offer-expired', { deliveryId: offer.deliveryId });
    }
  }

  /** Lance un tour de recherche pour cette course (idempotent : sans effet si des offres sont en cours). */
  async runRound(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            restaurant: { select: { name: true, latitude: true, longitude: true, members: { select: { userId: true } } } },
          },
        },
        offers: { select: { driverId: true, status: true, expiresAt: true } },
      },
    });
    if (!delivery || delivery.status !== 'SEARCHING' || delivery.driverId) return;

    const now = Date.now();
    const hasLiveOffers = delivery.offers.some((offer) => offer.status === 'SENT' && offer.expiresAt.getTime() > now);
    if (hasLiveOffers) return;

    const { latitude, longitude } = delivery.order.restaurant;
    if (delivery.searchAttempts >= MAX_SEARCH_ATTEMPTS || latitude === null || longitude === null) {
      await this.giveUp(delivery.id, delivery.order);
      return;
    }

    const radiusKm = SEARCH_RADII_KM[delivery.searchAttempts];
    // Exclus : ceux qui ont refusé (ou se sont désistés) pour CETTE course.
    const declined = new Set(
      delivery.offers.filter((offer) => offer.status === 'REJECTED').map((offer) => offer.driverId),
    );
    const nearby = await this.locations.nearby(latitude, longitude, radiusKm, OFFER_BATCH_SIZE * 4);
    const eligible = nearby.length
      ? await this.prisma.driverProfile.findMany({
          where: {
            id: { in: nearby.map((driver) => driver.driverId) },
            status: 'APPROVED',
            isOnline: true,
            isAvailable: true,
            user: { isActive: true },
          },
          select: { id: true, userId: true },
        })
      : [];
    const eligibleById = new Map(eligible.map((driver) => [driver.id, driver]));
    const chosen = nearby
      .filter((driver) => eligibleById.has(driver.driverId) && !declined.has(driver.driverId))
      .slice(0, OFFER_BATCH_SIZE);

    // Le tour est consommé même sans candidat : le rayon s'élargira au suivant.
    await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: { searchAttempts: { increment: 1 }, searchRadiusKm: radiusKm },
    });
    if (chosen.length === 0) return;

    const expiresAt = new Date(now + OFFER_TTL_MS);
    for (const driver of chosen) {
      const profile = eligibleById.get(driver.driverId)!;
      await this.prisma.$transaction([
        this.prisma.deliveryOffer.create({
          data: { deliveryId: delivery.id, driverId: driver.driverId, distanceKm: driver.distanceKm, expiresAt },
        }),
        this.prisma.driverProfile.update({ where: { id: driver.driverId }, data: { totalOffers: { increment: 1 } } }),
      ]);
      const payload = {
        deliveryId: delivery.id,
        orderId: delivery.order.id,
        orderNumber: delivery.order.orderNumber,
        restaurantName: delivery.order.restaurant.name,
        distanceKm: Math.round(driver.distanceKm * 10) / 10,
        deliveryFee: delivery.deliveryFee,
        expiresAt: expiresAt.toISOString(),
      };
      this.events.emitToUser(profile.userId, 'delivery:offer', payload);
      await this.notifications.create(profile.userId, 'DELIVERY_OFFER', payload);
    }
  }

  /** Aucun livreur trouvé : le restaurant et le client sont prévenus, le restaurant peut relancer. */
  private async giveUp(
    deliveryId: string,
    order: { id: string; orderNumber: number; restaurant: { members: Array<{ userId: string }> } },
  ): Promise<void> {
    await this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'NO_DRIVER_FOUND' } });
    const restaurantUserIds = order.restaurant.members.map((member) => member.userId);
    this.events.emitToUsers(restaurantUserIds, 'delivery:no-driver', { orderId: order.id, orderNumber: order.orderNumber });
    await Promise.all(
      restaurantUserIds.map((userId) =>
        this.notifications.create(userId, 'SYSTEM', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          body: `Commande #${order.orderNumber} : aucun livreur disponible. Relancez la recherche.`,
        }),
      ),
    );
  }
}
