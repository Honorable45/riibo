import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { haversineKm } from '../common/geo.util';
import { ConversationsService } from '../conversations/conversations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderStateMachineService, TransitionEvent } from '../orders/order-state-machine.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventsGateway } from '../websocket/events.gateway';
import { AttemptLimiter } from './attempt-limiter';
import { DRIVER_LOCATION_STORE } from './deliveries.tokens';
import {
  ACTIVE_DELIVERY_STATUSES,
  AVERAGE_SPEED_KMH,
  CODE_LENGTH,
  CODE_LOCK_SECONDS,
  CODE_MAX_FAILURES,
  SEARCH_RADII_KM,
} from './delivery.constants';
import { DispatchService } from './dispatch.service';
import type { DriverLocationStore } from './driver-location.store';
import { DriversService } from './drivers.service';

const DRIVER_VIEW_INCLUDE = {
  order: {
    select: {
      id: true, orderNumber: true, status: true, total: true, paymentMethod: true, notes: true,
      deliveryAddress: true, deliveryLandmark: true, latitude: true, longitude: true, contactPhone: true,
      client: { select: { firstName: true } },
      restaurant: { select: { id: true, name: true, address: true, quarter: true, phone: true, latitude: true, longitude: true } },
      _count: { select: { items: true } },
    },
  },
} satisfies Prisma.DeliveryInclude;

type DriverDelivery = Prisma.DeliveryGetPayload<{ include: typeof DRIVER_VIEW_INCLUDE }>;

function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

function codesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class DeliveriesService implements OnModuleInit {
  private readonly logger = new Logger(DeliveriesService.name);
  private readonly codeLimiter: AttemptLimiter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly machine: OrderStateMachineService,
    private readonly conversations: ConversationsService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsGateway,
    private readonly dispatch: DispatchService,
    private readonly drivers: DriversService,
    redis: RedisService,
    @Inject(DRIVER_LOCATION_STORE) private readonly locations: DriverLocationStore,
  ) {
    this.codeLimiter = new AttemptLimiter(redis.client, CODE_MAX_FAILURES, CODE_LOCK_SECONDS);
  }

  onModuleInit(): void {
    this.machine.onTransition((event) => this.onOrderTransition(event));
  }

  // ---------------------------------------------------------------------------
  // Réaction aux transitions de la commande
  // ---------------------------------------------------------------------------

  private async onOrderTransition(event: TransitionEvent): Promise<void> {
    if (event.deliveryType !== 'DELIVERY') return;
    // Les transitions déclenchées par le système (ASSIGN/UNASSIGN) viennent d'ici : pas de boucle.
    if (event.actor.kind === 'SYSTEM') return;

    if (event.to === 'PREPARING') return void (await this.createForOrder(event.orderId));
    if (event.to === 'READY') return void (await this.onOrderReady(event.orderId));
    if (event.to === 'CANCELLED' || event.to === 'REJECTED') return void (await this.cancelForOrder(event.orderId));
  }

  /**
   * La recherche démarre dès la PRÉPARATION (et non à « prête ») : le livreur
   * arrive ainsi au moment où le plat sort, sans attente supplémentaire.
   */
  async createForOrder(orderId: string): Promise<void> {
    const existing = await this.prisma.delivery.findUnique({ where: { orderId }, select: { id: true } });
    if (existing) return;

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        deliveryFee: true, latitude: true, longitude: true,
        restaurant: { select: { latitude: true, longitude: true } },
      },
    });
    const { latitude: rLat, longitude: rLng } = order.restaurant;
    const distanceKm =
      rLat !== null && rLng !== null && order.latitude !== null && order.longitude !== null
        ? Math.round(haversineKm({ latitude: rLat, longitude: rLng }, { latitude: order.latitude, longitude: order.longitude }) * 10) / 10
        : null;

    const delivery = await this.prisma.delivery.create({
      data: {
        orderId,
        deliveryFee: order.deliveryFee,
        distanceKm,
        pickupCode: generateCode(),
        deliveryCode: generateCode(),
        searchRadiusKm: SEARCH_RADII_KM[0],
      },
    });
    await this.dispatch.runRound(delivery.id);
  }

  private async onOrderReady(orderId: string): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({ where: { orderId } });
    if (!delivery) return void (await this.createForOrder(orderId));

    if ((delivery.status === 'ASSIGNED' || delivery.status === 'AT_RESTAURANT') && delivery.driverId) {
      // Le livreur avait accepté pendant la préparation : la commande est maintenant « assignée ».
      await this.machine.apply(orderId, 'ASSIGN', { kind: 'SYSTEM' });
    } else if (delivery.status === 'SEARCHING' || delivery.status === 'NO_DRIVER_FOUND') {
      // Le plat est prêt : on relance la recherche avec un rayon de départ neuf.
      await this.prisma.delivery.update({
        where: { id: delivery.id },
        data: { status: 'SEARCHING', searchAttempts: 0, searchRadiusKm: SEARCH_RADII_KM[0] },
      });
      await this.dispatch.runRound(delivery.id);
    }
  }

  private async cancelForOrder(orderId: string): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: { offers: { where: { status: 'SENT' }, select: { id: true, driver: { select: { userId: true } } } } },
    });
    if (!delivery || ['DELIVERED', 'CANCELLED'].includes(delivery.status)) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({ where: { id: delivery.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await tx.deliveryOffer.updateMany({ where: { deliveryId: delivery.id, status: 'SENT' }, data: { status: 'EXPIRED' } });
      if (delivery.driverId) {
        await tx.driverProfile.updateMany({ where: { id: delivery.driverId, isOnline: true }, data: { isAvailable: true } });
      }
    });
    for (const offer of delivery.offers) {
      this.events.emitToUser(offer.driver.userId, 'delivery:offer-expired', { deliveryId: delivery.id });
    }
  }

  // ---------------------------------------------------------------------------
  // Offres
  // ---------------------------------------------------------------------------

  /** Offres en attente de réponse. Avant acceptation le livreur ne voit PAS l'adresse exacte du client. */
  async listOffers(userId: string) {
    const profile = await this.drivers.requireApproved(userId);
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { driverId: profile.id, status: 'SENT', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: {
        delivery: {
          select: {
            id: true, deliveryFee: true, distanceKm: true,
            order: { select: { orderNumber: true, restaurant: { select: { name: true, quarter: true } } } },
          },
        },
      },
    });
    return offers.map((offer) => ({
      deliveryId: offer.delivery.id,
      orderNumber: offer.delivery.order.orderNumber,
      restaurant: offer.delivery.order.restaurant,
      distanceToRestaurantKm: offer.distanceKm === null ? null : Math.round(offer.distanceKm * 10) / 10,
      tripDistanceKm: offer.delivery.distanceKm,
      deliveryFee: offer.delivery.deliveryFee,
      expiresAt: offer.expiresAt,
    }));
  }

  async acceptOffer(userId: string, deliveryId: string) {
    const profile = await this.drivers.requireApproved(userId);
    if (!profile.isOnline) throw new ConflictException('Passez en ligne pour accepter une course.');

    const offer = await this.prisma.deliveryOffer.findFirst({
      where: { deliveryId, driverId: profile.id, status: 'SENT', expiresAt: { gt: new Date() } },
    });
    if (!offer) throw new ConflictException("Cette offre n'est plus disponible.");

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Un livreur = une seule course à la fois (condition atomique).
      const claimedDriver = await tx.driverProfile.updateMany({
        where: { id: profile.id, isAvailable: true },
        data: { isAvailable: false, acceptedOffers: { increment: 1 } },
      });
      if (claimedDriver.count === 0) throw new ConflictException('Vous avez déjà une course en cours.');

      // Premier arrivé, premier servi : une seule offre peut réussir.
      const claimed = await tx.delivery.updateMany({
        where: { id: deliveryId, status: 'SEARCHING', driverId: null },
        data: { driverId: profile.id, status: 'ASSIGNED', assignedAt: now },
      });
      if (claimed.count === 0) throw new ConflictException('Cette course vient d\'être prise par un autre livreur.');

      await tx.deliveryOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED', respondedAt: now } });
      await tx.deliveryOffer.updateMany({
        where: { deliveryId, id: { not: offer.id }, status: 'SENT' },
        data: { status: 'EXPIRED' },
      });
    });

    const delivery = await this.prisma.delivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: { order: { select: { id: true, orderNumber: true, status: true, clientId: true, restaurant: { select: { members: { select: { userId: true } } } } } } },
    });
    const { order } = delivery;

    await this.conversations.ensureDeliveryConversations(order.id, userId);
    // Les autres livreurs sollicités n'ont plus rien à répondre.
    const others = await this.prisma.deliveryOffer.findMany({
      where: { deliveryId, id: { not: offer.id } },
      select: { driver: { select: { userId: true } } },
    });
    this.events.emitToUsers(others.map((o) => o.driver.userId), 'delivery:offer-expired', { deliveryId });

    if (order.status === 'READY') {
      await this.machine.apply(order.id, 'ASSIGN', { kind: 'SYSTEM' });
    } else {
      // Commande encore en préparation : le restaurant est prévenu, le statut de commande attendra « prête ».
      const restaurantUserIds = order.restaurant.members.map((member) => member.userId);
      this.events.emitToUsers([order.clientId, ...restaurantUserIds], 'delivery:assigned', { orderId: order.id, deliveryId });
      await Promise.all(
        restaurantUserIds.map((id) =>
          this.notifications.create(id, 'ORDER_ASSIGNED', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            body: 'Un livreur a accepté la course.',
          }),
        ),
      );
    }
    return this.getDriverDelivery(userId, deliveryId);
  }

  async rejectOffer(userId: string, deliveryId: string): Promise<void> {
    const profile = await this.drivers.requireApproved(userId);
    const updated = await this.prisma.deliveryOffer.updateMany({
      where: { deliveryId, driverId: profile.id, status: 'SENT' },
      data: { status: 'REJECTED', respondedAt: new Date() },
    });
    if (updated.count === 0) throw new NotFoundException('Offre introuvable.');
  }

  // ---------------------------------------------------------------------------
  // Actions du livreur sur SA course
  // ---------------------------------------------------------------------------

  /** « Je suis au restaurant » : simple information, sans changer le statut de la commande. */
  async markAtRestaurant(userId: string, deliveryId: string) {
    const delivery = await this.requireOwnDelivery(userId, deliveryId);
    if (delivery.status !== 'ASSIGNED') throw new ConflictException('Action impossible à cette étape.');
    await this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'AT_RESTAURANT', atRestaurantAt: new Date() } });

    const members = await this.prisma.restaurantMember.findMany({ where: { restaurantId: delivery.order.restaurant.id }, select: { userId: true } });
    const restaurantUserIds = members.map((member) => member.userId);
    this.events.emitToUsers(restaurantUserIds, 'delivery:at-restaurant', { orderId: delivery.order.id, deliveryId });
    await Promise.all(
      restaurantUserIds.map((id) =>
        this.notifications.create(id, 'SYSTEM', {
          orderId: delivery.order.id,
          orderNumber: delivery.order.orderNumber,
          body: `Le livreur est arrivé pour la commande #${delivery.order.orderNumber}.`,
        }),
      ),
    );
    return this.getDriverDelivery(userId, deliveryId);
  }

  /** « J'ai récupéré la commande » : exige le code de retrait donné par le restaurant. */
  async pickUp(userId: string, deliveryId: string, code: string) {
    const delivery = await this.requireOwnDelivery(userId, deliveryId);
    if (delivery.status !== 'ASSIGNED' && delivery.status !== 'AT_RESTAURANT') {
      throw new ConflictException('Action impossible à cette étape.');
    }
    if (delivery.order.status !== 'ASSIGNED') {
      throw new ConflictException("La commande n'est pas encore prête.");
    }
    await this.verifyCode(`pickup:${deliveryId}`, delivery.pickupCode, code);

    const actor = { kind: 'DRIVER' as const, userId };
    await this.machine.apply(delivery.order.id, 'PICK_UP', actor);
    await this.machine.apply(delivery.order.id, 'ON_THE_WAY', actor);
    await this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'ON_THE_WAY', pickedUpAt: new Date() } });
    return this.getDriverDelivery(userId, deliveryId);
  }

  /** « Je suis arrivé » : prévient le client. */
  async markArrived(userId: string, deliveryId: string) {
    const delivery = await this.requireOwnDelivery(userId, deliveryId);
    if (delivery.status !== 'ON_THE_WAY') throw new ConflictException('Action impossible à cette étape.');
    await this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'ARRIVED', arrivedAt: new Date() } });

    const clientId = (await this.prisma.order.findUniqueOrThrow({ where: { id: delivery.order.id }, select: { clientId: true } })).clientId;
    this.events.emitToUser(clientId, 'delivery:arrived', { orderId: delivery.order.id, deliveryId });
    await this.notifications.create(clientId, 'ORDER_ON_THE_WAY', {
      orderId: delivery.order.id,
      orderNumber: delivery.order.orderNumber,
      body: 'Votre livreur est arrivé.',
    });
    return this.getDriverDelivery(userId, deliveryId);
  }

  /** « Commande livrée » : exige le code que le client lit sur son écran. */
  async deliver(userId: string, deliveryId: string, code: string) {
    const delivery = await this.requireOwnDelivery(userId, deliveryId);
    if (delivery.status !== 'ON_THE_WAY' && delivery.status !== 'ARRIVED') {
      throw new ConflictException('Action impossible à cette étape.');
    }
    await this.verifyCode(`deliver:${deliveryId}`, delivery.deliveryCode, code);

    await this.machine.apply(delivery.order.id, 'DELIVER', { kind: 'DRIVER', userId });
    await this.prisma.$transaction([
      this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'DELIVERED', deliveredAt: new Date() } }),
      this.prisma.driverProfile.updateMany({ where: { id: delivery.driverId!, isOnline: true }, data: { isAvailable: true, totalDeliveries: { increment: 1 } } }),
      this.prisma.driverProfile.updateMany({ where: { id: delivery.driverId!, isOnline: false }, data: { totalDeliveries: { increment: 1 } } }),
    ]);
    await this.codeLimiter.reset(`deliver:${deliveryId}`);
    return this.getDriverDelivery(userId, deliveryId);
  }

  /** Le livreur se désiste AVANT d'avoir récupéré la commande : la recherche repart sans lui. */
  async release(userId: string, deliveryId: string, reason?: string) {
    const delivery = await this.requireOwnDelivery(userId, deliveryId);
    if (delivery.status !== 'ASSIGNED' && delivery.status !== 'AT_RESTAURANT') {
      throw new ConflictException('Impossible de se désister après avoir récupéré la commande.');
    }
    const driverId = delivery.driverId!;

    await this.prisma.$transaction([
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: { driverId: null, status: 'SEARCHING', searchAttempts: 0, searchRadiusKm: SEARCH_RADII_KM[0], assignedAt: null, atRestaurantAt: null },
      }),
      // Il ne recevra plus d'offre pour CETTE course.
      this.prisma.deliveryOffer.updateMany({ where: { deliveryId, driverId, status: 'ACCEPTED' }, data: { status: 'REJECTED' } }),
      this.prisma.driverProfile.updateMany({ where: { id: driverId, isOnline: true }, data: { isAvailable: true } }),
    ]);
    if (delivery.order.status === 'ASSIGNED') {
      await this.machine.apply(delivery.order.id, 'UNASSIGN', { kind: 'SYSTEM' });
    }
    await this.conversations.removeDriverFromOrder(delivery.order.id, userId);

    const members = await this.prisma.restaurantMember.findMany({ where: { restaurantId: delivery.order.restaurant.id }, select: { userId: true } });
    await Promise.all(
      members.map((member) =>
        this.notifications.create(member.userId, 'SYSTEM', {
          orderId: delivery.order.id,
          orderNumber: delivery.order.orderNumber,
          body: `Le livreur s'est désisté${reason ? ` (${reason})` : ''}. Nouvelle recherche en cours.`,
        }),
      ),
    );
    this.logger.log(`Livreur ${userId} se désiste de la course ${deliveryId}${reason ? ` : ${reason}` : ''}`);
    await this.dispatch.runRound(deliveryId);
    return { released: true };
  }

  private async verifyCode(limiterKey: string, expected: string, provided: string): Promise<void> {
    if (await this.codeLimiter.isLocked(limiterKey)) {
      throw new HttpException('Trop d\'essais. Réessayez plus tard.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!codesMatch(expected, provided)) {
      await this.codeLimiter.recordFailure(limiterKey);
      throw new BadRequestException('Code incorrect.');
    }
    await this.codeLimiter.reset(limiterKey);
  }

  // ---------------------------------------------------------------------------
  // Lecture côté livreur
  // ---------------------------------------------------------------------------

  async getCurrent(userId: string) {
    const profile = await this.drivers.requireApproved(userId);
    const delivery = await this.prisma.delivery.findFirst({
      where: { driverId: profile.id, status: { in: ACTIVE_DELIVERY_STATUSES } },
      include: DRIVER_VIEW_INCLUDE,
    });
    return delivery ? this.toDriverView(delivery) : null;
  }

  async getDriverDelivery(userId: string, deliveryId: string) {
    return this.toDriverView(await this.requireOwnDelivery(userId, deliveryId));
  }

  async history(userId: string, cursor?: string, limit = 20) {
    const profile = await this.drivers.requireApproved(userId);
    const rows = await this.prisma.delivery.findMany({
      where: { driverId: profile.id, status: { in: ['DELIVERED', 'CANCELLED'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, status: true, deliveryFee: true, deliveredAt: true, createdAt: true,
        order: { select: { orderNumber: true, restaurant: { select: { name: true } } } },
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  /** 404 si la course n'est PAS assignée à ce livreur : jamais d'accès à la course d'un autre. */
  private async requireOwnDelivery(userId: string, deliveryId: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, driver: { userId } },
      include: DRIVER_VIEW_INCLUDE,
    });
    if (!delivery) throw new NotFoundException('Course introuvable.');
    return delivery;
  }

  private toDriverView(delivery: DriverDelivery) {
    const { order } = delivery;
    return {
      id: delivery.id,
      status: delivery.status,
      deliveryFee: delivery.deliveryFee,
      tripDistanceKm: delivery.distanceKm,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        itemCount: order._count.items,
        notes: order.notes,
        // Espèces à encaisser auprès du client (0 si déjà payé en ligne).
        amountToCollect: order.paymentMethod === 'CASH_ON_DELIVERY' ? order.total : 0,
      },
      restaurant: order.restaurant,
      // Adresse exacte et contact : uniquement une fois la course acceptée.
      destination: {
        firstName: order.client.firstName,
        address: order.deliveryAddress,
        landmark: order.deliveryLandmark,
        latitude: order.latitude,
        longitude: order.longitude,
        contactPhone: order.contactPhone,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Restaurant : relancer une recherche restée sans livreur
  // ---------------------------------------------------------------------------

  async retrySearch(restaurantId: string, orderId: string) {
    const delivery = await this.prisma.delivery.findFirst({ where: { orderId, order: { restaurantId } } });
    if (!delivery) throw new NotFoundException('Course introuvable.');
    if (delivery.status !== 'NO_DRIVER_FOUND') {
      throw new ConflictException('La recherche est déjà en cours ou terminée.');
    }
    await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: { status: 'SEARCHING', searchAttempts: 0, searchRadiusKm: SEARCH_RADII_KM[0] },
    });
    await this.dispatch.runRound(delivery.id);
    return { status: 'SEARCHING' };
  }

  // ---------------------------------------------------------------------------
  // Suivi (client, restaurant, livreur, admin)
  // ---------------------------------------------------------------------------

  async getTracking(viewer: { userId: string; role: Role }, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, status: true, clientId: true, deliveryType: true, latitude: true, longitude: true,
        restaurant: { select: { name: true, latitude: true, longitude: true, members: { select: { userId: true } } } },
        delivery: {
          select: {
            id: true, status: true, driverId: true,
            driver: { select: { userId: true, vehicleType: true, plateNumber: true, rating: true, user: { select: { firstName: true } } } },
          },
        },
      },
    });
    const isClient = order?.clientId === viewer.userId;
    const isRestaurant = order?.restaurant.members.some((m) => m.userId === viewer.userId) ?? false;
    const isDriver = order?.delivery?.driver?.userId === viewer.userId;
    if (!order || !(viewer.role === 'ADMIN' || isClient || isRestaurant || isDriver)) {
      throw new NotFoundException('Commande introuvable.');
    }

    const delivery = order.delivery;
    const active = !!delivery && ACTIVE_DELIVERY_STATUSES.includes(delivery.status);
    // La position du livreur n'est montrée qu'au client de la commande, et seulement pendant la course.
    const canSeeLocation = active && (isClient || viewer.role === 'ADMIN' || isDriver);
    const position = canSeeLocation && delivery?.driverId ? await this.locations.get(delivery.driverId) : null;

    let etaMinutes: number | null = null;
    if (position && delivery?.driver) {
      const beforePickup = ['ASSIGNED', 'AT_RESTAURANT'].includes(delivery.status);
      const target = beforePickup
        ? { latitude: order.restaurant.latitude, longitude: order.restaurant.longitude }
        : { latitude: order.latitude, longitude: order.longitude };
      if (target.latitude !== null && target.longitude !== null) {
        const speed = AVERAGE_SPEED_KMH[delivery.driver.vehicleType] ?? 20;
        etaMinutes = Math.max(1, Math.ceil((haversineKm(position, { latitude: target.latitude, longitude: target.longitude }) / speed) * 60));
      }
    }

    return {
      orderId: order.id,
      orderStatus: order.status,
      deliveryType: order.deliveryType,
      deliveryStatus: delivery?.status ?? null,
      driver:
        delivery?.driver && delivery.status !== 'CANCELLED'
          ? {
              firstName: delivery.driver.user.firstName,
              vehicleType: delivery.driver.vehicleType,
              plateNumber: delivery.driver.plateNumber,
              rating: delivery.driver.rating,
            }
          : null,
      driverLocation: position ? { latitude: position.latitude, longitude: position.longitude, at: new Date(position.at).toISOString() } : null,
      etaMinutes,
      restaurant: { name: order.restaurant.name, latitude: order.restaurant.latitude, longitude: order.restaurant.longitude },
      destination: isRestaurant && !isClient ? null : { latitude: order.latitude, longitude: order.longitude },
    };
  }
}
