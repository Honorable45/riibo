import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/account/account_screen.dart';
import '../../features/account/profile_screen.dart';
import '../../features/addresses/address_form_screen.dart';
import '../../features/addresses/address_models.dart';
import '../../features/addresses/addresses_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/cart/cart_screen.dart';
import '../../features/cart/widgets/cart_bar.dart';
import 'package:riiberaka_core/features/chat/chat_screen.dart';
import '../../features/checkout/checkout_screen.dart';
import '../../features/design_catalog/design_catalog_screen.dart';
import '../../features/favorites/favorites_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/orders/order_screen.dart';
import '../../features/orders/orders_screen.dart';
import '../../features/restaurant/restaurant_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/search/search_screen.dart';
import 'routes.dart';
import 'shell.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

final routerProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: Routes.home,
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(
          navigationShell: shell,
          overlay: const CartBar(bottomSafeArea: false),
        ),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.home,
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.search,
                builder: (context, state) => SearchScreen(
                  autofocus: state.uri.queryParameters['focus'] == '1',
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.orders,
                builder: (context, state) => const OrdersScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.account,
                builder: (context, state) => const AccountScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/r/:slug',
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => RestaurantScreen(
          slug: state.pathParameters['slug']!,
          openDishId: state.uri.queryParameters['plat'],
        ),
      ),
      GoRoute(
        path: Routes.login,
        parentNavigatorKey: rootNavigatorKey,
        pageBuilder: (context, state) => MaterialPage(
          fullscreenDialog: true,
          child: LoginScreen(reason: state.extra as String?),
        ),
      ),
      GoRoute(
        path: Routes.cart,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const CartScreen(),
      ),
      GoRoute(
        path: Routes.checkout,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const CheckoutScreen(),
      ),
      GoRoute(
        path: '/orders/:id',
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => OrderScreen(
          orderId: state.pathParameters['id']!,
          justPlaced: state.uri.queryParameters['nouvelle'] == '1',
        ),
      ),
      GoRoute(
        path: Routes.favorites,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const FavoritesScreen(),
      ),
      GoRoute(
        path: Routes.notifications,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: Routes.profile,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const ProfileScreen(),
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
      GoRoute(
        path: Routes.addresses,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const AddressesScreen(),
      ),
      GoRoute(
        path: Routes.addressNew,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const AddressFormScreen(),
      ),
      GoRoute(
        path: Routes.addressEdit,
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) =>
            AddressFormScreen(existing: state.extra as Address?),
      ),
      if (kDebugMode)
        GoRoute(
          path: Routes.design,
          parentNavigatorKey: rootNavigatorKey,
          builder: (context, state) => const DesignCatalogScreen(),
        ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
