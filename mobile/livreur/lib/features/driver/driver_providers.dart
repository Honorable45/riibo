import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';

import '../location/location_tracker.dart';
import 'driver_models.dart';
import 'driver_repository.dart';

/// Profil livreur, relu à chaque événement utile (course, reconnexion).
class DriverProfileController extends AsyncNotifier<DriverProfile> {
  @override
  Future<DriverProfile> build() async {
    ref.watch(currentUserProvider.select((u) => u?.id));
    ref.listen(realtimeEventsProvider, (_, next) {
      final name = next.value?.name ?? '';
      if (name.startsWith('order:') ||
          name == 'socket:connected' ||
          name == 'app:resumed') {
        ref.invalidateSelf();
      }
    });
    final profile = await ref.watch(driverRepositoryProvider).me();
    _syncTracking(profile);
    return profile;
  }

  /// Le suivi suit l'état CONFIRMÉ par le serveur, jamais l'inverse.
  void _syncTracking(DriverProfile profile) {
    final tracker = ref.read(locationTrackerProvider.notifier);
    if (profile.isOnline && profile.isApproved) {
      Future.microtask(() async {
        final access = await ref.read(locationSourceProvider).ensureAccess();
        if (access == LocationAccess.granted) await tracker.start();
      });
    } else {
      tracker.stop();
    }
  }

  void replace(DriverProfile profile) {
    state = AsyncData(profile);
    _syncTracking(profile);
  }
}

final driverProfileProvider =
    AsyncNotifierProvider<DriverProfileController, DriverProfile>(
      DriverProfileController.new,
    );

sealed class AvailabilityResult {
  const AvailabilityResult();
}

class AvailabilityChanged extends AvailabilityResult {
  const AvailabilityChanged();
}

class AvailabilityNeedsLocation extends AvailabilityResult {
  const AvailabilityNeedsLocation(this.access);
  final LocationAccess access;
}

class AvailabilityRefused extends AvailabilityResult {
  const AvailabilityRefused(this.message);
  final String message;
}

/// Passage en ligne / hors ligne. Ordre imposé : position autorisée →
/// demande au serveur → état CONFIRMÉ par le serveur → suivi démarré.
class AvailabilityController extends Notifier<bool> {
  @override
  bool build() => false; // vrai pendant une demande en cours

  Future<AvailabilityResult> setOnline(bool online) async {
    if (state) return const AvailabilityRefused('Changement déjà en cours.');
    state = true;
    try {
      if (online) {
        final access = await ref.read(locationSourceProvider).ensureAccess();
        if (access != LocationAccess.granted) {
          return AvailabilityNeedsLocation(access);
        }
      }
      final profile = await ref
          .read(driverRepositoryProvider)
          .setOnline(online);
      ref.read(driverProfileProvider.notifier).replace(profile);
      if (profile.isOnline != online) {
        return const AvailabilityRefused(
          'Le serveur n’a pas confirmé le changement.',
        );
      }
      return const AvailabilityChanged();
    } on ApiException catch (error) {
      return AvailabilityRefused(error.message);
    } finally {
      if (ref.mounted) state = false;
    }
  }
}

final availabilityProvider = NotifierProvider<AvailabilityController, bool>(
  AvailabilityController.new,
);

/// Offres reçues : lecture serveur + temps réel. Une offre expirée
/// disparaît ; l'acceptation reste toujours décidée par le serveur.
class OffersController extends AsyncNotifier<List<DeliveryOffer>> {
  Timer? _expiry;

  @override
  Future<List<DeliveryOffer>> build() async {
    ref.onDispose(() => _expiry?.cancel());
    final profile = ref.watch(driverProfileProvider).value;
    if (profile == null || !profile.isApproved || !profile.isOnline) {
      return const [];
    }
    ref.listen(realtimeEventsProvider, (_, next) {
      final event = next.value;
      if (event == null) return;
      switch (event.name) {
        case 'delivery:offer':
        case 'socket:connected':
        case 'app:resumed':
          ref.invalidateSelf();
        case 'delivery:offer-expired':
          final id = event.data['deliveryId'];
          final current = state.value;
          if (current != null) {
            state = AsyncData(
              current.where((o) => o.deliveryId != id).toList(),
            );
          }
      }
    });
    // Relecture régulière : filet de sécurité si le temps réel est coupé.
    final poll = Timer(const Duration(seconds: 20), ref.invalidateSelf);
    ref.onDispose(poll.cancel);
    final offers = await ref.watch(driverRepositoryProvider).offers();
    _scheduleExpiry(offers);
    return offers;
  }

  void _scheduleExpiry(List<DeliveryOffer> offers) {
    _expiry?.cancel();
    if (offers.isEmpty) return;
    final next = offers
        .map((o) => o.expiresAt)
        .reduce((a, b) => a.isBefore(b) ? a : b);
    final wait =
        next.difference(DateTime.now()) + const Duration(milliseconds: 300);
    _expiry = Timer(wait.isNegative ? Duration.zero : wait, () {
      final current = state.value;
      if (current == null || !ref.mounted) return;
      final alive = current.where((o) => !o.isExpired(DateTime.now())).toList();
      state = AsyncData(alive);
      _scheduleExpiry(alive);
    });
  }

  void remove(String deliveryId) {
    final current = state.value;
    if (current != null) {
      state = AsyncData(
        current.where((o) => o.deliveryId != deliveryId).toList(),
      );
    }
  }
}

final offersProvider =
    AsyncNotifierProvider<OffersController, List<DeliveryOffer>>(
      OffersController.new,
    );

/// Course en cours (ou `null`), tenue à jour par les événements de commande.
class CurrentDeliveryController extends AsyncNotifier<ActiveDelivery?> {
  @override
  Future<ActiveDelivery?> build() async {
    final profile = ref.watch(driverProfileProvider).value;
    if (profile == null || !profile.isApproved) return null;
    ref.listen(realtimeEventsProvider, (_, next) {
      final name = next.value?.name ?? '';
      if (name.startsWith('order:') ||
          name == 'socket:connected' ||
          name == 'app:resumed') {
        ref.invalidateSelf();
      }
    });
    final delivery = await ref.watch(driverRepositoryProvider).current();
    if (delivery != null) {
      // Préparation au restaurant : relecture pour voir « commande prête ».
      final poll = Timer(const Duration(seconds: 20), ref.invalidateSelf);
      ref.onDispose(poll.cancel);
    }
    return delivery;
  }

  void replace(ActiveDelivery? delivery) => state = AsyncData(delivery);
}

final currentDeliveryProvider =
    AsyncNotifierProvider<CurrentDeliveryController, ActiveDelivery?>(
      CurrentDeliveryController.new,
    );
