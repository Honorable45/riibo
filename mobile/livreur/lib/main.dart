import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';

import 'app/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Intl.defaultLocale = 'fr';
  await initializeDateFormatting('fr');
  // Pas de relance automatique de Riverpod : les actions sensibles (accepter,
  // valider un code) ne doivent jamais être rejouées en arrière-plan.
  runApp(ProviderScope(retry: (_, _) => null, child: const LivreurApp()));
}
