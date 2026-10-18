import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';
import 'package:riiberaka_livreur/features/driver/driver_models.dart';
import 'package:riiberaka_livreur/features/driver/driver_repository.dart';
import 'package:riiberaka_livreur/features/location/location_tracker.dart';

/// Données de TEST (formes relevées sur le vrai backend le 2026-10-17).
Json profileJson({
  String status = 'APPROVED',
  bool online = false,
  String? active,
}) => {
  'id': 'drv1',
  'status': status,
  'statusReason': null,
  'vehicleType': 'MOTO',
  'plateNumber': 'TG-1234-AB',
  'vehicleBrand': null,
  'vehicleColor': null,
  'mobileMoneyNumber': null,
  'isOnline': online,
  'isAvailable': online && active == null,
  'rating': 0,
  'ratingCount': 0,
  'totalDeliveries': 5,
  'today': {'deliveries': 2, 'earnings': 2000},
  'activeDeliveryId': active,
  'documents': <String, dynamic>{},
};

Json offerJson({
  String id = 'del1',
  Duration expiresIn = const Duration(seconds: 30),
}) => {
  'deliveryId': id,
  'orderNumber': 21,
  'restaurant': {'name': 'Chez Maman', 'quarter': 'Agoè'},
  'distanceToRestaurantKm': 1.4,
  'tripDistanceKm': 1.1,
  'deliveryFee': 1000,
  'expiresAt': DateTime.now().add(expiresIn).toUtc().toIso8601String(),
};

Json deliveryJson({
  String status = 'ASSIGNED',
  String orderStatus = 'PREPARING',
  int toCollect = 2500,
}) => {
  'id': 'del1',
  'status': status,
  'deliveryFee': 1000,
  'tripDistanceKm': 1.1,
  'order': {
    'id': 'ord1',
    'orderNumber': 21,
    'status': orderStatus,
    'itemCount': 2,
    'notes': 'Sans piment',
    'amountToCollect': toCollect,
  },
  'restaurant': {
    'id': 'r1',
    'name': 'Chez Maman',
    'address': 'Agoè, près du marché',
    'quarter': 'Agoè',
    'phone': '+22890200001',
    'latitude': 6.2311,
    'longitude': 1.1953,
  },
  'destination': {
    'firstName': 'Jean',
    'address': 'Rue du marché, maison bleue (Agoè)',
    'landmark': 'Portail bleu',
    'latitude': 6.2391,
    'longitude': 1.2033,
    'contactPhone': '+22890100001',
  },
};

class FakeDriverRepository implements DriverRepository {
  FakeDriverRepository({Json? profile})
    : profileData = profile ?? profileJson();

  Json profileData;
  List<Json> offersData = [];
  Json? currentData;
  ApiException? nextError;
  final calls = <String>[];
  Completer<void>? gate;

  Future<T> _do<T>(String call, T Function() result) async {
    calls.add(call);
    if (gate != null) await gate!.future;
    final error = nextError;
    if (error != null) {
      nextError = null;
      throw error;
    }
    return result();
  }

  @override
  Future<DriverProfile> me() =>
      _do('me', () => DriverProfile.fromJson(profileData));

  @override
  Future<DriverProfile> setOnline(bool online) => _do('online:$online', () {
    profileData = {...profileData, 'isOnline': online, 'isAvailable': online};
    return DriverProfile.fromJson(profileData);
  });

  @override
  Future<bool> sendLocation(double latitude, double longitude) =>
      _do('loc', () => false);

  @override
  Future<List<DeliveryOffer>> offers() =>
      _do('offers', () => offersData.map(DeliveryOffer.fromJson).toList());

  @override
  Future<ActiveDelivery> accept(String deliveryId) =>
      _do('accept:$deliveryId', () {
        currentData = deliveryJson();
        return ActiveDelivery.fromJson(currentData!);
      });

  @override
  Future<void> reject(String deliveryId) => _do('reject:$deliveryId', () {});

  @override
  Future<ActiveDelivery?> current() => _do(
    'current',
    () => currentData == null ? null : ActiveDelivery.fromJson(currentData!),
  );

  @override
  Future<ActiveDelivery> pickUp(String id, String code) =>
      _do('pickup:$code', () {
        currentData = deliveryJson(
          status: 'ON_THE_WAY',
          orderStatus: 'ON_THE_WAY',
        );
        return ActiveDelivery.fromJson(currentData!);
      });

  @override
  Future<ActiveDelivery> deliver(String id, String code) =>
      _do('deliver:$code', () {
        return ActiveDelivery.fromJson(
          deliveryJson(status: 'DELIVERED', orderStatus: 'DELIVERED'),
        );
      });

  @override
  Future<ActiveDelivery> atRestaurant(String id) => _do('at-restaurant', () {
    currentData = deliveryJson(
      status: 'AT_RESTAURANT',
      orderStatus: currentData?['order']['status'] as String? ?? 'PREPARING',
    );
    return ActiveDelivery.fromJson(currentData!);
  });

  @override
  Future<ActiveDelivery> arrived(String id) => _do('arrived', () {
    currentData = deliveryJson(status: 'ARRIVED', orderStatus: 'ON_THE_WAY');
    return ActiveDelivery.fromJson(currentData!);
  });

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('$invocation');
}

class FakeLocationSource implements LocationSource {
  FakeLocationSource([this.access = LocationAccess.granted]);

  LocationAccess access;
  // Fermé avec le test (doublure de courte durée).
  // ignore: close_sinks
  final controller = StreamController<Position>.broadcast();

  static Position at(double lat, double lng) => Position(
    latitude: lat,
    longitude: lng,
    timestamp: DateTime.now(),
    accuracy: 10,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 0,
    headingAccuracy: 0,
    speed: 0,
    speedAccuracy: 0,
  );

  @override
  Future<LocationAccess> ensureAccess() async => access;

  @override
  Future<Position?> current() async => at(6.2311, 1.1953);

  @override
  Stream<Position> stream() => controller.stream;

  @override
  Future<void> openAppSettings() async {}

  @override
  Future<void> openLocationSettings() async {}
}

class SignedInDriver extends SessionController {
  @override
  SessionState build() => const SignedIn(
    AuthUser(
      id: 'u-drv',
      firstName: 'Kofi',
      lastName: 'Livreur',
      role: 'LIVREUR',
      phone: '+22890300001',
    ),
  );
}

List<Override> baseOverrides(
  FakeDriverRepository repo, {
  FakeLocationSource? location,
}) => [
  driverRepositoryProvider.overrideWithValue(repo),
  locationSourceProvider.overrideWithValue(location ?? FakeLocationSource()),
  sessionProvider.overrideWith(SignedInDriver.new),
  realtimeEventsProvider.overrideWith((ref) => const Stream.empty()),
];

Future<void> pumpScreen(
  WidgetTester tester,
  Widget screen, {
  List<Override> overrides = const [],
  Size size = const Size(393, 852),
  bool dark = false,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => screen),
      GoRoute(
        path: '/:rest(.*)',
        builder: (_, state) => Scaffold(body: Text('route:${state.uri}')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: overrides,
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        theme: dark ? AppTheme.dark() : AppTheme.light(),
        locale: const Locale('fr'),
        supportedLocales: const [Locale('fr')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        routerConfig: router,
      ),
    ),
  );
}

Future<void> settle(WidgetTester tester, [int frames = 12]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}
