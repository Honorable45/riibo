import 'package:flutter_riverpod/flutter_riverpod.dart';

/// État d'une liste paginée chargée progressivement (défilement infini).
class PagedState<T> {
  const PagedState({
    required this.items,
    required this.hasMore,
    this.nextPage = 2,
    this.nextCursor,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<T> items;
  final bool hasMore;
  final int nextPage;
  final String? nextCursor;
  final bool loadingMore;

  /// Erreur du chargement de la page suivante (les éléments déjà affichés
  /// restent visibles, avec un « Réessayer » en bas de liste).
  final Object? loadMoreError;

  PagedState<T> copyWith({
    List<T>? items,
    bool? hasMore,
    int? nextPage,
    String? Function()? nextCursor,
    bool? loadingMore,
    Object? Function()? loadMoreError,
  }) => PagedState(
    items: items ?? this.items,
    hasMore: hasMore ?? this.hasMore,
    nextPage: nextPage ?? this.nextPage,
    nextCursor: nextCursor != null ? nextCursor() : this.nextCursor,
    loadingMore: loadingMore ?? this.loadingMore,
    loadMoreError: loadMoreError != null ? loadMoreError() : this.loadMoreError,
  );
}

/// Résultat d'un chargement de page : éléments + y en a-t-il d'autres.
typedef PageFetch<T> = ({List<T> items, bool hasMore, String? nextCursor});

/// Base des listes paginées : première page via `build`, pages suivantes via
/// [loadMore] (une seule à la fois, jamais en double).
abstract class PagedNotifier<T> extends AsyncNotifier<PagedState<T>> {
  Future<PageFetch<T>> fetchPage({required int page, String? cursor});

  @override
  Future<PagedState<T>> build() async {
    final first = await fetchPage(page: 1);
    return PagedState(
      items: first.items,
      hasMore: first.hasMore,
      nextCursor: first.nextCursor,
    );
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.loadingMore) return;
    state = AsyncData(
      current.copyWith(loadingMore: true, loadMoreError: () => null),
    );
    try {
      final next = await fetchPage(
        page: current.nextPage,
        cursor: current.nextCursor,
      );
      if (!ref.mounted) return;
      state = AsyncData(
        current.copyWith(
          items: [...current.items, ...next.items],
          hasMore: next.hasMore,
          nextPage: current.nextPage + 1,
          nextCursor: () => next.nextCursor,
          loadingMore: false,
        ),
      );
    } catch (error) {
      if (!ref.mounted) return;
      state = AsyncData(
        current.copyWith(loadingMore: false, loadMoreError: () => error),
      );
    }
  }
}
