import 'package:riiberaka_core/core/api/json.dart';

/// États de `Order.status` (machine à états du backend, order-transitions.ts).
enum OrderStatus {
  pending('PENDING'),
  accepted('ACCEPTED'),
  preparing('PREPARING'),
  ready('READY'),
  assigned('ASSIGNED'),
  pickedUp('PICKED_UP'),
  onTheWay('ON_THE_WAY'),
  delivered('DELIVERED'),
  cancelled('CANCELLED'),
  rejected('REJECTED'),
  unknown('');

  const OrderStatus(this.api);
  final String api;

  static OrderStatus parse(String? value) => values.firstWhere(
    (s) => s.api == value,
    orElse: () => OrderStatus.unknown,
  );

  bool get isFinal =>
      this == delivered || this == cancelled || this == rejected;
  bool get isFailure => this == cancelled || this == rejected;

  /// Le client peut annuler en PENDING ou ACCEPTED (règle CANCEL/CLIENT).
  bool get clientCanCancel => this == pending || this == accepted;

  String label(DeliveryType type) => switch (this) {
    pending => 'En attente du restaurant',
    accepted => 'Acceptée',
    preparing => 'En préparation',
    ready =>
      type == DeliveryType.pickup
          ? 'Prête à récupérer'
          : 'Prête, en attente du livreur',
    assigned => 'Livreur en route vers le restaurant',
    pickedUp => 'Récupérée par le livreur',
    onTheWay => 'En route vers vous',
    delivered => type == DeliveryType.pickup ? 'Récupérée' : 'Livrée',
    cancelled => 'Annulée',
    rejected => 'Refusée par le restaurant',
    unknown => 'Statut inconnu',
  };
}

/// États de `Delivery.status`.
enum DeliveryStatus {
  searching('SEARCHING'),
  assigned('ASSIGNED'),
  atRestaurant('AT_RESTAURANT'),
  pickedUp('PICKED_UP'),
  onTheWay('ON_THE_WAY'),
  arrived('ARRIVED'),
  delivered('DELIVERED'),
  noDriverFound('NO_DRIVER_FOUND'),
  cancelled('CANCELLED'),
  unknown('');

  const DeliveryStatus(this.api);
  final String api;

  static DeliveryStatus? parse(String? value) => value == null
      ? null
      : values.firstWhere(
          (s) => s.api == value,
          orElse: () => DeliveryStatus.unknown,
        );

  /// Précision affichée sous l'étape en cours, ou `null`.
  String? get hint => switch (this) {
    searching => 'Recherche d’un livreur à proximité…',
    assigned => 'Un livreur a accepté la course.',
    atRestaurant => 'Le livreur est au restaurant.',
    arrived => 'Le livreur est arrivé. Donnez-lui votre code de remise.',
    noDriverFound =>
      'Aucun livreur disponible pour le moment. Le restaurant relance la recherche.',
    _ => null,
  };
}

enum DeliveryType {
  delivery('DELIVERY', 'Livraison'),
  pickup('PICKUP', 'À emporter');

  const DeliveryType(this.api, this.label);
  final String api;
  final String label;

  static DeliveryType parse(String? value) =>
      value == 'PICKUP' ? DeliveryType.pickup : DeliveryType.delivery;
}

/// Moyens de paiement connus du backend. Seul le paiement à la livraison est
/// accepté aujourd'hui (OrdersService.create refuse les autres).
enum PaymentMethod {
  cashOnDelivery('CASH_ON_DELIVERY', 'Espèces à la livraison', available: true),
  tmoney('TMONEY', 'TMoney', available: false),
  flooz('FLOOZ', 'Flooz', available: false);

  const PaymentMethod(this.api, this.label, {required this.available});
  final String api;
  final String label;
  final bool available;

  static PaymentMethod parse(String? value) =>
      values.firstWhere((m) => m.api == value, orElse: () => cashOnDelivery);
}

class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.total,
    required this.deliveryType,
    required this.createdAt,
    required this.restaurantId,
    required this.restaurantName,
    required this.itemCount,
    required this.preview,
    this.restaurantLogoUrl,
  });

  factory OrderSummary.fromJson(Json json) {
    final restaurant = json.obj('restaurant');
    return OrderSummary(
      id: json.str('id'),
      orderNumber: json.integer('orderNumber'),
      status: OrderStatus.parse(json.strOrNull('status')),
      total: json.integer('total'),
      deliveryType: DeliveryType.parse(json.strOrNull('deliveryType')),
      createdAt: json.date('createdAt'),
      restaurantId: restaurant.str('id'),
      restaurantName: restaurant.str('name'),
      restaurantLogoUrl: restaurant.strOrNull('logoUrl'),
      itemCount: json.intOrNull('itemCount') ?? 0,
      preview: json
          .list('items', (i) => '${i.integer('quantity')} × ${i.str('name')}')
          .join(', '),
    );
  }

  final String id;
  final int orderNumber;
  final OrderStatus status;
  final int total;
  final DeliveryType deliveryType;
  final DateTime createdAt;
  final String restaurantId;
  final String restaurantName;
  final String? restaurantLogoUrl;
  final int itemCount;
  final String preview;
}

