// Captures d'écran de l'application livreur SANS téléphone (rendu Flutter
// réel, données de DÉMONSTRATION aux formes des réponses du backend).
//
//   flutter test test_screenshots --update-goldens --dart-define=SHOTS_DIR=/dossier
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';
import 'package:riiberaka_livreur/features/auth/login_screen.dart';
import 'package:riiberaka_livreur/features/dashboard/dashboard_screen.dart';
import 'package:riiberaka_livreur/features/delivery/active_delivery_screen.dart';
import 'package:riiberaka_livreur/features/delivery/delivery_actions.dart';
import 'package:riiberaka_livreur/features/driver/driver_models.dart';
import 'package:riiberaka_livreur/features/history/history_screen.dart';
import 'package:riiberaka_livreur/features/location/location_tracker.dart';
import 'package:riiberaka_livreur/features/profile/profile_screen.dart';
import 'package:riiberaka_livreur/features/support/support_screen.dart';

import '../test/support/fakes.dart';

const shotsDir = String.fromEnvironment('SHOTS_DIR', defaultValue: '/tmp/riiberaka_shots');

Future<void> loadFonts() async {
  final nunito = FontLoader('NunitoSans');
  for (final w in [400, 500, 600, 700, 800]) {
    nunito.addFont(File('assets/fonts/NunitoSans-$w.ttf').readAsBytes().then((b) => ByteData.view(b.buffer)));
  }
  await nunito.load();
  final home = Platform.environment['FLUTTER_ROOT'] ?? '${Platform.environment['HOME']}/development/flutter';
  await (FontLoader('MaterialIcons')
        ..addFont(
          File('$home/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf')
              .readAsBytes()
              .then((b) => ByteData.view(b.buffer)),
        ))
      .load();
}

class _Repo extends FakeDriverRepository {
  _Repo({super.profile});

  @override
  Future<CursorPage<HistoryEntry>> history({String? cursor}) async {
    final now = DateTime.now().toUtc();
    Json e(String id, int n, String r, Duration ago, {String status = 'DELIVERED'}) => {
      'id': id,
      'status': status,
      'deliveryFee': 1000,
      'createdAt': now.subtract(ago).toIso8601String(),
      'deliveredAt': status == 'DELIVERED' ? now.subtract(ago).toIso8601String() : null,
      'order': {'orderNumber': n, 'restaurant': {'name': r}},
    };
    return CursorPage(
      items: [
        HistoryEntry.fromJson(e('h1', 21, 'Chez Maman', const Duration(minutes: 30))),
        HistoryEntry.fromJson(e('h2', 20, 'Le Roi du Poulet', const Duration(hours: 2))),
        HistoryEntry.fromJson(e('h3', 15, 'Chez Maman', const Duration(days: 1, hours: 3))),
        HistoryEntry.fromJson(e('h4', 14, 'Pizza Palace Tokoin', const Duration(days: 1, hours: 5), status: 'CANCELLED')),
      ],
      nextCursor: null,
    );
  }
}

Future<void> shoot(WidgetTester tester, String name) async {
  await settle(tester, 20);
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('$shotsDir/$name.png'));
}

void stopTracking(WidgetTester tester) {
  ProviderScope.containerOf(tester.element(find.byType(MaterialApp))).read(locationTrackerProvider.notifier).stop();
}

void main() {
  setUpAll(loadFonts);

  Future<void> show(WidgetTester t, Widget screen, _Repo repo, {bool dark = false}) async {
    await pumpScreen(
      t,
      screen,
      dark: dark,
      overrides: [
        ...baseOverrides(repo),
        unreadNotificationsProvider.overrideWith((ref) async => 2),
        deliveryConversationsProvider.overrideWith(
          (ref, id) async => const [
            DeliveryConversation(id: 'c1', kind: 'ORDER_DELIVERY', isClosed: false),
            DeliveryConversation(id: 'c2', kind: 'ORDER_RESTAURANT_DRIVER', isClosed: false),
          ],
        ),
      ],
    );
    await settle(t, 20);
  }

  testWidgets('connexion', (t) async {
    await pumpScreen(
      t,
      const LoginScreen(),
      overrides: [sessionProvider.overrideWith(_Out.new)],
    );
    await shoot(t, 'livreur_01_connexion');
  });

  testWidgets('tableau de bord hors ligne', (t) async {
    await show(t, const DashboardScreen(), _Repo());
    await shoot(t, 'livreur_02_hors_ligne');
  });

  testWidgets('en ligne avec proposition', (t) async {
    final repo = _Repo(profile: profileJson(online: true))..offersData = [offerJson()];
    await show(t, const DashboardScreen(), repo);
    await shoot(t, 'livreur_03_proposition');
    stopTracking(t);
  });

  testWidgets('course : aller au restaurant', (t) async {
    final repo = _Repo(profile: profileJson(online: true, active: 'del1'))..currentData = deliveryJson();
    await show(t, const ActiveDeliveryScreen(), repo);
    await shoot(t, 'livreur_04_course_restaurant');
    stopTracking(t);
  });

  testWidgets('course : code de retrait', (t) async {
    final repo = _Repo(profile: profileJson(online: true, active: 'del1'))
      ..currentData = deliveryJson(status: 'AT_RESTAURANT', orderStatus: 'ASSIGNED');
    await show(t, const ActiveDeliveryScreen(), repo);
    await t.tap(find.text('Saisir le code de retrait'));
    await settle(t, 20);
    await t.enterText(find.byType(TextField).last, '4829');
    await shoot(t, 'livreur_05_code_retrait');
    stopTracking(t);
  });

  testWidgets('course : livrer le client', (t) async {
    final repo = _Repo(profile: profileJson(online: true, active: 'del1'))
      ..currentData = deliveryJson(status: 'ON_THE_WAY', orderStatus: 'ON_THE_WAY');
    await show(t, const ActiveDeliveryScreen(), repo);
    await shoot(t, 'livreur_06_course_client');
    await t.drag(find.byType(ListView).first, const Offset(0, -400));
    await shoot(t, 'livreur_07_course_client_suite');
    stopTracking(t);
  });

  testWidgets('historique', (t) async {
    await show(t, const HistoryScreen(), _Repo());
    await shoot(t, 'livreur_08_historique');
  });

  testWidgets('profil', (t) async {
    await show(t, const ProfileScreen(), _Repo());
    await shoot(t, 'livreur_09_profil');
  });

  testWidgets('assistance', (t) async {
    await show(t, const SupportScreen(), _Repo());
    await shoot(t, 'livreur_10_assistance');
  });

  testWidgets('compte en vérification', (t) async {
    await show(t, const DashboardScreen(), _Repo(profile: profileJson(status: 'IN_REVIEW')));
    await shoot(t, 'livreur_11_compte_en_verification');
  });

  testWidgets('en ligne, sombre', (t) async {
    final repo = _Repo(profile: profileJson(online: true))..offersData = [offerJson()];
    await show(t, const DashboardScreen(), repo, dark: true);
    await shoot(t, 'livreur_12_sombre');
    stopTracking(t);
  });
}

class _Out extends SessionController {
  @override
  SessionState build() => const SignedOut();
}
