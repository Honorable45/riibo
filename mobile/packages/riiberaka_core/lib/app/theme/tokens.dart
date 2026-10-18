import 'package:flutter/material.dart';

/// Couleurs Riiberaka. Le bleu de marque et l'encre viennent de l'identité
/// existante (logo « R » et PWA client) ; le reste est volontairement réduit :
/// une couleur d'action, des neutres, quatre couleurs d'état. La photo des
/// plats apporte la chaleur, l'interface reste calme autour.
abstract final class RiiColors {
  static const brand = Color(0xFF0058F0);
  static const brandPressed = Color(0xFF0042B8);
  static const brandSoft = Color(0xFFE8F0FF);
  static const brandOnDark = Color(0xFF6EA2FF);

  static const ink = Color(0xFF0A1633);
  static const inkSoft = Color(0xFF3B4558);
  static const muted = Color(0xFF667085);
  static const subtle = Color(0xFF98A2B3);
  static const line = Color(0xFFE4E7EC);
  static const lineStrong = Color(0xFFD0D5DD);
  static const canvas = Color(0xFFF5F6F8);
  static const surface = Color(0xFFFFFFFF);

  static const success = Color(0xFF14804A);
  static const successSoft = Color(0xFFE6F4EC);
  static const warning = Color(0xFFB54708);
  static const warningSoft = Color(0xFFFEF4E6);
  static const danger = Color(0xFFC0262D);
  static const dangerSoft = Color(0xFFFDECEC);

  /// Réservé aux étoiles de note.
  static const rating = Color(0xFFF2A100);

  // Mode sombre.
  static const darkCanvas = Color(0xFF0B1220);
  static const darkSurface = Color(0xFF131C2E);
  static const darkSurfaceHigh = Color(0xFF1B2539);
  static const darkLine = Color(0xFF26324A);
  static const darkInk = Color(0xFFEDF1F7);
  static const darkMuted = Color(0xFF9AA6BC);
}

/// Grille d'espacement (multiples de 4).
abstract final class RiiSpace {
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;

  /// Marge latérale des écrans.
  static const double gutter = 16;
}

abstract final class RiiRadius {
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double pill = 999;

  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius pillAll = BorderRadius.all(Radius.circular(pill));
}

abstract final class RiiDurations {
  static const fast = Duration(milliseconds: 140);
  static const normal = Duration(milliseconds: 220);
  static const slow = Duration(milliseconds: 320);
}

/// Hauteurs minimales de cible tactile.
abstract final class RiiSizes {
  static const double tapTarget = 48;
  static const double buttonHeight = 52;
  static const double buttonHeightSmall = 40;
  static const double fieldHeight = 52;
}

/// Ombres : une seule élévation douce pour ce qui flotte (barre panier,
/// feuilles). Les cartes posées sur le fond n'en ont pas, une bordure suffit.
abstract final class RiiShadows {
  static const floating = [
    BoxShadow(color: Color(0x1A0A1633), blurRadius: 24, offset: Offset(0, 8)),
    BoxShadow(color: Color(0x0D0A1633), blurRadius: 4, offset: Offset(0, 1)),
  ];
}
