import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../catalog/widgets/restaurant_card.dart';
import 'favorite_button.dart';
import 'favorites_repository.dart';

class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favorites = ref.watch(favoriteRestaurantsProvider);
    final ids = ref.watch(favoriteIdsProvider).value;
    return Scaffold(
      appBar: AppBar(title: const Text('Mes favoris')),
      body: favorites.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(favoriteRestaurantsProvider),
        ),
        data: (list) {
          // Un cœur retiré disparaît tout de suite de la liste.
          final visible = ids == null
              ? list
              : list.where((r) => ids.contains(r.id)).toList();
          if (visible.isEmpty) {
            return EmptyState(
              icon: Icons.favorite_border_rounded,
              title: 'Aucun favori',
              message: 'Touchez le cœur d’un restaurant pour le retrouver ici.',
              actionLabel: 'Découvrir les restaurants',
              onAction: () => context.go(Routes.home),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(favoriteRestaurantsProvider.future),
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
              itemCount: visible.length,
              itemBuilder: (context, index) => RestaurantCard(
                restaurant: visible[index],
                onTap: () =>
                    context.push(Routes.restaurant(visible[index].slug)),
                trailing: FavoriteButton(restaurantId: visible[index].id),
              ),
            ),
          );
        },
      ),
    );
  }
}
