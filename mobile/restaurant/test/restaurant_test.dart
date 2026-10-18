import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_restaurant/features/menu/item_editor_screen.dart';
import 'package:riiberaka_restaurant/features/menu/menu_screen.dart';
import 'package:riiberaka_restaurant/features/orders/order_actions.dart';
import 'package:riiberaka_restaurant/features/orders/orders_screen.dart';
import 'package:riiberaka_restaurant/features/settings/settings_screen.dart';
import 'package:riiberaka_restaurant/features/shared/models.dart';
import 'package:riiberaka_restaurant/features/shared/providers.dart';
import 'package:riiberaka_restaurant/features/shared/repository.dart';

import 'support/fakes.dart';

KitchenOrder order(String status, {String type = 'DELIVERY'}) =>
    KitchenOrder.fromJson(orderJson(status: status, type: type));

void main() {
  group('Règles (miroir de order-transitions.ts, acteur RESTAURANT)', () {
    test('actions proposées par état', () {
      expect(nextActions(order('PENDING')), [
        OrderAction.accept,
        OrderAction.reject,
      ]);
      expect(nextActions(order('ACCEPTED')), [
        OrderAction.startPreparing,
        OrderAction.cancel,
      ]);
      expect(nextActions(order('PREPARING')), [
        OrderAction.ready,
        OrderAction.cancel,
      ]);
      expect(nextActions(order('READY', type: 'PICKUP')), [
        OrderAction.handOver,
      ]);
      // Livraison : la remise passe par le livreur (code de retrait), pas par le restaurant.
      expect(nextActions(order('READY')), isEmpty);
      expect(nextActions(order('ASSIGNED')), isEmpty);
      expect(nextActions(order('DELIVERED')), isEmpty);
    });

    test('motif exigé pour refuser et annuler', () {
      expect(OrderAction.reject.needsReason, isTrue);
      expect(OrderAction.cancel.needsReason, isTrue);
      expect(OrderAction.accept.needsReason, isFalse);
    });

    test('chaque état actif a une colonne, les états finaux aucune', () {
      for (final s in OrderState.values.where(
        (s) => !s.isFinal && s != OrderState.unknown,
      )) {
        expect(
          KitchenColumn.values.where((c) => c.states.contains(s)),
          hasLength(1),
          reason: s.api,
        );
      }
      for (final s in [
        OrderState.delivered,
        OrderState.cancelled,
        OrderState.rejected,
      ]) {
        expect(
          KitchenColumn.values.where((c) => c.states.contains(s)),
          isEmpty,
        );
      }
    });

    test('lecture d’une commande et du menu réels', () {
      final o = order('PENDING');
      expect(o.itemCount, 1);
      expect(o.items.single.options, ['Frites']);
      expect(o.clientPhone, '+22890100001');
      final menu = OwnerMenu.fromJson(menuJson());
      expect(menu.itemCount, 2);
      expect(menu.sections.single.items.last.soldOut, isTrue);
    });

    test(
      'options : corps conforme à SetOptionGroupsDto (sans identifiants)',
      () {
        final g = OwnerMenu.fromJson(
          menuJson(),
        ).sections.single.items.first.optionGroups.single;
        expect(g.toJson(), {
          'name': 'Accompagnement',
          'minSelect': 1,
          'maxSelect': 1,
          'options': [
            {'name': 'Alloco', 'priceDelta': 0, 'isAvailable': true},
          ],
        });
      },
    );
  });

  group('Signal de nouvelle commande', () {
    test(
      'ne sonne pas au premier chargement, puis une seule fois par commande',
      () {
        final c = ProviderContainer();
        addTearDown(c.dispose);
        final seen = c.read(seenPendingProvider.notifier);
        expect(seen.update({'a'}), isFalse); // premier chargement
        expect(seen.update({'a'}), isFalse);
        expect(seen.update({'a', 'b'}), isTrue); // nouvelle commande
        expect(seen.update({'b'}), isFalse); // déjà signalée
      },
    );
  });

  group('Écrans', () {
    testWidgets('restaurant non validé : aucune commande accessible', (
      t,
    ) async {
      final repo = FakeRepo(
        restaurants: [
          {
            'id': 'r1',
            'name': 'Chez Ama',
            'slug': 'chez-ama',
            'status': 'IN_REVIEW',
            'memberRole': 'OWNER',
          },
        ],
      );
      await pumpScreen(t, const OrdersScreen(), overrides: overrides(repo));
      await settle(t);
      expect(find.textContaining('en cours de vérification'), findsOneWidget);
      expect(find.text('Accepter'), findsNothing);
    });

    testWidgets('nouvelle commande : accepter n’envoie qu’une demande', (
      t,
    ) async {
      final repo = FakeRepo()..gate = Completer<void>();
      await pumpScreen(t, const OrdersScreen(), overrides: overrides(repo));
      await settle(t, 20);
      expect(find.text('#21'), findsOneWidget);
      expect(find.text('Note : Sans piment'), findsOneWidget);
      await t.tap(find.text('Accepter'));
      await t.pump();
      await t.tap(find.text('Accepter'), warnIfMissed: false);
      await t.pump();
      repo.gate!.complete();
      await settle(t);
      expect(repo.calls.where((c) => c.startsWith('act:accept')), hasLength(1));
    });

    testWidgets('refus sans motif : rien n’est envoyé', (t) async {
      final repo = FakeRepo();
      await pumpScreen(t, const OrdersScreen(), overrides: overrides(repo));
      await settle(t, 20);
      await t.tap(find.text('Refuser'));
      await settle(t);
      expect(find.text('Confirmer'), findsOneWidget);
      final confirm = t.widget<InkWell>(
        find
            .ancestor(
              of: find.text('Confirmer'),
              matching: find.byType(InkWell),
            )
            .first,
      );
      expect(confirm.onTap, isNull); // motif obligatoire
      await t.tap(find.text('Rupture de stock'));
      await settle(t);
      await t.tap(find.text('Confirmer'));
      await settle(t);
      expect(repo.calls, contains('act:reject:Rupture de stock'));
    });

    testWidgets('commande déjà traitée : message explicite', (t) async {
      final repo = FakeRepo()
        ..nextError = const ApiException(
          ApiErrorKind.conflict,
          'Action impossible à cette étape.',
        );
      await pumpScreen(t, const OrdersScreen(), overrides: overrides(repo));
      await settle(t, 20);
      await t.tap(find.text('Accepter'));
      await settle(t);
      expect(find.textContaining('déjà été traitée'), findsOneWidget);
    });

    testWidgets('menu : disponibilité envoyée au serveur, épuisé signalé', (
      t,
    ) async {
      final repo = FakeRepo();
      await pumpScreen(t, const MenuScreen(), overrides: overrides(repo));
      await settle(t, 20);
      expect(find.textContaining('Épuisé (stock 0)'), findsOneWidget);
      await t.tap(find.byType(Switch).first);
      await settle(t);
      expect(repo.calls, contains('item:i1:isAvailable'));
    });

    testWidgets('pause : l’état affiché vient du serveur', (t) async {
      final repo = FakeRepo();
      await pumpScreen(t, const SettingsScreen(), overrides: overrides(repo));
      await settle(t, 20);
      expect(find.text('Ouvert aux commandes'), findsOneWidget);
      await t.tap(find.text('Mettre en pause'));
      await settle(t);
      await t.tap(find.text('Mettre en pause').last);
      await settle(t, 20);
      expect(repo.calls, contains('update:isPaused'));
      expect(find.text('En pause'), findsOneWidget);
    });

    testWidgets('équipe (non propriétaire) : seule la pause est proposée', (
      t,
    ) async {
      final repo = FakeRepo(
        restaurants: [
          {
            'id': 'r1',
            'name': 'Chez Maman',
            'slug': 'chez-maman',
            'status': 'APPROVED',
            'memberRole': 'STAFF',
          },
        ],
      );
      await pumpScreen(t, const SettingsScreen(), overrides: overrides(repo));
      await settle(t, 20);
      expect(find.textContaining('Seul le propriétaire'), findsOneWidget);
      expect(find.text('Enregistrer les informations'), findsNothing);
    });

    testWidgets('nouveau plat : nom et prix obligatoires', (t) async {
      final repo = FakeRepo();
      await pumpScreen(t, const ItemEditorScreen(), overrides: overrides(repo));
      await settle(t, 20);
      await t.tap(find.text('Créer le plat'));
      await settle(t);
      expect(find.text('Le nom est obligatoire.'), findsOneWidget);
      expect(find.text('Le prix est obligatoire.'), findsOneWidget);
    });
  });
}
