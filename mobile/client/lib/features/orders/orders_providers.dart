import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';
import 'package:riiberaka_core/core/state/paged.dart';
import 'order_models.dart';
import 'orders_repository.dart';

/// Commandes du client (en cours ou passées), paginées par curseur.
class OrderListNotifier extends PagedNotifier<OrderSummary> {
  OrderListNotifier(this.active);

  final bool active;

  @override
  Future<PagedState<OrderSummary>> build() {
    final userId = ref.watch(currentUserProvider.select((u) => u?.id));
    if (userId == null || userId.isEmpty) {
      return Future.value(const PagedState(items: [], hasMore: false));
    }
    // Tout changement d'état d'une commande peut la faire passer d'une liste
    // à l'autre : on relit.
    ref.listen(realtimeEventsProvider, (_, next) {
      final name = next.value?.name ?? '';
      if (name.startsWith('order:') ||
          name == 'socket:connected' ||
          name == 'app:resumed') {
        ref.invalidateSelf();
      }
    });
    return super.build();
  }

  @override
  Future<PageFetch<OrderSummary>> fetchPage({
    required int page,
    String? cursor,
  }) async {
    final result = await ref
        .read(ordersRepositoryProvider)
        .list(active: active, cursor: page == 1 ? null : cursor);
    return (
      items: result.items,
      hasMore: result.nextCursor != null,
      nextCursor: result.nextCursor,
    );
  }
}

final activeOrdersProvider =
    AsyncNotifierProvider.autoDispose<
      OrderListNotifier,
      PagedState<OrderSummary>
    >(() => OrderListNotifier(true));

final pastOrdersProvider =
    AsyncNotifierProvider.autoDispose<
      OrderListNotifier,
      PagedState<OrderSummary>
    >(() => OrderListNotifier(false));

/// Détail d'une commande, tenu à jour par les événements temps réel et, en
/// filet de sécurité, par une relecture périodique tant qu'elle est en cours.
final orderDetailProvider = FutureProvider.autoDispose
    .family<OrderDetail, String>((ref, id) async {
      ref.listen(realtimeEventsProvider, (_, next) {
        final event = next.value;
        if (event == null) return;
        final concernsOrder =
            event.orderId == id && event.name != 'delivery:location';
        if (concernsOrder ||
            event.name == 'socket:connected' ||
            event.name == 'app:resumed') {
          ref.invalidateSelf();
        }
      });
      final order = await ref.watch(ordersRepositoryProvider).get(id);
      if (!order.status.isFinal) {
        final timer = Timer(const Duration(seconds: 30), ref.invalidateSelf);
        ref.onDispose(timer.cancel);
      }
      return order;
    });

/// Suivi de la livraison : position du livreur et estimation.
class TrackingNotifier extends AsyncNotifier<Tracking> {
  TrackingNotifier(this.orderId);

  final String orderId;

  @override
  Future<Tracking> build() async {
    ref.listen(realtimeEventsProvider, (_, next) {
      final event = next.value;
      if (event == null) return;
      if (event.name == 'delivery:location' && event.orderId == orderId) {
        final current = state.value;
        final lat = (event.data['latitude'] as num?)?.toDouble();
        final lng = (event.data['longitude'] as num?)?.toDouble();
        final at = DateTime.tryParse(
          event.data['at'] as String? ?? '',
        )?.toLocal();
        if (current != null && lat != null && lng != null) {
          state = AsyncData(
            Tracking(
              orderStatus: current.orderStatus,
              deliveryStatus: current.deliveryStatus,
              driver: current.driver,
              driverLatitude: lat,
              driverLongitude: lng,
              driverSeenAt: at ?? DateTime.now(),
              etaMinutes: current.etaMinutes,
              restaurantLatitude: current.restaurantLatitude,
              restaurantLongitude: current.restaurantLongitude,
              destinationLatitude: current.destinationLatitude,
              destinationLongitude: current.destinationLongitude,
            ),
          );
        }
      } else if (event.orderId == orderId || event.name == 'socket:connected') {
        ref.invalidateSelf();
      }
    });
    final tracking = await ref
        .watch(ordersRepositoryProvider)
        .tracking(orderId);
    if (!tracking.orderStatus.isFinal) {
      // Estimation recalculée par le serveur ; position aussi relue si le
      // temps réel est coupé.
      final timer = Timer(const Duration(seconds: 20), ref.invalidateSelf);
      ref.onDispose(timer.cancel);
    }
    return tracking;
  }
}

final trackingProvider = AsyncNotifierProvider.autoDispose
    .family<TrackingNotifier, Tracking, String>(TrackingNotifier.new);
