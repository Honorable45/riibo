import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:riiberaka_core/app/config/env.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'package:riiberaka_livreur/app/app.dart';
import 'package:riiberaka_livreur/features/driver/driver_providers.dart';

import 'support/screenshots.dart';

/// Parcours RÉEL de bout en bout contre le backend local (données de démo,
/// jamais la production). Le client et le restaurant de démonstration
/// agissent via l'API, comme le feraient leurs applications ; le livreur
/// agit dans l'application.
const _password = 'demo12345';
const _driver = '+22890300001';
const _client = '+22890100001';
const _restaurant = '+22890200001';

class Actor {
  Actor(this.dio);
  final Dio dio;

  static Future<Actor> login(String phone) async {
    final dio = Dio(BaseOptions(baseUrl: Env.apiBase.toString()));
    final res = await dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'identifier': phone, 'password': _password},
    );
    dio.options.headers['Authorization'] = 'Bearer ${res.data!['accessToken']}';
    return Actor(dio);
  }

  Future<Map<String, dynamic>> get(String path) async =>
      (await dio.get<Map<String, dynamic>>(path)).data!;
  Future<dynamic> post(String path, [Object? body]) async =>
      (await dio.post<dynamic>(path, data: body ?? <String, dynamic>{})).data;
}

Future<void> pumpUntil(
  WidgetTester tester,
  Finder finder, {
  int seconds = 40,
}) async {
  final end = DateTime.now().add(Duration(seconds: seconds));
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isNotEmpty) return;
  }
  final visible = find
      .byType(Text)
      .evaluate()
      .map((e) => (e.widget as Text).data)
      .whereType<String>()
      .take(30)
      .join(' | ');
  throw TestFailure(
    'Introuvable après ${seconds}s : $finder\nÀ l’écran : $visible',
  );
}

