import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../../app/routes.dart';
import '../shared/models.dart';
import '../shared/providers.dart';
import '../shared/repository.dart';
import '../shared/widgets.dart';
import 'order_actions.dart';

/// Écran de service : les commandes en cours, rangées par étape réelle.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  KitchenColumn _column = KitchenColumn.incoming;

  @override
  Widget build(BuildContext context) {
    final restaurant = ref.watch(currentRestaurantProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(restaurant?.name ?? 'Commandes'),
        actions: [
          if (restaurant?.isApproved ?? false) const _PauseChip(),
          const SizedBox(width: RiiSpace.sm),
        ],
      ),
      body: RestaurantGate(
        builder: (context, r) {
          final orders = ref.watch(activeOrdersProvider);
          final list = orders.value;
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(dashboardProvider);
              await ref
                  .refresh(activeOrdersProvider.future)
                  .catchError((_) => <KitchenOrder>[]);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                RiiSpace.gutter,
                RiiSpace.sm,
                RiiSpace.gutter,
                RiiSpace.xxxl,
              ),
              children: [
                const _TodaySummary(),
                const SizedBox(height: RiiSpace.md),
                _ColumnTabs(
                  selected: _column,
                  counts: {
                    for (final c in KitchenColumn.values)
                      c:
                          list
                              ?.where((o) => c.states.contains(o.state))
                              .length ??
                          0,
                  },
                  onChanged: (c) => setState(() => _column = c),
                ),
                const SizedBox(height: RiiSpace.md),
                if (list == null && orders.hasError)
                  ErrorState(
                    error: orders.error!,
                    onRetry: () => ref.invalidate(activeOrdersProvider),
                    compact: true,
                  )
                else if (list == null)
                  const Padding(
                    padding: EdgeInsets.all(RiiSpace.xxl),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else ...[
                  if (orders.hasError)
                    const Padding(
                      padding: EdgeInsets.only(bottom: RiiSpace.md),
                      child: InlineBanner(
                        tone: BannerTone.warning,
                        icon: Icons.wifi_off_rounded,
                        message:
                            'Connexion interrompue. Nouvelle tentative… Les commandes affichées peuvent dater.',
                      ),
                    ),
                  ..._cards(
                    context,
                    r,
                    list
                        .where((o) => _column.states.contains(o.state))
                        .toList(),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  List<Widget> _cards(
    BuildContext context,
    MyRestaurant r,
    List<KitchenOrder> orders,
  ) {
    if (orders.isEmpty) {
      return [
        EmptyState(
          icon: switch (_column) {
            KitchenColumn.incoming => Icons.notifications_none_rounded,
            KitchenColumn.cooking => Icons.soup_kitchen_outlined,
            KitchenColumn.ready => Icons.check_circle_outline_rounded,
            KitchenColumn.delivering => Icons.delivery_dining_outlined,
          },
          title: switch (_column) {
            KitchenColumn.incoming => 'Aucune nouvelle commande',
            KitchenColumn.cooking => 'Rien en cuisine',
            KitchenColumn.ready => 'Aucune commande prête',
            KitchenColumn.delivering => 'Aucune commande en livraison',
          },
          message: _column == KitchenColumn.incoming
              ? 'Les nouvelles commandes arrivent ici avec un signal sonore.'
              : null,
          compact: true,
        ),
      ];
    }
    return [
      for (final o in orders)
        Padding(
          padding: const EdgeInsets.only(bottom: RiiSpace.md),
          child: OrderCard(order: o, restaurantId: r.id),
        ),
    ];
  }
}

class _PauseChip extends ConsumerWidget {
  const _PauseChip();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(restaurantProfileProvider).value;
    if (profile == null) return const SizedBox.shrink();
    return Tag(
      label: profile.isPaused ? 'En pause' : 'Ouvert aux commandes',
      tone: profile.isPaused ? TagTone.danger : TagTone.success,
      icon: profile.isPaused ? Icons.pause_rounded : Icons.circle,
    );
  }
}

class _TodaySummary extends ConsumerWidget {
  const _TodaySummary();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(dashboardProvider).value;
    final t = context.text;
    if (d == null) return const SizedBox(height: 72);
    Widget fig(String v, String l) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(v, style: t.titleLarge),
          Text(l, style: t.bodySmall),
        ],
      ),
    );
    return RiiCard(
      onTap: () => context.push(Routes.stats),
      child: Row(
        children: [
          fig('${d.total}', 'commandes aujourd’hui'),
          fig('${d.completed}', 'terminées'),
          fig(formatXof(d.revenue), 'ventes livrées'),
        ],
      ),
    );
  }
}

class _ColumnTabs extends StatelessWidget {
  const _ColumnTabs({
    required this.selected,
    required this.counts,
    required this.onChanged,
  });

