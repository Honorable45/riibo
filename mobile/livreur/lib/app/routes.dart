/// Chemins de navigation de l'application livreur.
abstract final class Routes {
  static const splash = '/demarrage';
  static const login = '/connexion';
  static const home = '/';
  static const history = '/historique';
  static const profile = '/profil';
  static const delivery = '/course';
  static const notifications = '/notifications';
  static const support = '/assistance';

  static String chat(
    String id, {
    required String title,
    bool readOnly = false,
  }) => Uri(
    path: '/chat/${Uri.encodeComponent(id)}',
    queryParameters: {'titre': title, if (readOnly) 'lecture': '1'},
  ).toString();
}
