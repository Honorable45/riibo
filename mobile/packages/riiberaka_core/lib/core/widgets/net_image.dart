import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../app/config/env.dart';
import '../../app/theme/app_theme.dart';

/// Image distante (photos de plats, logos) : mise en cache disque, décodée à
/// la taille affichée (pas une photo de 2000 px en mémoire pour une vignette),
/// et un repli sobre quand il n'y a pas de photo — jamais une image inventée.
class NetImage extends StatelessWidget {
  const NetImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.fallbackIcon = Icons.restaurant_rounded,
    this.borderRadius,
    this.semanticLabel,
  });

  final String? url;
  final BoxFit fit;
  final IconData fallbackIcon;
  final BorderRadius? borderRadius;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final fallback = ColoredBox(
      color: palette.skeleton,
      child: Center(child: Icon(fallbackIcon, color: palette.subtle, size: 28)),
    );

    Widget child;
    final source = Env.mediaUrl(url);
    if (source == null || source.isEmpty) {
      child = fallback;
    } else {
      child = LayoutBuilder(
        builder: (context, constraints) {
          final ratio = MediaQuery.devicePixelRatioOf(context);
          final width = constraints.maxWidth.isFinite
              ? (constraints.maxWidth * ratio).round()
              : null;
          return CachedNetworkImage(
            imageUrl: source,
            fit: fit,
            memCacheWidth: width,
            fadeInDuration: const Duration(milliseconds: 180),
            placeholder: (_, _) => ColoredBox(color: palette.skeleton),
            errorWidget: (_, _, _) => fallback,
          );
        },
      );
    }

    if (semanticLabel != null) {
      child = Semantics(image: true, label: semanticLabel, child: child);
    } else {
      child = ExcludeSemantics(child: child);
    }
    if (borderRadius != null) {
      child = ClipRRect(borderRadius: borderRadius!, child: child);
    }
    return child;
  }
}
