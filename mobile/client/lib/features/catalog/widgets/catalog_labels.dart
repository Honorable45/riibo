import 'package:flutter/material.dart';

import 'package:riiberaka_core/core/format/money.dart';

/// Icône par catégorie (le backend envoie des emoji, remplacés par des icônes
/// au trait cohérentes avec le reste de l'interface).
IconData categoryIcon(String slug) => switch (slug) {
  'poulet' => Icons.kebab_dining_outlined,
  'riz' => Icons.rice_bowl_outlined,
  'burger' => Icons.lunch_dining_outlined,
  'pizza' => Icons.local_pizza_outlined,
  'poisson' => Icons.set_meal_outlined,
  'pates' => Icons.soup_kitchen_outlined,
  'boissons' => Icons.local_drink_outlined,
  'desserts' => Icons.cake_outlined,
  _ => Icons.restaurant_outlined,
};

/// Raison de fermeture calculée par le serveur (computeOpenStatus).
String closedReasonLabel(String? reason) => switch (reason) {
  'PAUSED' => 'Pause momentanée',
  'CLOSURE' => 'Fermeture exceptionnelle',
  'NO_HOURS' => 'Horaires non communiqués',
  _ => 'Fermé pour le moment',
};

String deliveryFeeLabel(int fee) =>
    fee == 0 ? 'Livraison offerte' : 'Livraison ${formatXof(fee)}';

String distanceLabel(double km) => km < 1
    ? '${(km * 1000).round()} m'
    : '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
