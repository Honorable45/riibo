// Test RÉEL contre le backend local, exécutable sur l'ordinateur (sans
// téléphone) : l'application tourne dans l'environnement de test Flutter,
// mais le réseau réel est réactivé et la session vit en mémoire.
//
//   flutter test test_real_backend --dart-define=API_BASE_URL=http://localhost:4100
//
// Données de DÉMONSTRATION de la base de développement uniquement.
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:riiberaka_core/app/config/env.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/token_store.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';
import 'package:riiberaka_restaurant/features/orders/orders_screen.dart';
import 'package:riiberaka_restaurant/features/shared/repository.dart';

import '../test/support/fakes.dart' show pumpScreen;

const _password = 'demo12345';

/// Une seule connexion par compte pour tout le fichier : la connexion par
/// mot de passe est limitée à 5 par minute (protection du backend).
final _sessions = <String, Json>{};

Future<Json> session(String phone) async => _sessions[phone] ??=
    (await Dio(BaseOptions(baseUrl: Env.apiBase.toString())).post<Json>(
      '/auth/login',
      data: {'identifier': phone, 'password': _password},
    )).data!;

Future<Dio> login(String phone) async {
  final s = await session(phone);
  return Dio(
    BaseOptions(
      baseUrl: Env.apiBase.toString(),
      headers: {'Authorization': 'Bearer ${s['accessToken']}'},
    ),
  );
}

Future<void> pumpFor(WidgetTester t, Duration d) async {
  final end = DateTime.now().add(d);
  while (DateTime.now().isBefore(end)) {
    await t.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
    await t.pump(const Duration(milliseconds: 50));
  }
}

Future<void> tapVisible(WidgetTester t, Finder f) async {
  await t.ensureVisible(f);
  await t.pump(const Duration(milliseconds: 100));
  await t.tap(f);
}

