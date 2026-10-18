import 'package:flutter/material.dart';

import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/net_image.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/skeleton.dart';
import '../catalog_models.dart';
import 'catalog_labels.dart';

/// Vignette de plat pour un carrousel horizontal.
class DishTile extends StatelessWidget {
  const DishTile({super.key, required this.dish, required this.onTap});

  static const width = 150.0;

  final DishSummary dish;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    return SizedBox(
      width: width,
      child: Semantics(
        button: true,
        label:
            '${dish.name}, ${dish.restaurantName}, ${formatXofLong(dish.price)}',
        child: InkWell(
          onTap: onTap,
          borderRadius: RiiRadius.mdAll,
          child: ExcludeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AspectRatio(
                  aspectRatio: 1,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      NetImage(
                        url: dish.imageUrl,
                        borderRadius: RiiRadius.mdAll,
                        fallbackIcon: Icons.ramen_dining_outlined,
                      ),
                      if (!dish.restaurantIsOpen)
                        const Positioned(
                          left: 6,
                          bottom: 6,
                          child: Tag(
                            label: 'Fermé',
                            tone: TagTone.danger,
                            solid: true,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: RiiSpace.sm),
                Text(
                  dish.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.titleSmall,
                ),
                Text(
                  dish.restaurantName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.bodySmall,
                ),
                const SizedBox(height: 2),
                Text(
                  formatXof(dish.price),
                  style: t.labelLarge!.copyWith(color: p.ink),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class DishTileSkeleton extends StatelessWidget {
  const DishTileSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox(
    width: DishTile.width,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AspectRatio(aspectRatio: 1, child: SkeletonBox(radius: RiiRadius.md)),
        SizedBox(height: RiiSpace.sm),
        SkeletonBox(width: 110, height: 13),
        SizedBox(height: 6),
        SkeletonBox(width: 70, height: 11),
      ],
    ),
  );
}

/// Ligne de plat dans une liste (résultats de recherche).
class DishRow extends StatelessWidget {
  const DishRow({super.key, required this.dish, required this.onTap});

  final DishSummary dish;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: RiiSpace.gutter,
          vertical: RiiSpace.sm + 2,
        ),
        child: Row(
          children: [
            SizedBox.square(
              dimension: 64,
              child: NetImage(
                url: dish.imageUrl,
                borderRadius: RiiRadius.smAll,
                fallbackIcon: Icons.ramen_dining_outlined,
              ),
            ),
            const SizedBox(width: RiiSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    dish.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: t.titleSmall,
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          dish.restaurantName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: t.bodySmall,
                        ),
                      ),
                      if (!dish.restaurantIsOpen) ...[
                        const SizedBox(width: RiiSpace.xs + 2),
                        const Tag(label: 'Fermé', tone: TagTone.danger),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: RiiSpace.md),
            Text(formatXof(dish.price), style: t.labelLarge),
          ],
        ),
      ),
    );
  }
}

/// Rangée horizontale de catégories (filtre unique, re-toucher désélectionne).
class CategoryRail extends StatelessWidget {
  const CategoryRail({
    super.key,
    required this.categories,
    required this.selected,
    required this.onSelected,
  });

  final List<CuisineCategory> categories;
  final String? selected;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = context.text;
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter - 4),
        itemCount: categories.length,
        separatorBuilder: (_, _) => const SizedBox(width: 2),
        itemBuilder: (context, index) {
          final category = categories[index];
          final isSelected = category.slug == selected;
          return Semantics(
            selected: isSelected,
            button: true,
            label: category.name,
            child: InkWell(
              borderRadius: RiiRadius.mdAll,
              onTap: () => onSelected(isSelected ? null : category.slug),
              child: SizedBox(
                width: 76,
                child: ExcludeSemantics(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AnimatedContainer(
                        duration: RiiDurations.fast,
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: isSelected ? p.ink : p.surface,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isSelected ? p.ink : p.line,
                          ),
                        ),
                        child: Icon(
                          categoryIcon(category.slug),
                          size: 24,
                          color: isSelected ? p.surface : p.inkSoft,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        category.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.labelSmall!.copyWith(
                          color: isSelected ? p.ink : p.inkSoft,
                          fontWeight: isSelected
                              ? FontWeight.w800
                              : FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
