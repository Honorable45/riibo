import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../shared/models.dart';
import '../shared/providers.dart';
import '../shared/repository.dart';
import '../shared/widgets.dart';

/// Prochaines actions possibles pour une commande, d'après la table des
/// transitions du backend (order-transitions.ts, acteur RESTAURANT).
List<OrderAction> nextActions(KitchenOrder order) => switch (order.state) {
  OrderState.pending => const [OrderAction.accept, OrderAction.reject],
  OrderState.accepted => const [OrderAction.startPreparing, OrderAction.cancel],
  OrderState.preparing => const [OrderAction.ready, OrderAction.cancel],
  OrderState.ready when order.isPickup => const [OrderAction.handOver],
  _ => const [],
};

String actionLabel(OrderAction action, KitchenOrder order) => switch (action) {
  OrderAction.accept => 'Accepter',
  OrderAction.reject => 'Refuser',
  OrderAction.startPreparing => 'Lancer la préparation',
  OrderAction.ready =>
    order.isPickup ? 'Prête pour le retrait' : 'Commande prête',
  OrderAction.handOver => 'Remise au client',
  OrderAction.cancel => 'Annuler',
};

const rejectReasons = [
  'Rupture de stock',
  'Trop de commandes en cours',
  'Fermeture imminente',
  'Article indisponible',
];
const cancelReasons = [
  'Rupture de stock',
  'Problème en cuisine',
  'Client injoignable',
  'Fermeture imprévue',
];

/// Exécute une action sur le serveur. L'état n'est jamais changé localement :
/// les listes sont relues après la réponse. Renvoie vrai si accepté.
Future<bool> runOrderAction(
  BuildContext context,
  WidgetRef ref,
  String restaurantId,
  KitchenOrder order,
  OrderAction action,
) async {
  String? reason;
  if (action.needsReason) {
    reason = await askReason(
      context,
      title: action == OrderAction.reject
          ? 'Refuser la commande #${order.orderNumber}'
          : 'Annuler la commande #${order.orderNumber}',
      presets: action == OrderAction.reject ? rejectReasons : cancelReasons,
    );
    if (reason == null) return false;
  }
  try {
    await ref
        .read(restaurantRepositoryProvider)
        .act(restaurantId, order.id, action, reason: reason);
    unawaited(HapticFeedback.mediumImpact());
    return true;
  } on ApiException catch (error) {
    if (context.mounted) {
      showRiiSnack(
        context,
        error.kind == ApiErrorKind.conflict ||
                error.kind == ApiErrorKind.validation
            ? 'Cette commande a déjà été traitée ou a changé d’état. ${error.message}'
            : error.message,
      );
    }
    return false;
  } finally {
    ref.invalidate(activeOrdersProvider);
    ref.invalidate(dashboardProvider);
    ref.invalidate(orderDetailProvider(order.id));
  }
}
