import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../location/delivery_location.dart';
import 'address_models.dart';
import 'address_repository.dart';

/// Création ou modification d'une adresse. Se ferme avec l'adresse
/// enregistrée par le serveur.
class AddressFormScreen extends ConsumerStatefulWidget {
  const AddressFormScreen({super.key, this.existing});

  final Address? existing;

  @override
  ConsumerState<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends ConsumerState<AddressFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _fullAddress = TextEditingController(
    text: widget.existing?.fullAddress,
  );
  late final _quarter = TextEditingController(text: widget.existing?.quarter);
  late final _landmark = TextEditingController(text: widget.existing?.landmark);
  late final _customLabel = TextEditingController(
    text: widget.existing?.customLabel,
  );
  late AddressLabel _label = widget.existing?.label ?? AddressLabel.maison;
  late bool _isDefault = widget.existing?.isDefault ?? false;
  late double? _latitude = widget.existing?.latitude;
  late double? _longitude = widget.existing?.longitude;

  bool _saving = false;
  bool _locating = false;
  String? _error;
  LocateFailed? _locateFailure;

  @override
  void dispose() {
    _fullAddress.dispose();
    _quarter.dispose();
    _landmark.dispose();
    _customLabel.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    setState(() {
      _locating = true;
      _locateFailure = null;
    });
    final result = await ref.read(locationServiceProvider).current();
    if (!mounted) return;
    setState(() {
      _locating = false;
      switch (result) {
        case Located(:final latitude, :final longitude):
          _latitude = latitude;
          _longitude = longitude;
        case final LocateFailed failure:
          _locateFailure = failure;
      }
    });
  }

  Future<void> _save() async {
    // Le clavier ne doit pas rester ouvert sur l'écran suivant.
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final input = AddressInput(
      label: _label,
      customLabel: _customLabel.text,
      fullAddress: _fullAddress.text,
      quarter: _quarter.text,
      landmark: _landmark.text,
      latitude: _latitude,
      longitude: _longitude,
      isDefault: _isDefault,
    );
    final controller = ref.read(addressesProvider.notifier);
    try {
      final saved = widget.existing == null
          ? await controller.create(input)
          : await controller.save(widget.existing!.id, input);
      if (mounted) context.pop(saved);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final hasPosition = _latitude != null && _longitude != null;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.existing == null ? 'Nouvelle adresse' : 'Modifier l’adresse',
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.all(RiiSpace.gutter),
          children: [
            SegmentedButton<AddressLabel>(
              showSelectedIcon: false,
              segments: [
                for (final label in AddressLabel.values)
                  ButtonSegment(value: label, label: Text(label.display)),
              ],
              selected: {_label},
              onSelectionChanged: _saving
                  ? null
                  : (value) => setState(() => _label = value.first),
            ),
            if (_label == AddressLabel.autre) ...[
              const SizedBox(height: RiiSpace.md),
              TextFormField(
                controller: _customLabel,
                enabled: !_saving,
                textCapitalization: TextCapitalization.sentences,
                inputFormatters: [LengthLimitingTextInputFormatter(40)],
                decoration: const InputDecoration(
                  labelText: 'Nom de l’adresse',
                  hintText: 'Ex. Chez ma tante',
                ),
              ),
            ],
            const SizedBox(height: RiiSpace.lg),
            TextFormField(
              controller: _fullAddress,
              enabled: !_saving,
              textCapitalization: TextCapitalization.sentences,
              inputFormatters: [LengthLimitingTextInputFormatter(255)],
              maxLines: 2,
              minLines: 1,
              validator: (value) => (value?.trim().length ?? 0) < 2
                  ? 'Indiquez l’adresse (rue, maison…).'
                  : null,
              decoration: const InputDecoration(
                labelText: 'Adresse',
                hintText: 'Ex. Rue du marché, maison bleue',
              ),
            ),
            const SizedBox(height: RiiSpace.md),
            TextFormField(
              controller: _quarter,
              enabled: !_saving,
              textCapitalization: TextCapitalization.words,
              inputFormatters: [LengthLimitingTextInputFormatter(80)],
              decoration: const InputDecoration(
                labelText: 'Quartier',
                hintText: 'Ex. Agoè, Bè, Tokoin',
              ),
            ),
            const SizedBox(height: RiiSpace.md),
            TextFormField(
              controller: _landmark,
              enabled: !_saving,
              textCapitalization: TextCapitalization.sentences,
              inputFormatters: [LengthLimitingTextInputFormatter(200)],
              maxLines: 2,
              minLines: 1,
              decoration: const InputDecoration(
                labelText: 'Repère pour le livreur',
                hintText: 'Ex. Portail bleu, face à la pharmacie',
                helperText: 'Un repère précis aide beaucoup le livreur.',
              ),
            ),
            const SizedBox(height: RiiSpace.lg),
            RiiCard(
              padding: const EdgeInsets.all(RiiSpace.md),
              child: Row(
                children: [
                  Icon(
                    hasPosition
                        ? Icons.my_location_rounded
                        : Icons.location_searching_rounded,
                    color: hasPosition ? p.success : p.muted,
                  ),
                  const SizedBox(width: RiiSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          hasPosition
                              ? 'Position GPS enregistrée'
                              : 'Position GPS (facultative)',
                          style: t.titleSmall,
                        ),
                        Text(
                          hasPosition
                              ? 'Le livreur pourra vous retrouver plus facilement.'
                              : 'À ajouter si vous êtes à cette adresse maintenant.',
                          style: t.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  if (hasPosition)
                    TextButton(
                      onPressed: _saving
                          ? null
                          : () => setState(() {
                              _latitude = null;
                              _longitude = null;
                            }),
                      child: const Text('Retirer'),
                    )
                  else
                    TextButton(
                      onPressed: _saving || _locating ? null : _locate,
                      child: _locating
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Ajouter'),
                    ),
                ],
              ),
            ),
            if (_locateFailure != null) ...[
              const SizedBox(height: RiiSpace.sm),
              InlineBanner(
                message: _locateFailure!.message,
                tone: BannerTone.warning,
                action: _locateFailure!.canOpenSettings
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
            const SizedBox(height: RiiSpace.sm),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _isDefault || (widget.existing?.isDefault ?? false),
              onChanged: _saving || (widget.existing?.isDefault ?? false)
                  ? null
                  : (value) => setState(() => _isDefault = value),
              title: Text('Adresse principale', style: t.titleSmall),
              subtitle: Text(
                'Proposée en premier à la commande.',
                style: t.bodySmall,
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: RiiSpace.sm),
              InlineBanner(message: _error!, tone: BannerTone.danger),
            ],
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RiiSpace.gutter),
          child: RiiButton(
            label: 'Enregistrer',
            loading: _saving,
            onPressed: _save,
          ),
        ),
      ),
    );
  }
}
