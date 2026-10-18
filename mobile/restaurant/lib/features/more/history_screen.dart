import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/paged_footer.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../../app/routes.dart';
import '../shared/providers.dart';
import '../shared/widgets.dart';

/// Commandes terminées, refusées ou annulées, de la plus récente à la plus
/// ancienne (pagination par curseur ; le serveur ne filtre pas par dates).
class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.text;
    return Scaffold(
      appBar: AppBar(title: const Text('Historique')),
      body: RestaurantGate(
        builder: (context, r) {
          final async = ref.watch(historyProvider);
          final state = async.value;
          if (state == null) {
            return async.hasError
                ? ErrorState(
                    error: async.error!,
                    onRetry: () => ref.invalidate(historyProvider),
                  )
                : const Center(child: CircularProgressIndicator());
          }
          if (state.items.isEmpty) {
            return const EmptyState(
              icon: Icons.history_rounded,
              title: 'Aucune commande terminée',
            );
          }
          final f = DateFormat("EEE d MMM 'à' HH:mm", 'fr');
          return NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (n.metrics.extentAfter < 400) {
                ref.read(historyProvider.notifier).loadMore();
              }
              return false;
            },
            child: ListView.separated(
              itemCount: state.items.length + 1,
              separatorBuilder: (_, _) => Divider(
                indent: RiiSpace.gutter,
                endIndent: RiiSpace.gutter,
                color: context.palette.line,
              ),
              itemBuilder: (context, i) {
                if (i == state.items.length) {
                  return PagedFooter(
                    state: state,
                    onRetry: () =>
                        ref.read(historyProvider.notifier).loadMore(),
                  );
                }
                final o = state.items[i];
                return ListTile(
                  onTap: () => context.push(Routes.order(o.id)),
                  title: Text(
                    '#${o.orderNumber} · ${o.itemCount} article${o.itemCount > 1 ? 's' : ''}',
                    style: t.titleSmall,
                  ),
                  subtitle: Text(f.format(o.createdAt), style: t.bodySmall),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      orderStateTag(o.state),
                      Text(formatXof(o.total), style: t.labelMedium),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
