import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/core/widgets/paged_footer.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';

import '../../app/routes.dart';

/// Notifications du livreur. Une notification de proposition ancienne ne
/// permet jamais d'accepter : elle renvoie au tableau de bord, qui relit les
/// offres réellement ouvertes sur le serveur.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  String _title(AppNotification n) => switch (n.type) {
    'DELIVERY_OFFER' => 'Nouvelle proposition de course',
    'SYSTEM' => 'Information',
    _ => n.title,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationListProvider);
    final state = async.value;
    final p = context.palette;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (state?.items.any((n) => !n.isRead) ?? false)
            TextButton(
              onPressed: () =>
                  ref.read(notificationListProvider.notifier).markAllRead(),
              child: const Text('Tout lire'),
            ),
        ],
      ),
      body: state == null
          ? (async.hasError
                ? ErrorState(
                    error: async.error!,
                    onRetry: () => ref.invalidate(notificationListProvider),
                  )
                : const Center(child: CircularProgressIndicator()))
          : state.items.isEmpty
          ? const EmptyState(
              icon: Icons.notifications_none_rounded,
              title: 'Aucune notification',
            )
          : NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (n.metrics.extentAfter < 400) {
                  ref.read(notificationListProvider.notifier).loadMore();
                }
                return false;
              },
              child: ListView.builder(
                itemCount: state.items.length + 1,
                itemBuilder: (context, i) {
                  if (i == state.items.length) {
                    return PagedFooter(
                      state: state,
                      onRetry: () => ref
                          .read(notificationListProvider.notifier)
                          .loadMore(),
                    );
                  }
                  final n = state.items[i];
                  return ListTile(
                    leading: Icon(
                      n.type == 'DELIVERY_OFFER'
                          ? Icons.delivery_dining_outlined
                          : Icons.notifications_none_rounded,
                      color: n.isRead ? p.muted : p.brand,
                    ),
                    title: Text(
                      _title(n),
                      style: n.isRead
                          ? context.text.bodyMedium
                          : context.text.titleSmall,
                    ),
                    subtitle: Text(
                      [
                        ?n.body,
                        DateFormat("d MMM 'à' HH:mm", 'fr').format(n.createdAt),
                      ].join(' · '),
                      style: context.text.bodySmall,
                    ),
                    onTap: () {
                      ref
                          .read(notificationListProvider.notifier)
                          .markRead(n)
                          .ignore();
                      context.go(Routes.home);
                    },
                  );
                },
              ),
            ),
    );
  }
}
