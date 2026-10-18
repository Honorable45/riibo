import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';

import '../../app/routes.dart';
import '../driver/driver_models.dart';
import '../driver/driver_providers.dart';
import '../driver/driver_repository.dart';
import '../location/location_tracker.dart';
import 'offer_card.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(driverProfileProvider);
    final user = ref.watch(currentUserProvider);
    final unread = ref.watch(unreadNotificationsProvider).value ?? 0;
    final t = context.text;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          user == null || user.firstName.isEmpty
              ? 'Mes courses'
              : 'Bonjour ${user.firstName}',
          style: t.titleLarge,
        ),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => context.push(Routes.notifications),
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text(unread > 99 ? '99+' : '$unread'),
              child: const Icon(Icons.notifications_none_rounded),
            ),
          ),
          const SizedBox(width: RiiSpace.xs),
        ],
      ),
      body: profile.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(driverProfileProvider),
        ),
        data: (p) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(offersProvider);
            ref.invalidate(currentDeliveryProvider);
            ref.invalidate(driverProfileProvider);
            try {
              await ref.read(driverProfileProvider.future);
            } catch (_) {
              // L'erreur s'affiche à l'écran.
            }
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              RiiSpace.gutter,
              RiiSpace.sm,
              RiiSpace.gutter,
              RiiSpace.xxxl,
            ),
            children: [
              if (!p.isApproved)
                _AccountStatusCard(profile: p)
              else ...[
                _AvailabilityCard(profile: p),
                const SizedBox(height: RiiSpace.md),
                const _CurrentDeliveryCard(),
                _TodayStats(profile: p),
                const _OffersSection(),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Compte non validé : rien d'opérationnel n'est proposé (le serveur le
/// refuserait de toute façon), seulement l'explication et l'assistance.
class _AccountStatusCard extends StatelessWidget {
  const _AccountStatusCard({required this.profile});

  final DriverProfile profile;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final message = switch (profile.status) {
      DriverAccountStatus.pending =>
        'Votre dossier n’est pas encore complet. L’équipe Riiberaka vous indiquera les pièces à fournir.',
      DriverAccountStatus.inReview =>
        'Votre dossier est en cours de vérification. Vous pourrez recevoir des courses dès sa validation.',
      DriverAccountStatus.rejected => 'Votre dossier n’a pas été accepté.',
      DriverAccountStatus.suspended =>
        'Votre compte est suspendu : vous ne pouvez pas recevoir de courses.',
      _ => 'Votre compte ne peut pas recevoir de courses pour le moment.',
    };
    return RiiCard(
      padding: const EdgeInsets.all(RiiSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Tag(
            label: profile.status.label,
            tone: profile.status == DriverAccountStatus.inReview
                ? TagTone.warning
                : TagTone.danger,
          ),
          const SizedBox(height: RiiSpace.md),
          Text(message, style: t.bodyLarge),
          if (profile.statusReason != null &&
              profile.statusReason!.isNotEmpty) ...[
            const SizedBox(height: RiiSpace.sm),
            Text('Motif : ${profile.statusReason}', style: t.bodyMedium),
          ],
          const SizedBox(height: RiiSpace.lg),
          RiiButton(
            label: 'Contacter l’assistance',
            icon: Icons.support_agent_rounded,
            variant: RiiButtonVariant.secondary,
            onPressed: () => context.push(Routes.support),
          ),
        ],
      ),
    );
  }
}

class _AvailabilityCard extends ConsumerWidget {
  const _AvailabilityCard({required this.profile});

  final DriverProfile profile;

  Future<void> _toggle(BuildContext context, WidgetRef ref) async {
    unawaited(HapticFeedback.mediumImpact());
    final result = await ref
        .read(availabilityProvider.notifier)
        .setOnline(!profile.isOnline);
    if (!context.mounted) return;
    switch (result) {
      case AvailabilityChanged():
        break;
      case AvailabilityNeedsLocation(:final access):
        await _explainLocation(context, ref, access);
      case AvailabilityRefused(:final message):
        showRiiSnack(context, message);
    }
  }

  Future<void> _explainLocation(
    BuildContext context,
    WidgetRef ref,
    LocationAccess access,
  ) async {
    final source = ref.read(locationSourceProvider);
    final (
      String text,
      String action,
      Future<void> Function() open,
    ) = switch (access) {
      LocationAccess.serviceDisabled => (
        'La localisation du téléphone est désactivée. Activez-la pour passer en ligne.',
        'Activer la localisation',
        source.openLocationSettings,
      ),
      LocationAccess.deniedForever => (
        'Riiberaka n’a pas accès à votre position. Autorisez-la dans les réglages pour recevoir des courses.',
        'Ouvrir les réglages',
        source.openAppSettings,
      ),
      _ => (
        'Votre position est nécessaire pour vous proposer les courses proches et guider le client. '
            'Elle n’est partagée que lorsque vous êtes en ligne.',
        'Réessayer',
        () async {},
      ),
    };
    final retry = await confirmDialog(
      context,
      title: 'Position nécessaire',
      message: text,
      confirmLabel: action,
    );
    if (!retry || !context.mounted) return;
    await open();
    if (access == LocationAccess.denied && context.mounted) {
      await _toggle(context, ref);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final busy = ref.watch(availabilityProvider);
    final tracking = ref.watch(locationTrackerProvider);
    final p = context.palette;
    final t = context.text;
    final online = profile.isOnline;
    final now = DateTime.now();

    final String locationLine;
    if (!online) {
      locationLine = 'Votre position n’est pas partagée.';
    } else if (tracking.lastError != null) {
      locationLine = tracking.lastError!;
    } else if (tracking.isStale(now)) {
      locationLine = 'Recherche de votre position…';
    } else {
      locationLine = 'Position partagée — vous pouvez recevoir des courses.';
    }

    return Container(
      padding: const EdgeInsets.all(RiiSpace.xl),
      decoration: BoxDecoration(
        color: online ? p.brand : p.surface,
        borderRadius: RiiRadius.lgAll,
        border: online ? null : Border.all(color: p.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: online ? Colors.white : p.subtle,
                ),
              ),
              const SizedBox(width: RiiSpace.sm),
              Semantics(
                liveRegion: true,
                child: Text(
                  online ? 'En ligne' : 'Hors ligne',
                  style: t.headlineSmall!.copyWith(
                    color: online ? Colors.white : p.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: RiiSpace.xs),
          Text(
            locationLine,
            style: t.bodyMedium!.copyWith(
              color: online ? Colors.white.withValues(alpha: 0.9) : p.muted,
            ),
          ),
          const SizedBox(height: RiiSpace.lg),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: online ? Colors.white : p.brand,
                foregroundColor: online ? p.brand : Colors.white,
                shape: const RoundedRectangleBorder(
                  borderRadius: RiiRadius.mdAll,
                ),
              ),
              onPressed: busy ? null : () => _toggle(context, ref),
              child: busy
                  ? SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: online ? p.brand : Colors.white,
                      ),
                    )
                  : Text(
                      online ? 'Passer hors ligne' : 'Passer en ligne',
                      style: t.titleMedium!.copyWith(
                        color: online ? p.brand : Colors.white,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CurrentDeliveryCard extends ConsumerWidget {
  const _CurrentDeliveryCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final delivery = ref.watch(currentDeliveryProvider).value;
    if (delivery == null) return const SizedBox.shrink();
    final t = context.text;
    final p = context.palette;
    final toRestaurant = delivery.step.isBeforePickup;
    return Padding(
      padding: const EdgeInsets.only(bottom: RiiSpace.md),
      child: RiiCard(
        color: p.brandSoft,
        onTap: () => context.push(Routes.delivery),
        padding: const EdgeInsets.all(RiiSpace.lg),
        child: Row(
          children: [
            Icon(
              toRestaurant
                  ? Icons.storefront_rounded
                  : Icons.home_work_outlined,
              color: p.brand,
              size: 32,
            ),
            const SizedBox(width: RiiSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Course en cours · #${delivery.orderNumber}',
                    style: t.labelMedium,
                  ),
                  Text(
                    toRestaurant
                        ? 'Aller au restaurant ${delivery.restaurant.name}'
                        : 'Livrer ${delivery.destination.firstName ?? 'le client'}',
                    style: t.titleMedium,
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: p.brand),
          ],
        ),
      ),
    );
  }
}

class _TodayStats extends StatelessWidget {
  const _TodayStats({required this.profile});

  final DriverProfile profile;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    Widget stat(String value, String label) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: t.headlineSmall),
          Text(label, style: t.bodySmall),
        ],
      ),
    );
    return RiiCard(
      child: Row(
        children: [
          stat('${profile.todayDeliveries}', 'courses livrées aujourd’hui'),
          stat(
            formatXof(profile.todayDeliveryFees),
            'frais de livraison des courses du jour',
          ),
        ],
      ),
    );
  }
}

