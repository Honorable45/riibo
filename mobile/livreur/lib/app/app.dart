import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';

import 'router.dart';

class LivreurApp extends ConsumerWidget {
  const LivreurApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(realtimeProvider);
    // Une session restaurée qui n'est pas celle d'un livreur est fermée : le
    // serveur refuserait de toute façon chaque route livreur (rôle relu en base).
    ref.listen(currentUserProvider, (_, user) {
      if (user != null && user.id.isNotEmpty && user.role != 'LIVREUR') {
        ref.read(sessionProvider.notifier).signOut();
      }
    });
    return MaterialApp.router(
      title: 'Riiberaka Livreur',
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
