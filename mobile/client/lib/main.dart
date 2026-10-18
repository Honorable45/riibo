import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';

import 'app/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Intl.defaultLocale = 'fr';
  await initializeDateFormatting('fr');
  runApp(
    ProviderScope(
      // Pas de nouvelle tentative automatique de Riverpod : les relances
      // réseau sont décidées explicitement (bouton « Réessayer », lectures
      // idempotentes uniquement), jamais rejouées en boucle en arrière-plan.
      retry: (_, _) => null,
      child: const RiiberakaApp(),
    ),
  );
}
