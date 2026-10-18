import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_client/features/cart/cart_models.dart';
import 'package:riiberaka_client/features/cart/cart_repository.dart';
import 'package:riiberaka_client/features/restaurant/restaurant_models.dart';
import 'package:riiberaka_client/features/restaurant/restaurant_repository.dart';

import 'fake_catalog.dart';

/// Données de TEST (forme réelle de `GET /restaurants/chez-maman/menu`).
Json menuJson({bool braiseAvailable = true}) => {
  'categories': [
    {
      'id': 'c1',
      'name': 'Poulet',
      'items': [
        {
          'id': 'braise',
          'categoryId': 'c1',
          'name': 'Poulet braisé',
          'description': 'Poulet entier mariné, braisé au charbon.',
          'price': 2500,
          'imageUrl': null,
          'isAvailable': braiseAvailable,
          'maxQuantity': null,
          'optionGroups': [
            {
              'id': 'g1',
              'name': 'Accompagnement',
              'minSelect': 1,
              'maxSelect': 1,
              'options': [
                {
                  'id': 'alloco',
                  'name': 'Alloco',
                  'priceDelta': 0,
                  'isAvailable': true,
                },
                {
                  'id': 'attieke',
                  'name': 'Attiéké',
                  'priceDelta': 0,
                  'isAvailable': true,
                },
                {
                  'id': 'frites',
                  'name': 'Frites',
                  'priceDelta': 300,
                  'isAvailable': true,
                },
              ],
            },
            {
              'id': 'g2',
              'name': 'Suppléments',
              'minSelect': 0,
              'maxSelect': 2,
              'options': [
                {
                  'id': 'piment',
                  'name': 'Piment',
                  'priceDelta': 0,
                  'isAvailable': true,
                },
                {
                  'id': 'oeuf',
                  'name': 'Œuf',
                  'priceDelta': 200,
                  'isAvailable': true,
                },
                {
                  'id': 'avocat',
                  'name': 'Avocat',
                  'priceDelta': 300,
                  'isAvailable': false,
                },
              ],
            },
          ],
        },
        {
          'id': 'demi',
          'categoryId': 'c1',
          'name': 'Demi-poulet',
          'description': 'Un demi poulet braisé.',
          'price': 1500,
          'imageUrl': null,
          'isAvailable': true,
          'maxQuantity': 3,
          'optionGroups': <Json>[],
        },
      ],
    },
    {'id': 'c-empty', 'name': 'Vide', 'items': <Json>[]},
  ],
  'uncategorized': [
    {
      'id': 'eau',
      'categoryId': null,
      'name': 'Eau minérale',
      'description': null,
      'price': 300,
      'imageUrl': null,
      'isAvailable': true,
      'maxQuantity': null,
      'optionGroups': <Json>[],
    },
  ],
};

Json detailJson({bool isOpen = true}) => {
  ...restaurantJson(
    isOpen: isOpen,
    closedReason: isOpen ? null : 'OUTSIDE_HOURS',
  ),
  'address': 'Agoè, près du marché d’Agoè',
  'phone': '+22890200001',
  'latitude': 6.2311,
  'longitude': 1.1953,
  'hours': [
    {'dayOfWeek': 1, 'opensAt': '08:00', 'closesAt': '22:00'},
  ],
  'upcomingClosures': <Json>[],
};

class FakeRestaurantRepository implements RestaurantRepository {
  FakeRestaurantRepository({this.isOpen = true, Json? menu})
    : menuData = menu ?? menuJson();

  bool isOpen;
  Json menuData;

  @override
  Future<RestaurantDetail> detail(
    String idOrSlug, {
    double? latitude,
    double? longitude,
  }) async => RestaurantDetail.fromJson(detailJson(isOpen: isOpen));

  @override
  Future<RestaurantMenu> menu(String idOrSlug) async =>
      RestaurantMenu.fromJson(menuData);

