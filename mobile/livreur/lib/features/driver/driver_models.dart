import 'package:riiberaka_core/core/api/json.dart';

/// Statut administratif du compte livreur (`ApprovalStatus` du backend).
enum DriverAccountStatus {
  pending('PENDING', 'Dossier à compléter'),
  inReview('IN_REVIEW', 'Dossier en cours de vérification'),
  approved('APPROVED', 'Compte validé'),
  rejected('REJECTED', 'Dossier refusé'),
  suspended('SUSPENDED', 'Compte suspendu'),
  unknown('', 'Statut inconnu');

  const DriverAccountStatus(this.api, this.label);
  final String api;
  final String label;

  static DriverAccountStatus parse(String? value) =>
      values.firstWhere((s) => s.api == value, orElse: () => unknown);
}

enum VehicleType {
  moto('MOTO', 'Moto'),
  velo('VELO', 'Vélo'),
  voiture('VOITURE', 'Voiture');

  const VehicleType(this.api, this.label);
  final String api;
  final String label;

  static VehicleType parse(String? value) =>
      values.firstWhere((v) => v.api == value, orElse: () => moto);
}

/// Profil livreur (`GET /driver/me`).
class DriverProfile {
  const DriverProfile({
    required this.id,
    required this.status,
    required this.vehicleType,
    required this.isOnline,
    required this.isAvailable,
    required this.totalDeliveries,
    required this.todayDeliveries,
    required this.todayDeliveryFees,
    this.statusReason,
    this.plateNumber,
    this.vehicleBrand,
    this.vehicleColor,
    this.mobileMoneyNumber,
    this.rating = 0,
    this.ratingCount = 0,
    this.activeDeliveryId,
  });

  factory DriverProfile.fromJson(Json json) {
    final today = json.objOrNull('today') ?? const {};
    return DriverProfile(
      id: json.str('id'),
      status: DriverAccountStatus.parse(json.strOrNull('status')),
      statusReason: json.strOrNull('statusReason'),
      vehicleType: VehicleType.parse(json.strOrNull('vehicleType')),
      plateNumber: json.strOrNull('plateNumber'),
      vehicleBrand: json.strOrNull('vehicleBrand'),
      vehicleColor: json.strOrNull('vehicleColor'),
      mobileMoneyNumber: json.strOrNull('mobileMoneyNumber'),
      isOnline: json.boolean('isOnline'),
      isAvailable: json.boolean('isAvailable'),
      rating: json.dblOrNull('rating') ?? 0,
      ratingCount: json.intOrNull('ratingCount') ?? 0,
      totalDeliveries: json.intOrNull('totalDeliveries') ?? 0,
      todayDeliveries: today.intOrNull('deliveries') ?? 0,
      // Le backend nomme ce champ « earnings » mais il additionne les frais
      // de livraison PAYÉS PAR LES CLIENTS (Delivery.deliveryFee) : ce n'est
      // pas une rémunération du livreur, qui n'existe pas encore côté serveur.
      todayDeliveryFees: today.intOrNull('earnings') ?? 0,
      activeDeliveryId: json.strOrNull('activeDeliveryId'),
    );
  }

  final String id;
  final DriverAccountStatus status;
  final String? statusReason;
  final VehicleType vehicleType;
  final String? plateNumber;
  final String? vehicleBrand;
  final String? vehicleColor;
  final String? mobileMoneyNumber;
  final bool isOnline;
  final bool isAvailable;
  final double rating;
  final int ratingCount;
  final int totalDeliveries;
  final int todayDeliveries;
  final int todayDeliveryFees;
  final String? activeDeliveryId;

  bool get isApproved => status == DriverAccountStatus.approved;
}

/// Proposition de course (`GET /driver/offers`, événement `delivery:offer`).
/// Avant acceptation, l'adresse exacte du client n'est pas communiquée.
class DeliveryOffer {
  const DeliveryOffer({
    required this.deliveryId,
    required this.orderNumber,
    required this.restaurantName,
    required this.expiresAt,
    required this.deliveryFee,
    this.restaurantQuarter,
    this.distanceToRestaurantKm,
    this.tripDistanceKm,
  });

  factory DeliveryOffer.fromJson(Json json) {
    final restaurant = json.objOrNull('restaurant') ?? const {};
    return DeliveryOffer(
      deliveryId: json.str('deliveryId'),
      orderNumber: json.intOrNull('orderNumber') ?? 0,
      restaurantName: restaurant.strOrNull('name') ?? 'Restaurant',
      restaurantQuarter: restaurant.strOrNull('quarter'),
      distanceToRestaurantKm:
          json.dblOrNull('distanceToRestaurantKm') ??
          json.dblOrNull('distanceKm'),
      tripDistanceKm: json.dblOrNull('tripDistanceKm'),
      deliveryFee: json.intOrNull('deliveryFee') ?? 0,
      expiresAt: json.date('expiresAt'),
    );
  }

  final String deliveryId;
  final int orderNumber;
  final String restaurantName;
  final String? restaurantQuarter;

  /// Distance à vol d'oiseau livreur → restaurant (pas un itinéraire).
  final double? distanceToRestaurantKm;

  /// Distance à vol d'oiseau restaurant → client.
  final double? tripDistanceKm;

  /// Frais de livraison payés par le client (pas la rémunération du livreur).
  final int deliveryFee;
  final DateTime expiresAt;

  Duration remaining(DateTime now) {
    final left = expiresAt.difference(now);
    return left.isNegative ? Duration.zero : left;
  }

  bool isExpired(DateTime now) => !expiresAt.isAfter(now);
}

