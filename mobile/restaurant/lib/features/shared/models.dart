import 'package:riiberaka_core/core/api/json.dart';

/// Restaurant dont l'utilisateur est membre (`GET /users/me` → `restaurants`).
class MyRestaurant {
  const MyRestaurant({
    required this.id,
    required this.name,
    required this.status,
    required this.memberRole,
  });

  factory MyRestaurant.fromJson(Json json) => MyRestaurant(
    id: json.str('id'),
    name: json.strOrNull('name') ?? 'Restaurant',
    status: json.strOrNull('status') ?? '',
    memberRole: json.strOrNull('memberRole') ?? 'STAFF',
  );

  final String id;
  final String name;

  /// `ApprovalStatus` : seules les opérations sur un restaurant APPROVED sont
  /// autorisées par le serveur (commandes, tableau de bord).
  final String status;

  /// `OWNER` (tout) ou `STAFF` (pause du restaurant et menu seulement).
  final String memberRole;

  bool get isOwner => memberRole == 'OWNER';
  bool get isApproved => status == 'APPROVED';

  String get statusLabel => switch (status) {
    'APPROVED' => 'Validé',
    'PENDING' => 'Dossier à compléter',
    'IN_REVIEW' => 'En cours de vérification',
    'REJECTED' => 'Refusé',
    'SUSPENDED' => 'Suspendu',
    _ => 'Statut inconnu',
  };
}

class OpeningRange {
  const OpeningRange({
    required this.dayOfWeek,
    required this.opensAt,
    required this.closesAt,
  });

  factory OpeningRange.fromJson(Json json) => OpeningRange(
    dayOfWeek: json.integer('dayOfWeek'),
    opensAt: json.str('opensAt'),
    closesAt: json.str('closesAt'),
  );

  /// ISO : 1 = lundi … 7 = dimanche.
  final int dayOfWeek;
  final String opensAt;
  final String closesAt;

  Json toJson() => {
    'dayOfWeek': dayOfWeek,
    'opensAt': opensAt,
    'closesAt': closesAt,
  };
}

class Closure {
  const Closure({
    required this.id,
    required this.startsAt,
    required this.endsAt,
    this.reason,
  });

  factory Closure.fromJson(Json json) => Closure(
    id: json.str('id'),
    startsAt: json.date('startsAt'),
    endsAt: json.date('endsAt'),
    reason: json.strOrNull('reason'),
  );

  final String id;
  final DateTime startsAt;
  final DateTime endsAt;
  final String? reason;
}

/// Fiche complète vue par le restaurant (`GET /restaurant/:id`).
class RestaurantProfile {
  const RestaurantProfile({
    required this.id,
    required this.name,
    required this.status,
    required this.isPaused,
    required this.deliveryFee,
    required this.minOrderAmount,
    required this.hours,
    required this.closures,
    this.description,
    this.phone,
    this.address,
    this.city,
    this.quarter,
    this.latitude,
    this.longitude,
    this.logoUrl,
    this.coverUrl,
    this.statusReason,
    this.prepTimeMin,
    this.prepTimeMax,
    this.paymentAccountNumber,
    this.rating = 0,
    this.reviewCount = 0,
  });

  factory RestaurantProfile.fromJson(Json json) => RestaurantProfile(
    id: json.str('id'),
    name: json.str('name'),
    description: json.strOrNull('description'),
    phone: json.strOrNull('phone'),
    address: json.strOrNull('address'),
    city: json.strOrNull('city'),
    quarter: json.strOrNull('quarter'),
    latitude: json.dblOrNull('latitude'),
    longitude: json.dblOrNull('longitude'),
    logoUrl: json.strOrNull('logoUrl'),
    coverUrl: json.strOrNull('coverUrl'),
    status: json.strOrNull('status') ?? '',
    statusReason: json.strOrNull('statusReason'),
    deliveryFee: json.intOrNull('deliveryFee') ?? 0,
    minOrderAmount: json.intOrNull('minOrderAmount') ?? 0,
    prepTimeMin: json.intOrNull('prepTimeMin'),
    prepTimeMax: json.intOrNull('prepTimeMax'),
    isPaused: json.boolean('isPaused'),
    paymentAccountNumber: json.strOrNull('paymentAccountNumber'),
    rating: json.dblOrNull('rating') ?? 0,
    reviewCount: json.intOrNull('reviewCount') ?? 0,
    hours: json.list('hours', OpeningRange.fromJson),
    closures: json.list('closures', Closure.fromJson),
  );

