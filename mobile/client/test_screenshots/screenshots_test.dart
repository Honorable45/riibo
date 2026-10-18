// Génère des captures d'écran de l'application client SANS téléphone :
// rendu Flutter réel (vraies polices, vrai thème) avec des données de
// DÉMONSTRATION (formes des réponses réelles du backend).
//
//   flutter test test_screenshots --update-goldens \
//     --dart-define=SHOTS_DIR=/chemin/vers/dossier
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_client/features/account/account_screen.dart';
import 'package:riiberaka_client/features/addresses/address_models.dart';
import 'package:riiberaka_client/features/addresses/address_repository.dart';
import 'package:riiberaka_client/features/auth/login_screen.dart';
import 'package:riiberaka_client/features/cart/cart_models.dart';
import 'package:riiberaka_client/features/cart/cart_repository.dart';
import 'package:riiberaka_client/features/cart/cart_screen.dart';
import 'package:riiberaka_client/features/catalog/catalog_models.dart';
import 'package:riiberaka_client/features/catalog/catalog_repository.dart';
import 'package:riiberaka_client/features/checkout/checkout_screen.dart';
import 'package:riiberaka_client/features/home/home_screen.dart';
import 'package:riiberaka_client/features/orders/order_models.dart';
import 'package:riiberaka_client/features/orders/order_screen.dart';
import 'package:riiberaka_client/features/orders/orders_repository.dart';
import 'package:riiberaka_client/features/orders/orders_screen.dart';
import 'package:riiberaka_client/features/restaurant/restaurant_repository.dart';
import 'package:riiberaka_client/features/restaurant/restaurant_screen.dart';
import 'package:riiberaka_client/features/search/search_screen.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';

import '../test/support/app_harness.dart';
import '../test/support/fake_catalog.dart';
import '../test/support/fake_restaurant.dart';

const shotsDir = String.fromEnvironment('SHOTS_DIR', defaultValue: '/tmp/riiberaka_shots');

Future<void> loadFonts() async {
  final nunito = FontLoader('NunitoSans');
  for (final w in [400, 500, 600, 700, 800]) {
    nunito.addFont(File('assets/fonts/NunitoSans-$w.ttf').readAsBytes().then((b) => ByteData.view(b.buffer)));
  }
  await nunito.load();
  final home = Platform.environment['FLUTTER_ROOT'] ?? '${Platform.environment['HOME']}/development/flutter';
  final icons = FontLoader('MaterialIcons')
    ..addFont(
      File('$home/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf')
          .readAsBytes()
          .then((b) => ByteData.view(b.buffer)),
    );
  await icons.load();
}

class _SignedIn extends SessionController {
  @override
  SessionState build() => const SignedIn(
    AuthUser(id: 'u1', firstName: 'Jean', lastName: 'Client', role: 'CLIENT', phone: '+22890100001'),
  );
}

class _SignedOut extends SessionController {
  @override
  SessionState build() => const SignedOut();
}

class _Addresses implements AddressRepository {
  @override
  Future<List<Address>> list() async => [
    Address.fromJson({
      'id': 'a1',
      'label': 'MAISON',
      'fullAddress': 'Rue du marché, maison bleue',
      'quarter': 'Agoè',
      'landmark': 'Portail bleu, face à la pharmacie',
      'isDefault': true,
    }),
  ];

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

Json _orderJson({String status = 'PREPARING', String? deliveryStatus = 'SEARCHING'}) => {
  'id': 'o19',
  'orderNumber': 19,
  'status': status,
  'deliveryType': 'DELIVERY',
  'subtotal': 4300,
  'deliveryFee': 1000,
  'discountAmount': 0,
  'total': 5300,
  'paymentMethod': 'CASH_ON_DELIVERY',
  'paymentStatus': 'PENDING',
  'createdAt': DateTime.now().subtract(const Duration(minutes: 12)).toUtc().toIso8601String(),
  'acceptedAt': DateTime.now().subtract(const Duration(minutes: 10)).toUtc().toIso8601String(),
  'items': [
    {'name': 'Poulet braisé', 'quantity': 1, 'unitPrice': 2800, 'lineTotal': 2800, 'options': [{'name': 'Frites'}], 'note': null},
    {'name': 'Demi-poulet', 'quantity': 1, 'unitPrice': 1500, 'lineTotal': 1500, 'options': <Json>[], 'note': 'Sans piment'},
  ],
  'restaurant': {
    'id': 'r1',
    'name': 'Chez Maman',
    'slug': 'chez-maman',
    'phone': '+22890200001',
    'address': 'Agoè, près du marché d’Agoè',
  },
  'deliveryTarget': {
    'address': 'Rue du marché, maison bleue (Agoè)',
    'landmark': 'Portail bleu, face à la pharmacie',
    'contactPhone': '+22890100001',
  },
  'delivery': deliveryStatus == null
      ? null
      : {'status': deliveryStatus, 'driver': null, 'deliveryCode': '482913'},
  'conversations': [
    {'id': 'c1', 'kind': 'ORDER_RESTAURANT', 'isClosed': false},
  ],
  'review': null,
};

class _Orders implements OrdersRepository {
  @override
  Future<OrderDetail> get(String id) async => OrderDetail.fromJson(_orderJson());

  @override
  Future<Tracking> tracking(String id) async =>
      const Tracking(orderStatus: OrderStatus.preparing, deliveryStatus: DeliveryStatus.searching);

