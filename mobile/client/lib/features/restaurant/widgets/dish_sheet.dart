import 'package:flutter/material.dart';

import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/net_image.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../dish_selection.dart';
import '../restaurant_models.dart';

/// Ajout au panier : renvoie `true` si le serveur a accepté.
typedef AddDishCallback = Future<bool> Function(DishSelection selection);

Future<void> showDishSheet(
  BuildContext context, {
  required MenuItem item,
  required bool restaurantOpen,
  required AddDishCallback onAdd,
  DishSelection? initial,
  String actionLabel = 'Ajouter',
}) {
  return showRiiSheet<void>(
    context,
    builder: (_) => DishSheet(
      item: item,
      restaurantOpen: restaurantOpen,
      onAdd: onAdd,
      initial: initial,
      actionLabel: actionLabel,
    ),
  );
}

class DishSheet extends StatefulWidget {
  const DishSheet({
    super.key,
    required this.item,
    required this.restaurantOpen,
    required this.onAdd,
    this.initial,
    this.actionLabel = 'Ajouter',
  });

  final MenuItem item;
  final bool restaurantOpen;
  final AddDishCallback onAdd;
  final DishSelection? initial;
  final String actionLabel;

  @override
  State<DishSheet> createState() => _DishSheetState();
}

class _DishSheetState extends State<DishSheet> {
  late DishSelection _selection = widget.initial ?? DishSelection(widget.item);
  late final _note = TextEditingController(text: _selection.note);
  bool _submitting = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    FocusScope.of(context).unfocus();
    setState(() => _submitting = true);
    final ok = await widget.onAdd(_selection.withNote(_note.text.trim()));
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final t = context.text;
    final p = context.palette;
    final problem = _selection.problem;
    final blocked = !widget.restaurantOpen || !item.isAvailable;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: item.optionGroups.isEmpty ? 0.62 : 0.86,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, scroll) => Column(
        children: [
          Expanded(
            child: ListView(
              controller: scroll,
              padding: EdgeInsets.zero,
              children: [
                if (item.imageUrl != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: RiiSpace.gutter,
                    ),
                    child: AspectRatio(
                      aspectRatio: 16 / 10,
                      child: NetImage(
                        url: item.imageUrl,
                        borderRadius: RiiRadius.mdAll,
                        semanticLabel: item.name,
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    RiiSpace.gutter,
                    RiiSpace.lg,
                    RiiSpace.gutter,
                    0,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.name, style: t.headlineSmall),
                      const SizedBox(height: RiiSpace.xs),
                      Text(formatXof(item.price), style: t.titleMedium),
                      if (item.description != null &&
                          item.description!.isNotEmpty) ...[
                        const SizedBox(height: RiiSpace.sm),
                        Text(
                          item.description!,
                          style: t.bodyMedium!.copyWith(color: p.inkSoft),
                        ),
                      ],
                      if (blocked) ...[
                        const SizedBox(height: RiiSpace.md),
                        InlineBanner(
                          tone: BannerTone.warning,
                          message: !item.isAvailable
                              ? 'Ce plat n’est pas disponible pour le moment.'
                              : 'Le restaurant est fermé : vous pourrez commander à sa réouverture.',
                        ),
                      ],
                    ],
                  ),
                ),
                for (final group in item.optionGroups)
                  _OptionGroupSection(
                    group: group,
                    selection: _selection,
                    enabled: !blocked && !_submitting,
                    onToggle: (option) => setState(
                      () => _selection = _selection.toggle(group, option),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    RiiSpace.gutter,
                    RiiSpace.xl,
                    RiiSpace.gutter,
                    RiiSpace.lg,
                  ),
                  child: TextField(
                    controller: _note,
                    enabled: !blocked && !_submitting,
                    maxLength: 200,
                    maxLines: 2,
                    minLines: 1,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'Une précision pour le restaurant ?',
                      hintText: 'Ex. sans piment, bien cuit',
                    ),
                  ),
                ),
              ],
            ),
          ),
          _AddBar(
            selection: _selection,
            problem: blocked ? null : problem,
            enabled: !blocked && problem == null,
            submitting: _submitting,
            label: widget.actionLabel,
            onQuantity: (q) =>
                setState(() => _selection = _selection.withQuantity(q)),
            onSubmit: _submit,
          ),
        ],
      ),
    );
  }
}

