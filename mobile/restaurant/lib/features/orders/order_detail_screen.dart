import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/routes.dart';
import '../shared/models.dart';
import '../shared/providers.dart';
import '../shared/repository.dart';
import '../shared/widgets.dart';
import 'order_actions.dart';

class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  bool _busy = false;

  Future<void> _do(KitchenOrder order, OrderAction action) async {
    final restaurant = ref.read(currentRestaurantProvider);
    if (_busy || restaurant == null) return;
    setState(() => _busy = true);
    await runOrderAction(context, ref, restaurant.id, order, action);
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _retry(KitchenOrder order) async {
    final restaurant = ref.read(currentRestaurantProvider);
    if (_busy || restaurant == null) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(restaurantRepositoryProvider)
          .retryDelivery(restaurant.id, order.id);
      if (mounted) showRiiSnack(context, 'Recherche d’un livreur relancée.');
    } on ApiException catch (e) {
      if (mounted) showRiiSnack(context, e.message);
    } finally {
      ref.invalidate(orderDetailProvider(order.id));
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(orderDetailProvider(widget.orderId));
    final o = async.value;
    final t = context.text;
    final p = context.palette;
    return Scaffold(
      appBar: AppBar(
        title: Text(o == null ? 'Commande' : 'Commande #${o.orderNumber}'),
      ),
      body: o == null
          ? (async.hasError
                ? ErrorState(
                    error: async.error!,
                    onRetry: () =>
                        ref.invalidate(orderDetailProvider(widget.orderId)),
                  )
                : const Center(child: CircularProgressIndicator()))
          : ListView(
              padding: const EdgeInsets.all(RiiSpace.gutter),
              children: [
                Row(
                  children: [
                    orderStateTag(o.state),
                    const SizedBox(width: RiiSpace.sm),
                    Text(
                      o.isPickup ? 'À emporter' : 'Livraison',
                      style: t.labelLarge,
                    ),
                    const Spacer(),
                    Text(
                      DateFormat("d MMM 'à' HH:mm", 'fr').format(o.createdAt),
                      style: t.bodySmall,
                    ),
                  ],
                ),
                if (o.state == OrderState.rejected ||
                    o.state == OrderState.cancelled) ...[
                  const SizedBox(height: RiiSpace.md),
                  InlineBanner(
                    tone: BannerTone.danger,
                    message:
                        'Motif : ${o.rejectionReason ?? o.cancelReason ?? 'non précisé'}',
                  ),
                ],
                if (o.pickupCode != null &&
                    !o.state.isFinal &&
                    !o.isPickup) ...[
                  const SizedBox(height: RiiSpace.md),
                  RiiCard(
                    color: p.brandSoft,
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Code de retrait', style: t.titleSmall),
                              Text(
                                'À donner au livreur quand il récupère la commande.',
                                style: t.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        Text(
                          o.pickupCode!,
                          style: t.headlineMedium!.copyWith(
                            color: p.brand,
                            letterSpacing: 3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                if (o.deliveryLabel != null && !o.isPickup) ...[
                  const SizedBox(height: RiiSpace.md),
                  RiiCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.delivery_dining_outlined,
                              color: p.inkSoft,
                            ),
                            const SizedBox(width: RiiSpace.sm),
                            Expanded(
                              child: Text(
                                o.deliveryLabel!,
                                style: t.titleSmall,
                              ),
                            ),
                          ],
                        ),
                        if (o.driverFirstName != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4, left: 32),
                            child: Text(
                              [o.driverFirstName!, ?o.driverPlate].join(' · '),
                              style: t.bodyMedium,
                            ),
                          ),
                        if (o.deliveryStatus == 'NO_DRIVER_FOUND') ...[
                          const SizedBox(height: RiiSpace.sm),
                          RiiButton(
                            label: 'Relancer la recherche',
                            small: true,
                            variant: RiiButtonVariant.secondary,
                            loading: _busy,
                            onPressed: () => _retry(o),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
                const SectionHeader(
                  title: 'À préparer',
                  padding: EdgeInsets.fromLTRB(0, RiiSpace.xl, 0, RiiSpace.sm),
                ),
                RiiCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final line in o.items)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                width: 36,
                                child: Text(
                                  '${line.quantity}×',
                                  style: t.titleMedium,
                                ),
                              ),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(line.name, style: t.titleMedium),
                                    if (line.options.isNotEmpty)
                                      Text(
                                        line.options.join(', '),
                                        style: t.bodyMedium,
                                      ),
                                    if (line.note != null &&
                                        line.note!.isNotEmpty)
                                      Text(
                                        '« ${line.note} »',
                                        style: t.bodyMedium!.copyWith(
                                          color: p.warning,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              Text(
                                formatXof(line.lineTotal),
                                style: t.bodyMedium,
                              ),
                            ],
                          ),
                        ),
                      if (o.notes != null && o.notes!.isNotEmpty) ...[
                        const Divider(),
                        Text(
                          'Note du client : ${o.notes}',
                          style: t.bodyMedium!.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SectionHeader(
                  title: 'Client et paiement',
                  padding: EdgeInsets.fromLTRB(0, RiiSpace.xl, 0, RiiSpace.sm),
                ),
                RiiCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (o.clientFirstName != null)
                        Text(o.clientFirstName!, style: t.titleMedium),
                      if (o.clientPhone != null)
                        Row(
                          children: [
                            Expanded(
                              child: SelectableText(
                                PhoneNumbers.display(o.clientPhone!),
                                style: t.bodyLarge,
                              ),
                            ),
                            IconButton(
                              tooltip: 'Appeler',
                              icon: const Icon(Icons.call_outlined),
                              onPressed: () => launchUrl(
                                Uri(scheme: 'tel', path: o.clientPhone),
                              ),
                            ),
                            IconButton(
                              tooltip: 'Copier',
                              icon: const Icon(Icons.copy_rounded),
                              onPressed: () => Clipboard.setData(
                                ClipboardData(text: o.clientPhone!),
                              ),
                            ),
                          ],
                        ),
                      const Divider(),
                      Row(
                        children: [
                          Expanded(child: Text('Repas', style: t.bodyMedium)),
                          Text(formatXof(o.subtotal)),
                        ],
                      ),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Total payé par le client',
                              style: t.titleSmall,
                            ),
                          ),
                          Text(formatXof(o.total), style: t.titleSmall),
                        ],
                      ),
                      Text(
                        o.paymentMethod == 'CASH_ON_DELIVERY'
                            ? 'Paiement en espèces à la livraison'
                            : o.paymentMethod,
                        style: t.bodySmall,
                      ),
                    ],
                  ),
                ),
                for (final c in o.conversations)
                  Padding(
                    padding: const EdgeInsets.only(top: RiiSpace.sm),
                    child: RiiButton(
                      label: c.kind == 'ORDER_RESTAURANT_DRIVER'
                          ? 'Écrire au livreur'
                          : 'Écrire au client',
                      icon: Icons.chat_bubble_outline_rounded,
                      variant: RiiButtonVariant.ghost,
                      onPressed: () => context.push(
                        Routes.chat(
                          c.id,
                          title: c.kind == 'ORDER_RESTAURANT_DRIVER'
                              ? 'Livreur · #${o.orderNumber}'
                              : '${o.clientFirstName ?? 'Client'} · #${o.orderNumber}',
                          readOnly: c.isClosed,
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: RiiSpace.xxl),
              ],
            ),
      bottomNavigationBar: o == null || nextActions(o).isEmpty
          ? null
          : DecoratedBox(
              decoration: BoxDecoration(
                color: p.surface,
                border: Border(top: BorderSide(color: p.line)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(RiiSpace.gutter),
                  child: Row(
                    children: [
                      for (final a in nextActions(
                        o,
                      ).where((a) => a.needsReason)) ...[
                        Expanded(
                          child: RiiButton(
                            label: actionLabel(a, o),
                            variant: RiiButtonVariant.secondary,
                            onPressed: _busy ? null : () => _do(o, a),
                          ),
                        ),
                        const SizedBox(width: RiiSpace.sm),
                      ],
                      for (final a in nextActions(
                        o,
                      ).where((a) => !a.needsReason))
                        Expanded(
                          flex: 2,
                          child: RiiButton(
                            label: actionLabel(a, o),
                            loading: _busy,
                            onPressed: () => _do(o, a),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
    );
  }
}