class _OffersSection extends ConsumerWidget {
  const _OffersSection();

  Future<void> _accept(
    BuildContext context,
    WidgetRef ref,
    DeliveryOffer offer,
  ) async {
    try {
      final delivery = await ref
          .read(driverRepositoryProvider)
          .accept(offer.deliveryId);
      // Affectation CONFIRMÉE par le serveur : on bascule sur la course.
      ref.read(offersProvider.notifier).remove(offer.deliveryId);
      ref.read(currentDeliveryProvider.notifier).replace(delivery);
      ref.invalidate(driverProfileProvider);
      unawaited(HapticFeedback.heavyImpact());
      if (context.mounted) await context.push(Routes.delivery);
    } on ApiException catch (error) {
      ref.read(offersProvider.notifier).remove(offer.deliveryId);
      ref.invalidate(offersProvider);
      if (context.mounted) {
        showRiiSnack(
          context,
          error.kind == ApiErrorKind.conflict
              ? error.message
              : describeError(error),
        );
      }
    }
  }

  Future<void> _reject(
    BuildContext context,
    WidgetRef ref,
    DeliveryOffer offer,
  ) async {
    ref.read(offersProvider.notifier).remove(offer.deliveryId);
    try {
      await ref.read(driverRepositoryProvider).reject(offer.deliveryId);
    } on ApiException {
      // Offre déjà expirée : rien à faire, elle n'est plus proposée.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(driverProfileProvider).value;
    final hasDelivery = ref.watch(currentDeliveryProvider).value != null;
    final offers = ref.watch(offersProvider);
    if (profile == null || !profile.isOnline) {
      return const Padding(
        padding: EdgeInsets.only(top: RiiSpace.xl),
        child: EmptyState(
          icon: Icons.power_settings_new_rounded,
          title: 'Vous êtes hors ligne',
          message: 'Passez en ligne pour recevoir des propositions de course.',
          compact: true,
        ),
      );
    }
    if (hasDelivery) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: 'Propositions',
          padding: EdgeInsets.fromLTRB(0, RiiSpace.xl, 0, RiiSpace.sm),
        ),
        offers.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(RiiSpace.xl),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => ErrorState(
            error: error,
            compact: true,
            onRetry: () => ref.invalidate(offersProvider),
          ),
          data: (list) => list.isEmpty
              ? const EmptyState(
                  icon: Icons.radar_rounded,
                  title: 'En attente de propositions',
                  message:
                      'Les courses proches de vous s’afficheront ici. Gardez l’application ouverte.',
                  compact: true,
                )
              : Column(
                  children: [
                    for (final offer in list)
                      Padding(
                        padding: const EdgeInsets.only(bottom: RiiSpace.md),
                        child: OfferCard(
                          offer: offer,
                          onAccept: () => _accept(context, ref, offer),
                          onReject: () => _reject(context, ref, offer),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}
