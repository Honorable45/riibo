import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_client/features/catalog/catalog_models.dart';
import 'package:riiberaka_client/features/catalog/catalog_repository.dart';
import 'package:riiberaka_client/features/catalog/widgets/catalog_labels.dart';
import 'package:riiberaka_client/features/home/home_screen.dart';
import 'package:riiberaka_client/features/search/search_screen.dart';

import '../support/app_harness.dart';
import '../support/fake_catalog.dart';

final _vertical = find
    .byWidgetPredicate(
      (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
    )
    .first;

void main() {
  group('Modèles du catalogue', () {
    test('lit une carte restaurant réelle', () {
      final r = RestaurantSummary.fromJson(restaurantJson(distanceKm: 2.4));
      expect(r.name, 'Chez Maman');
      expect(r.place, 'Agoè, Lomé');
      expect(r.prepTimeLabel, '20–35 min');
      expect(r.categories.map((c) => c.slug), ['poulet', 'riz']);
      expect(r.distanceKm, 2.4);
    });

    test('« près de moi » est ignoré sans position', () {
      const withoutPosition = RestaurantQuery(sort: RestaurantSort.nearest);
      expect(withoutPosition.toQuery(page: 1, limit: 20)['sort'], isNull);
      const withPosition = RestaurantQuery(
        sort: RestaurantSort.nearest,
        latitude: 6.2,
        longitude: 1.2,
      );
      final q = withPosition.toQuery(page: 1, limit: 20);
      expect(q['sort'], 'nearest');
      expect(q['lat'], 6.2);
    });

    test('libellés', () {
      expect(deliveryFeeLabel(0), 'Livraison offerte');
      expect(deliveryFeeLabel(1000), 'Livraison 1 000 F');
      expect(distanceLabel(0.45), '450 m');
      expect(distanceLabel(2.36), '2,4 km');
      expect(closedReasonLabel('PAUSED'), 'Pause momentanée');
      expect(closedReasonLabel('OUTSIDE_HOURS'), 'Fermé pour le moment');
    });
  });

  group('Accueil', () {
    testWidgets('affiche catégories, plats et restaurants réels du dépôt', (
      tester,
    ) async {
      final repo = FakeCatalogRepository();
      await pumpScreen(
        tester,
        const HomeScreen(),
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      await settle(tester);

      expect(find.text('Choisir un lieu'), findsOneWidget);
      expect(find.text('Poulet'), findsOneWidget);
      expect(find.text('À commander maintenant'), findsOneWidget);
      expect(find.text('Demi-poulet'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Livraison 1 000 F'),
        200,
        scrollable: _vertical,
      );
      expect(find.text('Chez Maman'), findsWidgets);
      expect(find.text('20–35 min'), findsOneWidget);
    });

    testWidgets('restaurant fermé : étiquette explicite', (tester) async {
      final repo = FakeCatalogRepository(
        restaurants: [
          RestaurantSummary.fromJson(
            restaurantJson(isOpen: false, closedReason: 'PAUSED'),
          ),
        ],
        dishes: const [],
      );
      await pumpScreen(
        tester,
        const HomeScreen(),
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      await settle(tester);
      await tester.scrollUntilVisible(
        find.text('Pause momentanée'),
        200,
        scrollable: _vertical,
      );
      expect(find.text('Pause momentanée'), findsOneWidget);
    });

    testWidgets('choisir une catégorie filtre la requête serveur', (
      tester,
    ) async {
      final repo = FakeCatalogRepository();
      await pumpScreen(
        tester,
        const HomeScreen(),
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      await settle(tester);
      await tester.tap(find.text('Riz'));
      await settle(tester);
      expect(repo.restaurantQueries.last.category, 'riz');
      expect(repo.dishQueries.last.category, 'riz');
    });

    testWidgets('« Ouverts maintenant » est transmis au serveur', (
      tester,
    ) async {
      final repo = FakeCatalogRepository();
      await pumpScreen(
        tester,
        const HomeScreen(),
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      await settle(tester);
      await tester.scrollUntilVisible(
        find.text('Ouverts maintenant'),
        200,
        scrollable: _vertical,
      );
      await tester.tap(find.text('Ouverts maintenant'));
      await settle(tester);
      expect(repo.restaurantQueries.last.openNow, isTrue);
    });

    testWidgets('liste vide : message clair', (tester) async {
      final repo = FakeCatalogRepository(
        restaurants: const [],
        dishes: const [],
      );
      await pumpScreen(
        tester,
        const HomeScreen(),
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      await settle(tester);
      await tester.scrollUntilVisible(
        find.text('Aucun restaurant disponible'),
        200,
        scrollable: _vertical,
      );
      expect(find.text('Aucun restaurant disponible'), findsOneWidget);
    });

    testWidgets('hors ligne : erreur puis réessai réussi', (tester) async {
      final repo = FakeCatalogRepository()
        ..failure = const ApiException(
          ApiErrorKind.offline,
          'Connexion impossible. Vérifiez votre accès à Internet.',
        );
      await pumpScreen(
        tester,
        const HomeScreen(),
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      await settle(tester);
      await tester.scrollUntilVisible(
        find.text('Pas de connexion'),
        200,
        scrollable: _vertical,
      );
      expect(find.text('Pas de connexion'), findsOneWidget);

      repo.failure = null;
      await tester.tap(find.text('Réessayer'));
      await settle(tester);
      expect(find.text('Pas de connexion'), findsNothing);
      expect(find.text('Chez Maman'), findsWidgets);
    });

    testWidgets('petit écran (320 px) : aucun débordement', (tester) async {
      await pumpScreen(
        tester,
        const HomeScreen(),
        overrides: [
          catalogRepositoryProvider.overrideWithValue(FakeCatalogRepository()),
        ],
        size: const Size(320, 568),
      );
      await settle(tester);
      expect(tester.takeException(), isNull);
    });
  });

  group('Recherche', () {
    testWidgets('interroge le serveur après le délai de frappe', (
      tester,
    ) async {
      final repo = FakeCatalogRepository(
        dishes: [
          DishSummary.fromJson(dishJson()),
          DishSummary.fromJson(
            dishJson(id: 'd2', name: 'Riz gras', price: 1500),
          ),
        ],
      );
      await pumpScreen(
        tester,
        const SearchScreen(),
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      await settle(tester);
      expect(find.text('Que voulez-vous manger ?'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'poulet');
      await tester.pump(const Duration(milliseconds: 100));
      expect(repo.dishQueries.where((q) => q.text == 'poulet'), isEmpty);

      await tester.pump(const Duration(milliseconds: 400));
      await settle(tester);
      expect(repo.dishQueries.last.text, 'poulet');
      expect(find.text('Demi-poulet'), findsOneWidget);
      expect(find.text('Riz gras'), findsNothing);

      await tester.tap(find.text('Restaurants'));
      await settle(tester);
      expect(repo.restaurantQueries.last.text, 'poulet');
      expect(find.text('Chez Maman'), findsWidgets);
    });

    testWidgets('aucun résultat : message', (tester) async {
      await pumpScreen(
        tester,
        const SearchScreen(),
        overrides: [
          catalogRepositoryProvider.overrideWithValue(FakeCatalogRepository()),
        ],
      );
      await settle(tester);
      await tester.enterText(find.byType(TextField), 'sushi');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await settle(tester);
      expect(find.text('Aucun plat trouvé'), findsOneWidget);
    });
  });
}
