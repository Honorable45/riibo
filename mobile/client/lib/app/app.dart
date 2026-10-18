import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/realtime/realtime.dart';
import 'router/router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';

class RiiberakaApp extends ConsumerWidget {
  const RiiberakaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Connexion temps réel tant qu'un client est connecté.
    ref.watch(realtimeProvider);
    return MaterialApp.router(
      title: 'Riiberaka',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
