import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/state/paged.dart';
import 'package:riiberaka_core/core/widgets/net_image.dart';
import 'package:riiberaka_core/core/widgets/paged_footer.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/skeleton.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../cart/add_to_cart.dart';
import '../catalog/widgets/restaurant_card.dart';
import 'order_models.dart';
import 'orders_providers.dart';

TagTone statusTone(OrderStatus status) => switch (status) {
  OrderStatus.delivered => TagTone.success,
  OrderStatus.cancelled || OrderStatus.rejected => TagTone.danger,
  OrderStatus.pending => TagTone.warning,
  _ => TagTone.brand,
};

/// Onglet « Commandes » : en cours et historique.
class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Commandes')),
        body: EmptyState(
          icon: Icons.receipt_long_outlined,
          title: 'Suivez vos commandes ici',
          message:
              'Connectez-vous pour voir vos commandes en cours et passées.',
          actionLabel: 'Se connecter',
          onAction: () => ensureSignedIn(context, ref),
        ),
      );
    }
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Commandes'),
          bottom: TabBar(
            labelStyle: context.text.labelLarge,
            unselectedLabelStyle: context.text.labelLarge,
            labelColor: context.palette.ink,
            unselectedLabelColor: context.palette.muted,
            indicatorColor: context.palette.brand,
            tabs: const [
              Tab(text: 'En cours'),
              Tab(text: 'Passées'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _OrderList(provider: activeOrdersProvider, active: true),
            _OrderList(provider: pastOrdersProvider, active: false),
          ],
        ),
      ),
    );
  }
}

class _OrderList extends ConsumerWidget {
  const _OrderList({required this.provider, required this.active});

  final AsyncNotifierProvider<OrderListNotifier, PagedState<OrderSummary>>
  provider;
  final bool active;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(provider);
    final state = orders.value;
    if (state == null) {
      return orders.hasError
          ? ErrorState(
              error: orders.error!,
              onRetry: () => ref.invalidate(provider),
            )
          : const _OrdersSkeleton();
    }
    return RefreshIndicator(
      onRefresh: () => ref.refresh(provider.future),
      child: state.items.isEmpty
          ? ListView(
              children: [
                EmptyState(
                  icon: active
                      ? Icons.delivery_dining_outlined
                      : Icons.history_rounded,
                  title: active
                      ? 'Aucune commande en cours'
                      : 'Aucune commande passée',
                  message: active
                      ? 'Vos commandes apparaîtront ici dès leur envoi.'
                      : 'Votre historique apparaîtra ici.',
                  actionLabel: active ? 'Commander' : null,
                  onAction: active ? () => context.go(Routes.home) : null,
                ),
              ],
            )
          : NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (n.metrics.extentAfter < 400) {
                  ref.read(provider.notifier).loadMore();
                }
                return false;
              },
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: RiiSpace.sm),
                itemCount: state.items.length + 1,
                separatorBuilder: (_, _) => Divider(
                  indent: RiiSpace.gutter,
                  endIndent: RiiSpace.gutter,
                  color: context.palette.line,
                ),
                itemBuilder: (context, index) => index == state.items.length
                    ? PagedFooter(
                        state: state,
                        onRetry: () => ref.read(provider.notifier).loadMore(),
                      )
                    : OrderTile(
                        order: state.items[index],
                        onTap: () =>
                            context.push(Routes.order(state.items[index].id)),
                      ),
              ),
            ),
    );
  }
}

class OrderTile extends StatelessWidget {
  const OrderTile({super.key, required this.order, required this.onTap});

  final OrderSummary order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final date = DateFormat("d MMM 'à' HH:mm", 'fr').format(order.createdAt);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: RiiSpace.gutter,
          vertical: RiiSpace.md,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox.square(
              dimension: 48,
              child: ClipRRect(
                borderRadius: RiiRadius.smAll,
                child: order.restaurantLogoUrl != null
                    ? NetImage(
                        url: order.restaurantLogoUrl,
                        fit: BoxFit.contain,
                      )
                    : RestaurantMonogram(
                        name: order.restaurantName,
                        small: true,
                      ),
              ),
            ),
            const SizedBox(width: RiiSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          order.restaurantName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: t.titleSmall,
                        ),
                      ),
                      Text(formatXof(order.total), style: t.labelLarge),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    order.preview.isEmpty
                        ? '${order.itemCount} article(s)'
                        : order.preview,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodySmall,
                  ),
                  const SizedBox(height: RiiSpace.sm),
                  Row(
                    children: [
                      Flexible(
                        child: Tag(
                          label: order.status.label(order.deliveryType),
                          tone: statusTone(order.status),
                        ),
                      ),
                      const SizedBox(width: RiiSpace.sm),
                      Text('#${order.orderNumber} · $date', style: t.bodySmall),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrdersSkeleton extends StatelessWidget {
  const _OrdersSkeleton();

  @override
  Widget build(BuildContext context) => SkeletonScope(
    child: ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(RiiSpace.gutter),
      children: [
        for (var i = 0; i < 4; i++)
          const Padding(
            padding: EdgeInsets.only(bottom: RiiSpace.xl),
            child: Row(
              children: [
                SkeletonBox(width: 48, height: 48, radius: RiiRadius.sm),
                SizedBox(width: RiiSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonBox(width: 160, height: 14),
                      SizedBox(height: 8),
                      SkeletonBox(width: 200, height: 11),
                      SizedBox(height: 10),
                      SkeletonBox(width: 90, height: 18, radius: 9),
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
