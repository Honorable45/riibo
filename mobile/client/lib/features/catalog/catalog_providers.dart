import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/state/paged.dart';
import 'catalog_models.dart';
import 'catalog_repository.dart';

/// Garde une donnée de consultation en mémoire quelques minutes après le
/// dernier écran qui l'affichait : revenir à l'accueil ne recharge pas tout
/// sur une connexion lente.
void keepAliveFor(Ref ref, Duration duration) {
  final link = ref.keepAlive();
  Timer? timer;
  ref.onCancel(() => timer = Timer(duration, link.close));
  ref.onResume(() => timer?.cancel());
  ref.onDispose(() => timer?.cancel());
}

final categoriesProvider = FutureProvider.autoDispose<List<CuisineCategory>>((
  ref,
) {
  keepAliveFor(ref, const Duration(minutes: 30));
  return ref.watch(catalogRepositoryProvider).categories();
});

class RestaurantListNotifier extends PagedNotifier<RestaurantSummary> {
  RestaurantListNotifier(this.query);

  final RestaurantQuery query;

  @override
  Future<PagedState<RestaurantSummary>> build() {
    keepAliveFor(ref, const Duration(minutes: 3));
    return super.build();
  }

  @override
  Future<PageFetch<RestaurantSummary>> fetchPage({
    required int page,
    String? cursor,
  }) async {
    final result = await ref
        .read(catalogRepositoryProvider)
        .restaurants(query, page: page);
    return (items: result.items, hasMore: result.hasMore, nextCursor: null);
  }
}

final restaurantListProvider = AsyncNotifierProvider.autoDispose
    .family<
      RestaurantListNotifier,
      PagedState<RestaurantSummary>,
      RestaurantQuery
    >(RestaurantListNotifier.new);

typedef DishQuery = ({String? text, String? category});

class DishListNotifier extends PagedNotifier<DishSummary> {
  DishListNotifier(this.query);

  final DishQuery query;

  @override
  Future<PagedState<DishSummary>> build() {
    keepAliveFor(ref, const Duration(minutes: 3));
    return super.build();
  }

  @override
  Future<PageFetch<DishSummary>> fetchPage({
    required int page,
    String? cursor,
  }) async {
    final result = await ref
        .read(catalogRepositoryProvider)
        .dishes(text: query.text, category: query.category, page: page);
    return (items: result.items, hasMore: result.hasMore, nextCursor: null);
  }
}

final dishListProvider = AsyncNotifierProvider.autoDispose
    .family<DishListNotifier, PagedState<DishSummary>, DishQuery>(
      DishListNotifier.new,
    );
