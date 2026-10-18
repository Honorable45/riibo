import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';
import 'package:riiberaka_core/core/state/paged.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.payload,
    required this.createdAt,
    this.readAt,
  });

  factory AppNotification.fromJson(Json json) => AppNotification(
    id: json.str('id'),
    type: json.str('type'),
    payload: json.objOrNull('payload') ?? const {},
    createdAt: json.date('createdAt'),
    readAt: json.dateOrNull('readAt'),
  );

  final String id;
  final String type;
  final Json payload;
  final DateTime createdAt;
  final DateTime? readAt;

  bool get isRead => readAt != null;
  String? get orderId => payload['orderId'] as String?;

  String get title {
    final number = payload['orderNumber'];
    final order = number == null ? 'Votre commande' : 'Commande #$number';
    return switch (type) {
      'ORDER_ACCEPTED' => '$order acceptée',
      'ORDER_REJECTED' => '$order refusée',
      'ORDER_PREPARING' => '$order en préparation',
      'ORDER_READY' => '$order prête',
      'ORDER_ASSIGNED' => 'Un livreur prend en charge votre commande',
      'ORDER_PICKED_UP' => '$order récupérée par le livreur',
      'ORDER_ON_THE_WAY' => '$order en route',
      'ORDER_DELIVERED' => '$order livrée',
      'ORDER_CANCELLED' => '$order annulée',
      'PAYMENT_CONFIRMED' => 'Paiement confirmé',
      'NEW_MESSAGE' || 'NEW_VOICE_MESSAGE' => 'Nouveau message',
      _ => 'Notification',
    };
  }

  /// Texte complémentaire fourni par le serveur, sinon le restaurant.
  String? get body {
    final text = payload['body'] ?? payload['preview'];
    if (text is String && text.isNotEmpty) return text;
    final restaurant = payload['restaurantName'];
    return restaurant is String ? restaurant : null;
  }
}

class NotificationsRepository {
  const NotificationsRepository(this._api);

  final ApiClient _api;

  Future<CursorPage<AppNotification>> list({String? cursor}) async =>
      CursorPage.fromJson(
        await _api.get<Json>(
          '/notifications',
          query: {'cursor': cursor, 'limit': 20},
        ),
        AppNotification.fromJson,
      );

  Future<int> unreadCount() async =>
      (await _api.get<Json>('/notifications/unread-count')).integer('count');

  Future<void> markRead(String id) =>
      _api.patch<void>('/notifications/${Uri.encodeComponent(id)}/read');

  Future<void> markAllRead() => _api.patch<void>('/notifications/read-all');
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(ref.watch(apiClientProvider)),
);

/// Nombre de notifications non lues, mis à jour en temps réel.
final unreadNotificationsProvider = FutureProvider<int>((ref) async {
  final userId = ref.watch(currentUserProvider.select((u) => u?.id));
  if (userId == null || userId.isEmpty) return 0;
  ref.listen(realtimeEventsProvider, (_, next) {
    final name = next.value?.name;
    if (name == 'notification:new' ||
        name == 'app:resumed' ||
        name == 'socket:connected') {
      ref.invalidateSelf();
    }
  });
  return ref.watch(notificationsRepositoryProvider).unreadCount();
});

class NotificationListNotifier extends PagedNotifier<AppNotification> {
  @override
  Future<PagedState<AppNotification>> build() {
    ref.listen(realtimeEventsProvider, (_, next) {
      if (next.value?.name == 'notification:new') ref.invalidateSelf();
    });
    return super.build();
  }

  @override
  Future<PageFetch<AppNotification>> fetchPage({
    required int page,
    String? cursor,
  }) async {
    final result = await ref
        .read(notificationsRepositoryProvider)
        .list(cursor: page == 1 ? null : cursor);
    return (
      items: result.items,
      hasMore: result.nextCursor != null,
      nextCursor: result.nextCursor,
    );
  }

  Future<void> markRead(AppNotification notification) async {
    if (notification.isRead) return;
    await ref.read(notificationsRepositoryProvider).markRead(notification.id);
    ref.invalidate(unreadNotificationsProvider);
    final current = state.value;
    if (current == null || !ref.mounted) return;
    state = AsyncData(
      current.copyWith(
        items: [
          for (final n in current.items)
            n.id == notification.id
                ? AppNotification(
                    id: n.id,
                    type: n.type,
                    payload: n.payload,
                    createdAt: n.createdAt,
                    readAt: DateTime.now(),
                  )
                : n,
        ],
      ),
    );
  }

  Future<void> markAllRead() async {
    await ref.read(notificationsRepositoryProvider).markAllRead();
    ref.invalidate(unreadNotificationsProvider);
    ref.invalidateSelf();
  }
}

final notificationListProvider =
    AsyncNotifierProvider.autoDispose<
      NotificationListNotifier,
      PagedState<AppNotification>
    >(NotificationListNotifier.new);
