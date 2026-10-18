import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../../app/routes.dart';
import '../driver/driver_models.dart';
import '../driver/driver_providers.dart';
import '../driver/driver_repository.dart';
import '../location/location_tracker.dart';
import '../support/report_sheet.dart';
import 'code_sheet.dart';
import 'delivery_actions.dart';
import 'delivery_map.dart';

class ActiveDeliveryScreen extends ConsumerStatefulWidget {
  const ActiveDeliveryScreen({super.key});

  @override
  ConsumerState<ActiveDeliveryScreen> createState() =>
      _ActiveDeliveryScreenState();
}

class _ActiveDeliveryScreenState extends ConsumerState<ActiveDeliveryScreen> {
  bool _busy = false;

  /// Course terminée pendant que l'écran était ouvert (affichage du succès).
  ActiveDelivery? _completed;

  Future<void> _run(Future<ActiveDelivery> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final updated = await action();
      if (!mounted) return;
      if (updated.step == DeliveryStep.delivered) {
        unawaited(HapticFeedback.heavyImpact());
        setState(() => _completed = updated);
        ref.read(currentDeliveryProvider.notifier).replace(null);
        ref.invalidate(driverProfileProvider);
      } else {
        ref.read(currentDeliveryProvider.notifier).replace(updated);
      }
    } on ApiException catch (error) {
      if (mounted) showRiiSnack(context, error.message);
      ref.invalidate(currentDeliveryProvider);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _enterCode(ActiveDelivery d, {required bool pickup}) async {
    final repo = ref.read(driverRepositoryProvider);
    final updated = await showCodeSheet(
      context,
      title: pickup ? 'Code de retrait' : 'Code de remise',
      help: pickup
          ? 'Demandez le code au restaurant au moment où il vous remet la commande.'
          : 'Demandez au client le code affiché dans son application, une fois la commande remise.',
      submit: (code) =>
          pickup ? repo.pickUp(d.id, code) : repo.deliver(d.id, code),
    );
    if (updated == null || !mounted) return;
    await _run(() async => updated);
  }

  Future<void> _release(ActiveDelivery d) async {
    final ok = await confirmDialog(
      context,
      title: 'Vous désister de la course ?',
      message:
          'La course sera proposée à un autre livreur. Le restaurant sera prévenu.',
      confirmLabel: 'Me désister',
      cancelLabel: 'Garder la course',
      destructive: true,
    );
    if (!ok || _busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(driverRepositoryProvider).release(d.id);
      ref.read(currentDeliveryProvider.notifier).replace(null);
      ref.invalidate(driverProfileProvider);
      if (mounted) context.pop();
    } on ApiException catch (error) {
      if (mounted) showRiiSnack(context, error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_completed != null) return _Completed(delivery: _completed!);
    final async = ref.watch(currentDeliveryProvider);
    final d = async.value;
    return Scaffold(
      appBar: AppBar(
        title: Text(d == null ? 'Course' : 'Course #${d.orderNumber}'),
      ),
      body: d == null
          ? (async.hasError
                ? ErrorState(
                    error: async.error!,
                    onRetry: () => ref.invalidate(currentDeliveryProvider),
                  )
                : async.isLoading
                ? const Center(child: CircularProgressIndicator())
                : const EmptyState(
                    icon: Icons.inbox_outlined,
                    title: 'Aucune course en cours',
                    message: 'Les courses acceptées apparaissent ici.',
                  ))
          : _Body(
              delivery: d,
              busy: _busy,
              onAtRestaurant: () => _run(
                () => ref.read(driverRepositoryProvider).atRestaurant(d.id),
              ),
              onArrived: () =>
                  _run(() => ref.read(driverRepositoryProvider).arrived(d.id)),
              onPickupCode: () => _enterCode(d, pickup: true),
              onDeliveryCode: () => _enterCode(d, pickup: false),
              onRelease: () => _release(d),
            ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({
    required this.delivery,
    required this.busy,
    required this.onAtRestaurant,
    required this.onArrived,
    required this.onPickupCode,
    required this.onDeliveryCode,
    required this.onRelease,
  });

  final ActiveDelivery delivery;
  final bool busy;
  final VoidCallback onAtRestaurant;
  final VoidCallback onArrived;
  final VoidCallback onPickupCode;
  final VoidCallback onDeliveryCode;
  final VoidCallback onRelease;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = delivery;
    final t = context.text;
    final p = context.palette;
    final toRestaurant = d.step.isBeforePickup;
    final me = ref.watch(locationTrackerProvider).lastPosition;
    final conversations =
        ref.watch(deliveryConversationsProvider(d.orderId)).value ?? const [];

    final (String title, String? hint) = switch (d.step) {
      DeliveryStep.assigned => (
        'Allez au restaurant',
        d.orderReady
            ? 'La commande est prête.'
            : 'La commande est en préparation.',
      ),
      DeliveryStep.atRestaurant => (
        'Récupérez la commande',
        d.orderReady
            ? 'La commande est prête : demandez le code de retrait.'
            : 'Commande encore en préparation, patientez.',
      ),
      DeliveryStep.pickedUp ||
      DeliveryStep.onTheWay => ('Livrez le client', null),
      DeliveryStep.arrived => (
        'Remettez la commande',
        'Le client a été prévenu de votre arrivée.',
      ),
      _ => ('Course', null),
    };

    final targetName = toRestaurant
        ? d.restaurant.name
        : (d.destination.firstName ?? 'Client');
    final targetAddress = toRestaurant
        ? [
            d.restaurant.address,
            d.restaurant.quarter,
          ].whereType<String>().join(' — ')
        : d.destination.address ?? 'Adresse non précisée';
    final phone = toRestaurant
        ? d.restaurant.phone
        : d.destination.contactPhone;
    final hasCoords = toRestaurant
        ? d.restaurant.hasCoordinates
        : d.destination.hasCoordinates;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              SizedBox(
                height: 220,
                child: DeliveryMap(
                  restaurant: d.restaurant.hasCoordinates
                      ? LatLng(d.restaurant.latitude!, d.restaurant.longitude!)
                      : null,
                  destination: d.destination.hasCoordinates
                      ? LatLng(
                          d.destination.latitude!,
                          d.destination.longitude!,
                        )
                      : null,
                  me: me == null ? null : LatLng(me.latitude, me.longitude),
                  focusOnDestination: !toRestaurant,
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(RiiSpace.gutter),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      toRestaurant ? 'Étape 1 sur 2' : 'Étape 2 sur 2',
                      style: t.labelMedium!.copyWith(color: p.brand),
                    ),
                    const SizedBox(height: 2),
                    Semantics(
                      liveRegion: true,
                      child: Text(title, style: t.headlineMedium),
                    ),
                    if (hint != null) ...[
                      const SizedBox(height: RiiSpace.xs),
                      Text(
                        hint,
                        style: t.bodyLarge!.copyWith(color: p.inkSoft),
                      ),
                    ],
                    const SizedBox(height: RiiSpace.lg),
                    RiiCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(targetName, style: t.titleLarge),
                          const SizedBox(height: 2),
                          Text(targetAddress, style: t.bodyLarge),
                          if (!toRestaurant &&
                              d.destination.landmark != null) ...[
                            const SizedBox(height: RiiSpace.xs),
                            Text(
                              'Repère : ${d.destination.landmark}',
                              style: t.bodyMedium!.copyWith(color: p.inkSoft),
                            ),
                          ],
                          const SizedBox(height: RiiSpace.md),
                          Row(
                            children: [
                              Expanded(
                                child: RiiButton(
                                  label: 'Itinéraire',
                                  icon: Icons.navigation_rounded,
                                  variant: RiiButtonVariant.secondary,
                                  small: true,
                                  onPressed:
                                      hasCoords || targetAddress.isNotEmpty
                                      ? () async {
                                          final ok = await openNavigation(
                                            latitude: toRestaurant
                                                ? d.restaurant.latitude
                                                : d.destination.latitude,
                                            longitude: toRestaurant
                                                ? d.restaurant.longitude
                                                : d.destination.longitude,
                                            address: targetAddress,
                                          );
                                          if (!ok && context.mounted) {
                                            showRiiSnack(
                                              context,
                                              'Aucune application de navigation disponible.',
                                            );
                                          }
                                        }
                                      : null,
                                ),
                              ),
                              if (phone != null) ...[
                                const SizedBox(width: RiiSpace.sm),
                                Expanded(
                                  child: RiiButton(
                                    label: 'Appeler',
                                    icon: Icons.call_rounded,
                                    variant: RiiButtonVariant.secondary,
                                    small: true,
                                    onPressed: () => callNumber(phone),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          if (phone != null)
                            Padding(
                              padding: const EdgeInsets.only(top: RiiSpace.xs),
                              child: Text(
                                PhoneNumbers.display(phone),
                                style: t.bodySmall,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (!toRestaurant && d.amountToCollect > 0) ...[
                      const SizedBox(height: RiiSpace.md),
                      InlineBanner(
                        tone: BannerTone.warning,
                        icon: Icons.payments_outlined,
                        title:
                            'À encaisser : ${formatXofLong(d.amountToCollect)}',
                        message:
                            'Paiement en espèces à la remise. Comptez avant de donner le code.',
                      ),
                    ],
                    const SizedBox(height: RiiSpace.md),
                    RiiCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Commande #${d.orderNumber}',
                            style: t.titleSmall,
                          ),
                          Text(
                            '${d.itemCount} article${d.itemCount > 1 ? 's' : ''} · ${d.restaurant.name}',
                            style: t.bodySmall,
                          ),
                          if (d.notes != null && d.notes!.isNotEmpty) ...[
                            const SizedBox(height: RiiSpace.xs),
                            Text(
                              'Précision du client : ${d.notes}',
                              style: t.bodyMedium,
                            ),
                          ],
                        ],
                      ),
                    ),
                    for (final c in conversations)
                      Padding(
                        padding: const EdgeInsets.only(top: RiiSpace.sm),
                        child: RiiButton(
                          label: c.withClient
                              ? 'Écrire au client'
                              : 'Écrire au restaurant',
                          icon: Icons.chat_bubble_outline_rounded,
                          variant: RiiButtonVariant.ghost,
                          onPressed: () => context.push(
                            Routes.chat(
                              c.id,
                              title: c.withClient
                                  ? 'Client · #${d.orderNumber}'
                                  : '${d.restaurant.name} · #${d.orderNumber}',
                              readOnly: c.isClosed,
                            ),
                          ),
                        ),
                      ),
                    const SizedBox(height: RiiSpace.sm),
                    RiiButton(
                      label: 'Signaler un problème',
                      icon: Icons.flag_outlined,
                      variant: RiiButtonVariant.ghost,
                      onPressed: () =>
                          showReportSheet(context, orderId: d.orderId),
                    ),
                    if (d.canRelease)
                      RiiButton(
                        label: 'Me désister de la course',
                        variant: RiiButtonVariant.ghost,
                        onPressed: busy ? null : onRelease,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        _ActionBar(
          delivery: d,
          busy: busy,
          onAtRestaurant: onAtRestaurant,
          onArrived: onArrived,
          onPickupCode: onPickupCode,
          onDeliveryCode: onDeliveryCode,
        ),
      ],
    );
  }
}

/// Une seule action principale, toujours en bas, accessible au pouce.
class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.delivery,
    required this.busy,
    required this.onAtRestaurant,
    required this.onArrived,
    required this.onPickupCode,
    required this.onDeliveryCode,
  });

  final ActiveDelivery delivery;
  final bool busy;
  final VoidCallback onAtRestaurant;
  final VoidCallback onArrived;
  final VoidCallback onPickupCode;
  final VoidCallback onDeliveryCode;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final d = delivery;
    final List<Widget> buttons = switch (d.step) {
      DeliveryStep.assigned => [
        RiiButton(
          label: 'Je suis au restaurant',
          loading: busy,
          onPressed: onAtRestaurant,
        ),
        if (d.orderReady) ...[
          const SizedBox(height: RiiSpace.sm),
          RiiButton(
            label: 'Saisir le code de retrait',
            variant: RiiButtonVariant.secondary,
            onPressed: busy ? null : onPickupCode,
          ),
        ],
      ],
      DeliveryStep.atRestaurant => [
        RiiButton(
          label: d.orderReady
              ? 'Saisir le code de retrait'
              : 'Commande en préparation…',
          onPressed: d.orderReady && !busy ? onPickupCode : null,
        ),
      ],
      DeliveryStep.pickedUp || DeliveryStep.onTheWay => [
        RiiButton(label: 'Je suis arrivé', loading: busy, onPressed: onArrived),
        const SizedBox(height: RiiSpace.sm),
        RiiButton(
          label: 'Saisir le code de remise',
          variant: RiiButtonVariant.secondary,
          onPressed: busy ? null : onDeliveryCode,
        ),
      ],
      DeliveryStep.arrived => [
        RiiButton(
          label: 'Saisir le code de remise',
          loading: busy,
          onPressed: onDeliveryCode,
        ),
      ],
      _ => const [],
    };
    if (buttons.isEmpty) return const SizedBox.shrink();
    return DecoratedBox(
      decoration: BoxDecoration(
        color: p.surface,
        border: Border(top: BorderSide(color: p.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(RiiSpace.gutter),
          child: Column(mainAxisSize: MainAxisSize.min, children: buttons),
        ),
      ),
    );
  }
}

class _Completed extends StatelessWidget {
  const _Completed({required this.delivery});

  final ActiveDelivery delivery;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RiiSpace.xxl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.check_circle_rounded, color: p.success, size: 72),
              const SizedBox(height: RiiSpace.lg),
              Text('Course livrée', style: t.headlineMedium),
              const SizedBox(height: RiiSpace.sm),
              Text(
                'Commande #${delivery.orderNumber} remise au client. La livraison est confirmée par le serveur.',
                textAlign: TextAlign.center,
                style: t.bodyLarge!.copyWith(color: p.inkSoft),
              ),
              const SizedBox(height: RiiSpace.xxl),
              RiiButton(
                label: 'Retour aux courses',
                onPressed: () => context.go(Routes.home),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
