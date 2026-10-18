/// Numéros de téléphone : le Togo (+228, 8 chiffres) est le cas courant,
/// mais tout numéro international valide pour le backend reste accepté
/// (`/^\+?[0-9]{7,15}$/`, voir RequestPhoneOtpDto).
abstract final class PhoneNumbers {
  static const togoPrefix = '+228';
  static final _backendPattern = RegExp(r'^\+[0-9]{7,15}$');

  /// Normalise une saisie libre au format E.164 :
  /// `90 12 34 56` → `+22890123456`, `0022890123456` → `+22890123456`,
  /// `+33 6 12 34 56 78` → `+33612345678`. Retourne `null` si invalide.
  static String? normalize(String input) {
    var raw = input.trim().replaceAll(RegExp(r'[\s.\-()]'), '');
    if (raw.isEmpty) return null;
    if (raw.startsWith('00')) raw = '+${raw.substring(2)}';
    if (!raw.startsWith('+')) {
      if (!RegExp(r'^[0-9]+$').hasMatch(raw)) return null;
      // Numéro local togolais sans indicatif.
      if (raw.length == 8) {
        raw = '$togoPrefix$raw';
      } else if (raw.length == 11 && raw.startsWith('228')) {
        raw = '+$raw';
      } else {
        return null;
      }
    }
    if (!_backendPattern.hasMatch(raw)) return null;
    // Indicatif togolais : exactement 8 chiffres derrière.
    if (raw.startsWith(togoPrefix) && raw.length != togoPrefix.length + 8) {
      return null;
    }
    return raw;
  }

  /// `+22890123456` → `+228 90 12 34 56` ; autres pays inchangés.
  static String display(String e164) {
    if (e164.startsWith(togoPrefix) && e164.length == 12) {
      final local = e164.substring(4);
      final pairs = [
        for (var i = 0; i < local.length; i += 2) local.substring(i, i + 2),
      ];
      return '$togoPrefix ${pairs.join(' ')}';
    }
    return e164;
  }
}
