import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'delivery_location.dart';

Future<void> showLocationSheet(BuildContext context) =>
    showRiiSheet<void>(context, builder: (_) => const LocationSheet());

/// Choix du lieu de livraison pour parcourir le catalogue.
class LocationSheet extends ConsumerStatefulWidget {
  const LocationSheet({super.key});

  @override
  ConsumerState<LocationSheet> createState() => _LocationSheetState();
}

class _LocationSheetState extends ConsumerState<LocationSheet> {
  final _quarter = TextEditingController();
  bool _locating = false;
  LocateFailed? _failure;

  @override
  void dispose() {
    _quarter.dispose();
    super.dispose();
  }

  Future<void> _useDevicePosition() async {
    setState(() {
      _locating = true;
      _failure = null;
    });
    final result = await ref.read(locationServiceProvider).current();
    if (!mounted) return;
    switch (result) {
      case Located(:final latitude, :final longitude):
        await ref
            .read(deliveryLocationProvider.notifier)
            .set(
              DeliveryLocation(
                label: 'Ma position',
                latitude: latitude,
                longitude: longitude,
              ),
            );
        if (mounted) Navigator.of(context).pop();
      case final LocateFailed failure:
        setState(() {
          _locating = false;
          _failure = failure;
        });
    }
  }

  Future<void> _saveQuarter() async {
    final text = _quarter.text.trim();
    if (text.length < 2) return;
    await ref
        .read(deliveryLocationProvider.notifier)
        .set(DeliveryLocation(label: text));
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final current = ref.watch(deliveryLocationProvider).value;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        0,
        RiiSpace.gutter,
        RiiSpace.xxl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Où livrer ?', style: t.titleLarge),
          const SizedBox(height: RiiSpace.xs),
          Text(
            'Votre position permet de voir les restaurants les plus proches. '
            'Elle reste facultative.',
            style: t.bodyMedium!.copyWith(color: p.muted),
          ),
          const SizedBox(height: RiiSpace.xl),
          RiiButton(
            label: 'Utiliser ma position',
            icon: Icons.my_location_rounded,
            loading: _locating,
            onPressed: _useDevicePosition,
          ),
          if (_failure != null) ...[
            const SizedBox(height: RiiSpace.md),
            InlineBanner(
              message: _failure!.message,
              tone: BannerTone.warning,
              icon: Icons.location_off_outlined,
              action: _failure!.canOpenSettings
                  ? TextButton(
                      onPressed: () =>
                          ref.read(locationServiceProvider).openSettings(),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(0, 36),
                      ),
                      child: const Text('Ouvrir les réglages'),
                    )
                  : null,
            ),
          ],
          const SizedBox(height: RiiSpace.xl),
          Row(
            children: [
              Expanded(child: Divider(color: p.line)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: RiiSpace.md),
                child: Text('ou', style: t.bodySmall),
              ),
              Expanded(child: Divider(color: p.line)),
            ],
          ),
          const SizedBox(height: RiiSpace.xl),
          TextField(
            controller: _quarter,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _saveQuarter(),
            decoration: const InputDecoration(
              labelText: 'Quartier ou ville',
              hintText: 'Ex. Agoè, Tokoin, Kara',
              prefixIcon: Icon(Icons.place_outlined),
            ),
          ),
          const SizedBox(height: RiiSpace.sm),
          Text(
            'Sans position, tous les restaurants sont affichés, sans distance.',
            style: t.bodySmall,
          ),
          const SizedBox(height: RiiSpace.md),
          ListenableBuilder(
            listenable: _quarter,
            builder: (context, _) => RiiButton(
              label: 'Valider ce quartier',
              variant: RiiButtonVariant.secondary,
              onPressed: _quarter.text.trim().length >= 2 ? _saveQuarter : null,
            ),
          ),
          if (current != null) ...[
            const SizedBox(height: RiiSpace.sm),
            RiiButton(
              label: 'Ne plus utiliser « ${current.label} »',
              variant: RiiButtonVariant.ghost,
              onPressed: () async {
                await ref.read(deliveryLocationProvider.notifier).set(null);
                if (context.mounted) Navigator.of(context).pop();
              },
            ),
          ],
        ],
      ),
    );
  }
}