/// Remonte en haut de la liste verticale (l'en-tête défile avec elle).
Future<void> scrollToTop(WidgetTester t) async {
  final vertical = find.byWidgetPredicate(
    (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
  );
  await t.drag(vertical.first, const Offset(0, 3000));
  await t.pump(const Duration(milliseconds: 300));
}

Future<void> waitFor(WidgetTester t, Finder f, {int seconds = 15}) async {
  final end = DateTime.now().add(Duration(seconds: seconds));
  while (DateTime.now().isBefore(end)) {
    await pumpFor(t, const Duration(milliseconds: 200));
    if (f.evaluate().isNotEmpty) return;
  }
  throw TestFailure(
    'Introuvable : $f\n${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().take(30).join(' | ')}',
  );
}

void main() {
  setUpAll(() async {
    HttpOverrides.global = null; // réseau réel (désactivé par défaut en test)
    Intl.defaultLocale = 'fr';
    await initializeDateFormatting('fr');
  });

  testWidgets('commande à emporter : accepter → préparer → prête → remise', (
    t,
  ) async {
    late Dio client;
    late Dio restaurant;
    late String restaurantId;
    late String orderId;
    late Json appSession;
    await t.runAsync(() async {
      client = await login('+22890100001');
      restaurant = await login('+22890200001');
      final me = (await restaurant.get<Json>('/users/me')).data!;
      restaurantId = ((me['restaurants'] as List).first as Map)['id'] as String;
      // Session de l'application (le même compte, via la vraie route).
      appSession = await session('+22890200001');
      // Hors horaires (tests de nuit) : on ouvre toute la journée du jour
      // courant, puis on RESTAURE exactement les horaires d'origine.
      final profile = (await restaurant.get<Json>(
        '/restaurant/$restaurantId',
      )).data!;
      final original = (profile['hours'] as List).cast<Json>();
      final today = DateTime.now().toUtc().weekday; // Lomé = UTC
      await restaurant.put<dynamic>(
        '/restaurant/$restaurantId/hours',
        data: {
          'ranges': [
            ...original.where((h) => h['dayOfWeek'] != today),
            {'dayOfWeek': today, 'opensAt': '00:00', 'closesAt': '23:59'},
          ],
        },
      );
      addTearDown(() async {
        await restaurant.put<dynamic>(
          '/restaurant/$restaurantId/hours',
          data: {'ranges': original},
        );
      });
      // Le client commande à emporter (paiement à la livraison).
      final menu = (await client.get<Json>(
        '/restaurants/$restaurantId/menu',
      )).data!;
      final items = (menu['categories'] as List)
          .expand((c) => (c as Map)['items'] as List)
          .cast<Json>();
      final item = items.firstWhere(
        (i) => (i['optionGroups'] as List).isEmpty && i['isAvailable'] == true,
      );
      await client.delete<dynamic>('/cart');
      await client.post<dynamic>(
        '/cart/items',
        data: {'menuItemId': item['id'], 'quantity': 1},
      );
      final order = (await client.post<Json>(
        '/orders',
        data: {'deliveryType': 'PICKUP', 'paymentMethod': 'CASH_ON_DELIVERY'},
      )).data!;
      orderId = order['id'] as String;
      // Nettoyage : seule CETTE commande de test, si elle n'est pas terminée.
      addTearDown(() async {
        final o = (await restaurant.get<Json>('/orders/$orderId')).data!;
        final path = switch (o['status']) {
          'PENDING' => 'reject',
          'ACCEPTED' || 'PREPARING' => 'cancel',
          'READY' => 'hand-over', // à emporter : ne s'annule plus
          _ => null,
        };
        if (path != null) {
          await restaurant.post<dynamic>(
            '/restaurant/$restaurantId/orders/$orderId/$path',
            data: path == 'hand-over'
                ? null
                : {'reason': 'Commande de test automatisé'},
          );
        }
      });
    });
    final number = await t.runAsync(
      () async =>
          ((await client.get<Json>('/orders/$orderId')).data!)['orderNumber'],
    );

    final store = MemoryTokenStore();
    await t.runAsync(
      () => store.write(
        AuthTokens(
          accessToken: appSession['accessToken'] as String,
          refreshToken: appSession['refreshToken'] as String,
        ),
      ),
    );
    await pumpScreen(
      t,
      const OrdersScreen(),
      overrides: [
        tokenStoreProvider.overrideWithValue(store),
        realtimeEventsProvider.overrideWith((ref) => const Stream.empty()),
        unreadNotificationsProvider.overrideWith((ref) async => 0),
      ],
    );
    await waitFor(t, find.text('#$number'));
    await waitFor(t, find.text('Accepter'));

    // Acceptation réelle.
    final card = find.ancestor(
      of: find.text('#$number'),
      matching: find.byType(OrderCard),
    );
    await tapVisible(
      t,
      find.descendant(of: card, matching: find.text('Accepter')),
    );
    await pumpFor(t, const Duration(seconds: 2));
    var server = await t.runAsync(
      () async =>
          ((await restaurant.get<Json>('/orders/$orderId')).data!)['status'],
    );
    expect(server, 'ACCEPTED');

    // Onglet « En cuisine » → lancer la préparation → prête.
    await scrollToTop(t);
    await t.tap(find.textContaining('En cuisine'));
    await waitFor(t, find.text('Lancer la préparation'));
    await tapVisible(t, find.text('Lancer la préparation'));
    await pumpFor(t, const Duration(seconds: 2));
    server = await t.runAsync(
      () async =>
          ((await restaurant.get<Json>('/orders/$orderId')).data!)['status'],
    );
    expect(server, 'PREPARING');
    await waitFor(t, find.text('Prête pour le retrait'));
    await tapVisible(t, find.text('Prête pour le retrait'));
    await pumpFor(t, const Duration(seconds: 2));
    server = await t.runAsync(
      () async =>
          ((await restaurant.get<Json>('/orders/$orderId')).data!)['status'],
    );
    expect(server, 'READY');

    // Prêtes → remise au client.
    await scrollToTop(t);
    await t.scrollUntilVisible(
      find.textContaining('Prêtes'),
      200,
      scrollable: find.byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.right,
      ),
    );
    await t.tap(find.textContaining('Prêtes'));
    await waitFor(t, find.text('Remise au client'));
    await tapVisible(t, find.text('Remise au client'));
    await pumpFor(t, const Duration(seconds: 2));
    server = await t.runAsync(
      () async =>
          ((await client.get<Json>('/orders/$orderId')).data!)['status'],
    );
    expect(server, 'DELIVERED');
  });

  testWidgets('isolation : un autre restaurant est inaccessible', (t) async {
    await t.runAsync(() async {
      final restaurant = await login('+22890200001');
      final store = MemoryTokenStore();
      final res = await session('+22890200001');
      await store.write(
        AuthTokens(
          accessToken: res['accessToken'] as String,
          refreshToken: res['refreshToken'] as String,
        ),
      );
      final mine =
          ((await restaurant.get<Json>('/users/me')).data!['restaurants']
                      as List)
                  .first
              as Map;
      final others =
          (await Dio(BaseOptions(baseUrl: Env.apiBase.toString())).get<Json>(
                '/restaurants',
                queryParameters: {'limit': 30},
              )).data!['items']
              as List;
      final other = others.cast<Json>().firstWhere(
        (r) => r['id'] != mine['id'],
      );
      final api = RestaurantRepository(ProviderContainerHelper.api(store));
      for (final call in <Future<Object?> Function()>[
        () => api.dashboard(other['id'] as String),
        () => api.orders(other['id'] as String, active: true),
        () => api.menu(other['id'] as String),
        () => api.update(other['id'] as String, {'isPaused': true}),
      ]) {
        await expectLater(
          call(),
          throwsA(
            isA<ApiException>().having(
              (e) => e.kind,
              'kind',
              ApiErrorKind.notFound,
            ),
          ),
        );
      }
    });
  });
}

/// Client HTTP de l'application avec une session en mémoire.
abstract final class ProviderContainerHelper {
  static ApiClient api(TokenStore store) {
    final c = ProviderContainer(
      overrides: [tokenStoreProvider.overrideWithValue(store)],
    );
    addTearDown(c.dispose);
    return c.read(apiClientProvider);
  }
}
