import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import '../restaurant/dish_selection.dart';
import 'cart_models.dart';
import 'cart_repository.dart';

/// Résultat d'un ajout au panier.
sealed class AddResult {
  const AddResult();
}

class Added extends AddResult {
  const Added();
}

/// Le panier contient déjà les plats d'un autre restaurant : il faut
/// confirmer le remplacement (jamais fait sans l'accord du client).
class NeedsReplace extends AddResult {
  const NeedsReplace(this.currentRestaurant);
  final String? currentRestaurant;
}

class AddFailed extends AddResult {
  const AddFailed(this.error);
  final ApiException error;
}

/// État du panier : la seule source de vérité est le serveur. Les opérations
/// sont exécutées l'une après l'autre (jamais deux écritures concurrentes dont
/// les réponses arriveraient dans le désordre).
class CartController extends AsyncNotifier<Cart> {
  Future<void> _queue = Future.value();

  CartRepository get _repo => ref.read(cartRepositoryProvider);

  @override
  Future<Cart> build() async {
    final user = ref.watch(currentUserProvider.select((u) => u?.id));
    if (user == null) return Cart.empty;
    return ref.watch(cartRepositoryProvider).fetch();
  }

  Future<T> _serial<T>(Future<T> Function() task) {
    final completer = Completer<T>();
    _queue = _queue.then((_) async {
      try {
        completer.complete(await task());
      } catch (error, stack) {
        completer.completeError(error, stack);
      }
    });
    return completer.future;
  }

  void _set(Cart cart) {
    if (ref.mounted) state = AsyncData(cart);
  }

  Future<AddResult> add(DishSelection selection, {bool replaceCart = false}) =>
      _serial(() async {
        try {
          final cart = await _repo.add(
            menuItemId: selection.item.id,
            quantity: selection.quantity,
            optionIds: selection.orderedOptionIds,
            note: selection.note.trim().isEmpty ? null : selection.note.trim(),
            replaceCart: replaceCart,
          );
          _set(cart);
          return const Added();
        } on ApiException catch (error) {
          if (error.code == 'CART_OTHER_RESTAURANT') {
            return NeedsReplace(state.value?.restaurant?.name);
          }
          return AddFailed(error);
        }
      });

  /// Changement de quantité : affichage immédiat, puis valeur du serveur.
  /// En cas d'échec, le panier est relu (aucune valeur locale inventée).
  Future<ApiException?> setQuantity(String lineId, int quantity) {
    final current = state.value;
    if (current != null) {
      _set(
        Cart(
          restaurant: current.restaurant,
          items: [
            for (final line in current.items)
              line.id == lineId ? line.copyWith(quantity: quantity) : line,
          ],
          subtotal: current.subtotal,
          deliveryFee: current.deliveryFee,
          discount: current.discount,
          total: current.total,
          canCheckout: current.canCheckout,
          blockers: current.blockers,
          promoCode: current.promoCode,
          promoIssue: current.promoIssue,
        ),
      );
    }
    return _write(() => _repo.update(lineId, quantity: quantity));
  }

  Future<ApiException?> updateLine(
    String lineId, {
    required int quantity,
    required List<String> optionIds,
    required String note,
  }) => _write(
    () => _repo.update(
      lineId,
      quantity: quantity,
      optionIds: optionIds,
      note: note,
    ),
  );

  Future<ApiException?> remove(String lineId) =>
      _write(() => _repo.remove(lineId));

  Future<ApiException?> clear() => _write(_repo.clear);

  Future<ApiException?> applyPromo(String code) =>
      _write(() => _repo.applyPromo(code.trim().toUpperCase()));

  Future<ApiException?> removePromo() => _write(_repo.removePromo);

  /// Relit le panier (prix et disponibilités actuels).
  Future<void> refresh() => _serial(() async {
    try {
      _set(await _repo.fetch());
    } on ApiException catch (error, stack) {
      if (ref.mounted && state.value == null) state = AsyncError(error, stack);
    }
  });

  Future<ApiException?> _write(Future<Cart> Function() call) =>
      _serial(() async {
        try {
          _set(await call());
          return null;
        } on ApiException catch (error) {
          try {
            _set(await _repo.fetch());
          } on ApiException {
            // Hors ligne : on garde l'affichage, l'erreur est signalée.
          }
          return error;
        }
      });
}

final cartProvider = AsyncNotifierProvider<CartController, Cart>(
  CartController.new,
);