  final String id;
  final String name;
  final String? description;
  final String? phone;
  final String? address;
  final String? city;
  final String? quarter;
  final double? latitude;
  final double? longitude;
  final String? logoUrl;
  final String? coverUrl;
  final String status;
  final String? statusReason;
  final int deliveryFee;
  final int minOrderAmount;
  final int? prepTimeMin;
  final int? prepTimeMax;

  /// Pause : le restaurant n'accepte plus de commandes (calcul serveur).
  final bool isPaused;
  final String? paymentAccountNumber;
  final double rating;
  final int reviewCount;
  final List<OpeningRange> hours;
  final List<Closure> closures;
}

/// Chiffres du jour (`GET /restaurant/:id/dashboard`), fuseau Africa/Lome.
class Dashboard {
  const Dashboard({
    required this.total,
    required this.pending,
    required this.preparing,
    required this.ready,
    required this.inDelivery,
    required this.completed,
    required this.cancelled,
    required this.revenue,
  });

  factory Dashboard.fromJson(Json json) => Dashboard(
    total: json.intOrNull('total') ?? 0,
    pending: json.intOrNull('pending') ?? 0,
    preparing: json.intOrNull('preparing') ?? 0,
    ready: json.intOrNull('ready') ?? 0,
    inDelivery: json.intOrNull('inDelivery') ?? 0,
    completed: json.intOrNull('completed') ?? 0,
    cancelled: json.intOrNull('cancelled') ?? 0,
    revenue: json.intOrNull('revenue') ?? 0,
  );

  final int total;
  final int pending;
  final int preparing;
  final int ready;
  final int inDelivery;
  final int completed;
  final int cancelled;

  /// Repas des commandes LIVRÉES du jour, remises déduites, hors frais de
  /// livraison. Ce n'est ni un montant payé ni un net après commission (le
  /// backend ne gère pas de commission).
  final int revenue;
}

/// États d'une commande (`Order.status`).
enum OrderState {
  pending('PENDING', 'Nouvelle'),
  accepted('ACCEPTED', 'Acceptée'),
  preparing('PREPARING', 'En préparation'),
  ready('READY', 'Prête'),
  assigned('ASSIGNED', 'Livreur en route'),
  pickedUp('PICKED_UP', 'Récupérée'),
  onTheWay('ON_THE_WAY', 'En livraison'),
  delivered('DELIVERED', 'Terminée'),
  cancelled('CANCELLED', 'Annulée'),
  rejected('REJECTED', 'Refusée'),
  unknown('', 'Inconnu');

  const OrderState(this.api, this.label);
  final String api;
  final String label;

  static OrderState parse(String? value) =>
      values.firstWhere((s) => s.api == value, orElse: () => unknown);

  bool get isFinal =>
      this == delivered || this == cancelled || this == rejected;
}

/// Colonnes de la cuisine, déduites des états RÉELS (aucune seconde machine).
enum KitchenColumn {
  incoming('Nouvelles', {OrderState.pending}),
  cooking('En cuisine', {OrderState.accepted, OrderState.preparing}),
  ready('Prêtes', {OrderState.ready, OrderState.assigned}),
  delivering('En livraison', {OrderState.pickedUp, OrderState.onTheWay});

  const KitchenColumn(this.label, this.states);
  final String label;
  final Set<OrderState> states;
}

class OrderLine {
  const OrderLine({
    required this.name,
    required this.quantity,
    required this.lineTotal,
    this.options = const [],
    this.note,
  });

  factory OrderLine.fromJson(Json json) => OrderLine(
    name: json.str('name'),
    quantity: json.integer('quantity'),
    lineTotal: json.intOrNull('lineTotal') ?? 0,
    options: ((json['options'] as List<dynamic>?) ?? const [])
        .cast<Json>()
        .map((o) => o.strOrNull('name') ?? '')
        .where((n) => n.isNotEmpty)
        .toList(),
    note: json.strOrNull('note'),
  );

