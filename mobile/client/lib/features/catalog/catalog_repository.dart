import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'catalog_models.dart';

/// Catalogue public (consultable sans compte).
class CatalogRepository {
  const CatalogRepository(this._api);

  final ApiClient _api;

  static const pageSize = 20;

  Future<List<CuisineCategory>> categories() async {
    final data = await _api.get<List<dynamic>>('/restaurant-categories');
    return data.cast<Json>().map(CuisineCategory.fromJson).toList();
  }

  Future<PageResult<RestaurantSummary>> restaurants(
    RestaurantQuery query, {
    int page = 1,
  }) async {
    final data = await _api.get<Json>(
      '/restaurants',
      query: query.toQuery(page: page, limit: pageSize),
    );
    return PageResult.fromJson(data, RestaurantSummary.fromJson);
  }

  Future<PageResult<DishSummary>> dishes({
    String? text,
    String? category,
    int page = 1,
    int limit = pageSize,
  }) async {
    final data = await _api.get<Json>(
      '/menu-items',
      query: {
        'q': text?.trim(),
        'category': category,
        'page': page,
        'limit': limit,
      },
    );
    return PageResult.fromJson(data, DishSummary.fromJson);
  }
}

final catalogRepositoryProvider = Provider<CatalogRepository>(
  (ref) => CatalogRepository(ref.watch(apiClientProvider)),
);
