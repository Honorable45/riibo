import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';

import '../driver/driver_repository.dart';

/// Résultat d'une demande d'accès à la position.
enum LocationAccess { granted, serviceDisabled, denied, deniedForever }

/// Accès au GPS (interface pour les tests).
abstract class LocationSource {
  Future<LocationAccess> ensureAccess();
  Future<Position?> current();
  Stream<Position> stream();
  Future<void> openAppSettings();
  Future<void> openLocationSettings();
}

class GeolocatorSource implements LocationSource {
  const GeolocatorSource();

  @override
  Future<LocationAccess> ensureAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return LocationAccess.serviceDisabled;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    return switch (permission) {
      LocationPermission.deniedForever => LocationAccess.deniedForever,
      LocationPermission.denied ||
      LocationPermission.unableToDetermine => LocationAccess.denied,
      _ => LocationAccess.granted,
    };
  }

  @override
  Future<Position?> current() async {
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
    } catch (_) {
      return Geolocator.getLastKnownPosition();
    }
  }

  @override
  Stream<Position> stream() {
    final settings = defaultTargetPlatform == TargetPlatform.android
        ? AndroidSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 20,
            intervalDuration: const Duration(seconds: 10),
            // Service de premier plan : le suivi continue écran verrouillé,
            // avec une notification visible tant que le livreur est en ligne.
            foregroundNotificationConfig: const ForegroundNotificationConfig(
              notificationTitle: 'Riiberaka Livreur — en ligne',
              notificationText:
                  'Votre position est partagée pour recevoir et suivre vos courses.',
              notificationChannelName: 'Position en service',
              enableWakeLock: true,
            ),
          )
        : const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 20,
          );
    return Geolocator.getPositionStream(locationSettings: settings);
  }

  @override
  Future<void> openAppSettings() => Geolocator.openAppSettings();

  @override
  Future<void> openLocationSettings() => Geolocator.openLocationSettings();
}

final locationSourceProvider = Provider<LocationSource>(
  (ref) => const GeolocatorSource(),
);

/// État du partage de position.
class TrackingState {
  const TrackingState({
    this.active = false,
    this.lastPosition,
    this.lastSentAt,
    this.lastError,
    this.sharingWithClient = false,
  });

  final bool active;
  final Position? lastPosition;

  /// Dernier envoi ACCEPTÉ par le serveur.
  final DateTime? lastSentAt;
  final String? lastError;

  /// Le serveur relaie la position au client de la course en cours.
  final bool sharingWithClient;

  /// Le serveur oublie une position après 90 s : au-delà, le livreur n'est
  /// plus joignable par le dispatch.
  bool isStale(DateTime now) =>
      lastSentAt == null ||
      now.difference(lastSentAt!) > const Duration(seconds: 75);

  TrackingState copyWith({
    bool? active,
    Position? lastPosition,
    DateTime? lastSentAt,
    String? Function()? lastError,
    bool? sharingWithClient,
  }) => TrackingState(
    active: active ?? this.active,
    lastPosition: lastPosition ?? this.lastPosition,
    lastSentAt: lastSentAt ?? this.lastSentAt,
    lastError: lastError != null ? lastError() : this.lastError,
    sharingWithClient: sharingWithClient ?? this.sharingWithClient,
  );
}

/// Envoie la position tant que le livreur est EN LIGNE (condition du
/// dispatch : position de moins de 90 s) et pendant ses courses.
///
/// Cadence : au plus un envoi toutes les [minInterval] (le serveur limite à
/// 40 par minute), et au moins un toutes les [heartbeat] même immobile, pour
/// rester joignable. Aucun historique n'est conservé sur le téléphone.
class LocationTracker extends Notifier<TrackingState> {
  static const minInterval = Duration(seconds: 12);
  static const heartbeat = Duration(seconds: 30);

  StreamSubscription<Position>? _sub;
  Timer? _heartbeat;
  bool _sending = false;

  @override
  TrackingState build() {
    ref.onDispose(_cancel);
    return const TrackingState();
  }

  void _cancel() {
    _sub?.cancel();
    _sub = null;
    _heartbeat?.cancel();
    _heartbeat = null;
  }

  /// Démarre le suivi (permission déjà accordée). Sans effet s'il tourne.
  Future<void> start() async {
    if (_sub != null) return;
    final source = ref.read(locationSourceProvider);
    state = state.copyWith(active: true, lastError: () => null);
    _sub = source.stream().listen(
      (position) => _onPosition(position),
      onError: (Object _) => state = state.copyWith(
        lastError: () => 'Position GPS indisponible. Vérifiez la localisation.',
      ),
    );
    _heartbeat = Timer.periodic(heartbeat, (_) async {
      // Immobile : le flux n'émet rien, on renvoie la dernière position
      // (ou on en relit une) pour rester joignable.
      final last = state.lastPosition ?? await source.current();
      if (last != null) await _onPosition(last, force: true);
    });
    final first = await source.current();
    if (first != null) await _onPosition(first, force: true);
  }

  void stop() {
    _cancel();
    state = const TrackingState();
  }

  Future<void> _onPosition(Position position, {bool force = false}) async {
    if (!ref.mounted) return;
    state = state.copyWith(lastPosition: position);
    final now = DateTime.now();
    final last = state.lastSentAt;
    if (_sending) return;
    if (!force && last != null && now.difference(last) < minInterval) return;
    _sending = true;
    try {
      final sharing = await ref
          .read(driverRepositoryProvider)
          .sendLocation(position.latitude, position.longitude);
      if (!ref.mounted) return;
      state = state.copyWith(
        lastSentAt: DateTime.now(),
        sharingWithClient: sharing,
        lastError: () => null,
      );
    } on ApiException catch (error) {
      if (!ref.mounted) return;
      if (error.kind == ApiErrorKind.conflict ||
          error.kind == ApiErrorKind.forbidden) {
        // Hors ligne ou compte non validé côté serveur : on cesse de pister.
        stop();
        state = state.copyWith(lastError: () => error.message);
      } else {
        // Réseau : la prochaine position réessaiera, sans rejouer en boucle.
        state = state.copyWith(
          lastError: () => 'Connexion instable : position non transmise.',
        );
      }
    } finally {
      _sending = false;
    }
  }
}

final locationTrackerProvider =
    NotifierProvider<LocationTracker, TrackingState>(LocationTracker.new);