  final KitchenColumn selected;
  final Map<KitchenColumn, int> counts;
  final ValueChanged<KitchenColumn> onChanged;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = context.text;
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: KitchenColumn.values.length,
        separatorBuilder: (_, _) => const SizedBox(width: RiiSpace.sm),
        itemBuilder: (context, i) {
          final c = KitchenColumn.values[i];
          final active = c == selected;
          final n = counts[c] ?? 0;
          final urgent = c == KitchenColumn.incoming && n > 0;
          return Semantics(
            selected: active,
            button: true,
            label: '${c.label}, $n',
            child: InkWell(
              borderRadius: RiiRadius.pillAll,
              onTap: () => onChanged(c),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: RiiSpace.lg),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: active ? p.ink : p.surface,
                  borderRadius: RiiRadius.pillAll,
                  border: Border.all(color: active ? p.ink : p.line),
                ),
                child: ExcludeSemantics(
                  child: Row(
                    children: [
                      Text(
                        c.label,
                        style: t.labelLarge!.copyWith(
                          color: active ? p.surface : p.ink,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        constraints: const BoxConstraints(minWidth: 22),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 1,
                        ),
                        decoration: BoxDecoration(
                          color: urgent
                              ? p.warning
                              : (active
                                    ? p.surface.withValues(alpha: .2)
                                    : p.canvas),
                          borderRadius: RiiRadius.pillAll,
                        ),
                        child: Text(
                          '$n',
                          textAlign: TextAlign.center,
                          style: t.labelMedium!.copyWith(
                            color: urgent
                                ? Colors.white
                                : (active ? p.surface : p.inkSoft),
                          ),
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

/// Carte de commande : l'action suivante est directement sur la carte.
class OrderCard extends ConsumerStatefulWidget {
  const OrderCard({super.key, required this.order, required this.restaurantId});

  final KitchenOrder order;
  final String restaurantId;

  @override
  ConsumerState<OrderCard> createState() => _OrderCardState();
}

class _OrderCardState extends ConsumerState<OrderCard> {
  bool _busy = false;

  Future<void> _do(OrderAction action) async {
    if (_busy) return;
    setState(() => _busy = true);
    await runOrderAction(
      context,
      ref,
      widget.restaurantId,
      widget.order,
      action,
    );
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    final t = context.text;
    final p = context.palette;
    final minutes = DateTime.now().difference(o.createdAt).inMinutes;
    final age = minutes < 1 ? 'à l’instant' : 'il y a $minutes min';
    final actions = nextActions(o);
    final primary = actions
        .where((a) => a != OrderAction.reject && a != OrderAction.cancel)
        .toList();
    return Container(
      decoration: BoxDecoration(
        color: p.surface,
        borderRadius: RiiRadius.lgAll,
        border: Border.all(
          color: o.state == OrderState.pending ? p.warning : p.line,
          width: o.state == OrderState.pending ? 2 : 1,
        ),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: RiiRadius.lgAll,
          onTap: () => context.push(Routes.order(o.id)),
          child: Padding(
            padding: const EdgeInsets.all(RiiSpace.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Text('#${o.orderNumber}', style: t.headlineSmall),
                    const SizedBox(width: RiiSpace.sm),
                    Expanded(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: orderStateTag(o.state),
                      ),
                    ),
                    const SizedBox(width: RiiSpace.sm),
                    Text(age, style: t.bodySmall),
                  ],
                ),
                const SizedBox(height: RiiSpace.xs),
                Text(
                  [
                    o.isPickup ? 'À emporter' : 'Livraison',
                    ?o.clientFirstName,
                    '${o.itemCount} article${o.itemCount > 1 ? 's' : ''}',
                  ].join(' · '),
                  style: t.bodyMedium!.copyWith(color: p.inkSoft),
                ),
                const SizedBox(height: RiiSpace.sm),
                for (final line in o.items.take(4))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      '${line.quantity} × ${line.name}${line.options.isEmpty ? '' : ' (${line.options.join(', ')})'}',
                      style: t.titleSmall,
                    ),
                  ),
                if (o.items.length > 4)
                  Text('+ ${o.items.length - 4} autre(s)', style: t.bodySmall),
                if (o.notes != null && o.notes!.isNotEmpty) ...[
                  const SizedBox(height: RiiSpace.xs),
                  Text(
                    'Note : ${o.notes}',
                    style: t.bodyMedium!.copyWith(
                      color: p.warning,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                const SizedBox(height: RiiSpace.sm),
                Row(
                  children: [
                    Text(formatXof(o.total), style: t.titleMedium),
                    const SizedBox(width: RiiSpace.sm),
                    Text(
                      o.paymentMethod == 'CASH_ON_DELIVERY'
                          ? 'espèces'
                          : o.paymentMethod,
                      style: t.bodySmall,
                    ),
                  ],
                ),
                if (o.state == OrderState.ready && !o.isPickup) ...[
                  const SizedBox(height: RiiSpace.sm),
                  const InlineBanner(
                    message:
                        'En attente du livreur. Donnez-lui le code de retrait affiché dans le détail.',
                  ),
                ],
                if (o.state == OrderState.assigned) ...[
                  const SizedBox(height: RiiSpace.sm),
                  const InlineBanner(
                    message:
                        'Un livreur arrive. Ouvrez la commande pour voir le code de retrait.',
                  ),
                ],
                if (actions.isNotEmpty) ...[
                  const SizedBox(height: RiiSpace.md),
                  Row(
                    children: [
                      if (actions.contains(OrderAction.reject))
                        Expanded(
                          child: RiiButton(
                            label: 'Refuser',
                            variant: RiiButtonVariant.secondary,
                            onPressed: _busy
                                ? null
                                : () => _do(OrderAction.reject),
                          ),
                        ),
                      if (actions.contains(OrderAction.reject))
                        const SizedBox(width: RiiSpace.sm),
                      for (final a in primary)
                        Expanded(
                          flex: 2,
                          child: RiiButton(
                            label: actionLabel(a, o),
                            loading: _busy,
                            onPressed: () => _do(a),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
