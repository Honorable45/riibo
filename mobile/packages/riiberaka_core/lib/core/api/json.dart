/// Lecture tolérante mais typée des réponses JSON du backend.
typedef Json = Map<String, dynamic>;

extension JsonRead on Json {
  String str(String key) => this[key] as String;
  String? strOrNull(String key) => this[key] as String?;
  int integer(String key) => (this[key] as num).toInt();
  int? intOrNull(String key) => (this[key] as num?)?.toInt();
  double dbl(String key) => (this[key] as num).toDouble();
  double? dblOrNull(String key) => (this[key] as num?)?.toDouble();
  bool boolean(String key, {bool fallback = false}) =>
      this[key] as bool? ?? fallback;
  DateTime date(String key) => DateTime.parse(this[key] as String).toLocal();
  DateTime? dateOrNull(String key) {
    final raw = this[key] as String?;
    return raw == null ? null : DateTime.parse(raw).toLocal();
  }

  Json obj(String key) => this[key] as Json;
  Json? objOrNull(String key) => this[key] as Json?;

  List<T> list<T>(String key, T Function(Json) parse) =>
      ((this[key] as List<dynamic>?) ?? const [])
          .cast<Json>()
          .map(parse)
          .toList(growable: false);
}

/// Page d'une liste paginée par numéro (`{ items, page, limit, total, hasMore }`).
class PageResult<T> {
  const PageResult({
    required this.items,
    required this.page,
    required this.total,
    required this.hasMore,
  });

  factory PageResult.fromJson(Json json, T Function(Json) parse) => PageResult(
    items: json.list('items', parse),
    page: json.integer('page'),
    total: json.integer('total'),
    hasMore: json.boolean('hasMore'),
  );

  final List<T> items;
  final int page;
  final int total;
  final bool hasMore;
}

/// Page d'une liste paginée par curseur (`{ items, nextCursor }`).
class CursorPage<T> {
  const CursorPage({required this.items, required this.nextCursor});

  factory CursorPage.fromJson(Json json, T Function(Json) parse) => CursorPage(
    items: json.list('items', parse),
    nextCursor: json.strOrNull('nextCursor'),
  );

  final List<T> items;
  final String? nextCursor;
}
