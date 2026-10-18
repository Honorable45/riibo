/// Chemins de navigation : une seule source, aucune URL écrite à la main
/// dans les écrans.
abstract final class Routes {
  static const home = '/';
  static const search = '/search';
  static const orders = '/orders';
  static const account = '/account';
  static const design = '/design';
  static const login = '/login';
  static const cart = '/cart';
  static const checkout = '/checkout';
  static const addresses = '/addresses';
  static const favorites = '/favorites';
  static const notifications = '/notifications';
  static const profile = '/profile';
  static const addressNew = '/addresses/new';
  static const addressEdit = '/addresses/edit';

  static String order(String id, {bool justPlaced = false}) => Uri(
    path: '/orders/${Uri.encodeComponent(id)}',
    queryParameters: justPlaced ? {'nouvelle': '1'} : null,
  ).toString();

  static String chat(
    String id, {
    required String title,
    bool readOnly = false,
  }) => Uri(
    path: '/chat/${Uri.encodeComponent(id)}',
    queryParameters: {'titre': title, if (readOnly) 'lecture': '1'},
  ).toString();

  static String restaurant(String slug, {String? dishId}) => Uri(
    path: '/r/$slug',
    queryParameters: dishId == null ? null : {'plat': dishId},
  ).toString();
}
