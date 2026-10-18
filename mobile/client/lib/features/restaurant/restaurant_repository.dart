import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/providers.dart';
import '../catalog/catalog_providers.dart';
import '../location/delivery_location.dart';
import 'restaurant_models.dart';

class RestaurantRepository {
  const RestaurantRepository(this._api);

  final ApiClient _api;

  Future<RestaurantDetail> detail(
    String idOrSlug, {
    double? latitude,
    double? longitude,
  }) async {
    final data = await _api.get<Json>(
      '/restaurants/${Uri.encodeComponent(idOrSlug)}',
      query: {'lat': latitude, 'lng': longitude},
    );
    return RestaurantDetail.fromJson(data);
  }

  Future<RestaurantMenu> menu(String idOrSlug) async {
    final data = await _api.get<Json>(
      '/restaurants/${Uri.encodeComponent(idOrSlug)}/menu',
    );
    return RestaurantMenu.fromJson(data);
  }

  Future<ReviewPage> reviews(
    String idOrSlug, {
    String? cursor,
    int limit = 10,
  }) async {
    final data = await _api.get<Json>(
      '/restaurants/${Uri.encodeComponent(idOrSlug)}/reviews',
      query: {'cursor': cursor, 'limit': limit},
    );
    return ReviewPage.fromJson(data);
  }
}

final restaurantRepositoryProvider = Provider<RestaurantRepository>(
  (ref) => RestaurantRepository(ref.watch(apiClientProvider)),
);

final restaurantDetailProvider = FutureProvider.autoDispose
    .family<RestaurantDetail, String>((ref, slug) {
      keepAliveFor(ref, const Duration(minutes: 2));
      final location = ref.watch(deliveryLocationProvider).value;
      return ref
          .watch(restaurantRepositoryProvider)
          .detail(
            slug,
            latitude: location?.latitude,
            longitude: location?.longitude,
          );
    });

final restaurantMenuProvider = FutureProvider.autoDispose
    .family<RestaurantMenu, String>((ref, slug) {
      // Disponibilités et prix peuvent changer : cache court.
      keepAliveFor(ref, const Duration(minutes: 1));
      return ref.watch(restaurantRepositoryProvider).menu(slug);
    });

final restaurantReviewsProvider = FutureProvider.autoDispose
    .family<ReviewPage, String>(
      (ref, slug) =>
          ref.watch(restaurantRepositoryProvider).reviews(slug, limit: 3),
    );
