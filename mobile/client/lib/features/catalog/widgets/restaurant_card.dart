import 'package:flutter/material.dart';

import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/widgets/net_image.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/skeleton.dart';
import '../catalog_models.dart';
import 'catalog_labels.dart';

/// Visuel d'un restaurant : photo de couverture, sinon logo, sinon un
/// monogramme sobre (jamais une photo de plat inventée).
class RestaurantVisual extends StatelessWidget {
  const RestaurantVisual({
    super.key,
    required this.restaurant,
    this.dimmed = false,
  });

  final RestaurantSummary restaurant;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    Widget visual;
    if (restaurant.coverUrl != null) {
      visual = NetImage(url: restaurant.coverUrl);
    } else if (restaurant.logoUrl != null) {
      visual = ColoredBox(
        color: p.surface,
        child: Padding(
          padding: const EdgeInsets.all(RiiSpace.lg),
          child: NetImage(url: restaurant.logoUrl, fit: BoxFit.contain),
        ),
      );
    } else {
      visual = RestaurantMonogram(name: restaurant.name);
    }
    if (dimmed) {
      visual = Opacity(opacity: 0.55, child: visual);
    }
    return visual;
  }
}

class RestaurantMonogram extends StatelessWidget {
  const RestaurantMonogram({super.key, required this.name, this.small = false});

  final String name;
  final bool small;

  static String initialsOf(String name) {
    final words = name
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .toList();
    final meaningful = words.where((w) => w.length > 2).toList();
    final source = meaningful.isEmpty ? words : meaningful;
    final initials = source.take(2).map((w) => w[0].toUpperCase()).join();
    return initials.isEmpty ? 'R' : initials;
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ColoredBox(
      color: p.brandSoft,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (!small)
            Positioned(
              right: -18,
              bottom: -26,
              child: Icon(
                Icons.restaurant_rounded,
                size: 120,
                color: p.brand.withValues(alpha: 0.07),
              ),
            ),
          Center(
            child: Text(
              initialsOf(name),
              style: context.text.headlineMedium!.copyWith(
                color: p.brand,
                fontSize: small ? 18 : 30,
                letterSpacing: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Carte restaurant pleine largeur (listes de l'accueil et de la recherche).
class RestaurantCard extends StatelessWidget {
  const RestaurantCard({
    super.key,
    required this.restaurant,
    required this.onTap,
    this.trailing,
  });

  final RestaurantSummary restaurant;
  final VoidCallback onTap;

  /// Action en surimpression (bouton favori).
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = context.text;
    final r = restaurant;
    final cuisine = r.categories.map((c) => c.name).take(3).join(', ');
    final subtitle = [if (cuisine.isNotEmpty) cuisine, ?r.place].join(' · ');

    return Semantics(
      button: true,
      label: '${r.name}${r.isOpen ? '' : ', fermé'}',
      child: InkWell(
        onTap: onTap,
        borderRadius: RiiRadius.mdAll,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: RiiSpace.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: RiiRadius.mdAll,
                child: AspectRatio(
                  aspectRatio: 2.1,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      RestaurantVisual(restaurant: r, dimmed: !r.isOpen),
                      if (!r.isOpen)
                        Positioned(
                          left: RiiSpace.sm,
                          bottom: RiiSpace.sm,
                          child: Tag(
                            label: closedReasonLabel(r.closedReason),
                            tone: TagTone.danger,
                            solid: true,
                          ),
                        ),
                      if (trailing != null)
                        Positioned(top: 2, right: 2, child: trailing!),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: RiiSpace.sm + 2),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      r.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.titleMedium,
                    ),
                  ),
                  const SizedBox(width: RiiSpace.sm),
                  RatingLabel(rating: r.rating, count: r.reviewCount),
                ],
              ),
              if (subtitle.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodySmall,
                  ),
                ),
              const SizedBox(height: RiiSpace.xs),
              DefaultTextStyle.merge(
                style: t.labelMedium!.copyWith(color: p.inkSoft),
                child: Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (r.prepTimeLabel != null) ...[
                      Icon(Icons.schedule_rounded, size: 15, color: p.muted),
                      const SizedBox(width: 3),
                      Text(r.prepTimeLabel!),
                      const DotSeparator(),
                    ],
                    Text(deliveryFeeLabel(r.deliveryFee)),
                    if (r.distanceKm != null) ...[
                      const DotSeparator(),
                      Text(distanceLabel(r.distanceKm!)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class RestaurantCardSkeleton extends StatelessWidget {
  const RestaurantCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: RiiSpace.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 2.1,
            child: SkeletonBox(radius: RiiRadius.md),
          ),
          SizedBox(height: RiiSpace.md),
          SkeletonBox(width: 170, height: 16),
          SizedBox(height: RiiSpace.sm),
          SkeletonBox(width: 230, height: 12),
        ],
      ),
    );
  }
}
