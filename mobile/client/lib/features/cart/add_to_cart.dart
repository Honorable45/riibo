import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../restaurant/dish_selection.dart';
import 'cart_controller.dart';

/// Demande la connexion si nécessaire ; renvoie `true` si le client est
/// connecté au retour.
Future<bool> ensureSignedIn(
  BuildContext context,
  WidgetRef ref, {
  String? reason,
}) async {
  if (ref.read(currentUserProvider) != null) return true;
  final ok = await context.push<bool>(Routes.login, extra: reason);
  return ok == true && ref.read(currentUserProvider) != null;
}

/// Ajoute un plat au panier serveur : connexion à la demande, confirmation
/// explicite avant de remplacer le panier d'un autre restaurant, message clair
/// en cas de refus du serveur. Renvoie `true` si le plat a été ajouté.
Future<bool> addDishToCart(
  BuildContext context,
  WidgetRef ref,
  DishSelection selection,
) async {
  final signedIn = await ensureSignedIn(
    context,
    ref,
    reason:
        'Connectez-vous pour ajouter des plats à votre panier et commander.',
  );
  if (!signedIn || !context.mounted) return false;

  final controller = ref.read(cartProvider.notifier);
  var result = await controller.add(selection);
  if (!context.mounted) return false;

  if (result is NeedsReplace) {
    final confirmed = await confirmDialog(
      context,
      title: 'Commencer un nouveau panier ?',
      message: result.currentRestaurant == null
          ? 'Votre panier contient des plats d’un autre restaurant. Ils seront retirés.'
          : 'Votre panier contient des plats de ${result.currentRestaurant}. Ils seront retirés.',
      confirmLabel: 'Nouveau panier',
    );
    if (!confirmed || !context.mounted) return false;
    result = await controller.add(selection, replaceCart: true);
    if (!context.mounted) return false;
  }

  switch (result) {
    case Added():
      showRiiSnack(
        context,
        selection.quantity > 1
            ? '${selection.quantity} × ${selection.item.name} ajoutés au panier'
            : '${selection.item.name} ajouté au panier',
        actionLabel: 'Voir',
        onAction: () => context.push(Routes.cart),
      );
      return true;
    case AddFailed(:final error):
      showRiiSnack(context, describeError(error));
      return false;
    case NeedsReplace():
      return false;
  }
}
