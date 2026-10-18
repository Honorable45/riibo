import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../shared/providers.dart';
import '../shared/widgets.dart';

/// Chiffres du jour fournis par le serveur (`/dashboard`). Le backend ne
/// fournit ni historique par période, ni commission, ni règlement : rien
/// n'est donc affiché ni calculé à leur place.
class StatsScreen extends ConsumerWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.text;
    final p = context.palette;
    return Scaffold(
      appBar: AppBar(title: const Text('Statistiques du jour')),
      body: RestaurantGate(
        builder: (context, r) => ref
            .watch(dashboardProvider)
            .when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorState(
                error: e,
                onRetry: () => ref.invalidate(dashboardProvider),
              ),
              data: (d) {
                Widget row(String label, int value, {Color? color}) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Expanded(child: Text(label, style: t.bodyLarge)),
                      Text(
                        '$value',
                        style: t.titleMedium!.copyWith(
                          color: color,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                );
                return ListView(
                  padding: const EdgeInsets.all(RiiSpace.gutter),
                  children: [
                    RiiCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Ventes livrées aujourd’hui',
                            style: t.bodyMedium!.copyWith(color: p.muted),
                          ),
                          Text(formatXof(d.revenue), style: t.headlineMedium),
                          const SizedBox(height: RiiSpace.xs),
                          Text(
                            'Montant des repas des commandes livrées, remises déduites, hors frais de livraison. '
                            'Ce n’est pas un montant versé : commissions et règlements ne sont pas encore gérés.',
                            style: t.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: RiiSpace.lg),
                    RiiCard(
                      child: Column(
                        children: [
                          row('Commandes reçues', d.total),
                          const Divider(),
                          row(
                            'À accepter',
                            d.pending,
                            color: d.pending > 0 ? p.warning : null,
                          ),
                          row('En cuisine', d.preparing),
                          row('Prêtes', d.ready),
                          row('En livraison', d.inDelivery),
                          row('Terminées', d.completed, color: p.success),
                          row(
                            'Annulées ou refusées',
                            d.cancelled,
                            color: d.cancelled > 0 ? p.danger : null,
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),
      ),
    );
  }
}
