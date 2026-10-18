import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/skeleton.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../cart/cart_controller.dart';
import '../chat/support.dart';
import 'order_models.dart';
import 'orders_providers.dart';
import 'orders_repository.dart';

class OrderScreen extends ConsumerWidget {
  const OrderScreen({
    super.key,
    required this.orderId,
    this.justPlaced = false,
  });

  final String orderId;
  final bool justPlaced;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(orderDetailProvider(orderId));
    final order = async.value;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          order == null ? 'Commande' : 'Commande #${order.orderNumber}',
        ),
      ),
      body: order == null
          ? (async.hasError
                ? ErrorState(
                    error: async.error!,
                    onRetry: () => ref.invalidate(orderDetailProvider(orderId)),
                  )
                : const _DetailSkeleton())
          : RefreshIndicator(
              onRefresh: () => ref.refresh(orderDetailProvider(orderId).future),
              child: _OrderBody(
                order: order,
                justPlaced: justPlaced,
                stale: async.hasError,
              ),
            ),
    );
  }
}

class _OrderBody extends ConsumerWidget {
  const _OrderBody({
    required this.order,
    required this.justPlaced,
    required this.stale,
  });

  final OrderDetail order;
  final bool justPlaced;

  /// La dernière relecture a échoué : les informations affichées peuvent
  /// dater (on le dit plutôt que de les présenter comme à jour).
  final bool stale;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showTracking =
        order.deliveryType == DeliveryType.delivery &&
        !order.status.isFinal &&
        order.deliveryStatus != null;
    return ListView(
      padding: const EdgeInsets.only(bottom: RiiSpace.xxxl),
      children: [
        if (stale)
          const _Padded(
            child: InlineBanner(
              tone: BannerTone.warning,
              icon: Icons.wifi_off_rounded,
              message:
                  'Connexion instable : ces informations peuvent ne pas être à jour.',
            ),
          ),
        if (justPlaced && order.status == OrderStatus.pending)
          const _Padded(
            child: InlineBanner(
              tone: BannerTone.success,
              title: 'Commande envoyée',
              message:
                  'Le restaurant va la confirmer. Vous suivez chaque étape ici.',
            ),
          ),
        _StatusCard(order: order),
        if (order.deliveryCode != null &&
            order.deliveryType == DeliveryType.delivery &&
            !order.status.isFinal)
          _DeliveryCodeCard(code: order.deliveryCode!),
        if (showTracking) _DriverCard(order: order),
        _Section(
          title: order.restaurantName,
          children: [
            if (order.restaurantAddress != null)
              _Line(
                icon: Icons.storefront_outlined,
                text: order.restaurantAddress!,
              ),
            if (order.restaurantPhone != null)
              _CopyLine(
                icon: Icons.call_outlined,
                text: PhoneNumbers.display(order.restaurantPhone!),
              ),
          ],
        ),
        if (order.deliveryType == DeliveryType.delivery)
          _Section(
            title: 'Livraison',
            children: [
              _Line(
                icon: Icons.place_outlined,
                text: [
                  order.deliveryAddress ?? 'Adresse non précisée',
                  ?order.deliveryLandmark,
                ].join('\n'),
              ),
              if (order.contactPhone != null)
                _Line(
                  icon: Icons.phone_iphone_rounded,
                  text: PhoneNumbers.display(order.contactPhone!),
                ),
            ],
          ),
        _ItemsSection(order: order),
        _Actions(order: order),
      ],
    );
  }
}

