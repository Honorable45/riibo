import 'package:flutter/material.dart';

import '../../app/theme/tokens.dart';
import '../state/paged.dart';
import 'states.dart';

/// Bas de liste paginée : chargement, erreur avec réessai, ou rien.
class PagedFooter<T> extends StatelessWidget {
  const PagedFooter({super.key, required this.state, required this.onRetry});

  final PagedState<T> state;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (state.loadingMore) {
      return const Padding(
        padding: EdgeInsets.all(RiiSpace.xl),
        child: Center(
          child: SizedBox.square(
            dimension: 22,
            child: CircularProgressIndicator(strokeWidth: 2.2),
          ),
        ),
      );
    }
    if (state.loadMoreError != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: RiiSpace.md),
        child: Column(
          children: [
            Text(
              describeError(state.loadMoreError!),
              textAlign: TextAlign.center,
            ),
            TextButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }
}
