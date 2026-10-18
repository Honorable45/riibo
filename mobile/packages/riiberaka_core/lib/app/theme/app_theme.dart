import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tokens.dart';

const _fontFamily = 'NunitoSans';

/// Couleurs sémantiques résolues pour le thème courant (clair/sombre).
/// Les widgets lisent `context.palette` plutôt que des constantes, pour que
/// le mode sombre soit cohérent partout.
@immutable
class RiiPalette extends ThemeExtension<RiiPalette> {
  const RiiPalette({
    required this.canvas,
    required this.surface,
    required this.surfaceHigh,
    required this.ink,
    required this.inkSoft,
    required this.muted,
    required this.subtle,
    required this.line,
    required this.brand,
    required this.brandSoft,
    required this.success,
    required this.successSoft,
    required this.warning,
    required this.warningSoft,
    required this.danger,
    required this.dangerSoft,
    required this.rating,
    required this.skeleton,
  });

  final Color canvas;
  final Color surface;
  final Color surfaceHigh;
  final Color ink;
  final Color inkSoft;
  final Color muted;
  final Color subtle;
  final Color line;
  final Color brand;
  final Color brandSoft;
  final Color success;
  final Color successSoft;
  final Color warning;
  final Color warningSoft;
  final Color danger;
  final Color dangerSoft;
  final Color rating;
  final Color skeleton;

  static const light = RiiPalette(
    canvas: RiiColors.canvas,
    surface: RiiColors.surface,
    surfaceHigh: RiiColors.surface,
    ink: RiiColors.ink,
    inkSoft: RiiColors.inkSoft,
    muted: RiiColors.muted,
    subtle: RiiColors.subtle,
    line: RiiColors.line,
    brand: RiiColors.brand,
    brandSoft: RiiColors.brandSoft,
    success: RiiColors.success,
    successSoft: RiiColors.successSoft,
    warning: RiiColors.warning,
    warningSoft: RiiColors.warningSoft,
    danger: RiiColors.danger,
    dangerSoft: RiiColors.dangerSoft,
    rating: RiiColors.rating,
    skeleton: Color(0xFFECEEF2),
  );

  static const dark = RiiPalette(
    canvas: RiiColors.darkCanvas,
    surface: RiiColors.darkSurface,
    surfaceHigh: RiiColors.darkSurfaceHigh,
    ink: RiiColors.darkInk,
    inkSoft: Color(0xFFC9D1DE),
    muted: RiiColors.darkMuted,
    subtle: Color(0xFF6B778D),
    line: RiiColors.darkLine,
    brand: RiiColors.brandOnDark,
    brandSoft: Color(0xFF16284A),
    success: Color(0xFF4CC38A),
    successSoft: Color(0xFF12301F),
    warning: Color(0xFFF5A524),
    warningSoft: Color(0xFF3A2A10),
    danger: Color(0xFFFF6B6B),
    dangerSoft: Color(0xFF3B1719),
    rating: RiiColors.rating,
    skeleton: Color(0xFF1E283B),
  );

  @override
  RiiPalette copyWith() => this;

  @override
  RiiPalette lerp(RiiPalette? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return RiiPalette(
      canvas: l(canvas, other.canvas),
      surface: l(surface, other.surface),
      surfaceHigh: l(surfaceHigh, other.surfaceHigh),
      ink: l(ink, other.ink),
      inkSoft: l(inkSoft, other.inkSoft),
      muted: l(muted, other.muted),
      subtle: l(subtle, other.subtle),
      line: l(line, other.line),
      brand: l(brand, other.brand),
      brandSoft: l(brandSoft, other.brandSoft),
      success: l(success, other.success),
      successSoft: l(successSoft, other.successSoft),
      warning: l(warning, other.warning),
      warningSoft: l(warningSoft, other.warningSoft),
      danger: l(danger, other.danger),
      dangerSoft: l(dangerSoft, other.dangerSoft),
      rating: l(rating, other.rating),
      skeleton: l(skeleton, other.skeleton),
    );
  }
}

extension RiiThemeContext on BuildContext {
  RiiPalette get palette => Theme.of(this).extension<RiiPalette>()!;
  TextTheme get text => Theme.of(this).textTheme;
}

abstract final class AppTheme {
  static ThemeData light() => _build(Brightness.light, RiiPalette.light);
  static ThemeData dark() => _build(Brightness.dark, RiiPalette.dark);

  static TextTheme _textTheme(RiiPalette p) {
    TextStyle s(double size, FontWeight weight, double height, [Color? c]) =>
        TextStyle(
          fontFamily: _fontFamily,
          fontSize: size,
          fontWeight: weight,
          height: height,
          color: c ?? p.ink,
          letterSpacing: 0,
        );
    return TextTheme(
      // Titre d'écran principal (accueil, fiche restaurant).
      headlineMedium: s(26, FontWeight.w800, 1.15),
      headlineSmall: s(22, FontWeight.w800, 1.2),
      // Titres de section.
      titleLarge: s(19, FontWeight.w800, 1.25),
      titleMedium: s(16, FontWeight.w700, 1.3),
      titleSmall: s(14, FontWeight.w700, 1.3),
      bodyLarge: s(16, FontWeight.w400, 1.45),
      bodyMedium: s(14.5, FontWeight.w400, 1.45),
      bodySmall: s(13, FontWeight.w400, 1.4, p.muted),
      labelLarge: s(15, FontWeight.w700, 1.2),
      labelMedium: s(13, FontWeight.w600, 1.2),
      labelSmall: s(11.5, FontWeight.w600, 1.2, p.muted),
    );
  }

