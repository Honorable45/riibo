import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';
import 'package:riiberaka_restaurant/features/shared/models.dart';
import 'package:riiberaka_restaurant/features/shared/repository.dart';

/// Données de TEST (formes relevées sur le backend le 2026-10-18).
Json orderJson({
  String id = 'o1',
  int number = 21,
  String status = 'PENDING',
  String type = 'DELIVERY',
}) => {
  'id': id,
  'orderNumber': number,
  'status': status,
  'deliveryType': type,
  'total': 3800,
  'subtotal': 2800,
  'paymentMethod': 'CASH_ON_DELIVERY',
  'paymentStatus': 'PENDING',
  'notes': 'Sans piment',
  'createdAt': DateTime.now()
      .subtract(const Duration(minutes: 3))
      .toUtc()
      .toIso8601String(),
  'acceptedAt': null,
  'readyAt': null,
  'items': [
    {
      'name': 'Poulet braisé',
      'quantity': 1,
      'options': [
        {'name': 'Frites'},
      ],
      'note': null,
      'lineTotal': 2800,
    },
  ],
  'client': {'firstName': 'Jean', 'phone': '+22890100001'},
};

Json profileJson({bool paused = false}) => {
  'id': 'r1',
  'name': 'Chez Maman',
  'description': 'Cuisine familiale togolaise.',
  'phone': '+22890200001',
  'address': 'Agoè, près du marché',
  'city': 'Lomé',
  'quarter': 'Agoè',
  'status': 'APPROVED',
  'deliveryFee': 1000,
  'minOrderAmount': 1000,
  'prepTimeMin': 20,
  'prepTimeMax': 35,
  'isPaused': paused,
  'rating': 5,
  'reviewCount': 2,
  'hours': [
    {'dayOfWeek': 1, 'opensAt': '08:00', 'closesAt': '22:00'},
  ],
  'closures': <Json>[],
};

Json menuJson() => {
  'categories': [
    {
      'id': 'c1',
      'name': 'Poulet',
      'items': [
        {
          'id': 'i1',
          'categoryId': 'c1',
          'name': 'Poulet braisé',
          'description': 'Braisé au charbon',
          'price': 2500,
          'imageUrl': null,
          'isAvailable': true,
          'maxQuantity': null,
          'stock': null,
          'optionGroups': [
            {
              'id': 'g1',
              'name': 'Accompagnement',
              'minSelect': 1,
              'maxSelect': 1,
              'options': [
                {
                  'id': 'o1',
                  'name': 'Alloco',
                  'priceDelta': 0,
                  'isAvailable': true,
                },
              ],
            },
          ],
        },
        {
          'id': 'i2',
          'categoryId': 'c1',
          'name': 'Demi-poulet',
          'description': null,
          'price': 1500,
          'imageUrl': null,
          'isAvailable': true,
          'maxQuantity': 3,
          'stock': 0,
          'optionGroups': <Json>[],
        },
      ],
    },
  ],
  'uncategorized': <Json>[],
};

class FakeRepo implements RestaurantRepository {
  FakeRepo({this.restaurants, this.active, this.paused = false});

  List<Json>? restaurants;
  List<Json>? active;
  bool paused;
  Json menuData = menuJson();
  final calls = <String>[];
  ApiException? nextError;
  Completer<void>? gate;

  Future<T> _do<T>(String c, T Function() r) async {
    calls.add(c);
    if (gate != null) await gate!.future;
    final e = nextError;
    if (e != null) {
      nextError = null;
      throw e;
    }
    return r();
  }

  @override
  Future<List<MyRestaurant>> mine() async =>
      (restaurants ??
              [
                {
                  'id': 'r1',
                  'name': 'Chez Maman',
                  'slug': 'chez-maman',
                  'status': 'APPROVED',
                  'memberRole': 'OWNER',
                },
              ])
          .map(MyRestaurant.fromJson)
          .toList();

  @override
  Future<RestaurantProfile> profile(String id) async =>
      RestaurantProfile.fromJson(profileJson(paused: paused));

  @override
  Future<void> update(String id, Json changes) =>
      _do('update:${changes.keys.join(',')}', () {
        if (changes['isPaused'] is bool) paused = changes['isPaused'] as bool;
      });

  @override
  Future<Dashboard> dashboard(String id) async => Dashboard.fromJson({
    'total': 5,
    'pending': 1,
    'preparing': 2,
    'ready': 0,
    'inDelivery': 1,
    'completed': 1,
    'cancelled': 0,
    'revenue': 2800,
  });

  @override
  Future<CursorPage<KitchenOrder>> orders(
    String id, {
    required bool active,
    String? cursor,
    int limit = 50,
  }) async {
    // Même règle que le serveur (ListOrdersQueryDto : limit ≤ 50).
    if (limit > 50) {
      throw const ApiException(
        ApiErrorKind.validation,
        'limit must not be greater than 50',
      );
    }
    return CursorPage(
      items: (active ? (this.active ?? [orderJson()]) : <Json>[])
          .map(KitchenOrder.fromJson)
          .toList(),
      nextCursor: null,
    );
  }

  @override
  Future<KitchenOrder> order(String orderId) async => KitchenOrder.fromJson(
    (active ?? [orderJson()]).firstWhere((o) => o['id'] == orderId),
  );

  @override
  Future<void> act(
    String id,
    String orderId,
    OrderAction action, {
    String? reason,
  }) => _do('act:${action.path}:${reason ?? ''}', () {});

  @override
  Future<OwnerMenu> menu(String id) async => OwnerMenu.fromJson(menuData);

  @override
  Future<void> updateItem(String id, String itemId, Json changes) =>
      _do('item:$itemId:${changes.keys.join(',')}', () {});

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('$invocation');
}

class Owner extends SessionController {
  @override
  SessionState build() => const SignedIn(
    AuthUser(
      id: 'u-r',
      firstName: 'Maman',
      lastName: 'Akouvi',
      role: 'RESTAURANT',
      phone: '+22890200001',
    ),
  );
}

List<Override> overrides(FakeRepo repo) => [
  restaurantRepositoryProvider.overrideWithValue(repo),
  sessionProvider.overrideWith(Owner.new),
  realtimeEventsProvider.overrideWith((ref) => const Stream.empty()),
  unreadNotificationsProvider.overrideWith((ref) async => 0),
];

Future<void> pumpScreen(
  WidgetTester tester,
  Widget screen, {
  List<Override> overrides = const [],
  Size size = const Size(393, 852),
  bool dark = false,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => screen),
      GoRoute(
        path: '/:rest(.*)',
        builder: (_, state) => Scaffold(body: Text('route:${state.uri}')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: overrides,
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        theme: dark ? AppTheme.dark() : AppTheme.light(),
        locale: const Locale('fr'),
        supportedLocales: const [Locale('fr')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        routerConfig: router,
      ),
    ),
  );
}

Future<void> settle(WidgetTester tester, [int frames = 12]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}
