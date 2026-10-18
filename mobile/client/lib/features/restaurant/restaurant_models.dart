import 'package:riiberaka_core/core/api/json.dart';
import '../catalog/catalog_models.dart';

class OpeningRange {
  const OpeningRange({
    required this.dayOfWeek,
    required this.opensAt,
    required this.closesAt,
  });

  factory OpeningRange.fromJson(Json json) => OpeningRange(
    dayOfWeek: json.integer('dayOfWeek'),
    opensAt: json.str('opensAt'),
    closesAt: json.str('closesAt'),
  );

  /// ISO 8601 : 1 = lundi … 7 = dimanche (comme le backend).
  final int dayOfWeek;
  final String opensAt;
  final String closesAt;
}

class UpcomingClosure {
  const UpcomingClosure({
    required this.startsAt,
    required this.endsAt,
    this.reason,
  });

  factory UpcomingClosure.fromJson(Json json) => UpcomingClosure(
    startsAt: json.date('startsAt'),
    endsAt: json.date('endsAt'),
    reason: json.strOrNull('reason'),
  );

  final DateTime startsAt;
  final DateTime endsAt;
  final String? reason;
}

/// Fiche restaurant (`GET /restaurants/:idOrSlug`).
class RestaurantDetail {
  const RestaurantDetail({
    required this.summary,
    this.address,
    this.phone,
    this.latitude,
    this.longitude,
    this.hours = const [],
    this.upcomingClosures = const [],
  });

  factory RestaurantDetail.fromJson(Json json) => RestaurantDetail(
    summary: RestaurantSummary.fromJson(json),
    address: json.strOrNull('address'),
    phone: json.strOrNull('phone'),
    latitude: json.dblOrNull('latitude'),
    longitude: json.dblOrNull('longitude'),
    hours: json.list('hours', OpeningRange.fromJson),
    upcomingClosures: json.list('upcomingClosures', UpcomingClosure.fromJson),
  );

  final RestaurantSummary summary;
  final String? address;
  final String? phone;
  final double? latitude;
  final double? longitude;
  final List<OpeningRange> hours;
  final List<UpcomingClosure> upcomingClosures;
}

class MenuOption {
  const MenuOption({
    required this.id,
    required this.name,
    required this.priceDelta,
    required this.isAvailable,
  });

  factory MenuOption.fromJson(Json json) => MenuOption(
    id: json.str('id'),
    name: json.str('name'),
    priceDelta: json.integer('priceDelta'),
    isAvailable: json.boolean('isAvailable', fallback: true),
  );

  final String id;
  final String name;
  final int priceDelta;
  final bool isAvailable;
}

class OptionGroup {
  const OptionGroup({
    required this.id,
    required this.name,
    required this.minSelect,
    required this.maxSelect,
    required this.options,
  });

  factory OptionGroup.fromJson(Json json) => OptionGroup(
    id: json.str('id'),
    name: json.str('name'),
    minSelect: json.integer('minSelect'),
    maxSelect: json.integer('maxSelect'),
    options: json.list('options', MenuOption.fromJson),
  );

  final String id;
  final String name;
  final int minSelect;
  final int maxSelect;
  final List<MenuOption> options;

  bool get isRequired => minSelect > 0;
  bool get isSingleChoice => maxSelect == 1;

  /// « Obligatoire », « Jusqu'à 2 », « 2 à 3 au choix ».
  String get ruleLabel {
    if (minSelect == 1 && maxSelect == 1) return 'Obligatoire · 1 au choix';
    if (minSelect == 0 && maxSelect == 1) return 'Facultatif · 1 au choix';
    if (minSelect == 0) return 'Facultatif · jusqu’à $maxSelect';
    if (minSelect == maxSelect) return 'Obligatoire · $minSelect au choix';
    return 'Obligatoire · $minSelect à $maxSelect';
  }
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    required this.price,
    required this.isAvailable,
    this.categoryId,
    this.description,
    this.imageUrl,
    this.maxQuantity,
    this.optionGroups = const [],
  });

  factory MenuItem.fromJson(Json json) => MenuItem(
    id: json.str('id'),
    categoryId: json.strOrNull('categoryId'),
    name: json.str('name'),
    description: json.strOrNull('description'),
    price: json.integer('price'),
    imageUrl: json.strOrNull('imageUrl'),
    isAvailable: json.boolean('isAvailable'),
    maxQuantity: json.intOrNull('maxQuantity'),
    optionGroups: json.list('optionGroups', OptionGroup.fromJson),
  );

  final String id;
  final String? categoryId;
  final String name;
  final String? description;
  final int price;
  final String? imageUrl;
  final bool isAvailable;
  final int? maxQuantity;
  final List<OptionGroup> optionGroups;

  /// Prix d'appel affiché « à partir de » quand une option obligatoire
  /// augmente le prix minimal.
  int get startingPrice {
    var total = price;
    for (final group in optionGroups.where((g) => g.isRequired)) {
      final deltas =
          group.options
              .where((o) => o.isAvailable)
              .map((o) => o.priceDelta)
              .toList()
            ..sort();
      total += deltas.take(group.minSelect).fold(0, (a, b) => a + b);
    }
    return total;
  }
}

class MenuSection {
  const MenuSection({
    required this.id,
    required this.name,
    required this.items,
  });

  final String id;
  final String name;
  final List<MenuItem> items;
}

/// Menu public (`GET /restaurants/:idOrSlug/menu`) : sections non vides,
/// plats sans catégorie regroupés à la fin.
class RestaurantMenu {
  const RestaurantMenu(this.sections);

  factory RestaurantMenu.fromJson(Json json) {
    final sections = json
        .list(
          'categories',
          (c) => MenuSection(
            id: c.str('id'),
            name: c.str('name'),
            items: c.list('items', MenuItem.fromJson),
          ),
        )
        .where((s) => s.items.isNotEmpty)
        .toList();
    final loose = json.list('uncategorized', MenuItem.fromJson);
    if (loose.isNotEmpty) {
      sections.add(
        MenuSection(
          id: '_uncategorized',
          name: sections.isEmpty ? 'Menu' : 'Autres plats',
          items: loose,
        ),
      );
    }
    return RestaurantMenu(sections);
  }

  final List<MenuSection> sections;

  bool get isEmpty => sections.isEmpty;

  MenuItem? itemById(String id) {
    for (final section in sections) {
      for (final item in section.items) {
        if (item.id == id) return item;
      }
    }
    return null;
  }
}

class Review {
  const Review({
    required this.id,
    required this.rating,
    required this.createdAt,
    this.comment,
    this.reply,
    this.author,
  });

  factory Review.fromJson(Json json) => Review(
    id: json.str('id'),
    rating: json.integer('rating'),
    comment: json.strOrNull('comment'),
    reply: json.strOrNull('reply'),
    author: json.strOrNull('author'),
    createdAt: json.date('createdAt'),
  );

  final String id;
  final int rating;
  final String? comment;
  final String? reply;
  final String? author;
  final DateTime createdAt;
}

class ReviewPage {
  const ReviewPage({
    required this.rating,
    required this.count,
    required this.items,
    required this.nextCursor,
  });

  factory ReviewPage.fromJson(Json json) {
    final summary = json.objOrNull('summary') ?? const <String, dynamic>{};
    return ReviewPage(
      rating: summary.dblOrNull('rating') ?? 0,
      count: summary.intOrNull('reviewCount') ?? 0,
      items: json.list('items', Review.fromJson),
      nextCursor: json.strOrNull('nextCursor'),
    );
  }

  final double rating;
  final int count;
  final List<Review> items;
  final String? nextCursor;
}