  static ThemeData _build(Brightness brightness, RiiPalette p) {
    final isDark = brightness == Brightness.dark;
    final scheme = ColorScheme(
      brightness: brightness,
      primary: p.brand,
      onPrimary: isDark ? RiiColors.darkCanvas : Colors.white,
      primaryContainer: p.brandSoft,
      onPrimaryContainer: p.brand,
      secondary: p.inkSoft,
      onSecondary: p.surface,
      error: p.danger,
      onError: Colors.white,
      surface: p.surface,
      onSurface: p.ink,
      onSurfaceVariant: p.muted,
      outline: p.line,
      outlineVariant: p.line,
      surfaceContainerLowest: p.surface,
      surfaceContainerLow: p.canvas,
      surfaceContainer: p.canvas,
      surfaceContainerHigh: p.surfaceHigh,
      surfaceContainerHighest: p.skeleton,
    );
    final text = _textTheme(p);

    final fieldBorder = OutlineInputBorder(
      borderRadius: RiiRadius.mdAll,
      borderSide: BorderSide(color: p.line),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: _fontFamily,
      textTheme: text,
      scaffoldBackgroundColor: p.canvas,
      canvasColor: p.canvas,
      dividerColor: p.line,
      splashFactory: InkSparkle.splashFactory,
      visualDensity: VisualDensity.standard,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      extensions: [p],
      appBarTheme: AppBarTheme(
        backgroundColor: p.canvas,
        foregroundColor: p.ink,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: text.titleLarge,
        systemOverlayStyle: isDark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
      ),
      dividerTheme: DividerThemeData(color: p.line, thickness: 1, space: 1),
      iconTheme: IconThemeData(color: p.ink, size: 22),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.brand,
          foregroundColor: scheme.onPrimary,
          disabledBackgroundColor: p.line,
          disabledForegroundColor: p.subtle,
          minimumSize: const Size(64, RiiSizes.buttonHeight),
          padding: const EdgeInsets.symmetric(horizontal: RiiSpace.xl),
          shape: const RoundedRectangleBorder(borderRadius: RiiRadius.mdAll),
          textStyle: text.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.ink,
          minimumSize: const Size(64, RiiSizes.buttonHeight),
          padding: const EdgeInsets.symmetric(horizontal: RiiSpace.xl),
          side: BorderSide(color: p.line, width: 1.2),
          shape: const RoundedRectangleBorder(borderRadius: RiiRadius.mdAll),
          textStyle: text.labelLarge,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: p.brand,
          minimumSize: const Size(48, RiiSizes.tapTarget),
          padding: const EdgeInsets.symmetric(horizontal: RiiSpace.md),
          shape: const RoundedRectangleBorder(borderRadius: RiiRadius.smAll),
          textStyle: text.labelLarge,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: RiiSpace.lg,
          vertical: RiiSpace.md + 2,
        ),
        hintStyle: text.bodyLarge!.copyWith(color: p.subtle),
        labelStyle: text.bodyMedium!.copyWith(color: p.muted),
        floatingLabelStyle: text.labelMedium!.copyWith(color: p.brand),
        helperStyle: text.bodySmall,
        errorStyle: text.bodySmall!.copyWith(color: p.danger),
        border: fieldBorder,
        enabledBorder: fieldBorder,
        focusedBorder: fieldBorder.copyWith(
          borderSide: BorderSide(color: p.brand, width: 1.6),
        ),
        errorBorder: fieldBorder.copyWith(
          borderSide: BorderSide(color: p.danger),
        ),
        focusedErrorBorder: fieldBorder.copyWith(
          borderSide: BorderSide(color: p.danger, width: 1.6),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: p.surface,
        selectedColor: p.ink,
        disabledColor: p.canvas,
        side: BorderSide(color: p.line),
        shape: const StadiumBorder(),
        labelStyle: text.labelMedium,
        secondaryLabelStyle: text.labelMedium!.copyWith(
          color: isDark ? RiiColors.darkCanvas : Colors.white,
        ),
        padding: const EdgeInsets.symmetric(horizontal: RiiSpace.sm),
        showCheckmark: false,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: p.lineStrongOr(isDark),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(RiiRadius.xl),
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: RiiRadius.lgAll),
        titleTextStyle: text.titleLarge,
        contentTextStyle: text.bodyMedium!.copyWith(color: p.inkSoft),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? p.surfaceHigh : RiiColors.ink,
        contentTextStyle: text.bodyMedium!.copyWith(color: Colors.white),
        actionTextColor: RiiColors.brandOnDark,
        shape: const RoundedRectangleBorder(borderRadius: RiiRadius.mdAll),
        insetPadding: const EdgeInsets.fromLTRB(
          RiiSpace.gutter,
          0,
          RiiSpace.gutter,
          RiiSpace.md,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: p.brandSoft,
        height: 66,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => text.labelSmall!.copyWith(
            color: states.contains(WidgetState.selected) ? p.ink : p.muted,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w600,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 24,
            color: states.contains(WidgetState.selected) ? p.brand : p.muted,
          ),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: p.brand,
        linearTrackColor: p.brandSoft,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: p.inkSoft,
        titleTextStyle: text.titleSmall,
        subtitleTextStyle: text.bodySmall,
        contentPadding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
        minVerticalPadding: RiiSpace.md,
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
        },
      ),
    );
  }
}

extension on RiiPalette {
  Color lineStrongOr(bool isDark) =>
      isDark ? RiiColors.darkLine : RiiColors.lineStrong;
}
