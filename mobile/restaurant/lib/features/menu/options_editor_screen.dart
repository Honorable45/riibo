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

import '../shared/models.dart';
import '../shared/providers.dart';
import '../shared/repository.dart';

/// Brouillon modifiable d'un groupe d'options.
class _GroupDraft {
  _GroupDraft(MenuOptionGroup? g)
    : name = TextEditingController(text: g?.name),
      minSelect = g?.minSelect ?? 0,
      maxSelect = g?.maxSelect ?? 1,
      options = [
        for (final o in g?.options ?? const <MenuOption>[]) _OptionDraft(o),
      ];

  final TextEditingController name;
  int minSelect;
  int maxSelect;
  final List<_OptionDraft> options;

  void dispose() {
    name.dispose();
    for (final o in options) {
      o.dispose();
    }
  }

  MenuOptionGroup toGroup() => MenuOptionGroup(
    name: name.text.trim(),
    minSelect: minSelect,
    maxSelect: maxSelect,
    options: [for (final o in options) o.toOption()],
  );
}

class _OptionDraft {
  _OptionDraft(MenuOption? o)
    : name = TextEditingController(text: o?.name),
      price = TextEditingController(
        text: o == null || o.priceDelta == 0 ? '' : '${o.priceDelta}',
      ),
      available = o?.isAvailable ?? true;

  final TextEditingController name;
  final TextEditingController price;
  bool available;

  void dispose() {
    name.dispose();
    price.dispose();
  }

  MenuOption toOption() => MenuOption(
    name: name.text.trim(),
    priceDelta: int.tryParse(price.text.trim()) ?? 0,
    isAvailable: available,
  );
}

/// Options et suppléments d'un plat. L'enregistrement REMPLACE tous les
/// groupes (règle du serveur) ; les commandes passées gardent leurs choix.
class OptionsEditorScreen extends ConsumerStatefulWidget {
  const OptionsEditorScreen({super.key, required this.itemId});

  final String itemId;

  @override
  ConsumerState<OptionsEditorScreen> createState() =>
      _OptionsEditorScreenState();
}

