import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/widgets/paged_footer.dart';
import 'package:riiberaka_core/core/widgets/skeleton.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../catalog/catalog_models.dart';
import '../catalog/catalog_providers.dart';
import '../catalog/widgets/catalog_labels.dart';
import '../catalog/widgets/dish_tiles.dart';
import '../catalog/widgets/restaurant_card.dart';
import '../location/delivery_location.dart';
import 'recent_searches.dart';

enum SearchScope { dishes, restaurants }

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key, this.autofocus = false});

  final bool autofocus;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  Timer? _debounce;

  /// Texte réellement envoyé au serveur (après délai de frappe).
  String _query = '';
  String? _category;
  bool _openNow = false;
  SearchScope _scope = SearchScope.dishes;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    if (widget.autofocus) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _focus.requestFocus(),
      );
    }
  }

  @override
  void didUpdateWidget(SearchScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.autofocus && !oldWidget.autofocus) _focus.requestFocus();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  bool get _active => _query.length >= 2 || _category != null;

  void _onChanged(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() => _query = text.trim());
    });
  }

  void _submit(String text) {
    _debounce?.cancel();
    final value = text.trim();
    setState(() => _query = value);
    if (value.length >= 2) ref.read(recentSearchesProvider.notifier).add(value);
  }

  void _useRecent(String value) {
    _controller.text = value;
    _controller.selection = TextSelection.collapsed(offset: value.length);
    _submit(value);
  }

  void _clear() {
    _controller.clear();
    _debounce?.cancel();
    setState(() => _query = '');
    _focus.requestFocus();
  }

  RestaurantQuery _restaurantQuery() {
    final location = ref.read(deliveryLocationProvider).value;
    return RestaurantQuery(
      text: _query.length >= 2 ? _query : null,
      category: _category,
      openNow: _openNow,
      latitude: location?.latitude,
      longitude: location?.longitude,
    );
  }

  DishQuery get _dishQuery =>
      (text: _query.length >= 2 ? _query : null, category: _category);

  void _onScroll() {
    if (!_active || _scroll.position.extentAfter > 500) return;
    if (_scope == SearchScope.dishes) {
      ref.read(dishListProvider(_dishQuery).notifier).loadMore();
    } else {
      ref.read(restaurantListProvider(_restaurantQuery()).notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    ref.watch(deliveryLocationProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                RiiSpace.gutter,
                RiiSpace.md,
                RiiSpace.gutter,
                RiiSpace.sm,
              ),
              child: ListenableBuilder(
                listenable: _controller,
                builder: (context, _) => TextField(
                  controller: _controller,
                  focusNode: _focus,
                  onChanged: _onChanged,
                  onSubmitted: _submit,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Un plat, un restaurant…',
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: _controller.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Effacer',
                            onPressed: _clear,
                            icon: const Icon(Icons.close_rounded),
                          ),
                  ),
                ),
              ),
            ),
            _CategoryChips(
              selected: _category,
              onSelected: (slug) => setState(() => _category = slug),
            ),
            if (_active)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  RiiSpace.gutter,
                  RiiSpace.sm,
                  RiiSpace.gutter,
                  RiiSpace.xs,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: SegmentedButton<SearchScope>(
                        showSelectedIcon: false,
                        segments: const [
                          ButtonSegment(
                            value: SearchScope.dishes,
                            label: Text('Plats'),
                          ),
                          ButtonSegment(
                            value: SearchScope.restaurants,
                            label: Text('Restaurants'),
                          ),
                        ],
                        selected: {_scope},
                        onSelectionChanged: (value) =>
                            setState(() => _scope = value.first),
                      ),
                    ),
                  ],
                ),
              ),
            if (_active && _scope == SearchScope.restaurants)
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: RiiSpace.gutter,
                ),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: FilterChip(
                    label: const Text('Ouverts maintenant'),
                    selected: _openNow,
                    onSelected: (value) => setState(() => _openNow = value),
                  ),
                ),
              ),
            Divider(height: RiiSpace.md, color: p.line),
            Expanded(
              child: !_active
                  ? _RecentSearches(onSelected: _useRecent)
                  : _scope == SearchScope.dishes
                  ? _DishResults(
                      query: _dishQuery,
                      controller: _scroll,
                      onOpen: (dish) {
                        if (_query.length >= 2) {
                          ref.read(recentSearchesProvider.notifier).add(_query);
                        }
                        context.push(
                          Routes.restaurant(
                            dish.restaurantSlug,
                            dishId: dish.id,
                          ),
                        );
                      },
                    )
                  : _RestaurantResults(
                      query: _restaurantQuery(),
                      controller: _scroll,
                      onOpen: (restaurant) {
                        if (_query.length >= 2) {
                          ref.read(recentSearchesProvider.notifier).add(_query);
                        }
                        context.push(Routes.restaurant(restaurant.slug));
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryChips extends ConsumerWidget {
  const _CategoryChips({required this.selected, required this.onSelected});

  final String? selected;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider).value ?? const [];
    if (categories.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
        itemCount: categories.length,
        separatorBuilder: (_, _) => const SizedBox(width: RiiSpace.sm),
        itemBuilder: (context, index) {
          final category = categories[index];
          final isSelected = category.slug == selected;
          return ChoiceChip(
            avatar: Icon(
              categoryIcon(category.slug),
              size: 16,
              color: isSelected
                  ? context.palette.surface
                  : context.palette.inkSoft,
            ),
            label: Text(category.name),
            selected: isSelected,
            onSelected: (_) => onSelected(isSelected ? null : category.slug),
          );
        },
      ),
    );
  }
}

