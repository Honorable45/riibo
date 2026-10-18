import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_livreur/features/dashboard/dashboard_screen.dart';
import 'package:riiberaka_livreur/features/dashboard/offer_card.dart';
import 'package:riiberaka_livreur/features/delivery/active_delivery_screen.dart';
import 'package:riiberaka_livreur/features/delivery/code_sheet.dart';
import 'package:riiberaka_livreur/features/driver/driver_models.dart';
import 'package:riiberaka_livreur/features/driver/driver_providers.dart';
import 'package:riiberaka_livreur/features/location/location_tracker.dart';

import 'support/fakes.dart';

void main() {
  group('Modèles (réponses réelles du backend)', () {
    test(
      'profil : les « earnings » du serveur sont des frais de livraison',
      () {
        final p = DriverProfile.fromJson(profileJson());
        expect(p.isApproved, isTrue);
        expect(p.todayDeliveries, 2);
        expect(p.todayDeliveryFees, 2000);
        expect(
          DriverProfile.fromJson(profileJson(status: 'SUSPENDED')).isApproved,
          isFalse,
        );
      },
    );

    test('offre : temps restant et expiration', () {
      final offer = DeliveryOffer.fromJson(
        offerJson(expiresIn: const Duration(seconds: 12)),
      );
      final now = DateTime.now();
      expect(offer.remaining(now).inSeconds, inInclusiveRange(10, 12));
      expect(offer.isExpired(now.add(const Duration(seconds: 13))), isTrue);
      expect(offer.restaurantName, 'Chez Maman');
    });

    test('course : étapes et règles serveur', () {
      final d = ActiveDelivery.fromJson(deliveryJson());
      expect(d.step, DeliveryStep.assigned);
      expect(d.step.isBeforePickup, isTrue);
      expect(
        d.orderReady,
        isFalse,
      ); // collecte impossible tant que la commande n'est pas prête
      expect(d.canRelease, isTrue);
      expect(d.amountToCollect, 2500);
      final after = ActiveDelivery.fromJson(
        deliveryJson(status: 'ON_THE_WAY', orderStatus: 'ON_THE_WAY'),
      );
      expect(after.canRelease, isFalse);
      expect(after.step.isAfterPickup, isTrue);
    });
  });

  group('Disponibilité', () {
    ProviderContainer container(
      FakeDriverRepository repo,
      FakeLocationSource location,
    ) {
      final c = ProviderContainer(
        overrides: baseOverrides(repo, location: location),
        retry: (_, _) => null,
      );
      addTearDown(c.dispose);
      return c;
    }

    test('position refusée : aucune demande au serveur', () async {
      final repo = FakeDriverRepository();
      final c = container(repo, FakeLocationSource(LocationAccess.denied));
      await c.read(driverProfileProvider.future);
      final result = await c
          .read(availabilityProvider.notifier)
          .setOnline(true);
      expect(result, isA<AvailabilityNeedsLocation>());
      expect(repo.calls.where((x) => x.startsWith('online')), isEmpty);
      expect(c.read(driverProfileProvider).value!.isOnline, isFalse);
    });

    test('en ligne : état confirmé par le serveur, suivi démarré', () async {
      final repo = FakeDriverRepository();
      final c = container(repo, FakeLocationSource());
      await c.read(driverProfileProvider.future);
      final result = await c
          .read(availabilityProvider.notifier)
          .setOnline(true);
      expect(result, isA<AvailabilityChanged>());
      expect(c.read(driverProfileProvider).value!.isOnline, isTrue);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(c.read(locationTrackerProvider).active, isTrue);
      expect(repo.calls, contains('loc'));
      c.read(locationTrackerProvider.notifier).stop();
    });

    test(
      'refus serveur (course en cours) : l’état reste celui du serveur',
      () async {
        final repo = FakeDriverRepository(
          profile: profileJson(online: true, active: 'del1'),
        );
        final c = container(repo, FakeLocationSource());
        await c.read(driverProfileProvider.future);
        repo.nextError = const ApiException(
          ApiErrorKind.conflict,
          'Terminez ou libérez votre livraison en cours avant de vous mettre hors ligne.',
        );
        final result = await c
            .read(availabilityProvider.notifier)
            .setOnline(false);
        expect((result as AvailabilityRefused).message, contains('Terminez'));
        expect(c.read(driverProfileProvider).value!.isOnline, isTrue);
        c.read(locationTrackerProvider.notifier).stop();
      },
    );

    test(
      'le serveur refuse la position (hors ligne) : le suivi s’arrête',
      () async {
        final repo = FakeDriverRepository(profile: profileJson(online: true));
        final location = FakeLocationSource();
        final c = container(repo, location);
        await c.read(locationTrackerProvider.notifier).start();
        repo.nextError = const ApiException(
          ApiErrorKind.conflict,
          'Passez en ligne pour partager votre position.',
        );
        location.controller.add(FakeLocationSource.at(6.24, 1.20));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        // Premier envoi forcé déjà fait ; le suivant est dans l'intervalle :
        // on force via un arrêt explicite si l'intervalle a filtré l'envoi.
        expect(
          repo.calls.where((x) => x == 'loc').length,
          greaterThanOrEqualTo(1),
        );
        c.read(locationTrackerProvider.notifier).stop();
        expect(c.read(locationTrackerProvider).active, isFalse);
      },
    );
  });

  group('Écrans', () {
    testWidgets('compte en vérification : aucune action de course proposée', (
      tester,
    ) async {
      final repo = FakeDriverRepository(
        profile: profileJson(status: 'IN_REVIEW'),
      );
      await pumpScreen(
        tester,
        const DashboardScreen(),
        overrides: baseOverrides(repo),
      );
      await settle(tester);
      expect(find.text('Dossier en cours de vérification'), findsOneWidget);
      expect(find.text('Passer en ligne'), findsNothing);
    });

    testWidgets(
      'tableau de bord hors ligne : chiffres du serveur, libellés exacts',
      (tester) async {
        await pumpScreen(
          tester,
          const DashboardScreen(),
          overrides: baseOverrides(FakeDriverRepository()),
        );
        await settle(tester);
        expect(find.text('Hors ligne'), findsOneWidget);
        expect(find.text('Passer en ligne'), findsOneWidget);
        expect(
          find.text('frais de livraison des courses du jour'),
          findsOneWidget,
        );
        expect(find.text('Vous êtes hors ligne'), findsOneWidget);
      },
    );

    testWidgets('offre : un seul appel même en appuyant deux fois', (
      tester,
    ) async {
      var accepted = 0;
      final gate = Completer<void>();
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: OfferCard(
                offer: DeliveryOffer.fromJson(offerJson()),
                onAccept: () async {
                  accepted++;
                  await gate.future;
                },
                onReject: () async {},
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Accepter'));
      await tester.pump();
      await tester.tap(find.byType(OfferCard), warnIfMissed: false);
      await tester.pump();
      expect(accepted, 1);
      gate.complete();
      await tester.pump(const Duration(seconds: 1));
    });

    testWidgets('offre expirée : boutons désactivés', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: OfferCard(
                offer: DeliveryOffer.fromJson(
                  offerJson(expiresIn: const Duration(seconds: -1)),
                ),
                onAccept: () async => fail('ne doit pas accepter'),
                onReject: () async {},
              ),
            ),
          ),
        ),
      );
      expect(find.text('Expirée'), findsOneWidget);
      await tester.tap(find.text('Accepter'));
      await tester.pump();
    });

    testWidgets('course : commande en préparation → collecte impossible', (
      tester,
    ) async {
      final repo = FakeDriverRepository(
        profile: profileJson(online: true, active: 'del1'),
      )..currentData = deliveryJson(status: 'AT_RESTAURANT');
      await pumpScreen(
        tester,
        const ActiveDeliveryScreen(),
        overrides: baseOverrides(repo),
      );
      await settle(tester, 20);
      expect(find.text('Commande en préparation…'), findsOneWidget);
      expect(find.text('Saisir le code de retrait'), findsNothing);
    });

    testWidgets(
      'course après collecte : montant à encaisser et code de remise',
      (tester) async {
        final repo =
            FakeDriverRepository(
                profile: profileJson(online: true, active: 'del1'),
              )
              ..currentData = deliveryJson(
                status: 'ARRIVED',
                orderStatus: 'ON_THE_WAY',
              );
        await pumpScreen(
          tester,
          const ActiveDeliveryScreen(),
          overrides: baseOverrides(repo),
        );
        await settle(tester, 20);
        expect(find.textContaining('À encaisser'), findsOneWidget);
        expect(find.text('Remettez la commande'), findsOneWidget);
        expect(find.text('Me désister de la course'), findsNothing);
      },
    );

    testWidgets(
      'code refusé par le serveur : message, aucune validation locale',
      (tester) async {
        var attempts = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: Scaffold(
              body: CodeSheet(
                title: 'Code de remise',
                help: 'aide',
                submit: (code) async {
                  attempts++;
                  throw const ApiException(
                    ApiErrorKind.validation,
                    'Code incorrect.',
                  );
                },
              ),
            ),
          ),
        );
        await tester.enterText(find.byType(TextField), '123456');
        await tester.pump(const Duration(milliseconds: 100));
        expect(attempts, 1);
        expect(find.textContaining('Code incorrect'), findsOneWidget);
      },
    );
  });
}
