import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'cart_models.dart';

/// Panier serveur (rôle CLIENT). Chaque appel renvoie le panier complet,
/// recalculé depuis les prix actuels de la base.
class CartRepository {
  const CartRepository(this._api);

  final ApiClient _api;

  Future<Cart> fetch() async => Cart.fromJson(await _api.get<Json>('/cart'));

  Future<Cart> add({
    required String menuItemId,
    required int quantity,
    required List<String> optionIds,
    String? note,
    bool replaceCart = false,
  }) async => Cart.fromJson(
    await _api.post<Json>(
      '/cart/items',
      body: {
        'menuItemId': menuItemId,
        'quantity': quantity,
        'optionIds': optionIds,
        if (note != null && note.isNotEmpty) 'note': note,
        if (replaceCart) 'replaceCart': true,
      },
    ),
  );

  Future<Cart> update(
    String lineId, {
    int? quantity,
    List<String>? optionIds,
    String? note,
  }) async => Cart.fromJson(
    await _api.patch<Json>(
      '/cart/items/${Uri.encodeComponent(lineId)}',
      body: {'quantity': ?quantity, 'optionIds': ?optionIds, 'note': ?note},
    ),
  );

  Future<Cart> remove(String lineId) async => Cart.fromJson(
    await _api.delete<Json>('/cart/items/${Uri.encodeComponent(lineId)}'),
  );

  Future<Cart> clear() async => Cart.fromJson(await _api.delete<Json>('/cart'));

  Future<Cart> applyPromo(String code) async =>
      Cart.fromJson(await _api.post<Json>('/cart/promo', body: {'code': code}));

  Future<Cart> removePromo() async =>
      Cart.fromJson(await _api.delete<Json>('/cart/promo'));
}

final cartRepositoryProvider = Provider<CartRepository>(
  (ref) => CartRepository(ref.watch(apiClientProvider)),
);
