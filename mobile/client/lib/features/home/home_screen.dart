import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/state/paged.dart';
import 'package:riiberaka_core/core/widgets/paged_footer.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/skeleton.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import '../catalog/catalog_models.dart';
import '../catalog/catalog_providers.dart';
import '../catalog/widgets/dish_tiles.dart';
import '../catalog/widgets/restaurant_card.dart';
import '../favorites/favorite_button.dart';
import '../location/delivery_location.dart';
import '../location/location_sheet.dart';
import '../orders/orders_providers.dart';

/// Filtres de l'accueil (catégorie, ouverts, tri) — état de l'écran.
class HomeFilters {
  const HomeFilters({this.category, this.openNow = false, this.sort});

  final String? category;
  final bool openNow;
  final RestaurantSort? sort;
}

class HomeFiltersController extends Notifier<HomeFilters> {
  @override
  HomeFilters build() => const HomeFilters();

  void setCategory(String? slug) => state = HomeFilters(
    category: slug,
    openNow: state.openNow,
    sort: state.sort,
  );

  void toggleOpenNow() => state = HomeFilters(
    category: state.category,
    openNow: !state.openNow,
    sort: state.sort,
  );

  void setSort(RestaurantSort? sort) => state = HomeFilters(
    category: state.category,
    openNow: state.openNow,
    sort: sort,
  );
}

final homeFiltersProvider =
    NotifierProvider<HomeFiltersController, HomeFilters>(
      HomeFiltersController.new,
    );

/// Requête restaurants de l'accueil : filtres + lieu de livraison.
final homeRestaurantQueryProvider = Provider<RestaurantQuery>((ref) {
  final filters = ref.watch(homeFiltersProvider);
  final location = ref.watch(deliveryLocationProvider).value;
  return RestaurantQuery(
    category: filters.category,
    openNow: filters.openNow,
    sort: filters.sort,
    latitude: location?.latitude,
    longitude: location?.longitude,
  );
});

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.position.extentAfter < 600) {
      ref
          .read(
            restaurantListProvider(
              ref.read(homeRestaurantQueryProvider),
            ).notifier,
          )
          .loadMore();
    }
  }

  Future<void> _refresh() async {
    final query = ref.read(homeRestaurantQueryProvider);
    final category = ref.read(homeFiltersProvider).category;
    ref.invalidate(categoriesProvider);
    ref.invalidate(dishListProvider((text: null, category: category)));
    ref.invalidate(restaurantListProvider(query));
    await ref
        .read(restaurantListProvider(query).future)
        .catchError(
          (_) => const PagedState<RestaurantSummary>(items: [], hasMore: false),
        );
  }

  @override
  Widget build(BuildContext context) {
    final filters = ref.watch(homeFiltersProvider);
    final query = ref.watch(homeRestaurantQueryProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: CustomScrollView(
            controller: _scroll,
            slivers: [
              const SliverToBoxAdapter(child: _HomeHeader()),
              const SliverToBoxAdapter(child: _SearchEntry()),
              const SliverToBoxAdapter(child: _ActiveOrders()),
              SliverToBoxAdapter(
                child: _Categories(
                  selected: filters.category,
                  onSelected: ref
                      .read(homeFiltersProvider.notifier)
                      .setCategory,
                ),
              ),
              SliverToBoxAdapter(
                child: _DishCarousel(category: filters.category),
              ),
              SliverToBoxAdapter(
                child: _RestaurantFilters(
                  filters: filters,
                  hasLocation: query.hasLocation,
                ),
              ),
              _RestaurantSliver(query: query),
              const SliverToBoxAdapter(child: SizedBox(height: RiiSpace.xxxl)),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeHeader extends ConsumerWidget {
  const _HomeHeader();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.text;
    final p = context.palette;
    final location = ref.watch(deliveryLocationProvider).value;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter - 4,
        RiiSpace.sm,
        RiiSpace.gutter,
        0,
      ),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              button: true,
              label: 'Lieu de livraison : ${location?.label ?? 'non défini'}',
              child: InkWell(
                borderRadius: RiiRadius.smAll,
                onTap: () => showLocationSheet(context),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 6,
                  ),
                  child: ExcludeSemantics(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Livrer à', style: t.labelSmall),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Icon(
                              location?.hasCoordinates == true
                                  ? Icons.near_me_rounded
                                  : Icons.place_outlined,
                              size: 18,
                              color: p.brand,
                            ),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                location?.label ?? 'Choisir un lieu',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: t.titleMedium,
                              ),
                            ),
                            Icon(
                              Icons.expand_more_rounded,
                              size: 20,
                              color: p.ink,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          Image.asset(
            'assets/images/logo_mark.png',
            height: 30,
            semanticLabel: 'Riiberaka',
          ),
        ],
      ),
    );
  }
}

