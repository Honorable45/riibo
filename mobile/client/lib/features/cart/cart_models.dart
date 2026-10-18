import 'package:riiberaka_core/core/api/json.dart';

class CartOption {
  const CartOption({
    required this.id,
    required this.name,
    required this.priceDelta,
  });

  factory CartOption.fromJson(Json json) => CartOption(
    id: json.str('id'),
    name: json.str('name'),
    priceDelta: json.integer('priceDelta'),
  );

  final String id;
  final String name;
  final int priceDelta;
}

class CartLine {
  const CartLine({
    required this.id,
    required this.menuItemId,
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    this.imageUrl,
    this.note,
    this.options = const [],
    this.issue,
  });

  factory CartLine.fromJson(Json json) => CartLine(
    id: json.str('id'),
    menuItemId: json.str('menuItemId'),
    name: json.str('name'),
    imageUrl: json.strOrNull('imageUrl'),
    quantity: json.integer('quantity'),
    note: json.strOrNull('note'),
    options: json.list('options', CartOption.fromJson),
    unitPrice: json.integer('unitPrice'),
    lineTotal: json.integer('lineTotal'),
    issue: json.strOrNull('issue'),
  );

  final String id;
  final String menuItemId;
  final String name;
  final String? imageUrl;
  final int quantity;
  final String? note;
  final List<CartOption> options;

  /// Prix ACTUEL, recalculé par le serveur à chaque lecture du panier.
  final int unitPrice;
  final int lineTotal;

  /// Problème détecté par le serveur (épuisé, option retirée…) : la ligne
  /// n'est pas comptée dans le sous-total et bloque la commande.
  final String? issue;

  CartLine copyWith({int? quantity}) => CartLine(
    id: id,
    menuItemId: menuItemId,
    name: name,
    imageUrl: imageUrl,
    quantity: quantity ?? this.quantity,
    note: note,
    options: options,
    unitPrice: unitPrice,
    lineTotal: unitPrice * (quantity ?? this.quantity),
    issue: issue,
  );
}

class CartRestaurant {
  const CartRestaurant({
    required this.id,
    required this.slug,
    required this.name,
    required this.minOrderAmount,
    required this.isOpen,
    this.logoUrl,
    this.closedReason,
  });

  factory CartRestaurant.fromJson(Json json) => CartRestaurant(
    id: json.str('id'),
    slug: json.str('slug'),
    name: json.str('name'),
    logoUrl: json.strOrNull('logoUrl'),
    minOrderAmount: json.intOrNull('minOrderAmount') ?? 0,
    isOpen: json.boolean('isOpen'),
    closedReason: json.strOrNull('closedReason'),
  );

  final String id;
  final String slug;
  final String name;
  final String? logoUrl;
  final int minOrderAmount;
  final bool isOpen;
  final String? closedReason;
}

/// Panier serveur (`GET /cart`) — toujours chiffré par le backend.
class Cart {
  const Cart({
    required this.items,
    required this.subtotal,
    required this.deliveryFee,
    required this.discount,
    required this.total,
    required this.canCheckout,
    required this.blockers,
    this.restaurant,
    this.promoCode,
    this.promoIssue,
  });

  factory Cart.fromJson(Json json) {
    final restaurant = json.objOrNull('restaurant');
    final promo = json.objOrNull('promo');
    return Cart(
      restaurant: restaurant == null
          ? null
          : CartRestaurant.fromJson(restaurant),
      items: json.list('items', CartLine.fromJson),
      subtotal: json.intOrNull('subtotal') ?? 0,
      deliveryFee: json.intOrNull('deliveryFee') ?? 0,
      discount: json.intOrNull('discount') ?? 0,
      total: json.intOrNull('total') ?? 0,
      canCheckout: json.boolean('canCheckout'),
      blockers: ((json['blockers'] as List<dynamic>?) ?? const [])
          .cast<String>(),
      promoCode: promo?.strOrNull('code'),
      promoIssue: json.strOrNull('promoIssue'),
    );
  }

  static const empty = Cart(
    items: [],
    subtotal: 0,
    deliveryFee: 0,
    discount: 0,
    total: 0,
    canCheckout: false,
    blockers: [],
  );

  final CartRestaurant? restaurant;
  final List<CartLine> items;
  final int subtotal;
  final int deliveryFee;
  final int discount;
  final int total;
  final bool canCheckout;
  final List<String> blockers;

  /// Code promo appliqué ET encore valide.
  final String? promoCode;

  /// Code enregistré mais devenu invalide (expiré, minimum non atteint…).
  final String? promoIssue;

  bool get isEmpty => items.isEmpty;
  int get itemCount => items.fold(0, (sum, line) => sum + line.quantity);
}
