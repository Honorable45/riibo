import 'package:riiberaka_core/core/api/api_exception.dart';
import '../orders/orders_repository.dart';

sealed class SubmissionOutcome {
  const SubmissionOutcome();
}

/// Commande enregistrée et confirmée par le serveur.
class OrderPlaced extends SubmissionOutcome {
  const OrderPlaced(this.orderId);
  final String orderId;
}

/// Refus certain (validation, panier modifié, hors ligne avant envoi) :
/// rien n'a été créé, le client peut corriger et renvoyer.
class OrderRejected extends SubmissionOutcome {
  const OrderRejected(this.error);
  final ApiException error;
}

/// Réponse perdue ET vérification impossible : on ne sait pas si la commande
/// existe. L'interface propose de VÉRIFIER, jamais de renvoyer à l'aveugle.
class OrderUncertain extends SubmissionOutcome {
  const OrderUncertain();
}

/// Envoie la commande une seule fois. Si la réponse se perd (délai dépassé,
/// passerelle 502/504), cherche parmi les commandes en cours une commande de
/// ce restaurant créée depuis l'envoi. Le backend empêche de toute façon un
/// doublon (les lignes du panier sont consommées dans la transaction).
class OrderSubmitter {
  OrderSubmitter(this._repo, {DateTime Function()? clock})
    : _clock = clock ?? DateTime.now;

  final OrdersRepository _repo;
  final DateTime Function() _clock;

  /// Commandes en cours connues AVANT l'envoi : la vérification ne peut pas
  /// confondre une commande plus ancienne avec celle qu'on vient d'envoyer.
  Set<String>? _knownBefore;
  DateTime? _startedAt;

  Future<SubmissionOutcome> submit(
    PlaceOrderRequest request, {
    required String restaurantId,
  }) async {
    try {
      final before = await _repo.list(active: true, limit: 20);
      _knownBefore = before.items.map((o) => o.id).toSet();
    } on ApiException {
      _knownBefore = null; // repli : seule la date sert alors à vérifier
    }
    _startedAt = _clock();
    try {
      final order = await _repo.place(request);
      return OrderPlaced(order.id);
    } on ApiException catch (error) {
      if (!error.isUncertain) return OrderRejected(error);
      return verify(restaurantId: restaurantId);
    }
  }

  /// Recherche la commande correspondant au dernier envoi.
  Future<SubmissionOutcome> verify({required String restaurantId}) async {
    final since = _startedAt ?? _clock();
    try {
      final page = await _repo.list(active: true, limit: 20);
      // Marge pour l'écart d'horloge entre le téléphone et le serveur.
      final threshold = since.subtract(const Duration(minutes: 2));
      for (final order in page.items) {
        final isNew =
            _knownBefore?.contains(order.id) == false ||
            (_knownBefore == null && order.createdAt.isAfter(threshold));
        if (order.restaurantId == restaurantId && isNew) {
          return OrderPlaced(order.id);
        }
      }
      return const OrderRejected(
        ApiException(
          ApiErrorKind.unknown,
          'La commande n’a pas été enregistrée. Vérifiez votre panier puis réessayez.',
        ),
      );
    } on ApiException {
      return const OrderUncertain();
    }
  }
}
