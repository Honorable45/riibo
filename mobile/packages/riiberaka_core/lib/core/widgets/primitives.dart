import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme/app_theme.dart';
import '../../app/theme/tokens.dart';

/// Titre de section avec action optionnelle à droite (« Tout voir »).
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.actionLabel,
    this.onAction,
    this.padding = const EdgeInsets.fromLTRB(
      RiiSpace.gutter,
      RiiSpace.xl,
      RiiSpace.sm,
      RiiSpace.sm,
    ),
  });

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(title, style: context.text.titleLarge),
            ),
          ),
          if (actionLabel != null && onAction != null)
            TextButton(onPressed: onAction, child: Text(actionLabel!)),
        ],
      ),
    );
  }
}

enum TagTone { neutral, brand, success, warning, danger }

/// Petite étiquette (« Fermé », « En préparation », « -10 % »).
class Tag extends StatelessWidget {
  const Tag({
    super.key,
    required this.label,
    this.tone = TagTone.neutral,
    this.icon,
    this.solid = false,
  });

  final String label;
  final TagTone tone;
  final IconData? icon;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final (Color soft, Color strong) = switch (tone) {
      TagTone.neutral => (p.canvas, p.inkSoft),
      TagTone.brand => (p.brandSoft, p.brand),
      TagTone.success => (p.successSoft, p.success),
      TagTone.warning => (p.warningSoft, p.warning),
      TagTone.danger => (p.dangerSoft, p.danger),
    };
    final fg = solid ? Colors.white : strong;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: solid ? strong : soft,
        borderRadius: RiiRadius.pillAll,
        border: tone == TagTone.neutral && !solid
            ? Border.all(color: p.line)
            : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: fg),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.text.labelSmall!.copyWith(
                color: fg,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Note moyenne (« ★ 4,6 (128) »). Rien n'est affiché sans avis : pas de
/// fausse note à 0.
class RatingLabel extends StatelessWidget {
  const RatingLabel({
    super.key,
    required this.rating,
    required this.count,
    this.compact = false,
  });

  final double rating;
  final int count;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    final p = context.palette;
    final value = rating.toStringAsFixed(1).replaceAll('.', ',');
    return Semantics(
      label: 'Note $value sur 5, $count avis',
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.star_rounded, size: 16, color: p.rating),
            const SizedBox(width: 2),
            Text(
              value,
              style: context.text.labelMedium!.copyWith(color: p.ink),
            ),
            if (!compact) ...[
              const SizedBox(width: 3),
              Text('($count)', style: context.text.bodySmall),
            ],
          ],
        ),
      ),
    );
  }
}

/// Point séparateur discret entre deux informations sur une ligne.
class DotSeparator extends StatelessWidget {
  const DotSeparator({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 6),
    child: Text('·', style: context.text.bodySmall),
  );
}

/// Sélecteur de quantité − n +.
class QuantityStepper extends StatelessWidget {
  const QuantityStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 1,
    this.max = 50,
    this.enabled = true,
    this.dense = false,
    this.onRemove,
  });

  final int value;
  final ValueChanged<int> onChanged;

  /// Si fourni, le bouton « − » devient « supprimer » à la quantité minimale.
  final VoidCallback? onRemove;
  final int min;
  final int max;
  final bool enabled;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final size = dense ? 32.0 : 40.0;
    Widget button(IconData icon, String tip, VoidCallback? action) {
      final active = enabled && action != null;
      return Tooltip(
        message: tip,
        child: InkResponse(
          onTap: active
              ? () {
                  HapticFeedback.selectionClick();
                  action();
                }
              : null,
          radius: size / 2 + 4,
          child: SizedBox.square(
            dimension: size,
            child: Icon(
              icon,
              size: dense ? 18 : 20,
              color: active ? p.ink : p.subtle,
            ),
          ),
        ),
      );
    }

    return Semantics(
      label: 'Quantité',
      value: '$value',
      child: Container(
        decoration: BoxDecoration(
          color: p.surface,
          borderRadius: RiiRadius.pillAll,
          border: Border.all(color: p.line),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (value <= min && onRemove != null)
              button(Icons.delete_outline_rounded, 'Retirer', onRemove)
            else
              button(
                Icons.remove_rounded,
                'Diminuer',
                value > min ? () => onChanged(value - 1) : null,
              ),
            ConstrainedBox(
              constraints: BoxConstraints(minWidth: dense ? 20 : 28),
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: context.text.titleSmall,
              ),
            ),
            button(
              Icons.add_rounded,
              'Augmenter',
              value < max ? () => onChanged(value + 1) : null,
            ),
          ],
        ),
      ),
    );
  }
}

/// Carte posée sur le fond : bordure fine, pas d'ombre.
class RiiCard extends StatelessWidget {
  const RiiCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(RiiSpace.lg),
    this.radius = RiiRadius.md,
    this.color,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: color ?? p.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
        side: BorderSide(color: p.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// Feuille inférieure standard (poignée, coins arrondis, respect du clavier).
Future<T?> showRiiSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  bool scrollable = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: scrollable,
    useSafeArea: true,
    builder: (context) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: builder(context),
    ),
  );
}

/// Boîte de confirmation (action destructive ou engageante).
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String cancelLabel = 'Annuler',
  bool destructive = false,
}) async {
  final p = context.palette;
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(cancelLabel, style: TextStyle(color: p.inkSoft)),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(
            confirmLabel,
            style: TextStyle(color: destructive ? p.danger : p.brand),
          ),
        ),
      ],
    ),
  );
  return result ?? false;
}