  @override
  Future<CursorPage<OrderSummary>> list({required bool active, String? cursor, int limit = 20}) async =>
      CursorPage(
        items: [
          OrderSummary.fromJson({
            'id': 'o19',
            'orderNumber': 19,
            'status': active ? 'PREPARING' : 'DELIVERED',
            'total': 5300,
            'deliveryType': 'DELIVERY',
            'createdAt': DateTime.now().toUtc().toIso8601String(),
            'restaurant': {'id': 'r1', 'name': 'Chez Maman', 'logoUrl': null},
            'items': [
              {'name': 'Poulet braisé', 'quantity': 1},
              {'name': 'Demi-poulet', 'quantity': 1},
            ],
            'itemCount': 2,
          }),
          if (!active)
            OrderSummary.fromJson({
              'id': 'o14',
              'orderNumber': 14,
              'status': 'CANCELLED',
              'total': 2350,
              'deliveryType': 'DELIVERY',
              'createdAt': '2026-09-25T01:24:55.596Z',
              'restaurant': {'id': 'r1', 'name': 'Le Roi du Poulet', 'logoUrl': null},
              'items': [
                {'name': 'Demi-poulet', 'quantity': 1},
              ],
              'itemCount': 1,
            }),
        ],
        nextCursor: null,
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

FakeCatalogRepository _catalog() => FakeCatalogRepository(
  categories: const [
    CuisineCategory(slug: 'poulet', name: 'Poulet'),
    CuisineCategory(slug: 'riz', name: 'Riz'),
    CuisineCategory(slug: 'burger', name: 'Burger'),
    CuisineCategory(slug: 'pizza', name: 'Pizza'),
    CuisineCategory(slug: 'poisson', name: 'Poisson'),
    CuisineCategory(slug: 'boissons', name: 'Boissons'),
  ],
  restaurants: [
    RestaurantSummary.fromJson(restaurantJson()),
    RestaurantSummary.fromJson(
      restaurantJson(id: 'r2', slug: 'le-roi-du-poulet', name: 'Le Roi du Poulet', deliveryFee: 800, rating: 0, reviewCount: 0),
    ),
    RestaurantSummary.fromJson(
      restaurantJson(id: 'r3', slug: 'pizza-palace', name: 'Pizza Palace Tokoin', isOpen: false, closedReason: 'OUTSIDE_HOURS'),
    ),
  ],
  dishes: [
    DishSummary.fromJson(dishJson()),
    DishSummary.fromJson(dishJson(id: 'd2', name: 'Poulet braisé', price: 2500)),
    DishSummary.fromJson(dishJson(id: 'd3', name: 'Riz gras', price: 1500)),
  ],
);

List<Override> _common({bool signedIn = true}) => [
  sessionProvider.overrideWith(signedIn ? _SignedIn.new : _SignedOut.new),
  realtimeEventsProvider.overrideWith((ref) => const Stream.empty()),
  unreadNotificationsProvider.overrideWith((ref) async => 3),
  catalogRepositoryProvider.overrideWithValue(_catalog()),
  restaurantRepositoryProvider.overrideWithValue(FakeRestaurantRepository()),
  cartRepositoryProvider.overrideWithValue(FakeCartRepository(Cart.fromJson(cartJson()))),
  addressRepositoryProvider.overrideWithValue(_Addresses()),
  ordersRepositoryProvider.overrideWithValue(_Orders()),
];

Future<void> shoot(WidgetTester tester, String name) async {
  await settle(tester, 20);
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('$shotsDir/$name.png'));
}

void main() {
  setUpAll(loadFonts);

  Future<void> show(WidgetTester tester, Widget screen, {bool signedIn = true, bool dark = false}) async {
    await pumpScreen(tester, screen, overrides: _common(signedIn: signedIn), size: const Size(393, 852), dark: dark);
    await settle(tester, 20);
  }

  testWidgets('01 accueil', (t) async {
    await show(t, const HomeScreen(), signedIn: false);
    await shoot(t, 'client_01_accueil');
    await t.drag(find.byType(CustomScrollView), const Offset(0, -520));
    await shoot(t, 'client_02_accueil_restaurants');
  });

  testWidgets('03 recherche', (t) async {
    await show(t, const SearchScreen(), signedIn: false);
    await t.enterText(find.byType(TextField), 'poulet');
    await t.pump(const Duration(milliseconds: 400));
    await shoot(t, 'client_03_recherche');
  });

  testWidgets('04 restaurant et plat', (t) async {
    await show(t, const RestaurantScreen(slug: 'chez-maman'));
    await shoot(t, 'client_04_restaurant');
    await t.tap(find.text('Poulet braisé'));
    await settle(t, 20);
    await t.tap(find.text('Frites'));
    await shoot(t, 'client_05_plat_options');
  });

  testWidgets('06 panier', (t) async {
    await show(t, const CartScreen());
    await shoot(t, 'client_06_panier');
  });

  testWidgets('07 validation', (t) async {
    await show(t, const CheckoutScreen());
    await shoot(t, 'client_07_validation');
  });

  testWidgets('08 suivi commande', (t) async {
    await show(t, const OrderScreen(orderId: 'o19', justPlaced: true));
    await shoot(t, 'client_08_suivi');
  });

  testWidgets('09 commandes', (t) async {
    await show(t, const OrdersScreen());
    await shoot(t, 'client_09_commandes');
  });

  testWidgets('10 compte', (t) async {
    await show(t, const AccountScreen());
    await shoot(t, 'client_10_compte');
  });

  testWidgets('11 connexion', (t) async {
    await show(t, const LoginScreen(), signedIn: false);
    await shoot(t, 'client_11_connexion');
  });

  testWidgets('12 accueil sombre', (t) async {
    await show(t, const HomeScreen(), signedIn: false, dark: true);
    await shoot(t, 'client_12_accueil_sombre');
  });
}
