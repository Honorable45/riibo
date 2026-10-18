import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../cart/add_to_cart.dart';
import 'favorites_repository.dart';

/// Cœur « favori » : demande la connexion au premier usage.
class FavoriteButton extends ConsumerWidget {
  const FavoriteButton({super.key, required this.restaurantId});

  final String restaurantId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isFavorite =
        ref.watch(favoriteIdsProvider).value?.contains(restaurantId) ?? false;
    final p = context.palette;
    return RiiIconButton(
      icon: isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
      color: isFavorite ? p.danger : p.ink,
      tooltip: isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
      onPressed: () async {
        final signedIn = await ensureSignedIn(
          context,
          ref,
          reason: 'Connectez-vous pour retrouver vos restaurants favoris.',
        );
        if (!signedIn) return;
        final ok = await ref
            .read(favoriteIdsProvider.notifier)
            .toggle(restaurantId);
        if (!ok && context.mounted) {
          showRiiSnack(
            context,
            'Impossible de modifier vos favoris. Réessayez.',
          );
        }
      },
    );
  }
}
