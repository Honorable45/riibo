import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';
import 'package:riiberaka_core/core/state/paged.dart';

import 'models.dart';
import 'repository.dart';

/// Restaurants dont l'utilisateur est membre (relu sur le serveur).
final myRestaurantsProvider = FutureProvider<List<MyRestaurant>>((ref) async {
  final userId = ref.watch(currentUserProvider.select((u) => u?.id));
  if (userId == null || userId.isEmpty) return const [];
  return ref.watch(restaurantRepositoryProvider).mine();
});

/// Restaurant choisi (le premier par défaut ; choix possible s'il y en a
/// plusieurs). Le serveur revérifie l'appartenance à chaque requête.
class SelectedRestaurant extends Notifier<String?> {
  @override
  String? build() => null;

  void select(String id) => state = id;
}

final selectedRestaurantIdProvider =
    NotifierProvider<SelectedRestaurant, String?>(SelectedRestaurant.new);

final currentRestaurantProvider = Provider<MyRestaurant?>((ref) {
  final list = ref.watch(myRestaurantsProvider).value ?? const [];
  if (list.isEmpty) return null;
  final chosen = ref.watch(selectedRestaurantIdProvider);
  return list.firstWhere((r) => r.id == chosen, orElse: () => list.first);
});

String requireRestaurantId(Ref ref) {
  final r = ref.watch(currentRestaurantProvider);
  if (r == null) throw StateError('Aucun restaurant');
  return r.id;
}

final restaurantProfileProvider = FutureProvider<RestaurantProfile>((ref) {
  final id = requireRestaurantId(ref);
  return ref.watch(restaurantRepositoryProvider).profile(id);
});

/// Relit une donnée à chaque événement temps réel utile.
void _refreshOn(Ref ref, bool Function(String name) when) {
  ref.listen(realtimeEventsProvider, (_, next) {
    final name = next.value?.name;
    if (name != null && when(name)) ref.invalidateSelf();
  });
}

bool _orderEvent(String n) =>
    n.startsWith('order:') ||
    n.startsWith('delivery:') ||
    n == 'socket:connected' ||
    n == 'app:resumed';

final dashboardProvider = FutureProvider<Dashboard>((ref) {
  final id = requireRestaurantId(ref);
  _refreshOn(ref, _orderEvent);
  return ref.watch(restaurantRepositoryProvider).dashboard(id);
});

/// Commandes en cours. Rafraîchies par le temps réel (`order:new`…) ET par
/// une relecture régulière : un événement peut être perdu ou arriver en
/// double, seul l'état relu sur le serveur fait foi.
/// Commandes « nouvelles » déjà signalées (pour ne sonner qu'une fois).
class SeenPending extends Notifier<Set<String>?> {
  @override
  Set<String>? build() => null; // null = rien chargé encore : pas de son

  /// Renvoie vrai si [pending] contient une commande jamais vue.
  bool update(Set<String> pending) {
    final before = state;
    state = {...?before, ...pending};
    return before != null && pending.difference(before).isNotEmpty;
  }
}

final seenPendingProvider = NotifierProvider<SeenPending, Set<String>?>(
  SeenPending.new,
);

/// Commandes en cours. Rafraîchies par le temps réel (`order:new`…) ET par
/// une relecture régulière : un événement peut être perdu ou arriver en
/// double, seul l'état relu sur le serveur fait foi.
class ActiveOrdersController extends AsyncNotifier<List<KitchenOrder>> {
  @override
  Future<List<KitchenOrder>> build() async {
    final id = requireRestaurantId(ref);
    _refreshOn(ref, _orderEvent);
    final poll = Timer(const Duration(seconds: 30), ref.invalidateSelf);
    ref.onDispose(poll.cancel);
    final page = await ref
        .watch(restaurantRepositoryProvider)
        .orders(id, active: true, limit: 50);
    final pending = page.items
        .where((o) => o.state == OrderState.pending)
        .map((o) => o.id)
        .toSet();
    // Son + vibration pour une NOUVELLE commande confirmée par le serveur.
    if (ref.read(seenPendingProvider.notifier).update(pending)) {
      unawaited(SystemSound.play(SystemSoundType.alert));
      unawaited(HapticFeedback.heavyImpact());
    }
    return page.items;
  }
}

final activeOrdersProvider =
    AsyncNotifierProvider<ActiveOrdersController, List<KitchenOrder>>(
      ActiveOrdersController.new,
    );

final orderDetailProvider = FutureProvider.autoDispose
    .family<KitchenOrder, String>((ref, orderId) async {
      _refreshOn(ref, _orderEvent);
      final order = await ref
          .watch(restaurantRepositoryProvider)
          .order(orderId);
      if (!order.state.isFinal) {
        final poll = Timer(const Duration(seconds: 20), ref.invalidateSelf);
        ref.onDispose(poll.cancel);
      }
      return order;
    });

class HistoryController extends PagedNotifier<KitchenOrder> {
  @override
  Future<PageFetch<KitchenOrder>> fetchPage({
    required int page,
    String? cursor,
  }) async {
    final id = requireRestaurantId(ref);
    final result = await ref
        .read(restaurantRepositoryProvider)
        .orders(
          id,
          active: false,
          cursor: page == 1 ? null : cursor,
          limit: 30,
        );
    return (
      items: result.items,
      hasMore: result.nextCursor != null,
      nextCursor: result.nextCursor,
    );
  }
}

final historyProvider =
    AsyncNotifierProvider.autoDispose<
      HistoryController,
      PagedState<KitchenOrder>
    >(HistoryController.new);

final ownerMenuProvider = FutureProvider<OwnerMenu>((ref) {
  final id = requireRestaurantId(ref);
  return ref.watch(restaurantRepositoryProvider).menu(id);
});

class ReviewsController extends PagedNotifier<Review> {
  @override
  Future<PageFetch<Review>> fetchPage({
    required int page,
    String? cursor,
  }) async {
    final id = requireRestaurantId(ref);
    final result = await ref
        .read(restaurantRepositoryProvider)
        .reviews(id, cursor: page == 1 ? null : cursor);
    return (
      items: result.items,
      hasMore: result.nextCursor != null,
      nextCursor: result.nextCursor,
    );
  }
}

final reviewsProvider =
    AsyncNotifierProvider.autoDispose<ReviewsController, PagedState<Review>>(
      ReviewsController.new,
    );