class _OptionGroupSection extends StatelessWidget {
  const _OptionGroupSection({
    required this.group,
    required this.selection,
    required this.enabled,
    required this.onToggle,
  });

  final OptionGroup group;
  final DishSelection selection;
  final bool enabled;
  final ValueChanged<MenuOption> onToggle;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final count = selection.selectedCount(group);
    final satisfied = count >= group.minSelect;
    return Padding(
      padding: const EdgeInsets.only(top: RiiSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            color: p.canvas,
            padding: const EdgeInsets.symmetric(
              horizontal: RiiSpace.gutter,
              vertical: RiiSpace.sm + 2,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(group.name, style: t.titleSmall),
                      Text(group.ruleLabel, style: t.bodySmall),
                    ],
                  ),
                ),
                if (group.isRequired)
                  Tag(
                    label: satisfied ? 'Choisi' : 'Requis',
                    tone: satisfied ? TagTone.success : TagTone.neutral,
                    icon: satisfied ? Icons.check_rounded : null,
                  ),
              ],
            ),
          ),
          for (final option in group.options)
            _OptionTile(
              option: option,
              single: group.isSingleChoice,
              selected: selection.optionIds.contains(option.id),
              enabled:
                  enabled &&
                  option.isAvailable &&
                  (selection.optionIds.contains(option.id) ||
                      selection.canAddMore(group)),
              onTap: () => onToggle(option),
            ),
        ],
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({
    required this.option,
    required this.single,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final MenuOption option;
  final bool single;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final color = enabled ? p.ink : p.subtle;
    final control = single
        ? Icon(
            selected
                ? Icons.radio_button_checked_rounded
                : Icons.radio_button_off_rounded,
            color: selected ? p.brand : (enabled ? p.muted : p.line),
          )
        : Icon(
            selected
                ? Icons.check_box_rounded
                : Icons.check_box_outline_blank_rounded,
            color: selected ? p.brand : (enabled ? p.muted : p.line),
          );
    return Semantics(
      checked: selected,
      inMutuallyExclusiveGroup: single,
      enabled: enabled,
      label: option.name,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: RiiSizes.tapTarget + 4),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            child: ExcludeSemantics(
              child: Row(
                children: [
                  control,
                  const SizedBox(width: RiiSpace.md),
                  Expanded(
                    child: Text(
                      option.name,
                      style: t.bodyLarge!.copyWith(color: color),
                    ),
                  ),
                  if (!option.isAvailable)
                    Text('Épuisé', style: t.bodySmall)
                  else if (option.priceDelta != 0)
                    Text(
                      '${option.priceDelta > 0 ? '+' : ''}${formatXof(option.priceDelta)}',
                      style: t.labelMedium!.copyWith(color: p.inkSoft),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AddBar extends StatelessWidget {
  const _AddBar({
    required this.selection,
    required this.problem,
    required this.enabled,
    required this.submitting,
    required this.label,
    required this.onQuantity,
    required this.onSubmit,
  });

  final DishSelection selection;
  final String? problem;
  final bool enabled;
  final bool submitting;
  final String label;
  final ValueChanged<int> onQuantity;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: p.surface,
        border: Border(top: BorderSide(color: p.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            RiiSpace.gutter,
            RiiSpace.md,
            RiiSpace.gutter,
            RiiSpace.md,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (problem != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: RiiSpace.sm),
                  child: Text(
                    problem!,
                    textAlign: TextAlign.center,
                    style: context.text.bodySmall!.copyWith(color: p.inkSoft),
                  ),
                ),
              Row(
                children: [
                  QuantityStepper(
                    value: selection.quantity,
                    max: selection.maxQuantity,
                    enabled: !submitting && selection.item.isAvailable,
                    onChanged: onQuantity,
                  ),
                  const SizedBox(width: RiiSpace.md),
                  Expanded(
                    child: RiiButton(
                      label: label,
                      loading: submitting,
                      onPressed: enabled ? onSubmit : null,
                      trailing: Text(formatXof(selection.total)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