Future<void> settle(WidgetTester tester, [int ms = 800]) async {
  for (var i = 0; i < ms ~/ 50; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      finder,
      250,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 40,
    );
  }
  await tester.ensureVisible(finder.first);
  await settle(tester, 300);
  await tester.tap(finder.first);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    Intl.defaultLocale = 'fr';
    await initializeDateFormatting('fr');
  });

  testWidgets('offre → acceptation → retrait → remise → historique', (
    tester,
  ) async {
    late Actor client;
    late Actor restaurant;
    late String restaurantId;
    late String menuItemId;
    late double rLat;
    late double rLng;

    await tester.runAsync(() async {
      client = await Actor.login(_client);
      restaurant = await Actor.login(_restaurant);
      final me = await restaurant.get('/users/me');
      restaurantId = ((me['restaurants'] as List).first as Map)['id'] as String;
      final detail = await client.get('/restaurants/$restaurantId');
      rLat = (detail['latitude'] as num).toDouble();
      rLng = (detail['longitude'] as num).toDouble();
      final menu = await client.get('/restaurants/$restaurantId/menu');
      final items = (menu['categories'] as List)
          .expand((c) => (c as Map)['items'] as List)
          .cast<Map<String, dynamic>>();
      menuItemId =
          items.firstWhere(
                (i) =>
                    (i['optionGroups'] as List).isEmpty &&
                    i['isAvailable'] == true,
              )['id']
              as String;
    });

    // --- Livreur : application, connexion réelle au compte de démo.
    await tester.pumpWidget(
      withScreenshotBoundary(
        ProviderScope(retry: (_, _) => null, child: const LivreurApp()),
      ),
    );
    await settle(tester);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(Navigator).first),
    );
    await tester.runAsync(() async {
      final res = await container
          .read(apiClientProvider)
          .post<Map<String, dynamic>>(
            '/auth/login',
            body: {'identifier': _driver, 'password': _password},
          );
      await container.read(sessionProvider.notifier).signIn(res);
    });
    await pumpUntil(tester, find.text('Passer en ligne'));
    await takeScreenshot(tester, 'dashboard_offline');

    await tester.tap(find.text('Passer en ligne'));
    await pumpUntil(tester, find.text('En ligne'));
    // Position de test placée au restaurant (le GPS réel du téléphone peut
    // être ailleurs que Lomé) : envoi par l'API réelle du livreur.
    await tester.runAsync(
      () => container
          .read(apiClientProvider)
          .post<void>(
            '/driver/location',
            body: {'latitude': rLat, 'longitude': rLng},
          ),
    );
    await takeScreenshot(tester, 'dashboard_online');

    // --- Client : commande réelle (paiement à la livraison).
    late String orderId;
    await tester.runAsync(() async {
      await client.dio.delete<dynamic>('/cart');
      await client.post('/cart/items', {
        'menuItemId': menuItemId,
        'quantity': 2,
      });
      final address = await client.post('/addresses', {
        'label': 'AUTRE',
        'customLabel': 'Test livreur',
        'fullAddress': 'Adresse de test livreur',
        'quarter': 'Agoè',
        'landmark': 'Repère de test',
        'latitude': rLat + 0.006,
        'longitude': rLng + 0.006,
      });
      final order = await client.post('/orders', {
        'deliveryType': 'DELIVERY',
        'paymentMethod': 'CASH_ON_DELIVERY',
        'addressId': (address as Map)['id'],
      });
      orderId = (order as Map)['id'] as String;
      // --- Restaurant : accepte puis prépare → le dispatch réel démarre.
      await restaurant.post('/restaurant/$restaurantId/orders/$orderId/accept');
      await restaurant.post(
        '/restaurant/$restaurantId/orders/$orderId/start-preparing',
      );
    });

    // L'offre arrive (temps réel ou relecture), avec son compte à rebours.
    await pumpUntil(tester, find.text('Accepter'), seconds: 45);
    await takeScreenshot(tester, 'offer');
    await tester.tap(find.text('Accepter'));
    await pumpUntil(tester, find.text('Étape 1 sur 2'));
    expect(find.text('Allez au restaurant'), findsOneWidget);
    await takeScreenshot(tester, 'course_restaurant');

    // Commande pas encore prête : la collecte n'est pas proposée.
    expect(find.text('Saisir le code de retrait'), findsNothing);
    await tester.tap(find.text('Je suis au restaurant'));
    await pumpUntil(tester, find.text('Commande en préparation…'));

    // --- Restaurant : commande prête → la course passe à « assignée ».
    late String pickupCode;
    late String deliveryCode;
    await tester.runAsync(() async {
      await restaurant.post('/restaurant/$restaurantId/orders/$orderId/ready');
      final asRestaurant = await restaurant.get('/orders/$orderId');
      pickupCode = (asRestaurant['delivery'] as Map)['pickupCode'] as String;
      final asClient = await client.get('/orders/$orderId');
      deliveryCode = (asClient['delivery'] as Map)['deliveryCode'] as String;
    });
    container.invalidate(currentDeliveryProvider);
    await pumpUntil(tester, find.text('Saisir le code de retrait'));

    // Mauvais code : refusé par le serveur.
    await tester.tap(find.text('Saisir le code de retrait'));
    await settle(tester);
    final wrong = pickupCode == '000000' ? '111111' : '000000';
    await tester.enterText(find.byType(TextField).last, wrong);
    await pumpUntil(tester, find.textContaining('Code incorrect'));
    await tester.enterText(find.byType(TextField).last, pickupCode);
    await pumpUntil(tester, find.text('Étape 2 sur 2'));
    expect(find.textContaining('À encaisser'), findsOneWidget);
    await takeScreenshot(tester, 'course_client');

    await tester.tap(find.text('Je suis arrivé'));
    await pumpUntil(tester, find.text('Remettez la commande'));
    await tester.tap(find.text('Saisir le code de remise'));
    await settle(tester);
    await tester.enterText(find.byType(TextField).last, deliveryCode);
    await pumpUntil(tester, find.text('Course livrée'));
    await takeScreenshot(tester, 'delivered');

    // Vérification serveur : commande livrée.
    await tester.runAsync(() async {
      final finalOrder = await client.get('/orders/$orderId');
      expect(finalOrder['status'], 'DELIVERED');
    });

    // Historique : la course apparaît.
    await tester.tap(find.text('Retour aux courses'));
    await settle(tester);
    await tester.tap(find.text('Historique').last);
    await pumpUntil(tester, find.text('Aujourd’hui'));
    await takeScreenshot(tester, 'history');

    // Repasser hors ligne (aucune course en cours) et nettoyer l'adresse de test.
    await tester.tap(find.text('Courses').last);
    await pumpUntil(tester, find.text('Passer hors ligne'));
    await tester.tap(find.text('Passer hors ligne'));
    await pumpUntil(tester, find.text('Hors ligne'));
    await tester.runAsync(() async {
      final list = await client.dio.get<List<dynamic>>('/addresses');
      for (final a in list.data!.cast<Map<String, dynamic>>()) {
        if (a['customLabel'] == 'Test livreur') {
          await client.dio.delete<dynamic>('/addresses/${a['id']}');
        }
      }
    });
  });
}