class OrderLine {
  const OrderLine({
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    this.options = const [],
    this.note,
  });

  factory OrderLine.fromJson(Json json) => OrderLine(
    name: json.str('name'),
    quantity: json.integer('quantity'),
    unitPrice: json.integer('unitPrice'),
    lineTotal: json.integer('lineTotal'),
    options: ((json['options'] as List<dynamic>?) ?? const [])
        .cast<Json>()
        .map((o) => o.str('name'))
        .toList(),
    note: json.strOrNull('note'),
  );

  final String name;
  final int quantity;
  final int unitPrice;
  final int lineTotal;
  final List<String> options;
  final String? note;
}

class OrderConversation {
  const OrderConversation({
    required this.id,
    required this.kind,
    required this.isClosed,
  });

  factory OrderConversation.fromJson(Json json) => OrderConversation(
    id: json.str('id'),
    kind: json.str('kind'),
    isClosed: json.boolean('isClosed'),
  );

  final String id;

  /// `ORDER_RESTAURANT` (avec le restaurant) ou `ORDER_DELIVERY` (avec le livreur).
  final String kind;
  final bool isClosed;

  String get withWhom =>
      kind == 'ORDER_DELIVERY' ? 'le livreur' : 'le restaurant';
}

class DriverInfo {
  const DriverInfo({
    required this.firstName,
    this.vehicleType,
    this.plateNumber,
  });

  factory DriverInfo.fromJson(Json json) => DriverInfo(
    firstName: json.strOrNull('firstName') ?? 'Votre livreur',
    vehicleType: json.strOrNull('vehicleType'),
    plateNumber: json.strOrNull('plateNumber'),
  );

  final String firstName;
  final String? vehicleType;
  final String? plateNumber;

  String? get vehicleLabel => switch (vehicleType) {
    'MOTO' => 'Moto',
    'VELO' => 'Vélo',
    'VOITURE' => 'Voiture',
    _ => null,
  };
}

/// Détail d'une commande, vue CLIENT (`GET /orders/:id`).
class OrderDetail {
  const OrderDetail({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.deliveryType,
    required this.subtotal,
    required this.deliveryFee,
    required this.discount,
    required this.total,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.createdAt,
    required this.items,
    required this.restaurantId,
    required this.restaurantName,
    required this.restaurantSlug,
    this.restaurantPhone,
    this.restaurantAddress,
    this.notes,
    this.rejectionReason,
    this.cancelReason,
    this.acceptedAt,
    this.readyAt,
    this.deliveredAt,
    this.cancelledAt,
    this.deliveryAddress,
    this.deliveryLandmark,
    this.contactPhone,
    this.deliveryStatus,
    this.driver,
    this.deliveryCode,
    this.conversations = const [],
    this.reviewRating,
    this.reviewComment,
  });

  factory OrderDetail.fromJson(Json json) {
    final restaurant = json.obj('restaurant');
    final target = json.objOrNull('deliveryTarget');
    final delivery = json.objOrNull('delivery');
    final review = json.objOrNull('review');
    final driver = delivery?.objOrNull('driver');
    return OrderDetail(
      id: json.str('id'),
      orderNumber: json.integer('orderNumber'),
      status: OrderStatus.parse(json.strOrNull('status')),
      deliveryType: DeliveryType.parse(json.strOrNull('deliveryType')),
      subtotal: json.integer('subtotal'),
      deliveryFee: json.intOrNull('deliveryFee') ?? 0,
      discount: json.intOrNull('discountAmount') ?? 0,
      total: json.integer('total'),
      paymentMethod: PaymentMethod.parse(json.strOrNull('paymentMethod')),
      paymentStatus: json.strOrNull('paymentStatus') ?? 'PENDING',
      notes: json.strOrNull('notes'),
      rejectionReason: json.strOrNull('rejectionReason'),
      cancelReason: json.strOrNull('cancelReason'),
      createdAt: json.date('createdAt'),
      acceptedAt: json.dateOrNull('acceptedAt'),
      readyAt: json.dateOrNull('readyAt'),
      deliveredAt: json.dateOrNull('deliveredAt'),
      cancelledAt: json.dateOrNull('cancelledAt'),
      items: json.list('items', OrderLine.fromJson),
      restaurantId: restaurant.str('id'),
      restaurantName: restaurant.str('name'),
      restaurantSlug: restaurant.str('slug'),
      restaurantPhone: restaurant.strOrNull('phone'),
      restaurantAddress: restaurant.strOrNull('address'),
      deliveryAddress: target?.strOrNull('address'),
      deliveryLandmark: target?.strOrNull('landmark'),
      contactPhone: target?.strOrNull('contactPhone'),
      deliveryStatus: DeliveryStatus.parse(delivery?.strOrNull('status')),
      driver: driver == null ? null : DriverInfo.fromJson(driver),
      deliveryCode: delivery?.strOrNull('deliveryCode'),
      conversations: json.list('conversations', OrderConversation.fromJson),
      reviewRating: review?.intOrNull('rating'),
      reviewComment: review?.strOrNull('comment'),
    );
  }

