import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_client/features/catalog/catalog_models.dart';
import 'package:riiberaka_client/features/catalog/catalog_repository.dart';

/// Données de TEST uniquement (forme identique aux réponses réelles du
/// backend, relevées le 2026-10-17) — jamais utilisées par l'application.
Json restaurantJson({
  String id = 'r1',
  String slug = 'chez-maman',
  String name = 'Chez Maman',
  bool isOpen = true,
  String? closedReason,
  int deliveryFee = 1000,
  double rating = 5,
  int reviewCount = 2,
  double? distanceKm,
}) => {
  'id': id,
  'slug': slug,
  'name': name,
  'description': 'Cuisine familiale togolaise, poulet braisé et riz sauce.',
  'logoUrl': null,
  'coverUrl': null,
  'city': 'Lomé',
  'quarter': 'Agoè',
  'categories': [
    {'slug': 'poulet', 'name': 'Poulet', 'icon': '🍗'},
    {'slug': 'riz', 'name': 'Riz', 'icon': '🍚'},
  ],
  'rating': rating,
  'reviewCount': reviewCount,
  'deliveryFee': deliveryFee,
  'minOrderAmount': 1000,
  'prepTimeMin': 20,
  'prepTimeMax': 35,
  'distanceKm': distanceKm,
  'isOpen': isOpen,
  'closedReason': closedReason,
  'closesAt': isOpen ? '22:00' : null,
};

Json dishJson({
  String id = 'd1',
  String name = 'Demi-poulet',
  int price = 1500,
  bool restaurantOpen = true,
}) => {
  'id': id,
  'name': name,
  'price': price,
  'imageUrl': null,
  'rating': 5,
  'reviewCount': 2,
  'hasOptions': false,
  'restaurant': {
    'id': 'r1',
    'slug': 'chez-maman',
    'name': 'Chez Maman',
    'isOpen': restaurantOpen,
  },
};

class FakeCatalogRepository implements CatalogRepository {
  FakeCatalogRepository({
    List<CuisineCategory>? categories,
    List<RestaurantSummary>? restaurants,
    List<DishSummary>? dishes,
  }) : categoriesData =
           categories ??
           const [
             CuisineCategory(slug: 'poulet', name: 'Poulet'),
             CuisineCategory(slug: 'riz', name: 'Riz'),
           ],
       restaurantsData =
           restaurants ?? [RestaurantSummary.fromJson(restaurantJson())],
       dishesData = dishes ?? [DishSummary.fromJson(dishJson())];

  List<CuisineCategory> categoriesData;
  List<RestaurantSummary> restaurantsData;
  List<DishSummary> dishesData;

  /// Si défini, toutes les requêtes échouent avec cette erreur.
  ApiException? failure;

  final List<RestaurantQuery> restaurantQueries = [];
  final List<({String? text, String? category})> dishQueries = [];

  @override
  Future<List<CuisineCategory>> categories() async {
    if (failure != null) throw failure!;
    return categoriesData;
  }

  @override
  Future<PageResult<RestaurantSummary>> restaurants(
    RestaurantQuery query, {
    int page = 1,
  }) async {
    restaurantQueries.add(query);
    if (failure != null) throw failure!;
    return PageResult(
      items: restaurantsData,
      page: page,
      total: restaurantsData.length,
      hasMore: false,
    );
  }

  @override
  Future<PageResult<DishSummary>> dishes({
    String? text,
    String? category,
    int page = 1,
    int limit = CatalogRepository.pageSize,
  }) async {
    dishQueries.add((text: text, category: category));
    if (failure != null) throw failure!;
    final filtered = text == null
        ? dishesData
        : dishesData
              .where((d) => d.name.toLowerCase().contains(text.toLowerCase()))
              .toList();
    return PageResult(
      items: filtered,
      page: page,
      total: filtered.length,
      hasMore: false,
    );
  }
}