class _RecentSearches extends ConsumerWidget {
  const _RecentSearches({required this.onSelected});

  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recent = ref.watch(recentSearchesProvider).value ?? const [];
    if (recent.isEmpty) {
      return const EmptyState(
        icon: Icons.search_rounded,
        title: 'Que voulez-vous manger ?',
        message:
            'Cherchez un plat, un restaurant, ou choisissez une catégorie.',
      );
    }
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            RiiSpace.gutter,
            RiiSpace.md,
            RiiSpace.sm,
            0,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Recherches récentes',
                  style: context.text.titleSmall,
                ),
              ),
              TextButton(
                onPressed: () =>
                    ref.read(recentSearchesProvider.notifier).clear(),
                child: const Text('Effacer'),
              ),
            ],
          ),
        ),
        for (final value in recent)
          ListTile(
            leading: const Icon(Icons.history_rounded),
            title: Text(value, style: context.text.bodyLarge),
            onTap: () => onSelected(value),
          ),
      ],
    );
  }
}

class _DishResults extends ConsumerWidget {
  const _DishResults({
    required this.query,
    required this.controller,
    required this.onOpen,
  });

  final DishQuery query;
  final ScrollController controller;
  final ValueChanged<DishSummary> onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final results = ref.watch(dishListProvider(query));
    return results.when(
      data: (state) {
        if (state.items.isEmpty) {
          return const EmptyState(
            icon: Icons.ramen_dining_outlined,
            title: 'Aucun plat trouvé',
            message: 'Essayez un autre mot ou une autre catégorie.',
          );
        }
        return ListView.builder(
          controller: controller,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          itemCount: state.items.length + 1,
          itemBuilder: (context, index) => index == state.items.length
              ? PagedFooter(
                  state: state,
                  onRetry: () =>
                      ref.read(dishListProvider(query).notifier).loadMore(),
                )
              : DishRow(
                  dish: state.items[index],
                  onTap: () => onOpen(state.items[index]),
                ),
        );
      },
      loading: () => const _ListSkeleton(),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(dishListProvider(query)),
      ),
    );
  }
}

class _RestaurantResults extends ConsumerWidget {
  const _RestaurantResults({
    required this.query,
    required this.controller,
    required this.onOpen,
  });

  final RestaurantQuery query;
  final ScrollController controller;
  final ValueChanged<RestaurantSummary> onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final results = ref.watch(restaurantListProvider(query));
    return results.when(
      data: (state) {
        if (state.items.isEmpty) {
          return const EmptyState(
            icon: Icons.storefront_outlined,
            title: 'Aucun restaurant trouvé',
            message: 'La recherche porte sur le nom du restaurant.',
          );
        }
        return ListView.builder(
          controller: controller,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
          itemCount: state.items.length + 1,
          itemBuilder: (context, index) => index == state.items.length
              ? PagedFooter(
                  state: state,
                  onRetry: () => ref
                      .read(restaurantListProvider(query).notifier)
                      .loadMore(),
                )
              : RestaurantCard(
                  restaurant: state.items[index],
                  onTap: () => onOpen(state.items[index]),
                ),
        );
      },
      loading: () => const _ListSkeleton(),
      error: (error, _) => ErrorState(
        error: error,
        onRetry: () => ref.invalidate(restaurantListProvider(query)),
      ),
    );
  }
}

class _ListSkeleton extends StatelessWidget {
  const _ListSkeleton();

  @override
  Widget build(BuildContext context) {
    return SkeletonScope(
      child: ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(RiiSpace.gutter),
        children: [
          for (var i = 0; i < 5; i++)
            const Padding(
              padding: EdgeInsets.only(bottom: RiiSpace.lg),
              child: Row(
                children: [
                  SkeletonBox(width: 64, height: 64, radius: RiiRadius.sm),
                  SizedBox(width: RiiSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBox(width: 160, height: 14),
                        SizedBox(height: 8),
                        SkeletonBox(width: 100, height: 11),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
