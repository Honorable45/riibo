import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/features/chat/chat_screen.dart';

import '../features/auth/login_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/delivery/active_delivery_screen.dart';
import '../features/history/history_screen.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/support/support_screen.dart';
import 'routes.dart';
import 'shell.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Relaie les changements de session au routeur (redirections).
class _SessionListenable extends ChangeNotifier {
  void notify() => notifyListeners();
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _SessionListenable();
  ref.listen(sessionProvider, (_, _) => refresh.notify());
  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: Routes.home,
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final at = state.matchedLocation;
      if (session is SessionRestoring) {
        return at == Routes.splash ? null : Routes.splash;
      }
      if (session is SignedOut) return at == Routes.login ? null : Routes.login;
      if (at == Routes.login || at == Routes.splash) return Routes.home;
      return null;
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const _Splash()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => DriverShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.home,
                builder: (_, _) => const DashboardScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.history,
                builder: (_, _) => const HistoryScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.profile,
                builder: (_, _) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: Routes.delivery,
        parentNavigatorKey: rootNavigatorKey,
        builder: (_, _) => const ActiveDeliveryScreen(),
      ),
      GoRoute(
        path: Routes.notifications,
        parentNavigatorKey: rootNavigatorKey,
        builder: (_, _) => const NotificationsScreen(),
      ),
      GoRoute(
        path: Routes.support,
        parentNavigatorKey: rootNavigatorKey,
        builder: (_, _) => const SupportScreen(),
      ),
      GoRoute(
        path: '/chat/:id',
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => ChatScreen(
          conversationId: state.pathParameters['id']!,
          title: state.uri.queryParameters['titre'] ?? 'Conversation',
          readOnly: state.uri.queryParameters['lecture'] == '1',
        ),
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(child: Image.asset('assets/images/logo_mark.png', height: 64)),
  );
}