  @override
  Future<ReviewPage> reviews(
    String idOrSlug, {
    String? cursor,
    int limit = 10,
  }) async =>
      const ReviewPage(rating: 0, count: 0, items: [], nextCursor: null);
}

Json cartJson({
  List<Json>? items,
  List<String> blockers = const [],
  bool canCheckout = true,
  int subtotal = 2800,
  int deliveryFee = 1000,
}) => {
  'restaurant': {
    'id': 'r1',
    'slug': 'chez-maman',
    'name': 'Chez Maman',
    'logoUrl': null,
    'minOrderAmount': 1000,
    'isOpen': true,
    'closedReason': null,
  },
  'items':
      items ??
      [
        {
          'id': 'line1',
          'menuItemId': 'braise',
          'name': 'Poulet braisé',
          'imageUrl': null,
          'quantity': 1,
          'note': null,
          'options': [
            {'id': 'frites', 'name': 'Frites', 'priceDelta': 300},
          ],
          'unitPrice': 2800,
          'lineTotal': 2800,
          'issue': null,
        },
      ],
  'subtotal': subtotal,
  'deliveryFee': deliveryFee,
  'total': subtotal + deliveryFee,
  'canCheckout': canCheckout,
  'blockers': blockers,
  'discount': 0,
  'promo': null,
  'promoIssue': null,
};

/// Panier serveur simulé : applique les règles essentielles du backend.
class FakeCartRepository implements CartRepository {
  FakeCartRepository([Cart? initial]) : cart = initial ?? Cart.empty;

  Cart cart;
  String? restaurantId;
  ApiException? nextError;
  final List<String> calls = [];

  Future<Cart> _reply(String call, Cart Function() next) async {
    calls.add(call);
    final error = nextError;
    if (error != null) {
      nextError = null;
      throw error;
    }
    return cart = next();
  }

  @override
  Future<Cart> fetch() async {
    calls.add('fetch');
    return cart;
  }

  @override
  Future<Cart> add({
    required String menuItemId,
    required int quantity,
    required List<String> optionIds,
    String? note,
    bool replaceCart = false,
  }) => _reply(
    'add:$menuItemId:$quantity:${optionIds.join(',')}:$replaceCart',
    () {
      return Cart.fromJson(
        cartJson(
          items: [
            {
              'id': 'line-$menuItemId',
              'menuItemId': menuItemId,
              'name': menuItemId,
              'imageUrl': null,
              'quantity': quantity,
              'note': note,
              'options': <Json>[],
              'unitPrice': 1000,
              'lineTotal': 1000 * quantity,
              'issue': null,
            },
          ],
          subtotal: 1000 * quantity,
        ),
      );
    },
  );

  @override
  Future<Cart> update(
    String lineId, {
    int? quantity,
    List<String>? optionIds,
    String? note,
  }) => _reply('update:$lineId:$quantity', () {
    final items = cart.items
        .map(
          (l) => {
            'id': l.id,
            'menuItemId': l.menuItemId,
            'name': l.name,
            'imageUrl': null,
            'quantity': l.id == lineId ? quantity ?? l.quantity : l.quantity,
            'note': l.note,
            'options': <Json>[],
            'unitPrice': l.unitPrice,
            'lineTotal':
                l.unitPrice *
                (l.id == lineId ? quantity ?? l.quantity : l.quantity),
            'issue': null,
          },
        )
        .toList();
    final subtotal = items.fold<int>(0, (s, l) => s + (l['lineTotal']! as int));
    return Cart.fromJson(cartJson(items: items, subtotal: subtotal));
  });

  @override
  Future<Cart> remove(String lineId) =>
      _reply('remove:$lineId', () => Cart.empty);

  @override
  Future<Cart> clear() => _reply('clear', () => Cart.empty);

  @override
  Future<Cart> applyPromo(String code) => _reply('promo:$code', () => cart);

  @override
  Future<Cart> removePromo() => _reply('promo:remove', () => cart);
}
