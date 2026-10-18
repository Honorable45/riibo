import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:riiberaka_client/features/catalog/widgets/restaurant_card.dart';

import 'support/harness.dart';
import 'support/screenshots.dart';

/// Tests d'intégration RÉELS : application complète contre le backend
/// désigné par API_BASE_URL (aucun mock). Données attendues : jeu de
/// démonstration du backend (`SEED_DEMO=true`).
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(initIntegration);

  testWidgets('navigation : onglets et retour', (tester) async {
    useViewport(tester);
    await launchApp(tester);
    await pumpUntilFound(tester, find.text('Livrer à'));

    await tester.tap(find.text('Recherche').last);
    await settle(tester);
    expect(find.text('Que voulez-vous manger ?'), findsOneWidget);

    await tester.tap(find.text('Commandes').last);
    await settle(tester);
    await tester.tap(find.text('Compte').last);
    await settle(tester);

    // Catalogue du design (debug) puis retour visible et retour système.
    await tester.tap(find.text('Système de design'));
    await settle(tester);
    await tester.tap(find.byTooltip('Retour'));
    await settle(tester);
    expect(find.text('Système de design'), findsOneWidget);
    await tester.tap(find.text('Système de design'));
    await settle(tester);
    await tester.binding.handlePopRoute();
    await settle(tester);
    expect(find.text('Système de design'), findsOneWidget);

    await tester.tap(find.text('Accueil').last);
    await settle(tester);
    expect(find.text('Livrer à'), findsOneWidget);
  });

  testWidgets('accueil : données réelles du backend', (tester) async {
    useViewport(tester);
    await launchApp(tester);
    await pumpUntilFound(tester, find.text('À commander maintenant'));
    await takeScreenshot(tester, 'home_top');

    await tester.scrollUntilVisible(
      find.widgetWithText(RestaurantCard, 'Chez Maman'),
      300,
      scrollable: verticalScrollable.first,
    );
    await settle(tester);
    await takeScreenshot(tester, 'home_restaurants');

    // Filtre réel « Ouverts maintenant » : la liste se recharge sans erreur.
    await tester.scrollUntilVisible(
      find.text('Ouverts maintenant'),
      -200,
      scrollable: verticalScrollable.first,
    );
    await tester.tap(find.text('Ouverts maintenant'));
    await settle(tester, const Duration(seconds: 2));
    expect(find.text('Chargement impossible'), findsNothing);
    expect(find.text('Pas de connexion'), findsNothing);
  });

  testWidgets('recherche réelle : « poulet »', (tester) async {
    useViewport(tester);
    await launchApp(tester);
    await tester.tap(find.text('Recherche').last);
    await settle(tester);
    await tester.enterText(find.byType(TextField), 'poulet');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await pumpUntilFound(tester, find.text('Demi-poulet'));
    await takeScreenshot(tester, 'search_dishes');

    await tester.tap(find.text('Restaurants'));
    await pumpUntilFound(
      tester,
      find.widgetWithText(RestaurantCard, 'Le Roi du Poulet'),
    );
    await takeScreenshot(tester, 'search_restaurants');
  });

  testWidgets('petit écran 320 × 640 et mode sombre', (tester) async {
    useViewport(tester, logical: const Size(320, 640));
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await launchApp(tester);
    await pumpUntilFound(tester, find.text('À commander maintenant'));
    expect(tester.takeException(), isNull);
    await takeScreenshot(tester, 'home_small_dark');
  });
}
