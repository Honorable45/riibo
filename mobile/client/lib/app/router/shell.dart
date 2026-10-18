import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Coquille à onglets. Chaque onglet garde sa propre pile de navigation et sa
/// position de défilement (StatefulShellRoute.indexedStack).
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell, this.overlay});

  final StatefulNavigationShell navigationShell;

  /// Élément affiché au-dessus de la barre d'onglets (barre du panier).
  final Widget? overlay;

  void _select(int index) {
    // Re-toucher l'onglet actif revient à sa racine.
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ?overlay,
          DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(color: Theme.of(context).dividerColor),
              ),
            ),
            child: NavigationBar(
              selectedIndex: navigationShell.currentIndex,
              onDestinationSelected: _select,
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home_rounded),
                  label: 'Accueil',
                ),
                NavigationDestination(
                  icon: Icon(Icons.search_rounded),
                  selectedIcon: Icon(Icons.manage_search_rounded),
                  label: 'Recherche',
                ),
                NavigationDestination(
                  icon: Icon(Icons.receipt_long_outlined),
                  selectedIcon: Icon(Icons.receipt_long_rounded),
                  label: 'Commandes',
                ),
                NavigationDestination(
                  icon: Icon(Icons.person_outline_rounded),
                  selectedIcon: Icon(Icons.person_rounded),
                  label: 'Compte',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
