import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/providers.dart';

import 'driver_models.dart';

/// Routes du livreur (DriversController + DriverDeliveriesController).
/// Toutes exigent le rôle LIVREUR ; disponibilité, position, offres et
/// courses exigent en plus un compte APPROUVÉ (ApprovedGuard, côté serveur).
class DriverRepository {
  const DriverRepository(this._api);

  final ApiClient _api;

  Future<DriverProfile> me() async =>
      DriverProfile.fromJson(await _api.get<Json>('/driver/me'));

  Future<DriverProfile> update({
    VehicleType? vehicleType,
    String? plateNumber,
    String? vehicleBrand,
    String? vehicleColor,
    String? mobileMoneyNumber,
  }) async => DriverProfile.fromJson(
    await _api.patch<Json>(
      '/driver/me',
      body: {
        'vehicleType': ?vehicleType?.api,
        'plateNumber': ?plateNumber,
        'vehicleBrand': ?vehicleBrand,
        'vehicleColor': ?vehicleColor,
        'mobileMoneyNumber': ?mobileMoneyNumber,
      },
    ),
  );

  /// Le serveur refuse le passage hors ligne pendant une course (409).
  Future<DriverProfile> setOnline(bool online) async => DriverProfile.fromJson(
    await _api.put<Json>('/driver/me/availability', body: {'online': online}),
  );

  /// Position (Redis, TTL 90 s) ; acceptée seulement si le livreur est en ligne.
  Future<bool> sendLocation(double latitude, double longitude) async {
    final data = await _api.post<Json>(
      '/driver/location',
      body: {'latitude': latitude, 'longitude': longitude},
    );
    return data['sharing'] == true;
  }

  Future<List<DeliveryOffer>> offers() async {
    final data = await _api.get<List<dynamic>>('/driver/offers');
    return data.cast<Json>().map(DeliveryOffer.fromJson).toList();
  }

  Future<ActiveDelivery> accept(String deliveryId) async =>
      ActiveDelivery.fromJson(
        await _api.post<Json>(
          '/driver/offers/${Uri.encodeComponent(deliveryId)}/accept',
        ),
      );

  Future<void> reject(String deliveryId) => _api.post<void>(
    '/driver/offers/${Uri.encodeComponent(deliveryId)}/reject',
  );

  Future<ActiveDelivery?> current() async {
    final data = await _api.get<Json>('/driver/deliveries/current');
    final delivery = data.objOrNull('delivery');
    return delivery == null ? null : ActiveDelivery.fromJson(delivery);
  }

  Future<ActiveDelivery> get(String id) async => ActiveDelivery.fromJson(
    await _api.get<Json>('/driver/deliveries/${Uri.encodeComponent(id)}'),
  );

  Future<ActiveDelivery> atRestaurant(String id) async =>
      ActiveDelivery.fromJson(
        await _api.post<Json>(
          '/driver/deliveries/${Uri.encodeComponent(id)}/at-restaurant',
        ),
      );

  /// Code de retrait donné par le restaurant — vérifié par le serveur.
  Future<ActiveDelivery> pickUp(String id, String code) async =>
      ActiveDelivery.fromJson(
        await _api.post<Json>(
          '/driver/deliveries/${Uri.encodeComponent(id)}/pick-up',
          body: {'code': code},
        ),
      );

  Future<ActiveDelivery> arrived(String id) async => ActiveDelivery.fromJson(
    await _api.post<Json>(
      '/driver/deliveries/${Uri.encodeComponent(id)}/arrived',
    ),
  );

  /// Code de remise lu par le client — vérifié par le serveur.
  Future<ActiveDelivery> deliver(String id, String code) async =>
      ActiveDelivery.fromJson(
        await _api.post<Json>(
          '/driver/deliveries/${Uri.encodeComponent(id)}/deliver',
          body: {'code': code},
        ),
      );

  /// Désistement, uniquement avant la collecte (règle serveur).
  Future<void> release(String id, {String? reason}) => _api.post<void>(
    '/driver/deliveries/${Uri.encodeComponent(id)}/release',
    body: {
      if (reason != null && reason.trim().length >= 3) 'reason': reason.trim(),
    },
  );

  Future<CursorPage<HistoryEntry>> history({String? cursor}) async =>
      CursorPage.fromJson(
        await _api.get<Json>(
          '/driver/deliveries',
          query: {'cursor': cursor, 'limit': 20},
        ),
        HistoryEntry.fromJson,
      );
}

final driverRepositoryProvider = Provider<DriverRepository>(
  (ref) => DriverRepository(ref.watch(apiClientProvider)),
);