  final String name;
  final int quantity;
  final int lineTotal;
  final List<String> options;
  final String? note;
}

/// Commande vue par le restaurant (liste ET détail : le détail ajoute la
/// livraison et les conversations).
class KitchenOrder {
  const KitchenOrder({
    required this.id,
    required this.orderNumber,
    required this.state,
    required this.isPickup,
    required this.subtotal,
    required this.total,
    required this.paymentMethod,
    required this.createdAt,
    required this.items,
    this.notes,
    this.clientFirstName,
    this.clientPhone,
    this.acceptedAt,
    this.readyAt,
    this.rejectionReason,
    this.cancelReason,
    this.deliveryStatus,
    this.driverFirstName,
    this.driverVehicle,
    this.driverPlate,
    this.pickupCode,
    this.conversations = const [],
  });

  factory KitchenOrder.fromJson(Json json) {
    final client = json.objOrNull('client');
    final delivery = json.objOrNull('delivery');
    final driver = delivery?.objOrNull('driver');
    return KitchenOrder(
      id: json.str('id'),
      orderNumber: json.integer('orderNumber'),
      state: OrderState.parse(json.strOrNull('status')),
      isPickup: json.strOrNull('deliveryType') == 'PICKUP',
      subtotal: json.intOrNull('subtotal') ?? 0,
      total: json.intOrNull('total') ?? 0,
      paymentMethod: json.strOrNull('paymentMethod') ?? 'CASH_ON_DELIVERY',
      notes: json.strOrNull('notes'),
      createdAt: json.date('createdAt'),
      acceptedAt: json.dateOrNull('acceptedAt'),
      readyAt: json.dateOrNull('readyAt'),
      rejectionReason: json.strOrNull('rejectionReason'),
      cancelReason: json.strOrNull('cancelReason'),
      items: json.list('items', OrderLine.fromJson),
      clientFirstName: client?.strOrNull('firstName'),
      clientPhone: client?.strOrNull('phone'),
      deliveryStatus: delivery?.strOrNull('status'),
      driverFirstName: driver?.strOrNull('firstName'),
      driverVehicle: driver?.strOrNull('vehicleType'),
      driverPlate: driver?.strOrNull('plateNumber'),
      pickupCode: delivery?.strOrNull('pickupCode'),
      conversations: json.list(
        'conversations',
        (c) => (
          id: c.str('id'),
          kind: c.str('kind'),
          isClosed: c.boolean('isClosed'),
        ),
      ),
    );
  }

  final String id;
  final int orderNumber;
  final OrderState state;
  final bool isPickup;
  final int subtotal;
  final int total;
  final String paymentMethod;
  final String? notes;
  final DateTime createdAt;
  final DateTime? acceptedAt;
  final DateTime? readyAt;
  final String? rejectionReason;
  final String? cancelReason;
  final List<OrderLine> items;
  final String? clientFirstName;
  final String? clientPhone;

  /// `Delivery.status` (SEARCHING, ASSIGNED, AT_RESTAURANT, NO_DRIVER_FOUND…).
  final String? deliveryStatus;
  final String? driverFirstName;
  final String? driverVehicle;
  final String? driverPlate;

  /// Code de retrait à donner au livreur (visible du seul restaurant).
  final String? pickupCode;
  final List<({String id, String kind, bool isClosed})> conversations;

  int get itemCount => items.fold(0, (sum, line) => sum + line.quantity);

  /// Libellé de l'état de la livraison, uniquement d'après le serveur.
  String? get deliveryLabel => switch (deliveryStatus) {
    'SEARCHING' => 'Recherche d’un livreur…',
    'ASSIGNED' => 'Livreur en route vers vous',
    'AT_RESTAURANT' => 'Le livreur est arrivé',
    'PICKED_UP' || 'ON_THE_WAY' => 'En cours de livraison',
    'ARRIVED' => 'Le livreur est chez le client',
    'DELIVERED' => 'Livrée',
    'NO_DRIVER_FOUND' => 'Aucun livreur trouvé',
    'CANCELLED' => 'Livraison annulée',
    _ => null,
  };
}

class MenuOption {
  const MenuOption({
    this.id,
    required this.name,
    required this.priceDelta,
    required this.isAvailable,
  });