class _Padded extends StatelessWidget {
  const _Padded({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(
      RiiSpace.gutter,
      RiiSpace.md,
      RiiSpace.gutter,
      0,
    ),
    child: child,
  );
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.order});

  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final time = DateFormat('HH:mm', 'fr');
    final title = order.status.label(order.deliveryType);

    if (order.status.isFailure) {
      final reason = order.status == OrderStatus.rejected
          ? order.rejectionReason
          : order.cancelReason;
      return _Padded(
        child: RiiCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Tag(label: title, tone: TagTone.danger),
              const SizedBox(height: RiiSpace.md),
              Text(
                order.status == OrderStatus.rejected
                    ? 'Le restaurant n’a pas pu accepter votre commande.'
                    : 'Cette commande a été annulée.',
                style: t.titleMedium,
              ),
              if (reason != null && reason.isNotEmpty) ...[
                const SizedBox(height: RiiSpace.xs),
                Text(
                  'Motif : $reason',
                  style: t.bodyMedium!.copyWith(color: p.inkSoft),
                ),
              ],
              const SizedBox(height: RiiSpace.xs),
              Text('Aucun paiement n’a été demandé.', style: t.bodySmall),
            ],
          ),
        ),
      );
    }

    final steps = orderSteps(order.deliveryType);
    final current = currentStepIndex(order.status, order.deliveryType);
    final hint = order.status.isFinal ? null : order.deliveryStatus?.hint;
    DateTime? stepTime(int index) => switch (index) {
      0 => order.createdAt,
      1 => order.acceptedAt,
      _ when steps[index].$2.contains(OrderStatus.ready) => order.readyAt,
      _ when index == steps.length - 1 => order.deliveredAt,
      _ => null,
    };

    return _Padded(
      child: RiiCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              liveRegion: true,
              child: Text(title, style: t.headlineSmall),
            ),
            if (hint != null) ...[
              const SizedBox(height: RiiSpace.xs),
              Text(hint, style: t.bodyMedium!.copyWith(color: p.inkSoft)),
            ],
            const SizedBox(height: RiiSpace.lg),
            for (var i = 0; i < steps.length; i++)
              _Step(
                label: steps[i].$1,
                done: i < current || (i == current && order.status.isFinal),
                active: i == current && !order.status.isFinal,
                last: i == steps.length - 1,
                time: i <= current && stepTime(i) != null
                    ? time.format(stepTime(i)!)
                    : null,
              ),
          ],
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.label,
    required this.done,
    required this.active,
    required this.last,
    this.time,
  });

  final String label;
  final bool done;
  final bool active;
  final bool last;
  final String? time;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = context.text;
    final color = done || active ? p.brand : p.line;
    return Semantics(
      label:
          '$label${done
              ? ', terminé'
              : active
              ? ', en cours'
              : ''}',
      child: ExcludeSemantics(
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 24,
                child: Column(
                  children: [
                    Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: done ? p.brand : p.surface,
                        border: Border.all(color: color, width: 2),
                      ),
                      child: done
                          ? Icon(
                              Icons.check_rounded,
                              size: 13,
                              color: p.surface,
                            )
                          : active
                          ? Center(
                              child: Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: p.brand,
                                ),
                              ),
                            )
                          : null,
                    ),
                    if (!last)
                      Expanded(
                        child: Container(
                          width: 2,
                          color: done ? p.brand : p.line,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: RiiSpace.md),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(bottom: last ? 0 : RiiSpace.lg),
                  child: Text(
                    label,
                    style: (active ? t.titleSmall : t.bodyMedium)!.copyWith(
                      color: done || active ? p.ink : p.subtle,
                    ),
                  ),
                ),
              ),
              if (time != null) Text(time!, style: t.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _DeliveryCodeCard extends StatelessWidget {
  const _DeliveryCodeCard({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final spaced = code.split('').join(' ');
    return _Padded(
      child: RiiCard(
        color: p.brandSoft,
        child: Row(
          children: [
            Icon(Icons.verified_user_outlined, color: p.brand),
            const SizedBox(width: RiiSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Code de remise', style: t.titleSmall),
                  Text(
                    'À donner au livreur à la réception, jamais avant.',
                    style: t.bodySmall,
                  ),
                ],
              ),
            ),
            Semantics(
              label: 'Code de remise $spaced',
              child: Text(
                code,
                style: t.headlineSmall!.copyWith(
                  letterSpacing: 3,
                  color: p.brand,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DriverCard extends ConsumerStatefulWidget {
  const _DriverCard({required this.order});

  final OrderDetail order;

  @override
  ConsumerState<_DriverCard> createState() => _DriverCardState();
}

class _DriverCardState extends ConsumerState<_DriverCard> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Rafraîchit « il y a X s » sans requête réseau.
    _ticker = Timer.periodic(
      const Duration(seconds: 10),
      (_) => setState(() {}),
    );
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final tracking = ref.watch(trackingProvider(widget.order.id)).value;
    final driver = tracking?.driver ?? widget.order.driver;
    final now = DateTime.now();

    String positionText;
    if (tracking == null || !tracking.hasDriverPosition) {
      positionText = driver == null
          ? 'En attente d’un livreur.'
          : 'Position du livreur indisponible pour le moment.';
    } else if (tracking.isStale(now)) {
      positionText = 'Dernière position connue il y a plus de 2 min.';
    } else {
      final seconds = now
          .difference(tracking.driverSeenAt!)
          .inSeconds
          .clamp(0, 999);
      positionText = seconds < 15
          ? 'Position à l’instant'
          : 'Position mise à jour il y a $seconds s';
    }
    final eta = tracking?.etaMinutes;

    return _Padded(
      child: RiiCard(
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: p.brandSoft,
              foregroundColor: p.brand,
              child: const Icon(Icons.delivery_dining_rounded),
            ),
            const SizedBox(width: RiiSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(driver?.firstName ?? 'Livreur', style: t.titleSmall),
                  if (driver != null)
                    Text(
                      [?driver.vehicleLabel, ?driver.plateNumber].join(' · '),
                      style: t.bodySmall,
                    ),
                  const SizedBox(height: 2),
                  Text(positionText, style: t.bodySmall),
                ],
              ),
            ),
            if (eta != null && tracking != null && !tracking.isStale(now))
              Column(
                children: [
                  Text('~$eta min', style: t.titleMedium),
                  Text('estimé', style: t.bodySmall),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(title: title),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
          child: Column(children: children),
        ),
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: RiiSpace.sm),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: context.palette.muted),
        const SizedBox(width: RiiSpace.md),
        Expanded(child: Text(text, style: context.text.bodyMedium)),
      ],
    ),
  );
}

class _CopyLine extends StatelessWidget {
  const _CopyLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: () async {
      await Clipboard.setData(ClipboardData(text: text.replaceAll(' ', '')));
      if (context.mounted) showRiiSnack(context, 'Numéro copié');
    },
    child: Padding(
      padding: const EdgeInsets.only(bottom: RiiSpace.sm),
      child: Row(
        children: [
          Icon(icon, size: 20, color: context.palette.muted),
          const SizedBox(width: RiiSpace.md),
          Expanded(child: Text(text, style: context.text.bodyMedium)),
          Icon(Icons.copy_rounded, size: 18, color: context.palette.subtle),
        ],
      ),
    ),
  );
}

class _ItemsSection extends StatelessWidget {
  const _ItemsSection({required this.order});

  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    Widget row(String a, String b, {TextStyle? style}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(a, style: style ?? t.bodyMedium)),
          const SizedBox(width: RiiSpace.md),
          Text(b, style: style ?? t.bodyMedium),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Détail'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final line in order.items) ...[
                row(
                  '${line.quantity} × ${line.name}',
                  formatXof(line.lineTotal),
                ),
                if (line.options.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(
                      left: RiiSpace.lg,
                      bottom: 2,
                    ),
                    child: Text(line.options.join(', '), style: t.bodySmall),
                  ),
                if (line.note != null && line.note!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(
                      left: RiiSpace.lg,
                      bottom: 2,
                    ),
                    child: Text('« ${line.note} »', style: t.bodySmall),
                  ),
              ],
              Divider(height: RiiSpace.xl, color: p.line),
              row('Sous-total', formatXof(order.subtotal)),
              if (order.discount > 0)
                row('Remise', '−${formatXof(order.discount)}'),
              if (order.deliveryType == DeliveryType.delivery)
                row(
                  'Livraison',
                  order.deliveryFee == 0
                      ? 'Offerte'
                      : formatXof(order.deliveryFee),
                ),
              row('Total', formatXof(order.total), style: t.titleMedium),
              const SizedBox(height: RiiSpace.xs),
              Text(
                '${order.paymentMethod.label}'
                '${order.paymentStatus == 'PAID' ? ' · payé' : ''}',
                style: t.bodySmall,
              ),
              if (order.notes != null && order.notes!.isNotEmpty) ...[
                const SizedBox(height: RiiSpace.sm),
                Text('Votre précision : ${order.notes}', style: t.bodySmall),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Actions extends ConsumerStatefulWidget {
  const _Actions({required this.order});

  final OrderDetail order;

  @override
  ConsumerState<_Actions> createState() => _ActionsState();
}

class _ActionsState extends ConsumerState<_Actions> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } on ApiException catch (error) {
      if (mounted) showRiiSnack(context, error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    final ok = await confirmDialog(
      context,
      title: 'Annuler la commande ?',
      message: 'Le restaurant sera prévenu. Cette action est définitive.',
      confirmLabel: 'Annuler la commande',
      cancelLabel: 'Garder',
      destructive: true,
    );
    if (!ok) return;
    await _run(() async {
      await ref.read(ordersRepositoryProvider).cancel(widget.order.id);
      ref.invalidate(orderDetailProvider(widget.order.id));
    });
  }

  Future<void> _reorder() => _run(() async {
    final skipped = await ref
        .read(ordersRepositoryProvider)
        .reorder(widget.order.id);
    ref.invalidate(cartProvider);
    if (!mounted) return;
    if (skipped.isNotEmpty) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Certains plats n’ont pas été ajoutés'),
          content: Text(
            skipped.map((s) => '• ${s.name} : ${s.reason}').join('\n'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Compris'),
            ),
          ],
        ),
      );
    }
    if (mounted) await context.push(Routes.cart);
  });

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        RiiSpace.xl,
        RiiSpace.gutter,
        0,
      ),
      child: Column(
        children: [
          for (final conversation in order.conversations) ...[
            RiiButton(
              label: conversation.isClosed
                  ? 'Revoir la conversation avec ${conversation.withWhom}'
                  : 'Écrire à ${conversation.withWhom}',
              icon: Icons.chat_bubble_outline_rounded,
              variant: RiiButtonVariant.secondary,
              onPressed: () => context.push(
                Routes.chat(
                  conversation.id,
                  title: conversation.kind == 'ORDER_DELIVERY'
                      ? 'Livreur · #${order.orderNumber}'
                      : '${order.restaurantName} · #${order.orderNumber}',
                  readOnly: conversation.isClosed,
                ),
              ),
            ),
            const SizedBox(height: RiiSpace.sm),
          ],
          if (order.canReview) ...[
            _ReviewForm(orderId: order.id),
            const SizedBox(height: RiiSpace.md),
          ],
          if (order.status.isFinal)
            RiiButton(
              label: 'Commander à nouveau',
              icon: Icons.replay_rounded,
              variant: RiiButtonVariant.secondary,
              loading: _busy,
              onPressed: _reorder,
            ),
          const SizedBox(height: RiiSpace.sm),
          RiiButton(
            label: 'Signaler un problème',
            icon: Icons.flag_outlined,
            variant: RiiButtonVariant.ghost,
            onPressed: () => showReportSheet(context, orderId: order.id),
          ),
          if (order.status.clientCanCancel)
            RiiButton(
              label: 'Annuler la commande',
              variant: RiiButtonVariant.danger,
              loading: _busy,
              onPressed: _cancel,
            ),
        ],
      ),
    );
  }
}

