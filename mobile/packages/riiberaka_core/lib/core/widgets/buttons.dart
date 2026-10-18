import 'package:flutter/material.dart';

import '../../app/theme/app_theme.dart';
import '../../app/theme/tokens.dart';

enum RiiButtonVariant { primary, secondary, ghost, danger }

/// Bouton unique de l'application. `loading` désactive le bouton : un appui
/// répété pendant une requête ne peut jamais la renvoyer une seconde fois.
class RiiButton extends StatelessWidget {
  const RiiButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = RiiButtonVariant.primary,
    this.icon,
    this.loading = false,
    this.expand = true,
    this.small = false,
    this.trailing,
  });

  final String label;
  final VoidCallback? onPressed;
  final RiiButtonVariant variant;
  final IconData? icon;
  final bool loading;
  final bool expand;
  final bool small;

  /// Contenu aligné à droite (ex. total dans « Commander · 4 500 F »).
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final height = small ? RiiSizes.buttonHeightSmall : RiiSizes.buttonHeight;
    final enabled = onPressed != null && !loading;

    final (Color bg, Color fg, BorderSide? side) = switch (variant) {
      RiiButtonVariant.primary => (
        palette.brand,
        Theme.of(context).colorScheme.onPrimary,
        null,
      ),
      RiiButtonVariant.secondary => (
        palette.surface,
        palette.ink,
        BorderSide(color: palette.line, width: 1.2),
      ),
      RiiButtonVariant.ghost => (Colors.transparent, palette.brand, null),
      RiiButtonVariant.danger => (palette.dangerSoft, palette.danger, null),
    };

    final textStyle =
        (small ? context.text.labelMedium : context.text.labelLarge)!.copyWith(
          color: enabled ? fg : palette.subtle,
          fontWeight: FontWeight.w700,
        );

    final content = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: trailing == null
          ? MainAxisAlignment.center
          : MainAxisAlignment.spaceBetween,
      children: [
        Flexible(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading)
                SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.2,
                    color: variant == RiiButtonVariant.primary
                        ? fg
                        : palette.brand,
                  ),
                )
              else if (icon != null)
                Icon(icon, size: small ? 18 : 20, color: textStyle.color),
              if (loading || icon != null) const SizedBox(width: RiiSpace.sm),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textStyle,
                ),
              ),
            ],
          ),
        ),
        if (trailing != null)
          DefaultTextStyle.merge(style: textStyle, child: trailing!),
      ],
    );

    return Semantics(
      button: true,
      enabled: enabled,
      label: loading ? '$label, en cours' : null,
      child: SizedBox(
        height: height,
        width: expand ? double.infinity : null,
        child: Material(
          color: enabled || variant == RiiButtonVariant.ghost
              ? bg
              : (variant == RiiButtonVariant.primary ? palette.line : bg),
          shape: RoundedRectangleBorder(
            borderRadius: RiiRadius.mdAll,
            side: side ?? BorderSide.none,
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: enabled ? onPressed : null,
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: small ? RiiSpace.md : RiiSpace.xl,
              ),
              child: content,
            ),
          ),
        ),
      ),
    );
  }
}

/// Bouton icône rond (retour, favori, fermer) avec cible tactile de 48 px.
class RiiIconButton extends StatelessWidget {
  const RiiIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    required this.tooltip,
    this.color,
    this.background,
    this.size = 40,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String tooltip;
  final Color? color;
  final Color? background;
  final double size;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Tooltip(
      message: tooltip,
      child: SizedBox.square(
        dimension: RiiSizes.tapTarget,
        child: Center(
          child: Material(
            color: background ?? palette.surface,
            shape: const CircleBorder(),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onPressed,
              child: SizedBox.square(
                dimension: size,
                child: Icon(icon, size: 20, color: color ?? palette.ink),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
