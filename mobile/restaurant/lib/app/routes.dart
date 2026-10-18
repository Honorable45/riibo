/// Chemins de navigation de l'application restaurant.
abstract final class Routes {
  static const splash = '/demarrage';
  static const login = '/connexion';
  static const orders = '/';
  static const menu = '/menu';
  static const settings = '/restaurant';
  static const more = '/plus';
  static const history = '/historique';
  static const reviews = '/avis';
  static const stats = '/statistiques';
  static const notifications = '/notifications';
  static const support = '/assistance';
  static const hours = '/horaires';
  static const itemNew = '/menu/nouveau';

  static String order(String id) => '/commande/${Uri.encodeComponent(id)}';
  static String item(String id) => '/menu/plat/${Uri.encodeComponent(id)}';
  static String options(String id) =>
      '/menu/plat/${Uri.encodeComponent(id)}/options';

  static String chat(
    String id, {
    required String title,
    bool readOnly = false,
  }) => Uri(
    path: '/chat/${Uri.encodeComponent(id)}',
    queryParameters: {'titre': title, if (readOnly) 'lecture': '1'},
  ).toString();
}