  final String id;
  final int orderNumber;
  final OrderStatus status;
  final DeliveryType deliveryType;
  final int subtotal;
  final int deliveryFee;
  final int discount;
  final int total;
  final PaymentMethod paymentMethod;
  final String paymentStatus;
  final String? notes;
  final String? rejectionReason;
  final String? cancelReason;
  final DateTime createdAt;
  final DateTime? acceptedAt;
  final DateTime? readyAt;
  final DateTime? deliveredAt;
  final DateTime? cancelledAt;
  final List<OrderLine> items;
  final String restaurantId;
  final String restaurantName;
  final String restaurantSlug;
  final String? restaurantPhone;
  final String? restaurantAddress;
  final String? deliveryAddress;
  final String? deliveryLandmark;
  final String? contactPhone;
  final DeliveryStatus? deliveryStatus;
  final DriverInfo? driver;

  /// Code de remise à donner au livreur (visible du seul client).
  final String? deliveryCode;
  final List<OrderConversation> conversations;
  final int? reviewRating;
  final String? reviewComment;

  bool get canReview => status == OrderStatus.delivered && reviewRating == null;
}

/// Étapes affichées dans le suivi, selon le type de commande. Aucune étape
/// n'existe qui ne corresponde à un état réel du backend.
List<(String, Set<OrderStatus>)> orderSteps(DeliveryType type) => [
  ('Commande envoyée', {OrderStatus.pending}),
  ('Acceptée par le restaurant', {OrderStatus.accepted}),
  ('En préparation', {OrderStatus.preparing}),
  if (type == DeliveryType.pickup)
    ('Prête à récupérer', {OrderStatus.ready})
  else ...[
    ('Prête', {OrderStatus.ready, OrderStatus.assigned}),
    ('Récupérée par le livreur', {OrderStatus.pickedUp}),
    ('En route vers vous', {OrderStatus.onTheWay}),
  ],
  (
    type == DeliveryType.pickup ? 'Récupérée' : 'Livrée',
    {OrderStatus.delivered},
  ),
];

/// Index de l'étape atteinte (−1 si inconnue).
int currentStepIndex(OrderStatus status, DeliveryType type) {
  final steps = orderSteps(type);
  for (var i = 0; i < steps.length; i++) {
    if (steps[i].$2.contains(status)) return i;
  }
  return -1;
}

/// Suivi de livraison (`GET /orders/:id/tracking`).
class Tracking {
  const Tracking({
    required this.orderStatus,
    this.deliveryStatus,
    this.driver,
    this.driverLatitude,
    this.driverLongitude,
    this.driverSeenAt,
    this.etaMinutes,
    this.restaurantLatitude,
    this.restaurantLongitude,
    this.destinationLatitude,
    this.destinationLongitude,
  });

  factory Tracking.fromJson(Json json) {
    final location = json.objOrNull('driverLocation');
    final restaurant = json.objOrNull('restaurant');
    final destination = json.objOrNull('destination');
    final driver = json.objOrNull('driver');
    return Tracking(
      orderStatus: OrderStatus.parse(json.strOrNull('orderStatus')),
      deliveryStatus: DeliveryStatus.parse(json.strOrNull('deliveryStatus')),
      driver: driver == null ? null : DriverInfo.fromJson(driver),
      driverLatitude: location?.dblOrNull('latitude'),
      driverLongitude: location?.dblOrNull('longitude'),
      driverSeenAt: location?.dateOrNull('at'),
      etaMinutes: json.intOrNull('etaMinutes'),
      restaurantLatitude: restaurant?.dblOrNull('latitude'),
      restaurantLongitude: restaurant?.dblOrNull('longitude'),
      destinationLatitude: destination?.dblOrNull('latitude'),
      destinationLongitude: destination?.dblOrNull('longitude'),
    );
  }

  final OrderStatus orderStatus;
  final DeliveryStatus? deliveryStatus;
  final DriverInfo? driver;
  final double? driverLatitude;
  final double? driverLongitude;
  final DateTime? driverSeenAt;
  final int? etaMinutes;
  final double? restaurantLatitude;
  final double? restaurantLongitude;
  final double? destinationLatitude;
  final double? destinationLongitude;

  bool get hasDriverPosition =>
      driverLatitude != null && driverLongitude != null;

  /// Position trop ancienne pour être présentée comme actuelle (le backend
  /// l'efface après 90 s ; marge pour l'horloge du téléphone).
  bool isStale(DateTime now) =>
      driverSeenAt == null ||
      now.difference(driverSeenAt!) > const Duration(seconds: 120);
}
