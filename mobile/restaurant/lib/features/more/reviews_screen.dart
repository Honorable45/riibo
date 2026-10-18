import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/paged_footer.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../shared/models.dart';
import '../shared/providers.dart';
import '../shared/repository.dart';
import '../shared/widgets.dart';

class ReviewsScreen extends ConsumerWidget {
  const ReviewsScreen({super.key});

  Future<void> _reply(
    BuildContext context,
    WidgetRef ref,
    String restaurantId,
    Review review,
  ) async {
    final controller = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Répondre à l’avis'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 500,
          maxLines: 4,
          minLines: 2,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Publier'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (text == null || text.isEmpty) return;
    try {
      await ref
          .read(restaurantRepositoryProvider)
          .reply(restaurantId, review.id, text);
      ref.invalidate(reviewsProvider);
      if (context.mounted) showRiiSnack(context, 'Réponse publiée');
    } on ApiException catch (e) {
      if (context.mounted) showRiiSnack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.text;
    final p = context.palette;
    return Scaffold(
      appBar: AppBar(title: const Text('Avis des clients')),
      body: RestaurantGate(
        allowUnapproved: true,
        builder: (context, r) {
          final async = ref.watch(reviewsProvider);
          final state = async.value;
          if (state == null) {
            return async.hasError
                ? ErrorState(
                    error: async.error!,
                    onRetry: () => ref.invalidate(reviewsProvider),
                  )
                : const Center(child: CircularProgressIndicator());
          }
          if (state.items.isEmpty) {
            return const EmptyState(
              icon: Icons.star_outline_rounded,
              title: 'Aucun avis pour l’instant',
            );
          }
          return ListView(
            padding: const EdgeInsets.all(RiiSpace.gutter),
            children: [
              for (final review in state.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: RiiSpace.md),
                  child: RiiCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            for (var i = 0; i < 5; i++)
                              Icon(
                                i < review.rating
                                    ? Icons.star_rounded
                                    : Icons.star_outline_rounded,
                                size: 18,
                                color: i < review.rating ? p.rating : p.line,
                              ),
                            const SizedBox(width: RiiSpace.sm),
                            Expanded(
                              child: Text(
                                [
                                  ?review.author,
                                  if (review.orderNumber != null)
                                    '#${review.orderNumber}',
                                  DateFormat(
                                    'd MMM',
                                    'fr',
                                  ).format(review.createdAt),
                                ].join(' · '),
                                style: t.bodySmall,
                              ),
                            ),
                          ],
                        ),
                        if (review.comment != null) ...[
                          const SizedBox(height: RiiSpace.xs),
                          Text(review.comment!, style: t.bodyMedium),
                        ],
                        const SizedBox(height: RiiSpace.sm),
                        if (review.reply != null)
                          Container(
                            padding: const EdgeInsets.all(RiiSpace.sm),
                            decoration: BoxDecoration(
                              color: p.canvas,
                              borderRadius: RiiRadius.smAll,
                            ),
                            child: Text(
                              'Votre réponse : ${review.reply}',
                              style: t.bodySmall,
                            ),
                          )
                        else if (r.isOwner)
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton(
                              onPressed: () =>
                                  _reply(context, ref, r.id, review),
                              child: const Text('Répondre'),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              PagedFooter(
                state: state,
                onRetry: () => ref.read(reviewsProvider.notifier).loadMore(),
              ),
            ],
          );
        },
      ),
    );
  }
}
