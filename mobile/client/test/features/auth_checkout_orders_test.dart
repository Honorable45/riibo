import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/auth/token_store.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'package:riiberaka_client/features/addresses/address_models.dart';
import 'package:riiberaka_client/features/addresses/address_repository.dart';
import 'package:riiberaka_client/features/auth/auth_repository.dart';
import 'package:riiberaka_client/features/auth/login_screen.dart';
import 'package:riiberaka_client/features/cart/cart_models.dart';
import 'package:riiberaka_client/features/cart/cart_repository.dart';
import 'package:riiberaka_client/features/checkout/checkout_screen.dart';
import 'package:riiberaka_client/features/checkout/order_submission.dart';
import 'package:riiberaka_client/features/orders/order_models.dart';
import 'package:riiberaka_client/features/orders/orders_repository.dart';

import '../support/app_harness.dart';
import '../support/fake_adapter.dart';
import '../support/fake_restaurant.dart';

// ---------------------------------------------------------------------------
// Doublures
// ---------------------------------------------------------------------------

OrderSummary summary(String id, {String restaurantId = 'r1', DateTime? at}) =>
    OrderSummary(
      id: id,
      orderNumber: 1,
      status: OrderStatus.pending,
      total: 3800,
      deliveryType: DeliveryType.delivery,
      createdAt: at ?? DateTime.now(),
      restaurantId: restaurantId,
      restaurantName: 'Chez Maman',
      itemCount: 1,
      preview: '1 × Poulet braisé',
    );

Json orderDetailJson(String id) => {
  'id': id,
  'orderNumber': 16,
  'status': 'PENDING',
  'deliveryType': 'DELIVERY',
  'subtotal': 2800,
  'deliveryFee': 1000,
  'discountAmount': 0,
  'total': 3800,
  'paymentMethod': 'CASH_ON_DELIVERY',
  'paymentStatus': 'PENDING',
  'createdAt': DateTime.now().toUtc().toIso8601String(),
  'items': <Json>[],
  'restaurant': {'id': 'r1', 'name': 'Chez Maman', 'slug': 'chez-maman'},
  'deliveryTarget': null,
  'delivery': null,
  'conversations': <Json>[],
  'review': null,
};

class FakeOrdersRepository implements OrdersRepository {
  List<OrderSummary> activeBefore = [];
  List<OrderSummary> activeAfter = [];
  ApiException? placeError;
  ApiException? listError;

  /// Erreur des lectures faites APRÈS l'envoi (vérification).
  ApiException? listErrorAfterPlace;
  Completer<void>? placeGate;
  int placeCalls = 0;
  bool placed = false;

  @override
  Future<OrderDetail> place(PlaceOrderRequest request) async {
    placeCalls++;
    if (placeGate != null) await placeGate!.future;
    placed = true;
    if (placeError != null) throw placeError!;
    return OrderDetail.fromJson(orderDetailJson('new'));
  }

