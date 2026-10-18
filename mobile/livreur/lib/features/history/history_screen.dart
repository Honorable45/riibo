import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/state/paged.dart';
import 'package:riiberaka_core/core/widgets/paged_footer.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../driver/driver_models.dart';
import '../driver/driver_providers.dart';
import '../driver/driver_repository.dart';

class HistoryNotifier extends PagedNotifier<HistoryEntry> {
  @override
  Future<PageFetch<HistoryEntry>> fetchPage({
    required int page,
    String? cursor,
  }) async {
    final result = await ref
        .read(driverRepositoryProvider)
        .history(cursor: page == 1 ? null : cursor);
    return (
      items: result.items,
      hasMore: result.nextCursor != null,
      nextCursor: result.nextCursor,
    );
  }
}

final historyProvider =
    AsyncNotifierProvider.autoDispose<
      HistoryNotifier,
      PagedState<HistoryEntry>
    >(HistoryNotifier.new);

/// Historique des courses terminées ou annulées, groupé par jour.
///
/// Les montants affichés sont les frais de livraison payés par les clients
/// (seule donnée fournie par le serveur) : la rémunération du livreur, les
/// commissions et les versements ne sont pas encore gérés par le backend.
class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(historyProvider);
    final profile = ref.watch(driverProfileProvider).value;
    final state = async.value;
    final t = context.text;
    return Scaffold(
      appBar: AppBar(title: const Text('Historique')),
      body: state == null
          ? (async.hasError
                ? ErrorState(
                    error: async.error!,
                    onRetry: () => ref.invalidate(historyProvider),
                  )
                : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: () => ref.refresh(historyProvider.future),
              child: NotificationListener<ScrollNotification>(
                onNotification: (n) {
                  if (n.metrics.extentAfter < 400) {
                    ref.read(historyProvider.notifier).loadMore();
                  }
                  return false;
                },
                child: ListView(
                  padding: const EdgeInsets.only(bottom: RiiSpace.xxl),
                  children: [
                    if (profile != null)
                      Padding(
                        padding: const EdgeInsets.all(RiiSpace.gutter),
                        child: RiiCard(
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${profile.totalDeliveries}',
                                      style: t.headlineSmall,
                                    ),
                                    Text(
                                      'courses livrées au total',
                                      style: t.bodySmall,
                                    ),
                                  ],
                                ),
                              ),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${profile.todayDeliveries}',
                                      style: t.headlineSmall,
                                    ),
                                    Text('aujourd’hui', style: t.bodySmall),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    const Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: RiiSpace.gutter,
                      ),
                      child: InlineBanner(
                        message:
                            'Montants indiqués : frais de livraison payés par les clients. '
                            'Votre rémunération et vos versements ne sont pas encore calculés par l’application.',
                      ),
                    ),
                    if (state.items.isEmpty)
                      const EmptyState(
                        icon: Icons.history_rounded,
                        title: 'Aucune course pour l’instant',
                        message: 'Vos courses terminées apparaîtront ici.',
                      )
                    else
                      ..._grouped(context, state.items),
                    PagedFooter(
                      state: state,
                      onRetry: () =>
                          ref.read(historyProvider.notifier).loadMore(),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  List<Widget> _grouped(BuildContext context, List<HistoryEntry> items) {
    final day = DateFormat('EEEE d MMMM', 'fr');
    final time = DateFormat('HH:mm', 'fr');
    final now = DateTime.now();
    String label(DateTime d) {
      final date = DateTime(d.year, d.month, d.day);
      final today = DateTime(now.year, now.month, now.day);
      if (date == today) return 'Aujourd’hui';
      if (date == today.subtract(const Duration(days: 1))) return 'Hier';
      final text = day.format(d);
      return text[0].toUpperCase() + text.substring(1);
    }

    final widgets = <Widget>[];
    String? current;
    for (final entry in items) {
      final when = entry.deliveredAt ?? entry.createdAt;
      final group = label(when);
      if (group != current) {
        current = group;
        widgets.add(SectionHeader(title: group));
      }
      final delivered = entry.status == DeliveryStep.delivered;
      widgets.add(
        ListTile(
          title: Text(
            '${entry.restaurantName} · #${entry.orderNumber}',
            style: context.text.titleSmall,
          ),
          subtitle: Text(time.format(when), style: context.text.bodySmall),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Tag(
                label: delivered ? 'Livrée' : 'Annulée',
                tone: delivered ? TagTone.success : TagTone.danger,
              ),
              if (delivered)
                Text(
                  formatXof(entry.deliveryFee),
                  style: context.text.labelMedium,
                ),
            ],
          ),
        ),
      );
      widgets.add(
        Divider(
          indent: RiiSpace.gutter,
          endIndent: RiiSpace.gutter,
          color: context.palette.line,
        ),
      );
    }
    return widgets;
  }
}
