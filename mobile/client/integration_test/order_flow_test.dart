import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:riiberaka_core/app/config/env.dart';
import 'package:riiberaka_client/features/addresses/address_repository.dart';
import 'package:riiberaka_client/features/cart/cart_controller.dart';
import 'package:riiberaka_client/features/catalog/widgets/restaurant_card.dart';
import 'package:riiberaka_client/features/orders/order_screen.dart';

import 'support/harness.dart';
import 'support/screenshots.dart';

/// Commande RÉELLE de bout en bout (base de développement) : adresse, panier,
/// validation, suivi temps réel (le restaurant de démo accepte via l'API),
/// annulation puis « Commander à nouveau ».
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(initIntegration);

  /// Le restaurant de démonstration agit sur la commande (hors application
  /// client), comme le ferait l'espace restaurant.
  Future<void> restaurantAccepts(String orderId) async {
    final dio = Dio(BaseOptions(baseUrl: Env.apiBase.toString()));
    final login = await dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'identifier': '+22890200001', 'password': 'demo12345'},
    );
    final token = login.data!['accessToken'] as String;
    final auth = Options(headers: {'Authorization': 'Bearer $token'});
    final me = await dio.get<Map<String, dynamic>>('/users/me', options: auth);
    final restaurantId =
        ((me.data!['restaurants'] as List).first as Map)['id'] as String;
    await dio.post<dynamic>(
      '/restaurant/$restaurantId/orders/$orderId/accept',
      options: auth,
    );
  }

  testWidgets('adresse, commande, suivi temps réel, annulation, recommande', (
    tester,
  ) async {
    useViewport(tester);
    await launchApp(tester);
    await signInAsDemoClient(tester);
    final container = appContainer(tester);
    await tester.runAsync(() async {
      await container.read(cartProvider.notifier).clear();
      // Repartir sans adresse pour tester le formulaire.
      final repo = container.read(addressRepositoryProvider);
      for (final a in await repo.list()) {
        await repo.delete(a.id);
      }
    });
    container.invalidate(addressesProvider);
    await settle(tester);

    // Panier : Demi-poulet chez Chez Maman.
    await pumpUntilFound(tester, find.text('À commander maintenant'));
    final card = find.widgetWithText(RestaurantCard, 'Chez Maman');
    await tester.scrollUntilVisible(
      card,
      300,
      scrollable: verticalScrollable.first,
    );
    await tester.tap(card);
    await pumpUntilFound(tester, find.text('Demi-poulet'));
    await tapVisible(tester, find.text('Demi-poulet'));
    await settle(tester);
    await tester.tap(find.text('Ajouter'));
    await pumpUntilFound(tester, find.text('Voir'));
    await settle(tester); // fin de l'animation d'entrée de la notification
    await tester.tap(find.text('Voir'));
    await pumpUntilFound(tester, find.text('Continuer'));
    await tester.tap(find.text('Continuer'));
    await pumpUntilFound(tester, find.text('Ajouter mon adresse'));

    // Adresse via le formulaire.
    await tester.tap(find.text('Ajouter mon adresse'));
    await settle(tester);
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Adresse'),
      'Rue du marché, maison bleue',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Quartier'),
      'Agoè',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Repère pour le livreur'),
      'Portail bleu, face à la pharmacie',
    );
    await takeScreenshot(tester, 'address_form');
    await tester.tap(find.text('Enregistrer'));
    await pumpUntilFound(tester, find.text('Finaliser la commande'));
    await pumpUntilFound(
      tester,
      find.textContaining('Rue du marché, maison bleue (Agoè)'),
    );
    await settle(tester);
    await takeScreenshot(tester, 'checkout');
    // Les champs de contact sont réellement affichés et utilisables.
    await tester.ensureVisible(find.text('Numéro joignable (facultatif)'));
    await settle(tester);
    expect(
      find.text('Numéro joignable (facultatif)').hitTestable(),
      findsOneWidget,
    );
    await takeScreenshot(tester, 'checkout_contact');
    await tester.ensureVisible(find.text('Total à payer'));
    await settle(tester);
    await takeScreenshot(tester, 'checkout_summary');

    // Commande réelle.
    await tester.tap(find.text('Confirmer la commande'));
    await pumpUntilFound(tester, find.text('Commande envoyée'));
    expect(find.text('En attente du restaurant'), findsOneWidget);
    expect(container.read(cartProvider).value?.isEmpty ?? true, isTrue);
    await takeScreenshot(tester, 'order_pending');

    // Le restaurant accepte : l'écran se met à jour sans action du client.
    final id = tester.widget<OrderScreen>(find.byType(OrderScreen)).orderId;
    await tester.runAsync(() => restaurantAccepts(id));
    await pumpUntilFound(
      tester,
      find.text('Acceptée'),
      timeout: const Duration(seconds: 15),
    );
    await takeScreenshot(tester, 'order_accepted_realtime');

    // Annulation par le client (autorisée en ACCEPTED).
    await tapVisible(tester, find.text('Annuler la commande'));
    await settle(tester);
    await tester.tap(find.text('Annuler la commande').last);
    await pumpUntilFound(tester, find.text('Cette commande a été annulée.'));
    await takeScreenshot(tester, 'order_cancelled');

    // Commander à nouveau : le panier est rempli par le serveur.
    await tapVisible(tester, find.text('Commander à nouveau'));
    await pumpUntilFound(tester, find.text('Total estimé'));
    expect(find.text('Demi-poulet'), findsOneWidget);

    await tester.runAsync(() => container.read(cartProvider.notifier).clear());
  });
}