  @override
  Future<CursorPage<OrderSummary>> list({
    required bool active,
    String? cursor,
    int limit = 20,
  }) async {
    if (listError != null) throw listError!;
    if (placed && listErrorAfterPlace != null) throw listErrorAfterPlace!;
    return CursorPage(
      items: placed ? activeAfter : activeBefore,
      nextCursor: null,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

const _timeout = ApiException(
  ApiErrorKind.timeout,
  'Le serveur met trop de temps à répondre.',
);
const _request = PlaceOrderRequest(
  deliveryType: DeliveryType.delivery,
  paymentMethod: PaymentMethod.cashOnDelivery,
  addressId: 'a1',
);

class _SignedIn extends SessionController {
  @override
  SessionState build() => const SignedIn(
    AuthUser(
      id: 'u1',
      firstName: 'Jean',
      lastName: '',
      role: 'CLIENT',
      phone: '+22890100001',
    ),
  );
}

class FakeAddressRepository implements AddressRepository {
  FakeAddressRepository(this.items);
  List<Address> items;

  @override
  Future<List<Address>> list() async => items;

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.purpose = OtpPurpose.login, this.role = 'CLIENT'});

  final OtpPurpose purpose;
  final String role;
  final List<String> calls = [];

  @override
  Future<OtpPurpose> requestCode(String phone) async {
    calls.add('request:$phone');
    return purpose;
  }

  Json _response() => {
    'user': {
      'id': 'u1',
      'firstName': 'Ama',
      'lastName': '',
      'phone': '+22890123456',
      'role': role,
    },
    'accessToken': 'A',
    'refreshToken': 'R',
  };

  @override
  Future<Json> verifyLogin({
    required String phone,
    required String code,
  }) async {
    calls.add('login:$phone:$code');
    return _response();
  }

  @override
  Future<Json> verifyRegister({
    required String phone,
    required String code,
    required String firstName,
    String? lastName,
  }) async {
    calls.add('register:$phone:$code:$firstName');
    return _response();
  }
}

void main() {
  // -------------------------------------------------------------------------
  group('Envoi de commande (anti-doublon)', () {
    test('succès : identifiant renvoyé', () async {
      final repo = FakeOrdersRepository();
      final outcome = await OrderSubmitter(
        repo,
      ).submit(_request, restaurantId: 'r1');
      expect(outcome, isA<OrderPlaced>());
      expect(repo.placeCalls, 1);
    });

    test('refus certain : erreur affichable, aucune vérification', () async {
      final repo = FakeOrdersRepository()
        ..placeError = const ApiException(
          ApiErrorKind.validation,
          'Votre panier est vide.',
        );
      final outcome = await OrderSubmitter(
        repo,
      ).submit(_request, restaurantId: 'r1');
      expect(
        (outcome as OrderRejected).error.message,
        'Votre panier est vide.',
      );
    });

    test(
      'réponse perdue mais commande créée : retrouvée, jamais renvoyée',
      () async {
        final repo = FakeOrdersRepository()
          ..activeBefore = [summary('old')]
          ..activeAfter = [summary('old'), summary('created')]
          ..placeError = _timeout;
        final outcome = await OrderSubmitter(
          repo,
        ).submit(_request, restaurantId: 'r1');
        expect((outcome as OrderPlaced).orderId, 'created');
        expect(repo.placeCalls, 1);
      },
    );

    test(
      'réponse perdue, aucune nouvelle commande : refus explicite',
      () async {
        final repo = FakeOrdersRepository()
          ..activeBefore = [summary('old')]
          ..activeAfter = [summary('old')]
          ..placeError = _timeout;
        final outcome = await OrderSubmitter(
          repo,
        ).submit(_request, restaurantId: 'r1');
        expect(outcome, isA<OrderRejected>());
      },
    );

    test(
      'une commande plus ancienne du même restaurant n’est pas confondue',
      () async {
        final repo = FakeOrdersRepository()
          ..activeBefore = [summary('old', at: DateTime.now())]
          ..activeAfter = [summary('old', at: DateTime.now())]
          ..placeError = _timeout;
        final outcome = await OrderSubmitter(
          repo,
        ).submit(_request, restaurantId: 'r1');
        expect(outcome, isNot(isA<OrderPlaced>()));
      },
    );

    test('vérification impossible : état incertain', () async {
      final repo = FakeOrdersRepository()..placeError = _timeout;
      final submitter = OrderSubmitter(repo);
      repo.listError = const ApiException(ApiErrorKind.offline, 'hors ligne');
      final outcome = await submitter.submit(_request, restaurantId: 'r1');
      expect(outcome, isA<OrderUncertain>());
      // Plus tard, la vérification aboutit.
      repo
        ..listError = null
        ..activeAfter = [summary('created')];
      expect(await submitter.verify(restaurantId: 'r1'), isA<OrderPlaced>());
      expect(repo.placeCalls, 1);
    });

    test('le corps de commande ne contient ni plat ni prix', () {
      final body = _request.toJson();
      expect(
        body.keys,
        unorderedEquals(['deliveryType', 'paymentMethod', 'addressId']),
      );
      const pickup = PlaceOrderRequest(
        deliveryType: DeliveryType.pickup,
        paymentMethod: PaymentMethod.cashOnDelivery,
        addressId: 'a1',
      );
      expect(pickup.toJson().containsKey('addressId'), isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('Suivi', () {
    test(
      'étapes de livraison et de retrait conformes à la machine à états',
      () {
        expect(orderSteps(DeliveryType.delivery).length, 7);
        expect(orderSteps(DeliveryType.pickup).length, 5);
        expect(
          currentStepIndex(OrderStatus.assigned, DeliveryType.delivery),
          3,
        );
        expect(
          currentStepIndex(OrderStatus.onTheWay, DeliveryType.delivery),
          5,
        );
        expect(currentStepIndex(OrderStatus.delivered, DeliveryType.pickup), 4);
        expect(
          currentStepIndex(OrderStatus.cancelled, DeliveryType.delivery),
          -1,
        );
      },
    );

    test('annulation client seulement avant la préparation', () {
      expect(OrderStatus.pending.clientCanCancel, isTrue);
      expect(OrderStatus.accepted.clientCanCancel, isTrue);
      expect(OrderStatus.preparing.clientCanCancel, isFalse);
    });

    test('position périmée jamais présentée comme actuelle', () {
      final now = DateTime(2026, 10, 17, 12);
      Tracking at(DateTime? seen) => Tracking(
        orderStatus: OrderStatus.onTheWay,
        driverLatitude: 6.2,
        driverLongitude: 1.2,
        driverSeenAt: seen,
      );
      expect(
        at(now.subtract(const Duration(seconds: 30))).isStale(now),
        isFalse,
      );
      expect(at(now.subtract(const Duration(minutes: 3))).isStale(now), isTrue);
      expect(at(null).isStale(now), isTrue);
    });

    test('lit le détail réel d’une commande livrée', () {
      final order = OrderDetail.fromJson({
        ...orderDetailJson('o1'),
        'status': 'DELIVERED',
        'delivery': {
          'status': 'DELIVERED',
          'driver': {
            'firstName': 'Kofi',
            'vehicleType': 'MOTO',
            'plateNumber': 'TG-1234-AB',
          },
          'deliveryCode': '600580',
        },
        'review': null,
      });
      expect(order.driver!.vehicleLabel, 'Moto');
      expect(order.deliveryCode, '600580');
      expect(order.canReview, isTrue);
    });
  });

  // -------------------------------------------------------------------------
  group('Adresses', () {
    test('création : champs vides omis, jamais isDefault=false', () {
      const input = AddressInput(
        label: AddressLabel.maison,
        fullAddress: ' Rue 12 ',
        quarter: '',
      );
      expect(input.toJson(), {'label': 'MAISON', 'fullAddress': 'Rue 12'});
    });

    test('modification : champ vidé envoyé vide pour être effacé', () {
      const input = AddressInput(
        label: AddressLabel.autre,
        customLabel: 'Tante',
        fullAddress: 'Rue 12',
        landmark: '',
        latitude: 6.2,
        longitude: 1.2,
        isDefault: true,
      );
      expect(input.toJson(forUpdate: true), {
        'label': 'AUTRE',
        'customLabel': 'Tante',
        'fullAddress': 'Rue 12',
        'quarter': '',
        'landmark': '',
        'latitude': 6.2,
        'longitude': 1.2,
        'isDefault': true,
      });
    });
  });

  // -------------------------------------------------------------------------
  group('Session', () {
    ProviderContainer containerWith(
      MemoryTokenStore store,
      FakeAdapter adapter,
    ) {
      final api = ApiClient(
        baseUrl: Uri.parse('http://test/api/v1'),
        tokenStore: store,
        dio: Dio()..httpClientAdapter = adapter,
        refreshDio: Dio()..httpClientAdapter = adapter,
      );
      final c = ProviderContainer(
        overrides: [
          tokenStoreProvider.overrideWithValue(store),
          apiClientProvider.overrideWithValue(api),
        ],
      );
      addTearDown(c.dispose);
      return c;
    }

    Future<SessionState> settled(ProviderContainer c) async {
      c.read(sessionProvider);
      for (
        var i = 0;
        i < 20 && c.read(sessionProvider) is SessionRestoring;
        i++
      ) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      await Future<void>.delayed(const Duration(milliseconds: 20));
      return c.read(sessionProvider);
    }

    test('sans jeton : déconnecté', () async {
      final c = containerWith(
        MemoryTokenStore(),
        FakeAdapter((_) => const FakeReply(500)),
      );
      expect(await settled(c), isA<SignedOut>());
    });

    test('jetons valides : profil relu sur le serveur', () async {
      final store = MemoryTokenStore();
      await store.write(const AuthTokens(accessToken: 'A', refreshToken: 'R'));
      final c = containerWith(
        store,
        FakeAdapter(
          (_) => const FakeReply(200, {
            'id': 'u1',
            'firstName': 'Jean',
            'lastName': 'Client',
            'phone': '+22890100001',
            'role': 'CLIENT',
          }),
        ),
      );
      final state = await settled(c);
      expect((state as SignedIn).user.firstName, 'Jean');
    });

    test(
      'session révoquée côté serveur : déconnecté avec explication',
      () async {
        final store = MemoryTokenStore();
        await store.write(
          const AuthTokens(accessToken: 'A', refreshToken: 'R'),
        );
        final c = containerWith(
          store,
          FakeAdapter((_) => const FakeReply(401, {'message': 'x'})),
        );
        final state = await settled(c);
        expect((state as SignedOut).reason, contains('expiré'));
        expect(await store.read(), isNull);
      },
    );

    test('déconnexion hors ligne : jetons effacés quand même', () async {
      final store = MemoryTokenStore();
      await store.write(const AuthTokens(accessToken: 'A', refreshToken: 'R'));
      var online = true;
      final c = containerWith(
        store,
        FakeAdapter(
          (_) => online
              ? const FakeReply(200, {
                  'id': 'u1',
                  'firstName': 'Jean',
                  'role': 'CLIENT',
                })
              : const FakeReply.network(DioExceptionType.connectionError),
        ),
      );
      await settled(c);
      online = false;
      await c.read(sessionProvider.notifier).signOut();
      expect(c.read(sessionProvider), isA<SignedOut>());
      expect(await store.read(), isNull);
    });
  });

  // -------------------------------------------------------------------------
  group('Écran de connexion', () {
    testWidgets('numéro invalide : message, aucun appel', (tester) async {
      final auth = FakeAuthRepository();
      await pumpScreen(
        tester,
        const LoginScreen(),
        overrides: [
          authRepositoryProvider.overrideWithValue(auth),
          tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
        ],
      );
      await settle(tester);
      await tester.enterText(find.byType(TextField), '9012');
      await tester.tap(find.text('Recevoir un code'));
      await settle(tester);
      expect(find.textContaining('Numéro invalide'), findsOneWidget);
      expect(auth.calls, isEmpty);
    });

    testWidgets('inscription : prénom exigé puis compte créé', (tester) async {
      final auth = FakeAuthRepository(purpose: OtpPurpose.register);
      await pumpScreen(
        tester,
        const LoginScreen(),
        overrides: [
          authRepositoryProvider.overrideWithValue(auth),
          tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
        ],
      );
      await settle(tester);
      await tester.enterText(find.byType(TextField), '90 12 34 56');
      await tester.tap(find.text('Recevoir un code'));
      await settle(tester);
      expect(auth.calls, ['request:+22890123456']);
      expect(find.text('Créer votre compte'), findsOneWidget);

      await tester.enterText(
        find.widgetWithText(TextField, 'Code à 6 chiffres'),
        '123456',
      );
      await tester.tap(find.text('Créer mon compte'));
      await settle(tester);
      expect(find.text('Indiquez votre prénom.'), findsOneWidget);

      await tester.enterText(find.widgetWithText(TextField, 'Prénom'), 'Ama');
      await tester.tap(find.text('Créer mon compte'));
      await settle(tester);
      expect(auth.calls.last, 'register:+22890123456:123456:Ama');
    });

    testWidgets('compte professionnel refusé dans l’application client', (
      tester,
    ) async {
      final auth = FakeAuthRepository(role: 'RESTAURANT');
      final store = MemoryTokenStore();
      await pumpScreen(
        tester,
        const LoginScreen(),
        overrides: [
          authRepositoryProvider.overrideWithValue(auth),
          tokenStoreProvider.overrideWithValue(store),
          apiClientProvider.overrideWithValue(
            ApiClient(
              baseUrl: Uri.parse('http://test/api/v1'),
              tokenStore: store,
              dio: Dio()
                ..httpClientAdapter = FakeAdapter((_) => const FakeReply(204)),
            ),
          ),
        ],
      );
      await settle(tester);
      await tester.enterText(find.byType(TextField), '90123456');
      await tester.tap(find.text('Recevoir un code'));
      await settle(tester);
      await tester.enterText(find.byType(TextField).last, '123456');
      await settle(tester);
      expect(find.textContaining('compte professionnel'), findsOneWidget);
      expect(await store.read(), isNull);
    });
  });

  // -------------------------------------------------------------------------
  group('Validation de commande', () {
    List<Override> overrides(FakeOrdersRepository orders) => [
      sessionProvider.overrideWith(_SignedIn.new),
      cartRepositoryProvider.overrideWithValue(
        FakeCartRepository(Cart.fromJson(cartJson())),
      ),
      ordersRepositoryProvider.overrideWithValue(orders),
      addressRepositoryProvider.overrideWithValue(
        FakeAddressRepository([
          Address.fromJson({
            'id': 'a1',
            'label': 'MAISON',
            'fullAddress': 'Rue du marché',
            'quarter': 'Agoè',
            'landmark': 'Portail bleu',
            'isDefault': true,
          }),
        ]),
      ),
    ];

    testWidgets('paiement à la livraison seul disponible', (tester) async {
      await pumpScreen(
        tester,
        const CheckoutScreen(),
        overrides: overrides(FakeOrdersRepository()),
      );
      await settle(tester, 20);
      await tester.scrollUntilVisible(
        find.text('Flooz'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Espèces à la livraison'), findsOneWidget);
      expect(find.text('Bientôt'), findsNWidgets(2));
      expect(find.text('Total à payer'), findsOneWidget);
    });

    testWidgets('double appui : une seule commande envoyée', (tester) async {
      final orders = FakeOrdersRepository()..placeGate = Completer<void>();
      await pumpScreen(
        tester,
        const CheckoutScreen(),
        overrides: overrides(orders),
      );
      await settle(tester, 20);
      await tester.tap(find.text('Confirmer la commande'));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.text('Confirmer la commande'), warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 50));
      orders.placeGate!.complete();
      await settle(tester, 20);
      expect(orders.placeCalls, 1);
      expect(find.textContaining('route:/orders/new'), findsOneWidget);
    });

    testWidgets('réponse incertaine : vérification proposée, pas de renvoi', (
      tester,
    ) async {
      final orders = FakeOrdersRepository()
        ..placeError = _timeout
        ..listErrorAfterPlace = const ApiException(
          ApiErrorKind.offline,
          'hors ligne',
        );
      await pumpScreen(
        tester,
        const CheckoutScreen(),
        overrides: overrides(orders),
      );
      await settle(tester, 20);
      await tester.tap(find.text('Confirmer la commande'));
      await settle(tester, 20);
      expect(find.text('Connexion interrompue'), findsOneWidget);
      expect(find.text('Vérifier ma commande'), findsOneWidget);
      expect(find.text('Confirmer la commande'), findsNothing);
      expect(orders.placeCalls, 1);
    });
  });
}
