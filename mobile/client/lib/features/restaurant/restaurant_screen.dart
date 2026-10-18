import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/net_image.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/skeleton.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../cart/add_to_cart.dart';
import '../cart/widgets/cart_bar.dart';
import '../catalog/widgets/catalog_labels.dart';
import '../catalog/widgets/restaurant_card.dart';
import '../favorites/favorite_button.dart';
import 'restaurant_models.dart';
import 'restaurant_repository.dart';
import 'widgets/dish_sheet.dart';

class RestaurantScreen extends ConsumerStatefulWidget {
  const RestaurantScreen({super.key, required this.slug, this.openDishId});

  final String slug;

  /// Plat à ouvrir directement (arrivée depuis l'accueil ou la recherche).
  final String? openDishId;

  @override
  ConsumerState<RestaurantScreen> createState() => _RestaurantScreenState();
}

class _RestaurantScreenState extends ConsumerState<RestaurantScreen> {
  final _scroll = ScrollController();
  final Map<String, GlobalKey> _sectionKeys = {};
  final _collapsed = ValueNotifier(false);
  bool _openedInitialDish = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() => _collapsed.value = _scroll.offset > 150);
  }

  @override
  void dispose() {
    _scroll.dispose();
    _collapsed.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(restaurantDetailProvider(widget.slug));
    ref.invalidate(restaurantMenuProvider(widget.slug));
    ref.invalidate(restaurantReviewsProvider(widget.slug));
    try {
      await ref.read(restaurantMenuProvider(widget.slug).future);
    } catch (_) {}
  }

  void _openDish(MenuItem item, RestaurantDetail detail) {
    showDishSheet(
      context,
      item: item,
      restaurantOpen: detail.summary.isOpen,
      onAdd: (selection) => addDishToCart(context, ref, selection),
    );
  }

  void _maybeOpenInitialDish(RestaurantDetail detail, RestaurantMenu menu) {
    if (_openedInitialDish || widget.openDishId == null) return;
    _openedInitialDish = true;
    final item = menu.itemById(widget.openDishId!);
    if (item == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _openDish(item, detail);
    });
  }

  void _scrollToSection(String id) {
    final context = _sectionKeys[id]?.currentContext;
    if (context == null) return;
    Scrollable.ensureVisible(
      context,
      duration: RiiDurations.slow,
      curve: Curves.easeOutCubic,
      alignmentPolicy: ScrollPositionAlignmentPolicy.explicit,
      alignment: 0.02,
    );
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(restaurantDetailProvider(widget.slug));
    final menu = ref.watch(restaurantMenuProvider(widget.slug));

    return Scaffold(
      bottomNavigationBar: const CartBar(),
      body: detail.when(
        loading: () => const _RestaurantSkeleton(),
        error: (error, _) => SafeArea(
          child: Column(
            children: [
              const _TopBackBar(),
              Expanded(
                child: ErrorState(
                  error: error,
                  onRetry: () =>
                      ref.invalidate(restaurantDetailProvider(widget.slug)),
                ),
              ),
            ],
          ),
        ),
        data: (restaurant) {
          final loadedMenu = menu.value;
          if (loadedMenu != null) _maybeOpenInitialDish(restaurant, loadedMenu);
          return RefreshIndicator(
            onRefresh: _refresh,
            edgeOffset: 120,
            child: CustomScrollView(
              controller: _scroll,
              slivers: [
                _Header(detail: restaurant, collapsed: _collapsed),
                SliverToBoxAdapter(child: _Info(detail: restaurant)),
                if (loadedMenu != null && loadedMenu.sections.length > 1)
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: _SectionTabs(
                      sections: loadedMenu.sections,
                      onTap: _scrollToSection,
                    ),
                  ),
                ...menu.when(
                  loading: () => [
                    const SliverToBoxAdapter(child: _MenuSkeleton()),
                  ],
                  error: (error, _) => [
                    SliverToBoxAdapter(
                      child: ErrorState(
                        error: error,
                        compact: true,
                        onRetry: () =>
                            ref.invalidate(restaurantMenuProvider(widget.slug)),
                      ),
                    ),
                  ],
                  data: (m) => m.isEmpty
                      ? [
                          const SliverToBoxAdapter(
                            child: EmptyState(
                              icon: Icons.menu_book_outlined,
                              title: 'Menu bientôt disponible',
                              message:
                                  'Ce restaurant n’a pas encore publié ses plats.',
                              compact: true,
                            ),
                          ),
                        ]
                      : [
                          for (final section in m.sections)
                            SliverToBoxAdapter(
                              child: _MenuSection(
                                key: _sectionKeys.putIfAbsent(
                                  section.id,
                                  GlobalKey.new,
                                ),
                                section: section,
                                restaurantOpen: restaurant.summary.isOpen,
                                onOpen: (item) => _openDish(item, restaurant),
                              ),
                            ),
                        ],
                ),
                SliverToBoxAdapter(child: _Reviews(slug: widget.slug)),
                const SliverToBoxAdapter(
                  child: SizedBox(height: RiiSpace.xxxl),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TopBackBar extends StatelessWidget {
  const _TopBackBar();

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Padding(
      padding: const EdgeInsets.all(RiiSpace.xs),
      child: RiiIconButton(
        icon: Icons.arrow_back_rounded,
        tooltip: 'Retour',
        onPressed: () => Navigator.of(context).maybePop(),
      ),
    ),
  );
}

class _Header extends StatelessWidget {
  const _Header({required this.detail, required this.collapsed});

  final RestaurantDetail detail;
  final ValueListenable<bool> collapsed;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final r = detail.summary;
    return SliverAppBar(
      pinned: true,
      expandedHeight: 210,
      backgroundColor: p.surface,
      leading: Padding(
        padding: const EdgeInsets.only(left: RiiSpace.xs),
        child: RiiIconButton(
          icon: Icons.arrow_back_rounded,
          tooltip: 'Retour',
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      leadingWidth: 56,
      actions: [
        FavoriteButton(restaurantId: r.id),
        const SizedBox(width: RiiSpace.xs),
      ],
      // Le nom n'apparaît dans la barre qu'une fois l'en-tête replié (il est
      // déjà affiché en grand juste en dessous).
      title: ValueListenableBuilder<bool>(
        valueListenable: collapsed,
        builder: (context, isCollapsed, _) => AnimatedOpacity(
          opacity: isCollapsed ? 1 : 0,
          duration: RiiDurations.fast,
          child: Text(r.name, style: context.text.titleMedium),
        ),
      ),
      flexibleSpace: LayoutBuilder(
        builder: (context, constraints) {
          final top = MediaQuery.paddingOf(context).top;
          final collapsed = constraints.maxHeight <= kToolbarHeight + top + 8;
          return Stack(
            fit: StackFit.expand,
            children: [
              AnimatedOpacity(
                opacity: collapsed ? 0 : 1,
                duration: RiiDurations.fast,
                child: RestaurantVisual(restaurant: r),
              ),
              if (!collapsed && r.logoUrl != null && r.coverUrl != null)
                Positioned(
                  left: RiiSpace.gutter,
                  bottom: RiiSpace.md,
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: p.surface,
                      borderRadius: RiiRadius.mdAll,
                      border: Border.all(color: p.line),
                    ),
                    padding: const EdgeInsets.all(4),
                    child: NetImage(url: r.logoUrl, fit: BoxFit.contain),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({required this.detail});

  final RestaurantDetail detail;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final r = detail.summary;
    final cuisine = r.categories.map((c) => c.name).join(', ');
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        RiiSpace.lg,
        RiiSpace.gutter,
        RiiSpace.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(r.name, style: t.headlineSmall),
          if (cuisine.isNotEmpty || r.place != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                [if (cuisine.isNotEmpty) cuisine, ?r.place].join(' · '),
                style: t.bodyMedium!.copyWith(color: p.muted),
              ),
            ),
          const SizedBox(height: RiiSpace.md),
          Wrap(
            spacing: RiiSpace.sm,
            runSpacing: RiiSpace.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (r.isOpen)
                Tag(
                  label: r.closesAt != null
                      ? 'Ouvert · jusqu’à ${r.closesAt}'
                      : 'Ouvert',
                  tone: TagTone.success,
                )
              else
                Tag(
                  label: closedReasonLabel(r.closedReason),
                  tone: TagTone.danger,
                ),
              RatingLabel(rating: r.rating, count: r.reviewCount),
            ],
          ),
          const SizedBox(height: RiiSpace.lg),
          RiiCard(
            padding: const EdgeInsets.symmetric(vertical: RiiSpace.md),
            child: IntrinsicHeight(
              child: Row(
                children: [
                  _Fact(
                    icon: Icons.schedule_rounded,
                    value: r.prepTimeLabel ?? '—',
                    label: 'Préparation',
                  ),
                  VerticalDivider(color: p.line, width: 1),
                  _Fact(
                    icon: Icons.delivery_dining_outlined,
                    value: r.deliveryFee == 0
                        ? 'Offerte'
                        : formatXof(r.deliveryFee),
                    label: 'Livraison',
                  ),
                  VerticalDivider(color: p.line, width: 1),
                  _Fact(
                    icon: Icons.shopping_bag_outlined,
                    value: r.minOrderAmount == 0
                        ? 'Aucun'
                        : formatXof(r.minOrderAmount),
                    label: 'Minimum',
                  ),
                ],
              ),
            ),
          ),
          if (r.description != null && r.description!.isNotEmpty) ...[
            const SizedBox(height: RiiSpace.md),
            Text(
              r.description!,
              style: t.bodyMedium!.copyWith(color: p.inkSoft),
            ),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => showRiiSheet<void>(
                context,
                builder: (_) => RestaurantInfoSheet(detail: detail),
              ),
              style: TextButton.styleFrom(padding: EdgeInsets.zero),
              icon: const Icon(Icons.info_outline_rounded, size: 18),
              label: const Text('Adresse et horaires'),
            ),
          ),
          if (!r.isOpen)
            const Padding(
              padding: EdgeInsets.only(top: RiiSpace.xs),
              child: InlineBanner(
                tone: BannerTone.warning,
                message:
                    'Ce restaurant ne prend pas de commande pour le moment. '
                    'Vous pouvez consulter son menu.',
              ),
            ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.value, required this.label});

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    return Expanded(
      child: Semantics(
        label: '$label : $value',
        child: ExcludeSemantics(
          child: Column(
            children: [
              Icon(icon, size: 20, color: context.palette.inkSoft),
              const SizedBox(height: 4),
              Text(
                value,
                style: t.titleSmall,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(label, style: t.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionTabs extends SliverPersistentHeaderDelegate {
  _SectionTabs({required this.sections, required this.onTap});

  final List<MenuSection> sections;
  final ValueChanged<String> onTap;

  @override
  double get minExtent => 52;
  @override
  double get maxExtent => 52;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final p = context.palette;
    return Container(
      decoration: BoxDecoration(
        color: p.canvas,
        border: Border(bottom: BorderSide(color: p.line)),
      ),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: RiiSpace.gutter,
          vertical: 8,
        ),
        itemCount: sections.length,
        separatorBuilder: (_, _) => const SizedBox(width: RiiSpace.sm),
        itemBuilder: (context, index) => ActionChip(
          label: Text(sections[index].name),
          onPressed: () => onTap(sections[index].id),
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(_SectionTabs oldDelegate) =>
      oldDelegate.sections != sections;
}

class _MenuSection extends StatelessWidget {
  const _MenuSection({
    super.key,
    required this.section,
    required this.restaurantOpen,
    required this.onOpen,
  });

  final MenuSection section;
  final bool restaurantOpen;
  final ValueChanged<MenuItem> onOpen;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(title: section.name),
        for (final (index, item) in section.items.indexed) ...[
          if (index > 0)
            Divider(
              indent: RiiSpace.gutter,
              endIndent: RiiSpace.gutter,
              color: context.palette.line,
            ),
          MenuItemRow(item: item, onTap: () => onOpen(item)),
        ],
      ],
    );
  }
}

/// Ligne de plat du menu : texte à gauche, photo à droite (si elle existe).
class MenuItemRow extends StatelessWidget {
  const MenuItemRow({super.key, required this.item, required this.onTap});

  final MenuItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final available = item.isAvailable;
    final price = item.startingPrice > item.price
        ? 'À partir de ${formatXof(item.startingPrice)}'
        : formatXof(item.price);
    return Semantics(
      button: true,
      label: '${item.name}, $price${available ? '' : ', indisponible'}',
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: RiiSpace.gutter,
            vertical: RiiSpace.md,
          ),
          child: ExcludeSemantics(
            child: Opacity(
              opacity: available ? 1 : 0.5,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item.name, style: t.titleSmall),
                        if (item.description != null &&
                            item.description!.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(
                            item.description!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: t.bodySmall,
                          ),
                        ],
                        const SizedBox(height: RiiSpace.sm),
                        Row(
                          children: [
                            Text(
                              price,
                              style: t.labelLarge!.copyWith(color: p.ink),
                            ),
                            if (!available) ...[
                              const SizedBox(width: RiiSpace.sm),
                              const Tag(label: 'Indisponible'),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (item.imageUrl != null) ...[
                    const SizedBox(width: RiiSpace.md),
                    SizedBox.square(
                      dimension: 92,
                      child: NetImage(
                        url: item.imageUrl,
                        borderRadius: RiiRadius.mdAll,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Reviews extends ConsumerWidget {
  const _Reviews({required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviews = ref.watch(restaurantReviewsProvider(slug)).value;
    if (reviews == null || reviews.items.isEmpty) {
      return const SizedBox.shrink();
    }
    final t = context.text;
    final p = context.palette;
    final format = DateFormat('d MMM y', 'fr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(title: 'Avis (${reviews.count})'),
        for (final review in reviews.items)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              RiiSpace.gutter,
              0,
              RiiSpace.gutter,
              RiiSpace.md,
            ),
            child: RiiCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      for (var i = 0; i < 5; i++)
                        Icon(
                          i < review.rating
                              ? Icons.star_rounded
                              : Icons.star_outline_rounded,
                          size: 16,
                          color: i < review.rating ? p.rating : p.line,
                        ),
                      const SizedBox(width: RiiSpace.sm),
                      Expanded(
                        child: Text(
                          [
                            ?review.author,
                            format.format(review.createdAt),
                          ].join(' · '),
                          style: t.bodySmall,
                        ),
                      ),
                    ],
                  ),
                  if (review.comment != null && review.comment!.isNotEmpty) ...[
                    const SizedBox(height: RiiSpace.sm),
                    Text(review.comment!, style: t.bodyMedium),
                  ],
                  if (review.reply != null && review.reply!.isNotEmpty) ...[
                    const SizedBox(height: RiiSpace.sm),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(RiiSpace.sm + 2),
                      decoration: BoxDecoration(
                        color: p.canvas,
                        borderRadius: RiiRadius.smAll,
                      ),
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: 'Réponse du restaurant : ',
                              style: t.labelMedium,
                            ),
                            TextSpan(
                              text: review.reply,
                              style: t.bodySmall!.copyWith(color: p.inkSoft),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Adresse, téléphone, horaires et fermetures à venir.
class RestaurantInfoSheet extends StatelessWidget {
  const RestaurantInfoSheet({super.key, required this.detail});

  final RestaurantDetail detail;

  static const _days = [
    'Lundi',
    'Mardi',
    'Mercredi',
    'Jeudi',
    'Vendredi',
    'Samedi',
    'Dimanche',
  ];

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final today = DateTime.now().weekday;
    final dateFormat = DateFormat('EEEE d MMMM, HH:mm', 'fr');
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        0,
        RiiSpace.gutter,
        RiiSpace.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(detail.summary.name, style: t.titleLarge),
          const SizedBox(height: RiiSpace.lg),
          if (detail.address != null)
            _InfoLine(icon: Icons.place_outlined, text: detail.address!),
          if (detail.phone != null)
            _InfoLine(
              icon: Icons.call_outlined,
              text: detail.phone!,
              selectable: true,
            ),
          const SizedBox(height: RiiSpace.md),
          Text('Horaires', style: t.titleSmall),
          const SizedBox(height: RiiSpace.sm),
          if (detail.hours.isEmpty)
            Text(
              'Horaires non communiqués.',
              style: t.bodyMedium!.copyWith(color: p.muted),
            )
          else
            for (var day = 1; day <= 7; day++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 100,
                      child: Text(
                        _days[day - 1],
                        style: day == today ? t.titleSmall : t.bodyMedium,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        _rangesFor(day),
                        textAlign: TextAlign.right,
                        style: (day == today ? t.titleSmall : t.bodyMedium)!
                            .copyWith(
                              color: _rangesFor(day) == 'Fermé'
                                  ? p.muted
                                  : null,
                            ),
                      ),
                    ),
                  ],
                ),
              ),
          if (detail.upcomingClosures.isNotEmpty) ...[
            const SizedBox(height: RiiSpace.lg),
            Text('Fermetures prévues', style: t.titleSmall),
            const SizedBox(height: RiiSpace.sm),
            for (final closure in detail.upcomingClosures)
              Padding(
                padding: const EdgeInsets.only(bottom: RiiSpace.sm),
                child: InlineBanner(
                  tone: BannerTone.warning,
                  message:
                      'Du ${dateFormat.format(closure.startsAt)} au ${dateFormat.format(closure.endsAt)}'
                      '${closure.reason != null ? ' — ${closure.reason}' : ''}',
                ),
              ),
          ],
        ],
      ),
    );
  }

  String _rangesFor(int day) {
    final ranges = detail.hours.where((h) => h.dayOfWeek == day).toList();
    if (ranges.isEmpty) return 'Fermé';
    return ranges
        .map(
          (r) =>
              '${r.opensAt} – ${r.closesAt == '23:59' ? '00:00' : r.closesAt}',
        )
        .join(', ');
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({
    required this.icon,
    required this.text,
    this.selectable = false,
  });

  final IconData icon;
  final String text;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    final style = context.text.bodyMedium;
    return Padding(
      padding: const EdgeInsets.only(bottom: RiiSpace.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: context.palette.muted),
          const SizedBox(width: RiiSpace.sm),
          Expanded(
            child: selectable
                ? SelectableText(text, style: style)
                : Text(text, style: style),
          ),
        ],
      ),
    );
  }
}

class _RestaurantSkeleton extends StatelessWidget {
  const _RestaurantSkeleton();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: SkeletonScope(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          children: const [
            SkeletonBox(height: 250, radius: 0),
            Padding(
              padding: EdgeInsets.all(RiiSpace.gutter),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBox(width: 200, height: 22),
                  SizedBox(height: 10),
                  SkeletonBox(width: 150, height: 13),
                  SizedBox(height: 20),
                  SkeletonBox(height: 72, radius: RiiRadius.md),
                ],
              ),
            ),
            _MenuSkeleton(),
          ],
        ),
      ),
    );
  }
}

class _MenuSkeleton extends StatelessWidget {
  const _MenuSkeleton();

  @override
  Widget build(BuildContext context) {
    return SkeletonScope(
      child: Padding(
        padding: const EdgeInsets.all(RiiSpace.gutter),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < 4; i++)
              const Padding(
                padding: EdgeInsets.only(bottom: RiiSpace.xl),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SkeletonBox(width: 150, height: 14),
                          SizedBox(height: 8),
                          SkeletonBox(width: 220, height: 11),
                          SizedBox(height: 10),
                          SkeletonBox(width: 60, height: 13),
                        ],
                      ),
                    ),
                    SizedBox(width: RiiSpace.md),
                    SkeletonBox(width: 80, height: 80, radius: RiiRadius.md),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
