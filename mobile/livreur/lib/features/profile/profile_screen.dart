import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../../app/routes.dart';
import '../driver/driver_models.dart';
import '../driver/driver_providers.dart';
import '../driver/driver_repository.dart';
import '../location/location_tracker.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final profile = ref.read(driverProfileProvider).value;
    if (ref.read(currentDeliveryProvider).value != null) {
      showRiiSnack(
        context,
        'Terminez ou libérez votre course avant de vous déconnecter.',
      );
      return;
    }
    final ok = await confirmDialog(
      context,
      title: 'Se déconnecter ?',
      message: 'Vous serez mis hors ligne et ne recevrez plus de propositions.',
      confirmLabel: 'Se déconnecter',
    );
    if (!ok) return;
    try {
      if (profile?.isOnline ?? false) {
        await ref.read(driverRepositoryProvider).setOnline(false);
      }
    } on ApiException catch (error) {
      if (context.mounted) showRiiSnack(context, error.message);
      return;
    }
    ref.read(locationTrackerProvider.notifier).stop();
    await ref.read(sessionProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final async = ref.watch(driverProfileProvider);
    final t = context.text;
    final p = context.palette;
    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(driverProfileProvider),
        ),
        data: (profile) => ListView(
          padding: const EdgeInsets.all(RiiSpace.gutter),
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: p.brandSoft,
                  child: Text(
                    (user?.firstName.isNotEmpty ?? false)
                        ? user!.firstName[0].toUpperCase()
                        : 'L',
                    style: t.headlineSmall!.copyWith(color: p.brand),
                  ),
                ),
                const SizedBox(width: RiiSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user?.displayName ?? 'Livreur', style: t.titleLarge),
                      if (user?.phone != null)
                        Text(
                          PhoneNumbers.display(user!.phone!),
                          style: t.bodyMedium!.copyWith(color: p.muted),
                        ),
                      const SizedBox(height: RiiSpace.xs),
                      Tag(
                        label: profile.status.label,
                        tone: profile.isApproved
                            ? TagTone.success
                            : TagTone.warning,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: RiiSpace.xl),
            _VehicleForm(profile: profile),
            const SizedBox(height: RiiSpace.lg),
            RiiCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.notifications_none_rounded),
                    title: const Text('Notifications'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push(Routes.notifications),
                  ),
                  Divider(height: 1, color: p.line),
                  ListTile(
                    leading: const Icon(Icons.support_agent_rounded),
                    title: const Text('Assistance'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push(Routes.support),
                  ),
                ],
              ),
            ),
            const SizedBox(height: RiiSpace.lg),
            RiiButton(
              label: 'Se déconnecter',
              icon: Icons.logout_rounded,
              variant: RiiButtonVariant.secondary,
              onPressed: () => _signOut(context, ref),
            ),
          ],
        ),
      ),
    );
  }
}

/// Véhicule et numéro Mobile Money (`PATCH /driver/me`).
class _VehicleForm extends ConsumerStatefulWidget {
  const _VehicleForm({required this.profile});

  final DriverProfile profile;

  @override
  ConsumerState<_VehicleForm> createState() => _VehicleFormState();
}

class _VehicleFormState extends ConsumerState<_VehicleForm> {
  late VehicleType _type = widget.profile.vehicleType;
  late final _plate = TextEditingController(text: widget.profile.plateNumber);
  late final _brand = TextEditingController(text: widget.profile.vehicleBrand);
  late final _color = TextEditingController(text: widget.profile.vehicleColor);
  late final _momo = TextEditingController(
    text: widget.profile.mobileMoneyNumber,
  );
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _plate.dispose();
    _brand.dispose();
    _color.dispose();
    _momo.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    String? momo;
    if (_momo.text.trim().isNotEmpty) {
      momo = PhoneNumbers.normalize(_momo.text);
      if (momo == null) {
        setState(() => _error = 'Numéro Mobile Money invalide.');
        return;
      }
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      String? clean(TextEditingController c) =>
          c.text.trim().isEmpty ? null : c.text.trim();
      final updated = await ref
          .read(driverRepositoryProvider)
          .update(
            vehicleType: _type,
            plateNumber: clean(_plate),
            vehicleBrand: clean(_brand),
            vehicleColor: clean(_color),
            mobileMoneyNumber: momo,
          );
      ref.read(driverProfileProvider.notifier).replace(updated);
      if (mounted) showRiiSnack(context, 'Informations enregistrées');
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    return RiiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Véhicule', style: t.titleMedium),
          const SizedBox(height: RiiSpace.md),
          SegmentedButton<VehicleType>(
            showSelectedIcon: false,
            segments: [
              for (final v in VehicleType.values)
                ButtonSegment(value: v, label: Text(v.label)),
            ],
            selected: {_type},
            onSelectionChanged: _saving
                ? null
                : (v) => setState(() => _type = v.first),
          ),
          const SizedBox(height: RiiSpace.md),
          TextField(
            controller: _plate,
            enabled: !_saving,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [LengthLimitingTextInputFormatter(20)],
            decoration: const InputDecoration(
              labelText: 'Immatriculation',
              hintText: 'TG-1234-AB',
            ),
          ),
          const SizedBox(height: RiiSpace.md),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _brand,
                  enabled: !_saving,
                  inputFormatters: [LengthLimitingTextInputFormatter(40)],
                  decoration: const InputDecoration(labelText: 'Marque'),
                ),
              ),
              const SizedBox(width: RiiSpace.md),
              Expanded(
                child: TextField(
                  controller: _color,
                  enabled: !_saving,
                  inputFormatters: [LengthLimitingTextInputFormatter(30)],
                  decoration: const InputDecoration(labelText: 'Couleur'),
                ),
              ),
            ],
          ),
          const SizedBox(height: RiiSpace.md),
          TextField(
            controller: _momo,
            enabled: !_saving,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Numéro Mobile Money (facultatif)',
              helperText:
                  'Pour vos futurs versements. Aucun versement n’est encore géré par l’application.',
              helperMaxLines: 2,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: RiiSpace.md),
            InlineBanner(message: _error!, tone: BannerTone.danger),
          ],
          const SizedBox(height: RiiSpace.lg),
          RiiButton(label: 'Enregistrer', loading: _saving, onPressed: _save),
        ],
      ),
    );
  }
}
