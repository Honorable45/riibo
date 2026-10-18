import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:riiberaka_client/app/app.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'screenshots.dart';

/// Taille d'écran : sur un vrai téléphone, celle de l'appareil ; sur le
/// bureau, celle d'un téléphone courant (393 × 852) sauf indication contraire.
void useViewport(WidgetTester tester, {Size? logical}) {
  if (Platform.isAndroid && logical == null) return;
  const ratio = 2.75;
  tester.view.devicePixelRatio = ratio;
  tester.view.physicalSize = (logical ?? const Size(393, 852)) * ratio;
  addTearDown(tester.view.reset);
}

Future<void> initIntegration() async {
  Intl.defaultLocale = 'fr';
  await initializeDateFormatting('fr');
}

/// Lance l'application complète, préférences locales vierges.
Future<void> launchApp(WidgetTester tester) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.clear();
  await tester.pumpWidget(
    withScreenshotBoundary(
      ProviderScope(retry: (_, _) => null, child: const RiiberakaApp()),
    ),
  );
  await settle(tester);
}

/// Attend qu'un élément apparaisse (réponse réseau réelle), sans
/// `pumpAndSettle` qui ne se termine jamais avec un indicateur animé.
Future<void> pumpUntilFound(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 20),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isNotEmpty) return;
  }
  final visible = find
      .byType(Text)
      .evaluate()
      .map(
        (e) =>
            (e.widget as Text).data ??
            (e.widget as Text).textSpan?.toPlainText(),
      )
      .whereType<String>()
      .take(40)
      .join(' | ');
  throw TestFailure(
    'Élément introuvable après $timeout : $finder\nÀ l’écran : $visible',
  );
}

/// Laisse passer les transitions (≈ 0,6 s) sans exiger que TOUTES les
/// animations s'arrêtent : les squelettes de chargement tournent en boucle.
Future<void> settle(
  WidgetTester tester, [
  Duration total = const Duration(milliseconds: 600),
]) async {
  const step = Duration(milliseconds: 50);
  for (var elapsed = Duration.zero; elapsed < total; elapsed += step) {
    await tester.pump(step);
  }
}

final verticalScrollable = find.byWidgetPredicate(
  (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
);

/// Conteneur Riverpod de l'application lancée.
ProviderContainer appContainer(WidgetTester tester) =>
    ProviderScope.containerOf(tester.element(find.byType(Navigator).first));

/// Ouvre une session RÉELLE du compte client de démonstration
/// (`SEED_DEMO=true`, mot de passe de démo) via `POST /auth/login`, puis la
/// confie à l'application exactement comme après une vérification OTP. Sert
/// aux tests sur téléphone, où le code SMS de développement (écrit dans le
/// journal du backend) n'est pas lisible.
Future<void> signInAsDemoClient(WidgetTester tester) async {
  final container = appContainer(tester);
  final api = container.read(apiClientProvider);
  await tester.runAsync(() async {
    final response = await api.post<Map<String, dynamic>>(
      '/auth/login',
      body: {'identifier': demoClientPhone, 'password': 'demo12345'},
    );
    await container.read(sessionProvider.notifier).signIn(response);
  });
  await settle(tester);
}

const demoClientPhone = '+22890100001';

/// Fait défiler jusqu'à l'élément puis le touche (écran réel plus petit que
/// celui des tests de widgets).
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    // Élément pas encore construit (liste paresseuse) : défilement.
    await tester.scrollUntilVisible(
      finder,
      250,
      scrollable: verticalScrollable.last,
      maxScrolls: 40,
    );
  }
  await tester.ensureVisible(finder.first);
  await settle(tester, const Duration(milliseconds: 300));
  await tester.tap(finder.first);
}
