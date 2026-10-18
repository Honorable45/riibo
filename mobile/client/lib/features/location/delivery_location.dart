import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:riiberaka_core/core/api/json.dart';

/// Lieu de livraison choisi pour parcourir le catalogue. Facultatif : sans
/// lieu, tous les restaurants approuvés sont proposés, sans distance.
class DeliveryLocation {
  const DeliveryLocation({
    required this.label,
    this.latitude,
    this.longitude,
    this.addressId,
  });

  factory DeliveryLocation.fromJson(Json json) => DeliveryLocation(
    label: json.str('label'),
    latitude: json.dblOrNull('latitude'),
    longitude: json.dblOrNull('longitude'),
    addressId: json.strOrNull('addressId'),
  );

  /// Texte affiché (« Agoè », « Maison », « Ma position »).
  final String label;
  final double? latitude;
  final double? longitude;

  /// Adresse enregistrée sur le compte, si le lieu en vient.
  final String? addressId;

  bool get hasCoordinates => latitude != null && longitude != null;

  Json toJson() => {
    'label': label,
    // Précision réduite (~100 m) pour le stockage local : suffisante pour
    // trier les restaurants, sans conserver une position exacte sur
    // l'appareil. L'adresse précise de livraison vit côté serveur.
    'latitude': latitude == null ? null : _round(latitude!),
    'longitude': longitude == null ? null : _round(longitude!),
    'addressId': addressId,
  };

  static double _round(double value) => (value * 1000).round() / 1000;
}

sealed class LocateResult {
  const LocateResult();
}

class Located extends LocateResult {
  const Located(this.latitude, this.longitude);
  final double latitude;
  final double longitude;
}

class LocateFailed extends LocateResult {
  const LocateFailed(this.message, {this.canOpenSettings = false});
  final String message;
  final bool canOpenSettings;
}

/// Accès à la position de l'appareil (interface pour les tests).
abstract class LocationService {
  Future<LocateResult> current();
  Future<void> openSettings();
}

class GeolocatorLocationService implements LocationService {
  const GeolocatorLocationService();

  @override
  Future<LocateResult> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const LocateFailed(
          'La localisation est désactivée sur ce téléphone.',
          canOpenSettings: true,
        );
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        return const LocateFailed(
          'Position non autorisée. Vous pouvez saisir votre quartier.',
        );
      }
      if (permission == LocationPermission.deniedForever) {
        return const LocateFailed(
          'La position est bloquée pour Riiberaka dans les réglages.',
          canOpenSettings: true,
        );
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 15),
        ),
      );
      return Located(position.latitude, position.longitude);
    } catch (_) {
      // GPS lent ou indisponible : on n'insiste pas, la saisie manuelle reste
      // possible.
      return const LocateFailed(
        'Position introuvable pour le moment. Réessayez ou saisissez votre quartier.',
      );
    }
  }

  @override
  Future<void> openSettings() => Geolocator.openAppSettings();
}

final locationServiceProvider = Provider<LocationService>(
  (ref) => const GeolocatorLocationService(),
);

final sharedPreferencesProvider = FutureProvider<SharedPreferences>(
  (ref) => SharedPreferences.getInstance(),
);

class DeliveryLocationController extends AsyncNotifier<DeliveryLocation?> {
  static const _key = 'riiberaka.delivery_location';

  @override
  Future<DeliveryLocation?> build() async {
    final prefs = await ref.watch(sharedPreferencesProvider.future);
    final raw = prefs.getString(_key);
    if (raw == null) return null;
    try {
      return DeliveryLocation.fromJson(jsonDecode(raw) as Json);
    } catch (_) {
      await prefs.remove(_key);
      return null;
    }
  }

  Future<void> set(DeliveryLocation? location) async {
    final prefs = await ref.read(sharedPreferencesProvider.future);
    if (location == null) {
      await prefs.remove(_key);
    } else {
      await prefs.setString(_key, jsonEncode(location.toJson()));
    }
    state = AsyncData(location);
  }
}

final deliveryLocationProvider =
    AsyncNotifierProvider<DeliveryLocationController, DeliveryLocation?>(
      DeliveryLocationController.new,
    );
