import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/features/chat/chat_screen.dart';

import '../features/auth/login_screen.dart';
import '../features/menu/item_editor_screen.dart';
import '../features/menu/menu_screen.dart';
import '../features/menu/options_editor_screen.dart';
import '../features/more/history_screen.dart';
import '../features/more/more_screen.dart';
import '../features/more/notifications_screen.dart';
import '../features/more/reviews_screen.dart';
import '../features/more/stats_screen.dart';
import '../features/more/support_screen.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/orders/orders_screen.dart';
import '../features/settings/hours_screen.dart';
import '../features/settings/settings_screen.dart';
import 'routes.dart';
import 'shell.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

class _SessionListenable extends ChangeNotifier {
  void notify() => notifyListeners();
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _SessionListenable();
  ref.listen(sessionProvider, (_, _) => refresh.notify());
  GoRoute page(String path, Widget Function(GoRouterState s) build) => GoRoute(
    path: path,
    parentNavigatorKey: rootNavigatorKey,
    builder: (_, s) => build(s),
  );
  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: Routes.orders,
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final at = state.matchedLocation;
      if (session is SessionRestoring) {
        return at == Routes.splash ? null : Routes.splash;
      }
      if (session is SignedOut) return at == Routes.login ? null : Routes.login;
      if (at == Routes.login || at == Routes.splash) return Routes.orders;
      return null;
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const _Splash()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) =>
            RestaurantShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.orders,
                builder: (_, _) => const OrdersScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: Routes.menu, builder: (_, _) => const MenuScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.settings,
                builder: (_, _) => const SettingsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: Routes.more, builder: (_, _) => const MoreScreen()),
            ],
          ),
        ],
      ),
      page(
        '/commande/:id',
        (s) => OrderDetailScreen(orderId: s.pathParameters['id']!),
      ),
      page(Routes.itemNew, (s) => const ItemEditorScreen()),
      page(
        '/menu/plat/:id',
        (s) => ItemEditorScreen(itemId: s.pathParameters['id']),
      ),
      page(
        '/menu/plat/:id/options',
        (s) => OptionsEditorScreen(itemId: s.pathParameters['id']!),
      ),
      page(Routes.hours, (s) => const HoursScreen()),
      page(Routes.history, (s) => const HistoryScreen()),
      page(Routes.reviews, (s) => const ReviewsScreen()),
      page(Routes.stats, (s) => const StatsScreen()),
      page(Routes.notifications, (s) => const NotificationsScreen()),
      page(Routes.support, (s) => const SupportScreen()),
      page(
        '/chat/:id',
        (s) => ChatScreen(
          conversationId: s.pathParameters['id']!,
          title: s.uri.queryParameters['titre'] ?? 'Conversation',
          readOnly: s.uri.queryParameters['lecture'] == '1',
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
