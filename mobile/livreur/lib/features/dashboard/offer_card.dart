import 'dart:async';

import 'package:flutter/material.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';

import '../driver/driver_models.dart';

String km(double value) =>
    '${value.toStringAsFixed(1).replaceAll('.', ',')} km';

/// Proposition de course avec compte à rebours. L'acceptation n'est jamais
/// considérée comme acquise avant la réponse du serveur.
class OfferCard extends StatefulWidget {
  const OfferCard({
    super.key,
    required this.offer,
    required this.onAccept,
    required this.onReject,
    this.clock = DateTime.now,
  });

  final DeliveryOffer offer;
  final Future<void> Function() onAccept;
  final Future<void> Function() onReject;
  final DateTime Function() clock;

  @override
  State<OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends State<OfferCard> {
  Timer? _ticker;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    final t = context.text;
    final p = context.palette;
    final left = o.remaining(widget.clock());
    final expired = left == Duration.zero;
    final total = const Duration(seconds: 30).inMilliseconds;
    final ratio = (left.inMilliseconds / total).clamp(0.0, 1.0);

    return Container(
      decoration: BoxDecoration(
        color: p.surface,
        borderRadius: RiiRadius.lgAll,
        border: Border.all(color: p.brand, width: 1.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LinearProgressIndicator(value: ratio, minHeight: 4),
          Padding(
            padding: const EdgeInsets.all(RiiSpace.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Nouvelle course · #${o.orderNumber}',
                        style: t.labelMedium,
                      ),
                    ),
                    Semantics(
                      label: 'Temps restant ${left.inSeconds} secondes',
                      child: Text(
                        expired ? 'Expirée' : '${left.inSeconds} s',
                        style: t.titleMedium!.copyWith(
                          color: left.inSeconds <= 10 ? p.danger : p.brand,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: RiiSpace.xs),
                Text(o.restaurantName, style: t.headlineSmall),
                if (o.restaurantQuarter != null)
                  Text(
                    o.restaurantQuarter!,
                    style: t.bodyMedium!.copyWith(color: p.muted),
                  ),
                const SizedBox(height: RiiSpace.md),
                Wrap(
                  spacing: RiiSpace.lg,
                  runSpacing: RiiSpace.sm,
                  children: [
                    if (o.distanceToRestaurantKm != null)
                      _Fact(
                        icon: Icons.storefront_outlined,
                        text:
                            '${km(o.distanceToRestaurantKm!)} jusqu’au restaurant',
                      ),
                    if (o.tripDistanceKm != null)
                      _Fact(
                        icon: Icons.route_outlined,
                        text: '${km(o.tripDistanceKm!)} du restaurant au client',
                      ),
                    _Fact(
                      icon: Icons.payments_outlined,
                      text:
                          'Frais de livraison client : ${formatXof(o.deliveryFee)}',
                    ),
                  ],
                ),
                const SizedBox(height: RiiSpace.xs),
                Text(
                  'Distances à vol d’oiseau, l’itinéraire réel peut être plus long.',
                  style: t.bodySmall,
                ),
                const SizedBox(height: RiiSpace.lg),
                Row(
                  children: [
                    Expanded(
                      child: RiiButton(
                        label: 'Refuser',
                        variant: RiiButtonVariant.secondary,
                        onPressed: _busy || expired
                            ? null
                            : () => _run(widget.onReject),
                      ),
                    ),
                    const SizedBox(width: RiiSpace.md),
                    Expanded(
                      flex: 2,
                      child: RiiButton(
                        label: 'Accepter',
                        loading: _busy,
                        onPressed: expired ? null : () => _run(widget.onAccept),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 18, color: context.palette.inkSoft),
      const SizedBox(width: 4),
      Flexible(child: Text(text, style: context.text.labelMedium)),
    ],
  );
}
