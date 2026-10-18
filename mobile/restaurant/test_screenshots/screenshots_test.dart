// Génère des captures d'écran de l'application restaurant SANS téléphone :
// rendu Flutter réel (vraies polices, vrai thème) avec des données de
// DÉMONSTRATION (formes des réponses réelles du backend).
//
//   flutter test test_screenshots --update-goldens \
//     --dart-define=SHOTS_DIR=/chemin/vers/dossier
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_restaurant/features/auth/login_screen.dart';
import 'package:riiberaka_restaurant/features/menu/item_editor_screen.dart';
import 'package:riiberaka_restaurant/features/menu/menu_screen.dart';
import 'package:riiberaka_restaurant/features/more/more_screen.dart';
import 'package:riiberaka_restaurant/features/more/reviews_screen.dart';
import 'package:riiberaka_restaurant/features/more/stats_screen.dart';
import 'package:riiberaka_restaurant/features/orders/order_detail_screen.dart';
import 'package:riiberaka_restaurant/features/orders/orders_screen.dart';
import 'package:riiberaka_restaurant/features/settings/hours_screen.dart';
import 'package:riiberaka_restaurant/features/settings/settings_screen.dart';
import 'package:riiberaka_restaurant/features/shared/models.dart';

import '../test/support/fakes.dart';

const shotsDir = String.fromEnvironment(
  'SHOTS_DIR',
  defaultValue: '/tmp/riiberaka_shots',
);

Future<void> loadFonts() async {
  final nunito = FontLoader('NunitoSans');
  for (final w in [400, 500, 600, 700, 800]) {
    nunito.addFont(
      File(
        'assets/fonts/NunitoSans-$w.ttf',
      ).readAsBytes().then((b) => ByteData.view(b.buffer)),
    );
  }
  await nunito.load();
  final home =
      Platform.environment['FLUTTER_ROOT'] ??
      '${Platform.environment['HOME']}/development/flutter';
  final icons = FontLoader('MaterialIcons')
    ..addFont(
      File(
        '$home/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
      ).readAsBytes().then((b) => ByteData.view(b.buffer)),
    );
  await icons.load();
}

/// Plusieurs commandes de démonstration réparties dans les colonnes.
class _ShotRepo extends FakeRepo {
  _ShotRepo()
    : super(
        active: [
          orderJson(id: 'o31', number: 31),
          orderJson(id: 'o30', number: 30, type: 'PICKUP')
            ..['notes'] = null
            ..['items'] = [
              {
                'name': 'Riz gras',
                'quantity': 2,
                'options': <Json>[],
                'note': null,
                'lineTotal': 3000,
              },
            ],
          orderJson(id: 'o29', number: 29, status: 'PREPARING'),
          orderJson(id: 'o28', number: 28, status: 'READY'),
        ],
      );

  @override
  Future<CursorPage<Review>> reviews(String id, {String? cursor}) async =>
      CursorPage(
        items: [
          Review.fromJson({
            'id': 'v1',
            'rating': 5,
            'comment': 'Poulet bien braisé, livré chaud. Merci !',
            'reply': 'Merci Jean, à bientôt chez Maman !',
            'author': 'Jean',
            'orderNumber': 19,
            'createdAt': '2026-10-15T12:30:00Z',
          }),
          Review.fromJson({
            'id': 'v2',
            'rating': 4,
            'comment': 'Bon, mais un peu d’attente.',
            'reply': null,
            'author': 'Afi',
            'orderNumber': 17,
            'createdAt': '2026-10-12T19:05:00Z',
          }),
        ],
        nextCursor: null,
      );
}

Future<void> shoot(WidgetTester tester, String name) async {
  await settle(tester, 20);
  await expectLater(
    find.byType(MaterialApp),
    matchesGoldenFile('$shotsDir/$name.png'),
  );
}

void main() {
  setUpAll(loadFonts);

  Future<void> show(WidgetTester t, Widget screen, {bool dark = false}) async {
    await pumpScreen(t, screen, overrides: overrides(_ShotRepo()), dark: dark);
    await settle(t, 20);
  }

  testWidgets('01 commandes', (t) async {
    await show(t, const OrdersScreen());
    await shoot(t, 'resto_01_commandes');
    await t.tap(find.text('Refuser').first);
    await shoot(t, 'resto_02_refus_motif');
  });

  testWidgets('03 détail commande', (t) async {
    await show(t, const OrderDetailScreen(orderId: 'o31'));
    await shoot(t, 'resto_03_detail');
  });

  testWidgets('04 menu', (t) async {
    await show(t, const MenuScreen());
    await shoot(t, 'resto_04_menu');
  });

  testWidgets('05 plat', (t) async {
    await show(t, const ItemEditorScreen(itemId: 'i1'));
    await shoot(t, 'resto_05_plat');
  });

  testWidgets('06 établissement', (t) async {
    await show(t, const SettingsScreen());
    await shoot(t, 'resto_06_etablissement');
  });

  testWidgets('07 horaires', (t) async {
    await show(t, const HoursScreen());
    await shoot(t, 'resto_07_horaires');
  });

  testWidgets('08 statistiques', (t) async {
    await show(t, const StatsScreen());
    await shoot(t, 'resto_08_statistiques');
  });

  testWidgets('09 avis', (t) async {
    await show(t, const ReviewsScreen());
    await shoot(t, 'resto_09_avis');
  });

  testWidgets('10 plus', (t) async {
    await show(t, const MoreScreen());
    await shoot(t, 'resto_10_plus');
  });

  testWidgets('11 connexion', (t) async {
    await show(t, const LoginScreen());
    await shoot(t, 'resto_11_connexion');
  });

  testWidgets('12 commandes sombre', (t) async {
    await show(t, const OrdersScreen(), dark: true);
    await shoot(t, 'resto_12_commandes_sombre');
  });
}