/// États d'une course côté livreur (`Delivery.status`).
enum DeliveryStep {
  assigned('ASSIGNED'),
  atRestaurant('AT_RESTAURANT'),
  pickedUp('PICKED_UP'),
  onTheWay('ON_THE_WAY'),
  arrived('ARRIVED'),
  delivered('DELIVERED'),
  cancelled('CANCELLED'),
  searching('SEARCHING'),
  noDriverFound('NO_DRIVER_FOUND'),
  unknown('');

  const DeliveryStep(this.api);
  final String api;

  static DeliveryStep parse(String? value) =>
      values.firstWhere((s) => s.api == value, orElse: () => unknown);

  /// Avant la collecte : direction le restaurant.
  bool get isBeforePickup => this == assigned || this == atRestaurant;

  /// Après la collecte : direction le client.
  bool get isAfterPickup =>
      this == pickedUp || this == onTheWay || this == arrived;

  bool get isFinished => this == delivered || this == cancelled;
}

class RestaurantInfo {
  const RestaurantInfo({
    required this.name,
    this.address,
    this.quarter,
    this.phone,
    this.latitude,
    this.longitude,
  });

  factory RestaurantInfo.fromJson(Json json) => RestaurantInfo(
    name: json.strOrNull('name') ?? 'Restaurant',
    address: json.strOrNull('address'),
    quarter: json.strOrNull('quarter'),
    phone: json.strOrNull('phone'),
    latitude: json.dblOrNull('latitude'),
    longitude: json.dblOrNull('longitude'),
  );

  final String name;
  final String? address;
  final String? quarter;
  final String? phone;
  final double? latitude;
  final double? longitude;

  bool get hasCoordinates => latitude != null && longitude != null;
}

class Destination {
  const Destination({
    this.firstName,
    this.address,
    this.landmark,
    this.latitude,
    this.longitude,
    this.contactPhone,
  });

  factory Destination.fromJson(Json json) => Destination(
    firstName: json.strOrNull('firstName'),
    address: json.strOrNull('address'),
    landmark: json.strOrNull('landmark'),
    latitude: json.dblOrNull('latitude'),
    longitude: json.dblOrNull('longitude'),
    contactPhone: json.strOrNull('contactPhone'),
  );

  final String? firstName;
  final String? address;
  final String? landmark;
  final double? latitude;
  final double? longitude;
  final String? contactPhone;

  bool get hasCoordinates => latitude != null && longitude != null;
}

/// Course vue par SON livreur (`toDriverView` du backend).
class ActiveDelivery {
  const ActiveDelivery({
    required this.id,
    required this.step,
    required this.deliveryFee,
    required this.orderId,
    required this.orderNumber,
    required this.orderStatus,
    required this.itemCount,
    required this.amountToCollect,
    required this.restaurant,
    required this.destination,
    this.tripDistanceKm,
    this.notes,
  });

  factory ActiveDelivery.fromJson(Json json) {
    final order = json.obj('order');
    return ActiveDelivery(
      id: json.str('id'),
      step: DeliveryStep.parse(json.strOrNull('status')),
      deliveryFee: json.intOrNull('deliveryFee') ?? 0,
      tripDistanceKm: json.dblOrNull('tripDistanceKm'),
      orderId: order.str('id'),
      orderNumber: order.intOrNull('orderNumber') ?? 0,
      orderStatus: order.strOrNull('status') ?? '',
      itemCount: order.intOrNull('itemCount') ?? 0,
      notes: order.strOrNull('notes'),
      amountToCollect: order.intOrNull('amountToCollect') ?? 0,
      restaurant: RestaurantInfo.fromJson(
        json.objOrNull('restaurant') ?? const {},
      ),
      destination: Destination.fromJson(
        json.objOrNull('destination') ?? const {},
      ),
    );
  }

  final String id;
  final DeliveryStep step;
  final int deliveryFee;
  final double? tripDistanceKm;
  final String orderId;
  final int orderNumber;

  /// `Order.status` : la collecte n'est possible qu'à `ASSIGNED` (commande
  /// prête et attribuée), règle vérifiée par le serveur.
  final String orderStatus;
  final int itemCount;
  final String? notes;

  /// Montant à encaisser en espèces (0 si déjà payé autrement).
  final int amountToCollect;
  final RestaurantInfo restaurant;
  final Destination destination;

  bool get orderReady => orderStatus == 'ASSIGNED';
  bool get canRelease => step.isBeforePickup;
}

/// Course terminée ou annulée (`GET /driver/deliveries`).
class HistoryEntry {
  const HistoryEntry({
    required this.id,
    required this.status,
    required this.deliveryFee,
    required this.createdAt,
    required this.orderNumber,
    required this.restaurantName,
    this.deliveredAt,
  });

  factory HistoryEntry.fromJson(Json json) {
    final order = json.objOrNull('order') ?? const {};
    final restaurant = order.objOrNull('restaurant') ?? const {};
    return HistoryEntry(
      id: json.str('id'),
      status: DeliveryStep.parse(json.strOrNull('status')),
      deliveryFee: json.intOrNull('deliveryFee') ?? 0,
      createdAt: json.date('createdAt'),
      deliveredAt: json.dateOrNull('deliveredAt'),
      orderNumber: order.intOrNull('orderNumber') ?? 0,
      restaurantName: restaurant.strOrNull('name') ?? 'Restaurant',
    );
  }

  final String id;
  final DeliveryStep status;
  final int deliveryFee;
  final DateTime createdAt;
  final DateTime? deliveredAt;
  final int orderNumber;
  final String restaurantName;
}
