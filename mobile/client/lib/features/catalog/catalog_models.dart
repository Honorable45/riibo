import 'package:riiberaka_core/core/api/json.dart';

class CuisineCategory {
  const CuisineCategory({required this.slug, required this.name});

  factory CuisineCategory.fromJson(Json json) =>
      CuisineCategory(slug: json.str('slug'), name: json.str('name'));

  final String slug;
  final String name;
}

/// Carte restaurant (`toRestaurantCard` du backend). Le statut ouvert/fermé
/// est calculé par le serveur (fuseau Africa/Lome, pauses, fermetures).
class RestaurantSummary {
  const RestaurantSummary({
    required this.id,
    required this.slug,
    required this.name,
    this.description,
    this.logoUrl,
    this.coverUrl,
    this.city,
    this.quarter,
    this.categories = const [],
    this.rating = 0,
    this.reviewCount = 0,
    this.deliveryFee = 0,
    this.minOrderAmount = 0,
    this.prepTimeMin,
    this.prepTimeMax,
    this.distanceKm,
    this.isOpen = false,
    this.closedReason,
    this.closesAt,
  });

  factory RestaurantSummary.fromJson(Json json) => RestaurantSummary(
    id: json.str('id'),
    slug: json.str('slug'),
    name: json.str('name'),
    description: json.strOrNull('description'),
    logoUrl: json.strOrNull('logoUrl'),
    coverUrl: json.strOrNull('coverUrl'),
    city: json.strOrNull('city'),
    quarter: json.strOrNull('quarter'),
    categories: json.list('categories', CuisineCategory.fromJson),
    rating: json.dblOrNull('rating') ?? 0,
    reviewCount: json.intOrNull('reviewCount') ?? 0,
    deliveryFee: json.intOrNull('deliveryFee') ?? 0,
    minOrderAmount: json.intOrNull('minOrderAmount') ?? 0,
    prepTimeMin: json.intOrNull('prepTimeMin'),
    prepTimeMax: json.intOrNull('prepTimeMax'),
    distanceKm: json.dblOrNull('distanceKm'),
    isOpen: json.boolean('isOpen'),
    closedReason: json.strOrNull('closedReason'),
    closesAt: json.strOrNull('closesAt'),
  );

  final String id;
  final String slug;
  final String name;
  final String? description;
  final String? logoUrl;
  final String? coverUrl;
  final String? city;
  final String? quarter;
  final List<CuisineCategory> categories;
  final double rating;
  final int reviewCount;
  final int deliveryFee;
  final int minOrderAmount;
  final int? prepTimeMin;
  final int? prepTimeMax;
  final double? distanceKm;
  final bool isOpen;
  final String? closedReason;

  /// Heure de fermeture du service en cours (« 22:00 »).
  final String? closesAt;

  /// Localisation lisible (« Agoè, Lomé »).
  String? get place {
    final parts = [
      quarter,
      city,
    ].whereType<String>().where((s) => s.isNotEmpty);
    return parts.isEmpty ? null : parts.join(', ');
  }

  /// Temps de préparation annoncé par le restaurant (« 20–35 min »).
  /// Ce n'est PAS un délai de livraison garanti.
  String? get prepTimeLabel {
    if (prepTimeMin == null && prepTimeMax == null) return null;
    if (prepTimeMin != null &&
        prepTimeMax != null &&
        prepTimeMin != prepTimeMax) {
      return '$prepTimeMin–$prepTimeMax min';
    }
    return '${prepTimeMax ?? prepTimeMin} min';
  }
}

/// Plat vendable maintenant, tous restaurants confondus (`GET /menu-items`).
class DishSummary {
  const DishSummary({
    required this.id,
    required this.name,
    required this.price,
    required this.restaurantId,
    required this.restaurantSlug,
    required this.restaurantName,
    required this.restaurantIsOpen,
    this.imageUrl,
    this.rating = 0,
    this.reviewCount = 0,
    this.hasOptions = false,
  });

  factory DishSummary.fromJson(Json json) {
    final restaurant = json.obj('restaurant');
    return DishSummary(
      id: json.str('id'),
      name: json.str('name'),
      price: json.integer('price'),
      imageUrl: json.strOrNull('imageUrl'),
      rating: json.dblOrNull('rating') ?? 0,
      reviewCount: json.intOrNull('reviewCount') ?? 0,
      hasOptions: json.boolean('hasOptions'),
      restaurantId: restaurant.str('id'),
      restaurantSlug: restaurant.str('slug'),
      restaurantName: restaurant.str('name'),
      restaurantIsOpen: restaurant.boolean('isOpen'),
    );
  }

  final String id;
  final String name;
  final int price;
  final String? imageUrl;
  final double rating;
  final int reviewCount;
  final bool hasOptions;
  final String restaurantId;
  final String restaurantSlug;
  final String restaurantName;
  final bool restaurantIsOpen;
}

enum RestaurantSort {
  nearest('nearest', 'Les plus proches'),
  rating('rating', 'Les mieux notés'),
  popular('popular', 'Les plus commandés');

  const RestaurantSort(this.apiValue, this.label);
  final String apiValue;
  final String label;
}

/// Critères de `GET /restaurants` — uniquement ceux que le backend applique
/// réellement (pas de filtre prix ni note : ils n'existent pas côté serveur).
class RestaurantQuery {
  const RestaurantQuery({
    this.text,
    this.category,
    this.openNow = false,
    this.sort,
    this.latitude,
    this.longitude,
  });

  final String? text;
  final String? category;
  final bool openNow;
  final RestaurantSort? sort;
  final double? latitude;
  final double? longitude;

  bool get hasLocation => latitude != null && longitude != null;

  RestaurantQuery copyWith({
    String? text,
    String? Function()? category,
    bool? openNow,
    RestaurantSort? Function()? sort,
  }) => RestaurantQuery(
    text: text ?? this.text,
    category: category != null ? category() : this.category,
    openNow: openNow ?? this.openNow,
    sort: sort != null ? sort() : this.sort,
    latitude: latitude,
    longitude: longitude,
  );

  Map<String, Object?> toQuery({required int page, required int limit}) => {
    'q': text?.trim(),
    'category': category,
    'openNow': openNow ? 'true' : null,
    // « Près de moi » n'a de sens qu'avec une position.
    'sort': sort == RestaurantSort.nearest && !hasLocation
        ? null
        : sort?.apiValue,
    'lat': latitude,
    'lng': longitude,
    'page': page,
    'limit': limit,
  };

  @override
  bool operator ==(Object other) =>
      other is RestaurantQuery &&
      other.text == text &&
      other.category == category &&
      other.openNow == openNow &&
      other.sort == sort &&
      other.latitude == latitude &&
      other.longitude == longitude;

  @override
  int get hashCode =>
      Object.hash(text, category, openNow, sort, latitude, longitude);
}
