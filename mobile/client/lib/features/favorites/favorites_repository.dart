import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/providers.dart';
import '../catalog/catalog_models.dart';

/// Restaurants favoris, synchronisés avec le compte (`/favorites`).
class FavoritesRepository {
  const FavoritesRepository(this._api);

  final ApiClient _api;

  Future<List<RestaurantSummary>> list() async {
    final data = await _api.get<List<dynamic>>('/favorites');
    return data.cast<Json>().map(RestaurantSummary.fromJson).toList();
  }

  Future<Set<String>> ids() async {
    final data = await _api.get<List<dynamic>>('/favorites/ids');
    return data.cast<String>().toSet();
  }

  Future<void> add(String restaurantId) =>
      _api.post<void>('/favorites/${Uri.encodeComponent(restaurantId)}');

  Future<void> remove(String restaurantId) =>
      _api.delete<void>('/favorites/${Uri.encodeComponent(restaurantId)}');
}

final favoritesRepositoryProvider = Provider<FavoritesRepository>(
  (ref) => FavoritesRepository(ref.watch(apiClientProvider)),
);

/// Identifiants des favoris (cœurs des listes). Vide si déconnecté.
class FavoriteIdsController extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() async {
    final userId = ref.watch(currentUserProvider.select((u) => u?.id));
    if (userId == null || userId.isEmpty) return <String>{};
    return ref.watch(favoritesRepositoryProvider).ids();
  }

  /// Bascule un favori : affichage immédiat, annulé si le serveur refuse.
  Future<bool> toggle(String restaurantId) async {
    final current = state.value ?? <String>{};
    final adding = !current.contains(restaurantId);
    state = AsyncData(
      adding
          ? {...current, restaurantId}
          : ({...current}..remove(restaurantId)),
    );
    try {
      final repo = ref.read(favoritesRepositoryProvider);
      adding ? await repo.add(restaurantId) : await repo.remove(restaurantId);
      ref.invalidate(favoriteRestaurantsProvider);
      return true;
    } catch (_) {
      if (ref.mounted) state = AsyncData(current);
      return false;
    }
  }
}

final favoriteIdsProvider =
    AsyncNotifierProvider<FavoriteIdsController, Set<String>>(
      FavoriteIdsController.new,
    );

final favoriteRestaurantsProvider =
    FutureProvider.autoDispose<List<RestaurantSummary>>(
      (ref) => ref.watch(favoritesRepositoryProvider).list(),
    );