class _SearchEntry extends StatelessWidget {
  const _SearchEntry();

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        RiiSpace.md,
        RiiSpace.gutter,
        RiiSpace.xs,
      ),
      child: Semantics(
        button: true,
        label: 'Rechercher un plat ou un restaurant',
        child: Material(
          color: p.surface,
          shape: RoundedRectangleBorder(
            borderRadius: RiiRadius.mdAll,
            side: BorderSide(color: p.line),
          ),
          child: InkWell(
            borderRadius: RiiRadius.mdAll,
            onTap: () => context.go('${Routes.search}?focus=1'),
            child: SizedBox(
              height: RiiSizes.fieldHeight,
              child: ExcludeSemantics(
                child: Row(
                  children: [
                    const SizedBox(width: RiiSpace.lg),
                    Icon(Icons.search_rounded, color: p.muted),
                    const SizedBox(width: RiiSpace.sm + 2),
                    Expanded(
                      child: Text(
                        'Un plat, un restaurant…',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.bodyLarge!.copyWith(
                          color: p.subtle,
                        ),
                      ),
                    ),
                    const SizedBox(width: RiiSpace.lg),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Categories extends ConsumerWidget {
  const _Categories({required this.selected, required this.onSelected});

  final String? selected;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider);
    return categories.when(
      data: (list) => list.isEmpty
          ? const SizedBox(height: RiiSpace.sm)
          : Padding(
              padding: const EdgeInsets.only(top: RiiSpace.md),
              child: CategoryRail(
                categories: list,
                selected: selected,
                onSelected: onSelected,
              ),
            ),
      loading: () => SkeletonScope(
        child: SizedBox(
          height: 104,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(
              RiiSpace.gutter,
              RiiSpace.md,
              0,
              0,
            ),
            physics: const NeverScrollableScrollPhysics(),
            children: [
              for (var i = 0; i < 6; i++)
                const Padding(
                  padding: EdgeInsets.only(right: 24),
                  child: Column(
                    children: [
                      SkeletonBox(width: 52, height: 52, radius: 26),
                      SizedBox(height: 8),
                      SkeletonBox(width: 44, height: 10),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
      // Les catégories sont un raccourci : leur échec ne bloque pas l'accueil.
      error: (_, _) => const SizedBox(height: RiiSpace.sm),
    );
  }
}

class _DishCarousel extends ConsumerWidget {
  const _DishCarousel({required this.category});

  final String? category;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dishes = ref.watch(
      dishListProvider((text: null, category: category)),
    );
    return dishes.when(
      data: (state) {
        if (state.items.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(title: 'À commander maintenant'),
            SizedBox(
              height: 232,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: RiiSpace.gutter,
                ),
                itemCount: state.items.length.clamp(0, 12),
                separatorBuilder: (_, _) => const SizedBox(width: RiiSpace.md),
                itemBuilder: (context, index) {
                  final dish = state.items[index];
                  return DishTile(
                    dish: dish,
                    onTap: () => context.push(
                      Routes.restaurant(dish.restaurantSlug, dishId: dish.id),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
      loading: () => SkeletonScope(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(
                RiiSpace.gutter,
                RiiSpace.xl,
                0,
                RiiSpace.md,
              ),
              child: SkeletonBox(width: 190, height: 18),
            ),
            SizedBox(
              height: 220,
              child: ListView(
                scrollDirection: Axis.horizontal,
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(
                  horizontal: RiiSpace.gutter,
                ),
                children: const [
                  DishTileSkeleton(),
                  SizedBox(width: RiiSpace.md),
                  DishTileSkeleton(),
                  SizedBox(width: RiiSpace.md),
                  DishTileSkeleton(),
                ],
              ),
            ),
          ],
        ),
      ),
      // Secondaire : la liste des restaurants porte l'erreur réseau.
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}

class _RestaurantFilters extends ConsumerWidget {
  const _RestaurantFilters({required this.filters, required this.hasLocation});

  final HomeFilters filters;
  final bool hasLocation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(homeFiltersProvider.notifier);
    final sorts = [
      if (hasLocation) RestaurantSort.nearest,
      RestaurantSort.rating,
      RestaurantSort.popular,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Restaurants'),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            children: [
              FilterChip(
                label: const Text('Ouverts maintenant'),
                selected: filters.openNow,
                onSelected: (_) => controller.toggleOpenNow(),
              ),
              for (final sort in sorts) ...[
                const SizedBox(width: RiiSpace.sm),
                ChoiceChip(
                  label: Text(sort.label),
                  selected: filters.sort == sort,
                  onSelected: (selected) =>
                      controller.setSort(selected ? sort : null),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: RiiSpace.xs),
      ],
    );
  }
}

class _RestaurantSliver extends ConsumerWidget {
  const _RestaurantSliver({required this.query});

  final RestaurantQuery query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(restaurantListProvider(query));
    const padding = EdgeInsets.symmetric(horizontal: RiiSpace.gutter);

    return list.when(
      skipLoadingOnRefresh: false,
      data: (state) {
        if (state.items.isEmpty) {
          return SliverToBoxAdapter(
            child: EmptyState(
              icon: Icons.storefront_outlined,
              title: query.openNow || query.category != null
                  ? 'Aucun restaurant pour ces critères'
                  : 'Aucun restaurant disponible',
              message: query.hasLocation
                  ? 'Aucun restaurant trouvé près de ce lieu pour le moment.'
                  : 'Revenez un peu plus tard.',
              compact: true,
            ),
          );
        }
        return SliverPadding(
          padding: padding,
          sliver: SliverList.builder(
            itemCount: state.items.length + 1,
            itemBuilder: (context, index) {
              if (index == state.items.length) {
                return PagedFooter(
                  state: state,
                  onRetry: () => ref
                      .read(restaurantListProvider(query).notifier)
                      .loadMore(),
                );
              }
              final restaurant = state.items[index];
              return RestaurantCard(
                restaurant: restaurant,
                onTap: () => context.push(Routes.restaurant(restaurant.slug)),
                trailing: FavoriteButton(restaurantId: restaurant.id),
              );
            },
          ),
        );
      },
      loading: () => const SliverPadding(
        padding: padding,
        sliver: SliverToBoxAdapter(
          child: SkeletonScope(
            child: Column(
              children: [RestaurantCardSkeleton(), RestaurantCardSkeleton()],
            ),
          ),
        ),
      ),
      error: (error, _) => SliverToBoxAdapter(
        child: ErrorState(
          error: error,
          onRetry: () => ref.invalidate(restaurantListProvider(query)),
          compact: true,
        ),
      ),
    );
  }
}

/// Raccourci vers les commandes en cours (client connecté uniquement).
class _ActiveOrders extends ConsumerWidget {
  const _ActiveOrders();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(currentUserProvider) == null) return const SizedBox.shrink();
    final orders = ref.watch(activeOrdersProvider).value?.items ?? const [];
    if (orders.isEmpty) return const SizedBox.shrink();
    final t = context.text;
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        RiiSpace.md,
        RiiSpace.gutter,
        0,
      ),
      child: Column(
        children: [
          for (final order in orders.take(2))
            Padding(
              padding: const EdgeInsets.only(bottom: RiiSpace.sm),
              child: RiiCard(
                color: p.brandSoft,
                padding: const EdgeInsets.symmetric(
                  horizontal: RiiSpace.lg,
                  vertical: RiiSpace.md,
                ),
                onTap: () => context.push(Routes.order(order.id)),
                child: Row(
                  children: [
                    Icon(Icons.delivery_dining_rounded, color: p.brand),
                    const SizedBox(width: RiiSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            order.status.label(order.deliveryType),
                            style: t.titleSmall,
                          ),
                          Text(
                            '${order.restaurantName} · #${order.orderNumber}',
                            style: t.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    Text(
                      'Suivre',
                      style: t.labelLarge!.copyWith(color: p.brand),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