  factory MenuOption.fromJson(Json json) => MenuOption(
    id: json.strOrNull('id'),
    name: json.str('name'),
    priceDelta: json.intOrNull('priceDelta') ?? 0,
    isAvailable: json.boolean('isAvailable', fallback: true),
  );

  final String? id;
  final String name;
  final int priceDelta;
  final bool isAvailable;

  Json toJson() => {
    'name': name,
    'priceDelta': priceDelta,
    'isAvailable': isAvailable,
  };
}

class MenuOptionGroup {
  const MenuOptionGroup({
    this.id,
    required this.name,
    required this.minSelect,
    required this.maxSelect,
    required this.options,
  });

  factory MenuOptionGroup.fromJson(Json json) => MenuOptionGroup(
    id: json.strOrNull('id'),
    name: json.str('name'),
    minSelect: json.intOrNull('minSelect') ?? 0,
    maxSelect: json.intOrNull('maxSelect') ?? 1,
    options: json.list('options', MenuOption.fromJson),
  );

  final String? id;
  final String name;
  final int minSelect;
  final int maxSelect;
  final List<MenuOption> options;

  Json toJson() => {
    'name': name,
    'minSelect': minSelect,
    'maxSelect': maxSelect,
    'options': [for (final o in options) o.toJson()],
  };
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    required this.price,
    required this.isAvailable,
    this.categoryId,
    this.description,
    this.imageUrl,
    this.stock,
    this.maxQuantity,
    this.optionGroups = const [],
  });

  factory MenuItem.fromJson(Json json) => MenuItem(
    id: json.str('id'),
    categoryId: json.strOrNull('categoryId'),
    name: json.str('name'),
    description: json.strOrNull('description'),
    price: json.integer('price'),
    imageUrl: json.strOrNull('imageUrl'),
    isAvailable: json.boolean('isAvailable'),
    stock: json.intOrNull('stock'),
    maxQuantity: json.intOrNull('maxQuantity'),
    optionGroups: json.list('optionGroups', MenuOptionGroup.fromJson),
  );

  final String id;
  final String? categoryId;
  final String name;
  final String? description;
  final int price;
  final String? imageUrl;
  final bool isAvailable;

  /// `null` = illimité ; 0 = épuisé (le client le voit indisponible).
  final int? stock;
  final int? maxQuantity;
  final List<MenuOptionGroup> optionGroups;

  bool get soldOut => stock == 0;
}

class MenuSection {
  const MenuSection({
    required this.id,
    required this.name,
    required this.items,
  });
  final String? id;
  final String name;
  final List<MenuItem> items;
}

/// Menu du restaurant, y compris les plats indisponibles et le stock exact.
class OwnerMenu {
  const OwnerMenu(this.sections);

  factory OwnerMenu.fromJson(Json json) {
    final sections = json
        .list(
          'categories',
          (c) => MenuSection(
            id: c.str('id'),
            name: c.str('name'),
            items: c.list('items', MenuItem.fromJson),
          ),
        )
        .toList();
    final loose = json.list('uncategorized', MenuItem.fromJson);
    if (loose.isNotEmpty) {
      sections.add(MenuSection(id: null, name: 'Sans catégorie', items: loose));
    }
    return OwnerMenu(sections);
  }

  final List<MenuSection> sections;

  List<({String id, String name})> get categories => [
    for (final s in sections)
      if (s.id != null) (id: s.id!, name: s.name),
  ];

  int get itemCount => sections.fold(0, (n, s) => n + s.items.length);
}

class Review {
  const Review({
    required this.id,
    required this.rating,
    required this.createdAt,
    this.comment,
    this.reply,
    this.author,
    this.orderNumber,
  });

  factory Review.fromJson(Json json) => Review(
    id: json.str('id'),
    rating: json.integer('rating'),
    comment: json.strOrNull('comment'),
    reply: json.strOrNull('reply'),
    author: json.strOrNull('author'),
    orderNumber: json.intOrNull('orderNumber'),
    createdAt: json.date('createdAt'),
  );

  final String id;
  final int rating;
  final String? comment;
  final String? reply;
  final String? author;
  final int? orderNumber;
  final DateTime createdAt;
}