class _ReviewForm extends ConsumerStatefulWidget {
  const _ReviewForm({required this.orderId});

  final String orderId;

  @override
  ConsumerState<_ReviewForm> createState() => _ReviewFormState();
}

class _ReviewFormState extends ConsumerState<_ReviewForm> {
  int _rating = 0;
  final _comment = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(ordersRepositoryProvider)
          .review(widget.orderId, rating: _rating, comment: _comment.text);
      ref.invalidate(orderDetailProvider(widget.orderId));
      if (mounted) showRiiSnack(context, 'Merci pour votre avis !');
    } on ApiException catch (error) {
      if (mounted) showRiiSnack(context, error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    return RiiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Votre avis sur cette commande', style: t.titleSmall),
          const SizedBox(height: RiiSpace.sm),
          Row(
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  tooltip: '$i étoile${i > 1 ? 's' : ''}',
                  onPressed: _busy ? null : () => setState(() => _rating = i),
                  icon: Icon(
                    i <= _rating
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                    color: i <= _rating ? p.rating : p.subtle,
                    size: 30,
                  ),
                ),
            ],
          ),
          if (_rating > 0) ...[
            TextField(
              controller: _comment,
              enabled: !_busy,
              maxLength: 500,
              maxLines: 3,
              minLines: 1,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Commentaire (facultatif)',
              ),
            ),
            RiiButton(
              label: 'Publier mon avis',
              loading: _busy,
              onPressed: _send,
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();

  @override
  Widget build(BuildContext context) => const SkeletonScope(
    child: Padding(
      padding: EdgeInsets.all(RiiSpace.gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SkeletonBox(height: 220, radius: RiiRadius.md),
          SizedBox(height: RiiSpace.lg),
          SkeletonBox(height: 72, radius: RiiRadius.md),
        ],
      ),
    ),
  );
}
