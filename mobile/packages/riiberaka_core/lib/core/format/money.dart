import 'package:intl/intl.dart';

/// Montants en franc CFA (XOF) : entiers, sans décimales, comme le backend
/// les stocke (`Payment.currency = 'XOF'`).
final NumberFormat _grouping = NumberFormat('#,##0', 'fr');

/// `2350` → `2 350 F` (espaces fines insécables, jamais de retour à la ligne
/// au milieu d'un prix).
String formatXof(int amount) {
  final sign = amount < 0 ? '−' : '';
  return '$sign${_grouping.format(amount.abs())} F';
}

/// Variante longue pour les récapitulatifs et l'accessibilité.
String formatXofLong(int amount) =>
    '${formatXof(amount).replaceAll(' F', '')} F CFA';