class _OptionsEditorScreenState extends ConsumerState<OptionsEditorScreen> {
  List<_GroupDraft>? _groups;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final g in _groups ?? const <_GroupDraft>[]) {
      g.dispose();
    }
    super.dispose();
  }

  String? _validate() {
    for (final g in _groups!) {
      if (g.name.text.trim().isEmpty) return 'Chaque groupe doit avoir un nom.';
      if (g.options.isEmpty) {
        return 'Le groupe « ${g.name.text.trim()} » n’a aucun choix.';
      }
      if (g.options.any((o) => o.name.text.trim().isEmpty)) {
        return 'Chaque choix doit avoir un nom.';
      }
      if (g.maxSelect < 1 || g.minSelect > g.maxSelect) {
        return '« ${g.name.text.trim()} » : minimum et maximum incohérents.';
      }
      if (g.minSelect > g.options.length) {
        return '« ${g.name.text.trim()} » : minimum supérieur au nombre de choix.';
      }
    }
    return null;
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    final problem = _validate();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    final r = ref.read(currentRestaurantProvider);
    if (r == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(restaurantRepositoryProvider).setOptionGroups(
        r.id,
        widget.itemId,
        [for (final g in _groups!) g.toGroup()],
      );
      ref.invalidate(ownerMenuProvider);
      if (mounted) {
        showRiiSnack(context, 'Options enregistrées');
        context.pop();
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(ownerMenuProvider).value;
    MenuItem? item;
    for (final s in menu?.sections ?? const <MenuSection>[]) {
      for (final i in s.items) {
        if (i.id == widget.itemId) item = i;
      }
    }
    if (item != null) {
      _groups ??= [for (final g in item.optionGroups) _GroupDraft(g)];
    }
    final t = context.text;
    final p = context.palette;
    return Scaffold(
      appBar: AppBar(
        title: Text(item == null ? 'Options' : 'Options · ${item.name}'),
      ),
      body: _groups == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.all(RiiSpace.gutter),
              children: [
                Text(
                  'Ex. « Accompagnement » (1 choix obligatoire) ou « Suppléments » (jusqu’à 2, payants).',
                  style: t.bodyMedium!.copyWith(color: p.muted),
                ),
                const SizedBox(height: RiiSpace.md),
                for (final (gi, g) in _groups!.indexed) ...[
                  RiiCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: g.name,
                                maxLength: 60,
                                decoration: const InputDecoration(
                                  labelText: 'Nom du groupe',
                                  counterText: '',
                                ),
                              ),
                            ),
                            IconButton(
                              tooltip: 'Supprimer le groupe',
                              onPressed: () => setState(
                                () => _groups!.removeAt(gi).dispose(),
                              ),
                              icon: const Icon(Icons.delete_outline_rounded),
                            ),
                          ],
                        ),
                        const SizedBox(height: RiiSpace.sm),
                        Row(
                          children: [
                            Expanded(
                              child: _Stepper(
                                label: 'Minimum',
                                value: g.minSelect,
                                min: 0,
                                max: 20,
                                onChanged: (v) =>
                                    setState(() => g.minSelect = v),
                              ),
                            ),
                            Expanded(
                              child: _Stepper(
                                label: 'Maximum',
                                value: g.maxSelect,
                                min: 1,
                                max: 20,
                                onChanged: (v) =>
                                    setState(() => g.maxSelect = v),
                              ),
                            ),
                          ],
                        ),
                        Text(
                          g.minSelect == 0
                              ? 'Facultatif'
                              : 'Obligatoire : au moins ${g.minSelect} choix',
                          style: t.bodySmall,
                        ),
                        const Divider(height: RiiSpace.xl),
                        for (final (oi, o) in g.options.indexed)
                          Padding(
                            padding: const EdgeInsets.only(bottom: RiiSpace.sm),
                            child: Row(
                              children: [
                                Expanded(
                                  flex: 3,
                                  child: TextField(
                                    controller: o.name,
                                    maxLength: 60,
                                    decoration: const InputDecoration(
                                      labelText: 'Choix',
                                      counterText: '',
                                      isDense: true,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: RiiSpace.sm),
                                Expanded(
                                  flex: 2,
                                  child: TextField(
                                    controller: o.price,
                                    keyboardType: TextInputType.number,
                                    inputFormatters: [
                                      FilteringTextInputFormatter.digitsOnly,
                                    ],
                                    decoration: const InputDecoration(
                                      labelText: '+ prix',
                                      suffixText: 'F',
                                      isDense: true,
                                    ),
                                  ),
                                ),
                                Checkbox(
                                  value: o.available,
                                  onChanged: (v) =>
                                      setState(() => o.available = v ?? true),
                                  semanticLabel: 'Disponible',
                                ),
                                IconButton(
                                  tooltip: 'Retirer',
                                  onPressed: () => setState(
                                    () => g.options.removeAt(oi).dispose(),
                                  ),
                                  icon: const Icon(Icons.close_rounded),
                                ),
                              ],
                            ),
                          ),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: g.options.length >= 30
                                ? null
                                : () => setState(
                                    () => g.options.add(_OptionDraft(null)),
                                  ),
                            icon: const Icon(Icons.add_rounded),
                            label: const Text('Ajouter un choix'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: RiiSpace.md),
                ],
                RiiButton(
                  label: 'Ajouter un groupe d’options',
                  icon: Icons.add_rounded,
                  variant: RiiButtonVariant.secondary,
                  onPressed: _groups!.length >= 10
                      ? null
                      : () => setState(() => _groups!.add(_GroupDraft(null))),
                ),
                const SizedBox(height: RiiSpace.md),
                const InlineBanner(
                  message:
                      'Enregistrer remplace toutes les options du plat. Les paniers en cours avec d’anciennes options devront être mis à jour par les clients.',
                ),
                if (_error != null) ...[
                  const SizedBox(height: RiiSpace.md),
                  InlineBanner(message: _error!, tone: BannerTone.danger),
                ],
              ],
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RiiSpace.gutter),
          child: RiiButton(
            label: 'Enregistrer les options',
            loading: _saving,
            onPressed: _groups == null ? null : _save,
          ),
        ),
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final String label;
  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Text('$label ', style: context.text.bodyMedium),
      QuantityStepper(
        value: value,
        min: min,
        max: max,
        dense: true,
        onChanged: onChanged,
      ),
    ],
  );
}
