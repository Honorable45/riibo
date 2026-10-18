import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:riiberaka_client/features/cart/cart_controller.dart';
import 'package:riiberaka_client/features/catalog/widgets/restaurant_card.dart';

import 'support/harness.dart';
import 'support/screenshots.dart';

/// Parcours réel restaurant → plat → panier, contre le backend local
/// (données de démonstration). Modifie le panier du compte de démo.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(initIntegration);

  Future<void> openChezMaman(WidgetTester tester) async {
    await pumpUntilFound(tester, find.text('À commander maintenant'));
    final card = find.widgetWithText(RestaurantCard, 'Chez Maman');
    await tester.scrollUntilVisible(
      card,
      300,
      scrollable: verticalScrollable.first,
    );
    await tester.tap(card);
    await pumpUntilFound(tester, find.text('Poulet braisé'));
    await settle(tester);
  }

  testWidgets('fiche restaurant et plat avec options (sans compte)', (
    tester,
  ) async {
    useViewport(tester);
    await launchApp(tester);
    await openChezMaman(tester);
    expect(find.text('Préparation'), findsOneWidget);
    await takeScreenshot(tester, 'restaurant_top');

    await tapVisible(tester, find.text('Poulet braisé'));
    await settle(tester);
    expect(find.text('Choisissez « Accompagnement ».'), findsOneWidget);
    await tapVisible(tester, find.text('Frites'));
    await tapVisible(tester, find.text('Œuf'));
    await settle(tester);
    // 2 500 + 300 (frites) + 200 (œuf), prix du menu réel.
    expect(find.text('3 000 F'), findsOneWidget);
    await takeScreenshot(tester, 'dish_sheet');

    // Ajout sans compte : la connexion est demandée au bon moment.
    await tester.tap(find.text('Ajouter'));
    await settle(tester);
    expect(find.text('Votre numéro de téléphone'), findsOneWidget);
    await takeScreenshot(tester, 'login_phone');
    await tester.tap(find.byTooltip('Fermer'));
    await settle(tester);
    expect(find.text('Accompagnement'), findsOneWidget);
  });

  testWidgets(
    'panier réel : ajout, quantité recalculée par le serveur, retrait',
    (tester) async {
      useViewport(tester);
      await launchApp(tester);
      await signInAsDemoClient(tester);
      final container = appContainer(tester);
      await tester.runAsync(
        () => container.read(cartProvider.notifier).clear(),
      );
      await settle(tester);

      await openChezMaman(tester);
      await tester.tap(find.text('Poulet braisé'));
      await settle(tester);
      await tester.tap(find.text('Frites'));
      await settle(tester);
      await tester.tap(find.text('Ajouter'));
      await pumpUntilFound(tester, find.textContaining('ajouté au panier'));

      final cart = container.read(cartProvider).value!;
      expect(cart.items.single.unitPrice, 2800); // calculé par le serveur
      expect(cart.subtotal, 2800);

      // Action « Voir » de la confirmation d'ajout.
      await tester.tap(find.text('Voir'));
      await pumpUntilFound(tester, find.text('Total estimé'));
      await takeScreenshot(tester, 'cart');

      await tester.tap(find.byTooltip('Augmenter'));
      await settle(tester, const Duration(seconds: 2));
      expect(container.read(cartProvider).value!.subtotal, 5600);

      await tester.tap(find.byTooltip('Diminuer'));
      await settle(tester, const Duration(seconds: 2));
      await tester.tap(find.byTooltip('Retirer'));
      await pumpUntilFound(tester, find.text('Votre panier est vide'));
      expect(container.read(cartProvider).value!.isEmpty, isTrue);
    },
  );
}
