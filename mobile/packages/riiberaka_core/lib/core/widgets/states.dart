import 'package:flutter/material.dart';

import '../../app/theme/app_theme.dart';
import '../../app/theme/tokens.dart';
import '../api/api_exception.dart';
import 'buttons.dart';

/// Message lisible pour n'importe quelle erreur (jamais une trace brute).
String describeError(Object error) {
  if (error is ApiException) return error.message;
  return 'Une erreur est survenue. Réessayez.';
}

IconData _errorIcon(Object error) {
  if (error is ApiException) {
    if (error.isNetwork) return Icons.wifi_off_rounded;
    if (error.kind == ApiErrorKind.notFound) return Icons.search_off_rounded;
  }
  return Icons.error_outline_rounded;
}

/// État vide : une icône, une phrase, éventuellement une action.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: RiiSpace.xxl,
          vertical: compact ? RiiSpace.xl : RiiSpace.xxxl,
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: compact ? 48 : 64,
                height: compact ? 48 : 64,
                decoration: BoxDecoration(
                  color: palette.surface,
                  shape: BoxShape.circle,
                  border: Border.all(color: palette.line),
                ),
                child: Icon(
                  icon,
                  size: compact ? 22 : 28,
                  color: palette.muted,
                ),
              ),
              const SizedBox(height: RiiSpace.lg),
              Text(
                title,
                textAlign: TextAlign.center,
                style: context.text.titleMedium,
              ),
              if (message != null) ...[
                const SizedBox(height: RiiSpace.xs + 2),
                Text(
                  message!,
                  textAlign: TextAlign.center,
                  style: context.text.bodyMedium!.copyWith(
                    color: palette.muted,
                  ),
                ),
              ],
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: RiiSpace.xl),
                RiiButton(
                  label: actionLabel!,
                  onPressed: onAction,
                  variant: RiiButtonVariant.secondary,
                  expand: false,
                  small: true,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Erreur de chargement avec « Réessayer ».
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.error,
    required this.onRetry,
    this.compact = false,
  });

  final Object error;
  final VoidCallback onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final isNetwork =
        error is ApiException && (error as ApiException).isNetwork;
    return EmptyState(
      icon: _errorIcon(error),
      title: isNetwork ? 'Pas de connexion' : 'Chargement impossible',
      message: describeError(error),
      actionLabel: 'Réessayer',
      onAction: onRetry,
      compact: compact,
    );
  }
}

enum BannerTone { info, warning, danger, success }

/// Bandeau d'information dans le flux (panier bloqué, restaurant fermé…).
class InlineBanner extends StatelessWidget {
  const InlineBanner({
    super.key,
    required this.message,
    this.tone = BannerTone.info,
    this.title,
    this.icon,
    this.action,
  });

  final String message;
  final String? title;
  final BannerTone tone;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final (Color bg, Color fg, IconData defaultIcon) = switch (tone) {
      BannerTone.info => (p.brandSoft, p.brand, Icons.info_outline_rounded),
      BannerTone.warning => (p.warningSoft, p.warning, Icons.schedule_rounded),
      BannerTone.danger => (
        p.dangerSoft,
        p.danger,
        Icons.error_outline_rounded,
      ),
      BannerTone.success => (
        p.successSoft,
        p.success,
        Icons.check_circle_outline_rounded,
      ),
    };
    return Container(
      padding: const EdgeInsets.all(RiiSpace.md),
      decoration: BoxDecoration(color: bg, borderRadius: RiiRadius.mdAll),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon ?? defaultIcon, size: 20, color: fg),
          const SizedBox(width: RiiSpace.sm + 2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      title!,
                      style: context.text.titleSmall!.copyWith(color: p.ink),
                    ),
                  ),
                Text(
                  message,
                  style: context.text.bodyMedium!.copyWith(color: p.inkSoft),
                ),
                if (action != null) ...[
                  const SizedBox(height: RiiSpace.xs),
                  action!,
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Affiche un message court en bas de l'écran.
void showRiiSnack(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        action: actionLabel != null && onAction != null
            ? SnackBarAction(label: actionLabel, onPressed: onAction)
            : null,
      ),
    );
}
