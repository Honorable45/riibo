import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/widgets/paged_footer.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationListProvider);
    final state = async.value;
    final hasUnread = state?.items.any((n) => !n.isRead) ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (hasUnread)
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
          : RefreshIndicator(
              onRefresh: () => ref.refresh(notificationListProvider.future),
              child: state.items.isEmpty
                  ? ListView(
                      children: const [
                        EmptyState(
                          icon: Icons.notifications_none_rounded,
                          title: 'Aucune notification',
                          message: 'Le suivi de vos commandes apparaîtra ici.',
                        ),
                      ],
                    )
                  : NotificationListener<ScrollNotification>(
                      onNotification: (n) {
                        if (n.metrics.extentAfter < 400) {
                          ref
                              .read(notificationListProvider.notifier)
                              .loadMore();
                        }
                        return false;
                      },
                      child: ListView.separated(
                        itemCount: state.items.length + 1,
                        separatorBuilder: (_, _) =>
                            Divider(indent: 72, color: context.palette.line),
                        itemBuilder: (context, index) {
                          if (index == state.items.length) {
                            return PagedFooter(
                              state: state,
                              onRetry: () => ref
                                  .read(notificationListProvider.notifier)
                                  .loadMore(),
                            );
                          }
                          final n = state.items[index];
                          return _NotificationTile(
                            notification: n,
                            onTap: () {
                              ref
                                  .read(notificationListProvider.notifier)
                                  .markRead(n)
                                  .ignore();
                              if (n.orderId != null) {
                                context.push(Routes.order(n.orderId!));
                              }
                            },
                          );
                        },
                      ),
                    ),
            ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification, required this.onTap});

  final AppNotification notification;
  final VoidCallback onTap;

  IconData get _icon => switch (notification.type) {
    'ORDER_DELIVERED' => Icons.check_circle_outline_rounded,
    'ORDER_REJECTED' || 'ORDER_CANCELLED' => Icons.cancel_outlined,
    'ORDER_ON_THE_WAY' ||
    'ORDER_PICKED_UP' ||
    'ORDER_ASSIGNED' => Icons.delivery_dining_outlined,
    'NEW_MESSAGE' || 'NEW_VOICE_MESSAGE' => Icons.chat_bubble_outline_rounded,
    _ => Icons.receipt_long_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = context.text;
    final unread = !notification.isRead;
    final date = DateFormat(
      "d MMM 'à' HH:mm",
      'fr',
    ).format(notification.createdAt);
    return ListTile(
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: unread ? p.brandSoft : p.canvas,
        foregroundColor: unread ? p.brand : p.muted,
        child: Icon(_icon, size: 22),
      ),
      title: Text(
        notification.title,
        style: unread ? t.titleSmall : t.bodyMedium,
      ),
      subtitle: Text(
        [?notification.body, date].join(' · '),
        style: t.bodySmall,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: unread
          ? Container(
              width: 9,
              height: 9,
              decoration: BoxDecoration(color: p.brand, shape: BoxShape.circle),
            )
          : null,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: RiiSpace.gutter,
        vertical: 2,
      ),
    );
  }
}
