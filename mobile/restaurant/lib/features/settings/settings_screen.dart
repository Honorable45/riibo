import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/net_image.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../../app/routes.dart';
import '../shared/models.dart';
import '../shared/providers.dart';
import '../shared/repository.dart';
import '../shared/widgets.dart';

const _days = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Restaurant')),
      body: RestaurantGate(
        allowUnapproved: true,
        builder: (context, r) {
          final async = ref.watch(restaurantProfileProvider);
          return async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(restaurantProfileProvider),
            ),
            data: (profile) => RefreshIndicator(
              onRefresh: () => ref.refresh(restaurantProfileProvider.future),
              child: ListView(
                padding: const EdgeInsets.all(RiiSpace.gutter),
                children: [
                  _PauseCard(restaurant: r, profile: profile),
                  const SizedBox(height: RiiSpace.lg),
                  if (!r.isOwner)
                    const InlineBanner(
                      message:
                          'Seul le propriétaire peut modifier les informations, photos et horaires.',
                    )
                  else ...[
                    _Images(profile: profile),
                    const SizedBox(height: RiiSpace.lg),
                    _InfoForm(profile: profile),
                    const SizedBox(height: RiiSpace.lg),
                    _HoursSummary(profile: profile),
                    const SizedBox(height: RiiSpace.lg),
                    _Closures(profile: profile),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Pause : arrêt immédiat des nouvelles commandes, autorisé à tout membre.
/// Les commandes déjà acceptées continuent normalement.
class _PauseCard extends ConsumerStatefulWidget {
  const _PauseCard({required this.restaurant, required this.profile});

  final MyRestaurant restaurant;
  final RestaurantProfile profile;

  @override
  ConsumerState<_PauseCard> createState() => _PauseCardState();
}

class _PauseCardState extends ConsumerState<_PauseCard> {
  bool _busy = false;

  Future<void> _toggle() async {
    final pause = !widget.profile.isPaused;
    if (pause) {
      final ok = await confirmDialog(
        context,
        title: 'Mettre le restaurant en pause ?',
        message:
            'Les clients ne pourront plus commander. Les commandes en cours ne sont pas touchées.',
        confirmLabel: 'Mettre en pause',
      );
      if (!ok) return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(restaurantRepositoryProvider).update(
        widget.restaurant.id,
        {'isPaused': pause},
      );
      unawaited(HapticFeedback.mediumImpact());
    } on ApiException catch (e) {
      if (mounted) showRiiSnack(context, e.message);
    } finally {
      // Toujours l'état relu sur le serveur, jamais l'état supposé.
      ref.invalidate(restaurantProfileProvider);
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = context.text;
    final paused = widget.profile.isPaused;
    return Container(
      padding: const EdgeInsets.all(RiiSpace.xl),
      decoration: BoxDecoration(
        color: paused ? p.dangerSoft : p.successSoft,
        borderRadius: RiiRadius.lgAll,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                paused
                    ? Icons.pause_circle_rounded
                    : Icons.check_circle_rounded,
                color: paused ? p.danger : p.success,
                size: 28,
              ),
              const SizedBox(width: RiiSpace.sm),
              Expanded(
                child: Text(
                  paused ? 'En pause' : 'Ouvert aux commandes',
                  style: t.headlineSmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: RiiSpace.xs),
          Text(
            paused
                ? 'Aucune nouvelle commande ne peut arriver.'
                : 'Les clients peuvent commander pendant vos horaires d’ouverture.',
            style: t.bodyMedium,
          ),
          if (widget.restaurant.isApproved) ...[
            const SizedBox(height: RiiSpace.md),
            RiiButton(
              label: paused ? 'Reprendre les commandes' : 'Mettre en pause',
              variant: paused
                  ? RiiButtonVariant.primary
                  : RiiButtonVariant.secondary,
              loading: _busy,
              onPressed: _toggle,
            ),
          ] else
            Padding(
              padding: const EdgeInsets.only(top: RiiSpace.sm),
              child: Text(
                'Statut du dossier : ${widget.restaurant.statusLabel}',
                style: t.titleSmall,
              ),
            ),
        ],
      ),
    );
  }
}

class _Images extends ConsumerWidget {
  const _Images({required this.profile});

  final RestaurantProfile profile;

  Future<void> _upload(BuildContext context, WidgetRef ref, String kind) async {
    final file = await pickPhoto(context);
    if (file == null || !context.mounted) return;
    final ok = await uploadWithProgress(
      context,
      (progress) => ref
          .read(restaurantRepositoryProvider)
          .uploadImage(profile.id, kind, file, onProgress: progress),
    );
    if (ok) ref.invalidate(restaurantProfileProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.text;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Photos', style: t.titleMedium),
        const SizedBox(height: RiiSpace.sm),
        Row(
          children: [
            SizedBox(
              width: 96,
              child: Column(
                children: [
                  AspectRatio(
                    aspectRatio: 1,
                    child: NetImage(
                      url: profile.logoUrl,
                      borderRadius: RiiRadius.mdAll,
                      fallbackIcon: Icons.storefront_outlined,
                    ),
                  ),
                  TextButton(
                    onPressed: () => _upload(context, ref, 'logo'),
                    child: const Text('Logo'),
                  ),
                ],
              ),
            ),
            const SizedBox(width: RiiSpace.md),
            Expanded(
              child: Column(
                children: [
                  AspectRatio(
                    aspectRatio: 2.1,
                    child: NetImage(
                      url: profile.coverUrl,
                      borderRadius: RiiRadius.mdAll,
                      fallbackIcon: Icons.image_outlined,
                    ),
                  ),
                  TextButton(
                    onPressed: () => _upload(context, ref, 'cover'),
                    child: const Text('Photo de couverture'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _InfoForm extends ConsumerStatefulWidget {
  const _InfoForm({required this.profile});

  final RestaurantProfile profile;

  @override
  ConsumerState<_InfoForm> createState() => _InfoFormState();
}

class _InfoFormState extends ConsumerState<_InfoForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.profile.name);
  late final _description = TextEditingController(
    text: widget.profile.description,
  );
  late final _phone = TextEditingController(text: widget.profile.phone);
  late final _address = TextEditingController(text: widget.profile.address);
  late final _quarter = TextEditingController(text: widget.profile.quarter);
  late final _city = TextEditingController(text: widget.profile.city);
  late final _fee = TextEditingController(
    text: '${widget.profile.deliveryFee}',
  );
  late final _min = TextEditingController(
    text: '${widget.profile.minOrderAmount}',
  );
  late final _prepMin = TextEditingController(
    text: widget.profile.prepTimeMin?.toString(),
  );
  late final _prepMax = TextEditingController(
    text: widget.profile.prepTimeMax?.toString(),
  );
  late final _momo = TextEditingController(
    text: widget.profile.paymentAccountNumber,
  );
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [
      _name,
      _description,
      _phone,
      _address,
      _quarter,
      _city,
      _fee,
      _min,
      _prepMin,
      _prepMax,
      _momo,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    if (!_form.currentState!.validate()) return;
    int? n(TextEditingController c) => int.tryParse(c.text.trim());
    final phone = PhoneNumbers.normalize(_phone.text);
    final momo = _momo.text.trim().isEmpty
        ? null
        : PhoneNumbers.normalize(_momo.text);
    final Json changes = {
      'name': _name.text.trim(),
      'description': _description.text.trim(),
      'phone': ?phone,
      'address': _address.text.trim(),
      'quarter': _quarter.text.trim(),
      'city': _city.text.trim(),
      'deliveryFee': n(_fee),
      'minOrderAmount': n(_min),
      'prepTimeMin': ?n(_prepMin),
      'prepTimeMax': ?n(_prepMax),
      'paymentAccountNumber': ?momo,
    };
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(restaurantRepositoryProvider)
          .update(widget.profile.id, changes);
      ref.invalidate(restaurantProfileProvider);
      ref.invalidate(myRestaurantsProvider);
      if (mounted) showRiiSnack(context, 'Informations enregistrées');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    Widget field(
      TextEditingController c,
      String label, {
      bool number = false,
      String? suffix,
      String? Function(String?)? validator,
      int maxLines = 1,
    }) => Padding(
      padding: const EdgeInsets.only(bottom: RiiSpace.md),
      child: TextFormField(
        controller: c,
        enabled: !_saving,
        maxLines: maxLines,
        keyboardType: number ? TextInputType.number : null,
        inputFormatters: number
            ? [FilteringTextInputFormatter.digitsOnly]
            : null,
        validator: validator,
        decoration: InputDecoration(labelText: label, suffixText: suffix),
      ),
    );
    String? range(String? v, int min, int max, String what) {
      final x = int.tryParse(v?.trim() ?? '');
      if (v == null || v.trim().isEmpty) return null;
      return x == null || x < min || x > max
          ? '$what : entre $min et $max.'
          : null;
    }

    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Informations', style: t.titleMedium),
          const SizedBox(height: RiiSpace.sm),
          field(
            _name,
            'Nom du restaurant',
            validator: (v) =>
                (v?.trim().length ?? 0) < 2 ? 'Nom trop court.' : null,
          ),
          field(_description, 'Présentation', maxLines: 3),
          field(
            _phone,
            'Téléphone',
            validator: (v) => PhoneNumbers.normalize(v ?? '') == null
                ? 'Numéro invalide.'
                : null,
          ),
          field(
            _address,
            'Adresse',
            validator: (v) =>
                (v?.trim().length ?? 0) < 2 ? 'Adresse obligatoire.' : null,
          ),
          Row(
            children: [
              Expanded(child: field(_quarter, 'Quartier')),
              const SizedBox(width: RiiSpace.md),
              Expanded(child: field(_city, 'Ville')),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: field(
                  _fee,
                  'Frais de livraison',
                  number: true,
                  suffix: 'FCFA',
                  validator: (v) => range(v, 0, 50000, 'Frais'),
                ),
              ),
              const SizedBox(width: RiiSpace.md),
              Expanded(
                child: field(
                  _min,
                  'Commande minimum',
                  number: true,
                  suffix: 'FCFA',
                  validator: (v) => range(v, 0, 1000000, 'Minimum'),
                ),
              ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: field(
                  _prepMin,
                  'Préparation min.',
                  number: true,
                  suffix: 'min',
                  validator: (v) => range(v, 1, 240, 'Durée'),
                ),
              ),
              const SizedBox(width: RiiSpace.md),
              Expanded(
                child: field(
                  _prepMax,
                  'Préparation max.',
                  number: true,
                  suffix: 'min',
                  validator: (v) => range(v, 1, 240, 'Durée'),
                ),
              ),
            ],
          ),
          field(_momo, 'Numéro Mobile Money (règlements)'),
          if (_error != null) ...[
            InlineBanner(message: _error!, tone: BannerTone.danger),
            const SizedBox(height: RiiSpace.md),
          ],
          RiiButton(
            label: 'Enregistrer les informations',
            loading: _saving,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}

class _HoursSummary extends StatelessWidget {
  const _HoursSummary({required this.profile});

  final RestaurantProfile profile;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    return RiiCard(
      onTap: () => context.push(Routes.hours),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Horaires d’ouverture', style: t.titleMedium),
              ),
              const Text('Modifier'),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
          const SizedBox(height: RiiSpace.sm),
          for (var d = 1; d <= 7; d++)
            Row(
              children: [
                SizedBox(
                  width: 92,
                  child: Text(_days[d - 1], style: t.bodyMedium),
                ),
                Expanded(
                  child: Text(
                    profile.hours
                        .where((h) => h.dayOfWeek == d)
                        .map((h) => '${h.opensAt}–${h.closesAt}')
                        .join(', ')
                        .ifEmpty('Fermé'),
                    style: t.bodyMedium,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

class _Closures extends ConsumerWidget {
  const _Closures({required this.profile});

  final RestaurantProfile profile;

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final now = DateTime.now();
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
      helpText: 'Fermeture exceptionnelle',
    );
    if (range == null || !context.mounted) return;
    try {
      await ref
          .read(restaurantRepositoryProvider)
          .addClosure(
            profile.id,
            startsAt: range.start,
            endsAt: range.end.add(const Duration(days: 1)),
          );
      ref.invalidate(restaurantProfileProvider);
    } on ApiException catch (e) {
      if (context.mounted) showRiiSnack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.text;
    final f = DateFormat('EEE d MMM', 'fr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Fermetures exceptionnelles', style: t.titleMedium),
        const SizedBox(height: RiiSpace.sm),
        if (profile.closures.isEmpty)
          Text('Aucune fermeture prévue.', style: t.bodySmall),
        for (final c in profile.closures)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event_busy_outlined),
            title: Text(
              'Du ${f.format(c.startsAt)} au ${f.format(c.endsAt)}',
              style: t.bodyMedium,
            ),
            subtitle: c.reason == null ? null : Text(c.reason!),
            trailing: IconButton(
              tooltip: 'Supprimer',
              icon: const Icon(Icons.delete_outline_rounded),
              onPressed: () async {
                try {
                  await ref
                      .read(restaurantRepositoryProvider)
                      .removeClosure(profile.id, c.id);
                } on ApiException catch (e) {
                  if (context.mounted) showRiiSnack(context, e.message);
                }
                ref.invalidate(restaurantProfileProvider);
              },
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => _add(context, ref),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Ajouter une fermeture'),
          ),
        ),
      ],
    );
  }
}
