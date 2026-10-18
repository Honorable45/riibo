import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/auth/token_store.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'package:riiberaka_client/features/cart/cart_controller.dart';
import 'package:riiberaka_client/features/cart/cart_models.dart';
import 'package:riiberaka_client/features/cart/cart_repository.dart';
import 'package:riiberaka_client/features/cart/cart_screen.dart';
import 'package:riiberaka_client/features/restaurant/dish_selection.dart';
import 'package:riiberaka_client/features/restaurant/restaurant_models.dart';
import 'package:riiberaka_client/features/restaurant/restaurant_repository.dart';
import 'package:riiberaka_client/features/restaurant/restaurant_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/app_harness.dart';
import '../support/fake_restaurant.dart';

/// Session simulée « connecté » (tests de widgets uniquement).
class _SignedInSession extends SessionController {
  @override
  SessionState build() => const SignedIn(
    AuthUser(id: 'u1', firstName: 'Jean', lastName: 'Client', role: 'CLIENT'),
  );
}

class _SignedOutSession extends SessionController {
  @override
  SessionState build() => const SignedOut();
}

void main() {
  final menu = RestaurantMenu.fromJson(menuJson());
  final braise = menu.itemById('braise')!;
  final demi = menu.itemById('demi')!;
  final accompaniment = braise.optionGroups[0];
  final extras = braise.optionGroups[1];
  MenuOption opt(OptionGroup g, String id) =>
      g.options.firstWhere((o) => o.id == id);

  group('Menu', () {
    test('sections vides ignorées, plats sans catégorie à la fin', () {
      expect(menu.sections.map((s) => s.name), ['Poulet', 'Autres plats']);
      expect(menu.itemById('eau')!.price, 300);
    });

    test('règles des groupes d’options', () {
      expect(accompaniment.ruleLabel, 'Obligatoire · 1 au choix');
      expect(extras.ruleLabel, 'Facultatif · jusqu’à 2');
    });
  });

  group('DishSelection (miroir de resolveSelection)', () {
    test('option obligatoire manquante : ajout bloqué', () {
      final s = DishSelection(braise);
      expect(s.isValid, isFalse);
      expect(s.problem, 'Choisissez « Accompagnement ».');
    });

    test('prix : base + suppléments, multiplié par la quantité', () {
      var s = DishSelection(braise)
          .toggle(accompaniment, opt(accompaniment, 'frites'))
          .toggle(extras, opt(extras, 'oeuf'));
      expect(s.unitPrice, 2500 + 300 + 200);
      s = s.withQuantity(3);
      expect(s.total, 3000 * 3);
      expect(s.isValid, isTrue);
      expect(s.orderedOptionIds, ['frites', 'oeuf']);
    });

    test('choix unique : la nouvelle option remplace l’ancienne', () {
      final s = DishSelection(braise)
          .toggle(accompaniment, opt(accompaniment, 'alloco'))
          .toggle(accompaniment, opt(accompaniment, 'attieke'));
      expect(s.optionIds, {'attieke'});
      // Un choix unique obligatoire ne se décoche pas.
      expect(s.toggle(accompaniment, opt(accompaniment, 'attieke')).optionIds, {
        'attieke',
      });
    });

    test('maximum du groupe respecté, option épuisée refusée', () {
      final s = DishSelection(braise)
          .toggle(extras, opt(extras, 'piment'))
          .toggle(extras, opt(extras, 'oeuf'));
      expect(s.canAddMore(extras), isFalse);
      expect(s.toggle(extras, opt(extras, 'avocat')).optionIds, s.optionIds);
    });

    test('quantité bornée par le maximum du plat', () {
      final s = DishSelection(demi).withQuantity(10);
      expect(s.quantity, 3);
      expect(DishSelection(braise).withQuantity(99).quantity, maxLineQuantity);
      expect(DishSelection(demi).withQuantity(0).quantity, 1);
    });

    test('plat indisponible', () {
      final unavailable = RestaurantMenu.fromJson(
        menuJson(braiseAvailable: false),
      ).itemById('braise')!;
      expect(
        DishSelection(unavailable).problem,
        contains('n’est plus disponible'),
      );
    });
  });

  group('Panier', () {
    test('lit un panier serveur avec blocages et ligne en défaut', () {
      final cart = Cart.fromJson(
        cartJson(
          blockers: ['Certains articles ne sont plus disponibles.'],
          canCheckout: false,
          items: [
            {
              'id': 'l1',
              'menuItemId': 'braise',
              'name': 'Poulet braisé',
              'imageUrl': null,
              'quantity': 2,
              'note': 'sans piment',
              'options': <Map<String, dynamic>>[],
              'unitPrice': 2500,
              'lineTotal': 5000,
              'issue': '« Poulet braisé » est épuisé.',
            },
          ],
        ),
      );
      expect(cart.canCheckout, isFalse);
      expect(cart.itemCount, 2);
      expect(cart.items.single.issue, contains('épuisé'));
    });

    ProviderContainer container(FakeCartRepository repo) {
      final c = ProviderContainer(
        overrides: [
          cartRepositoryProvider.overrideWithValue(repo),
          sessionProvider.overrideWith(_SignedInSession.new),
          tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
        ],
        retry: (_, _) => null,
      );
      addTearDown(c.dispose);
      return c;
    }

    test('autre restaurant : remplacement demandé, jamais forcé', () async {
      final repo = FakeCartRepository(Cart.fromJson(cartJson()))
        ..nextError = const ApiException(
          ApiErrorKind.conflict,
          'Votre panier contient des plats d’un autre restaurant.',
          code: 'CART_OTHER_RESTAURANT',
        );
      final c = container(repo);
      await c.read(cartProvider.future);
      final result = await c
          .read(cartProvider.notifier)
          .add(DishSelection(demi));
      expect(result, isA<NeedsReplace>());
      expect((result as NeedsReplace).currentRestaurant, 'Chez Maman');
      expect(repo.calls.where((call) => call.endsWith(':true')), isEmpty);

      final replaced = await c
          .read(cartProvider.notifier)
          .add(DishSelection(demi), replaceCart: true);
      expect(replaced, isA<Added>());
      expect(repo.calls.last, 'add:demi:1::true');
    });

    test('quantité : valeur serveur retenue ; échec → panier relu', () async {
      final repo = FakeCartRepository(Cart.fromJson(cartJson()));
      final c = container(repo);
      await c.read(cartProvider.future);

      final ok = await c.read(cartProvider.notifier).setQuantity('line1', 3);
      expect(ok, isNull);
      expect(c.read(cartProvider).value!.subtotal, 2800 * 3);

      repo.nextError = const ApiException(
        ApiErrorKind.validation,
        '« Poulet braisé » : il n’en reste que 2.',
      );
      final error = await c.read(cartProvider.notifier).setQuantity('line1', 5);
      expect(error!.message, contains('il n’en reste que 2'));
      expect(c.read(cartProvider).value!.items.single.quantity, 3);
      expect(repo.calls.last, 'fetch');
    });

    test('déconnecté : panier vide sans appel serveur', () async {
      final repo = FakeCartRepository(Cart.fromJson(cartJson()));
      final c = ProviderContainer(
        overrides: [
          cartRepositoryProvider.overrideWithValue(repo),
          sessionProvider.overrideWith(_SignedOutSession.new),
        ],
        retry: (_, _) => null,
      );
      addTearDown(c.dispose);
      expect((await c.read(cartProvider.future)).isEmpty, isTrue);
      expect(repo.calls, isEmpty);
    });
  });

  group('Fiche restaurant', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    testWidgets('affiche les infos, le menu, et le plat avec options', (
      tester,
    ) async {
      final repo = FakeRestaurantRepository();
      await pumpScreen(
        tester,
        const RestaurantScreen(slug: 'chez-maman'),
        overrides: [
          restaurantRepositoryProvider.overrideWithValue(repo),
          sessionProvider.overrideWith(_SignedOutSession.new),
        ],
      );
      await settle(tester, 20);
      expect(find.text('Ouvert · jusqu’à 22:00'), findsOneWidget);
      expect(find.text('Préparation'), findsOneWidget);
      expect(find.text('Poulet braisé'), findsOneWidget);
      expect(find.text('Eau minérale'), findsNothing); // plus bas dans la liste

      await tester.tap(find.text('Poulet braisé'));
      await settle(tester, 20);
      expect(find.text('Choisissez « Accompagnement ».'), findsOneWidget);
      final addButton = find.widgetWithText(InkWell, 'Ajouter');
      expect(addButton, findsOneWidget);

      await tester.tap(find.text('Frites'));
      await settle(tester);
      expect(find.text('Choisissez « Accompagnement ».'), findsNothing);
      expect(find.text('2 800 F'), findsOneWidget);

      await tester.tap(find.byTooltip('Augmenter'));
      await settle(tester);
      expect(find.text('5 600 F'), findsOneWidget);
    });

    testWidgets('restaurant fermé : menu consultable, ajout impossible', (
      tester,
    ) async {
      await pumpScreen(
        tester,
        const RestaurantScreen(slug: 'chez-maman', openDishId: 'demi'),
        overrides: [
          restaurantRepositoryProvider.overrideWithValue(
            FakeRestaurantRepository(isOpen: false),
          ),
          sessionProvider.overrideWith(_SignedOutSession.new),
        ],
      );
      await settle(tester, 20);
      // Le plat demandé s'ouvre directement.
      expect(find.textContaining('Le restaurant est fermé'), findsOneWidget);
      final button = tester.widget<InkWell>(
        find.widgetWithText(InkWell, 'Ajouter'),
      );
      expect(button.onTap, isNull);
    });
  });

  group('Écran panier', () {
    testWidgets('blocages serveur visibles et commande désactivée', (
      tester,
    ) async {
      final repo = FakeCartRepository(
        Cart.fromJson(
          cartJson(
            blockers: ['Commande minimum : 5000 F.'],
            canCheckout: false,
          ),
        ),
      );
      await pumpScreen(
        tester,
        const CartScreen(),
        overrides: [
          cartRepositoryProvider.overrideWithValue(repo),
          sessionProvider.overrideWith(_SignedInSession.new),
        ],
      );
      await settle(tester, 20);
      expect(find.text('Commande minimum : 5000 F.'), findsOneWidget);
      expect(find.text('Frites (+300 F)'), findsOneWidget);
      expect(find.text('Commande impossible pour le moment'), findsOneWidget);
    });

    testWidgets('déconnecté : invitation à se connecter', (tester) async {
      await pumpScreen(
        tester,
        const CartScreen(),
        overrides: [sessionProvider.overrideWith(_SignedOutSession.new)],
      );
      await settle(tester);
      expect(find.text('Connectez-vous pour commander'), findsOneWidget);
    });

    testWidgets('retirer la dernière ligne : panier vide', (tester) async {
      final repo = FakeCartRepository(Cart.fromJson(cartJson()));
      await pumpScreen(
        tester,
        const CartScreen(),
        overrides: [
          cartRepositoryProvider.overrideWithValue(repo),
          sessionProvider.overrideWith(_SignedInSession.new),
        ],
      );
      await settle(tester, 20);
      await tester.tap(find.byTooltip('Retirer'));
      await settle(tester, 20);
      expect(repo.calls, contains('remove:line1'));
      expect(find.text('Votre panier est vide'), findsOneWidget);
    });
  });
}
