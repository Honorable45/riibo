import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/providers.dart';

import 'models.dart';

/// Actions de commande exposées au restaurant (RestaurantOrdersController).
/// Chaque action est validée par la machine à états centrale du backend
/// (acteur, état de départ, appartenance au restaurant).
enum OrderAction {
  accept('accept'),
  reject('reject'),
  startPreparing('start-preparing'),
  ready('ready'),
  handOver('hand-over'),
  cancel('cancel');

  const OrderAction(this.path);
  final String path;

  /// Motif exigé par le serveur pour refuser ou annuler côté restaurant.
  bool get needsReason => this == reject || this == cancel;
}

/// Routes du restaurant : TOUTES vérifient côté serveur que l'utilisateur est
/// membre de CE restaurant (RestaurantAccessGuard → 404 sinon).
class RestaurantRepository {
  const RestaurantRepository(this._api);

  final ApiClient _api;

  String _r(String id) => '/restaurant/${Uri.encodeComponent(id)}';

  Future<List<MyRestaurant>> mine() async {
    final me = await _api.get<Json>('/users/me');
    return me.list('restaurants', MyRestaurant.fromJson);
  }

  Future<RestaurantProfile> profile(String id) async =>
      RestaurantProfile.fromJson(await _api.get<Json>(_r(id)));

  /// Propriétaire : tous les champs. Personnel : `isPaused` uniquement (403 sinon).
  Future<void> update(String id, Json changes) =>
      _api.patch<void>(_r(id), body: changes);

  Future<void> setHours(String id, List<OpeningRange> ranges) => _api.put<void>(
    '${_r(id)}/hours',
    body: {
      'ranges': [for (final r in ranges) r.toJson()],
    },
  );

  Future<void> addClosure(
    String id, {
    required DateTime startsAt,
    required DateTime endsAt,
    String? reason,
  }) => _api.post<void>(
    '${_r(id)}/closures',
    body: {
      'startsAt': startsAt.toUtc().toIso8601String(),
      'endsAt': endsAt.toUtc().toIso8601String(),
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    },
  );

  Future<void> removeClosure(String id, String closureId) =>
      _api.delete<void>('${_r(id)}/closures/${Uri.encodeComponent(closureId)}');

  Future<void> uploadImage(
    String id,
    String kind,
    MultipartFile file, {
    void Function(double)? onProgress,
  }) => _api.upload<void>(
    '${_r(id)}/images/$kind',
    FormData.fromMap({'image': file}),
    onProgress: onProgress,
  );

  // --- Commandes -----------------------------------------------------------

  Future<Dashboard> dashboard(String id) async =>
      Dashboard.fromJson(await _api.get<Json>('${_r(id)}/dashboard'));

  /// `limit` ≤ 50 (ListOrdersQueryDto) : au-delà, le serveur refuse (400).
  Future<CursorPage<KitchenOrder>> orders(
    String id, {
    required bool active,
    String? cursor,
    int limit = 50,
  }) async => CursorPage.fromJson(
    await _api.get<Json>(
      '${_r(id)}/orders',
      query: {
        'scope': active ? 'active' : 'past',
        'cursor': cursor,
        'limit': limit,
      },
    ),
    KitchenOrder.fromJson,
  );

  /// Détail (vue RESTAURANT : code de retrait, livreur, conversations).
  Future<KitchenOrder> order(String orderId) async => KitchenOrder.fromJson(
    await _api.get<Json>('/orders/${Uri.encodeComponent(orderId)}'),
  );

  Future<void> act(
    String id,
    String orderId,
    OrderAction action, {
    String? reason,
  }) => _api.post<void>(
    '${_r(id)}/orders/${Uri.encodeComponent(orderId)}/${action.path}',
    body: {
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    },
  );

  /// Aucun livreur trouvé : relancer la recherche.
  Future<void> retryDelivery(String id, String orderId) => _api.post<void>(
    '${_r(id)}/orders/${Uri.encodeComponent(orderId)}/retry-delivery',
  );

  // --- Menu ---------------------------------------------------------------

  Future<OwnerMenu> menu(String id) async =>
      OwnerMenu.fromJson(await _api.get<Json>('${_r(id)}/menu'));

  Future<void> createCategory(String id, String name) =>
      _api.post<void>('${_r(id)}/menu/categories', body: {'name': name.trim()});

  Future<void> updateCategory(
    String id,
    String categoryId, {
    String? name,
    int? position,
  }) => _api.patch<void>(
    '${_r(id)}/menu/categories/${Uri.encodeComponent(categoryId)}',
    body: {'name': ?name?.trim(), 'position': ?position},
  );

  /// Les plats de la catégorie ne sont pas supprimés : ils deviennent « sans catégorie ».
  Future<void> deleteCategory(String id, String categoryId) =>
      _api.delete<void>(
        '${_r(id)}/menu/categories/${Uri.encodeComponent(categoryId)}',
      );

  Future<MenuItem> createItem(String id, Json data) async => MenuItem.fromJson(
    await _api.post<Json>('${_r(id)}/menu/items', body: data),
  );

  Future<void> updateItem(String id, String itemId, Json changes) =>
      _api.patch<void>(
        '${_r(id)}/menu/items/${Uri.encodeComponent(itemId)}',
        body: changes,
      );

  Future<void> deleteItem(String id, String itemId) =>
      _api.delete<void>('${_r(id)}/menu/items/${Uri.encodeComponent(itemId)}');

  Future<void> uploadItemImage(
    String id,
    String itemId,
    MultipartFile file, {
    void Function(double)? onProgress,
  }) => _api.upload<void>(
    '${_r(id)}/menu/items/${Uri.encodeComponent(itemId)}/image',
    FormData.fromMap({'image': file}),
    onProgress: onProgress,
  );

  /// Remplace TOUS les groupes d'options du plat (règle serveur).
  Future<void> setOptionGroups(
    String id,
    String itemId,
    List<MenuOptionGroup> groups,
  ) => _api.put<void>(
    '${_r(id)}/menu/items/${Uri.encodeComponent(itemId)}/options',
    body: {
      'groups': [for (final g in groups) g.toJson()],
    },
  );

  // --- Avis ---------------------------------------------------------------

  Future<CursorPage<Review>> reviews(String id, {String? cursor}) async =>
      CursorPage.fromJson(
        await _api.get<Json>(
          '${_r(id)}/reviews',
          query: {'cursor': cursor, 'limit': 20},
        ),
        Review.fromJson,
      );

  Future<void> reply(String id, String reviewId, String text) =>
      _api.post<void>(
        '${_r(id)}/reviews/${Uri.encodeComponent(reviewId)}/reply',
        body: {'reply': text.trim()},
      );
}

final restaurantRepositoryProvider = Provider<RestaurantRepository>(
  (ref) => RestaurantRepository(ref.watch(apiClientProvider)),
);
