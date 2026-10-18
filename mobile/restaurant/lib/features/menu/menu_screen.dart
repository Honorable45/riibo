import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/net_image.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../../app/routes.dart';
import '../shared/models.dart';
import '../shared/providers.dart';
import '../shared/repository.dart';
import '../shared/widgets.dart';

class MenuScreen extends ConsumerWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Menu'),
        actions: [
          TextButton.icon(
            onPressed: () => showRiiSheet<void>(
              context,
              builder: (_) => const _CategoriesSheet(),
            ),
            icon: const Icon(Icons.folder_outlined),
            label: const Text('Catégories'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(Routes.itemNew),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Ajouter un plat'),
      ),
      body: RestaurantGate(
        allowUnapproved: true,
        builder: (context, r) {
          final async = ref.watch(ownerMenuProvider);
          return async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(ownerMenuProvider),
            ),
            data: (menu) => menu.itemCount == 0
                ? const EmptyState(
                    icon: Icons.restaurant_menu_outlined,
                    title: 'Votre menu est vide',
                    message:
                        'Ajoutez vos catégories puis vos plats avec leur prix.',
                  )
                : RefreshIndicator(
                    onRefresh: () => ref.refresh(ownerMenuProvider.future),
                    child: ListView(
                      padding: const EdgeInsets.only(bottom: 96),
                      children: [
                        for (final section in menu.sections) ...[
                          SectionHeader(
                            title: '${section.name} (${section.items.length})',
                          ),
                          for (final item in section.items)
                            _ItemRow(restaurantId: r.id, item: item),
                        ],
                      ],
                    ),
                  ),
          );
        },
      ),
    );
  }
}

class _ItemRow extends ConsumerStatefulWidget {
  const _ItemRow({required this.restaurantId, required this.item});

  final String restaurantId;
  final MenuItem item;

  @override
  ConsumerState<_ItemRow> createState() => _ItemRowState();
}

class _ItemRowState extends ConsumerState<_ItemRow> {
  bool _saving = false;

  /// Disponibilité confirmée par le serveur avant d'être affichée.
  Future<void> _toggle(bool value) async {
    setState(() => _saving = true);
    try {
      await ref.read(restaurantRepositoryProvider).updateItem(
        widget.restaurantId,
        widget.item.id,
        {'isAvailable': value},
      );
      unawaited(HapticFeedback.selectionClick());
    } on ApiException catch (e) {
      if (mounted) showRiiSnack(context, e.message);
    } finally {
      ref.invalidate(ownerMenuProvider);
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final t = context.text;
    final p = context.palette;
    final status = item.soldOut
        ? 'Épuisé (stock 0)'
        : !item.isAvailable
        ? 'Indisponible'
        : item.stock != null
        ? 'Stock : ${item.stock}'
        : null;
    return InkWell(
      onTap: () => context.push(Routes.item(item.id)),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: RiiSpace.gutter,
          vertical: RiiSpace.sm,
        ),
        child: Row(
          children: [
            SizedBox.square(
              dimension: 56,
              child: NetImage(
                url: item.imageUrl,
                borderRadius: RiiRadius.smAll,
              ),
            ),
            const SizedBox(width: RiiSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.name,
                    style: t.titleSmall!.copyWith(
                      color: item.isAvailable ? p.ink : p.subtle,
                    ),
                  ),
                  Text(
                    [
                      formatXof(item.price),
                      if (item.optionGroups.isNotEmpty)
                        '${item.optionGroups.length} groupe(s) d’options',
                      ?status,
                    ].join(' · '),
                    style: t.bodySmall!.copyWith(
                      color: status != null && !item.isAvailable || item.soldOut
                          ? p.danger
                          : null,
                    ),
                  ),
                ],
              ),
            ),
            Semantics(
              label: 'Disponible à la commande',
              child: Switch(
                value: item.isAvailable,
                onChanged: _saving ? null : _toggle,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Catégories : création, renommage, ordre, suppression (les plats ne sont
/// jamais supprimés : ils passent « sans catégorie », règle du serveur).
class _CategoriesSheet extends ConsumerStatefulWidget {
  const _CategoriesSheet();

  @override
  ConsumerState<_CategoriesSheet> createState() => _CategoriesSheetState();
}

class _CategoriesSheetState extends ConsumerState<_CategoriesSheet> {
  final _name = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _run(
    Future<void> Function(RestaurantRepository repo, String id) action, {
    String? done,
  }) async {
    final r = ref.read(currentRestaurantProvider);
    if (r == null || _busy) return;
    setState(() => _busy = true);
    try {
      await action(ref.read(restaurantRepositoryProvider), r.id);
      if (done != null && mounted) showRiiSnack(context, done);
    } on ApiException catch (e) {
      if (mounted) showRiiSnack(context, e.message);
    } finally {
      ref.invalidate(ownerMenuProvider);
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rename(String categoryId, String current) async {
    final controller = TextEditingController(text: current);
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Renommer la catégorie'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 60,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty) return;
    await _run((repo, id) => repo.updateCategory(id, categoryId, name: name));
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(ownerMenuProvider).value;
    final categories = menu?.categories ?? const [];
    final t = context.text;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        0,
        RiiSpace.gutter,
        RiiSpace.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Catégories du menu', style: t.titleLarge),
          const SizedBox(height: RiiSpace.md),
          for (final (index, c) in categories.indexed)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(c.name, style: t.titleSmall),
              subtitle: Text(
                '${menu!.sections.firstWhere((s) => s.id == c.id).items.length} plat(s)',
                style: t.bodySmall,
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'Monter',
                    onPressed: index == 0 || _busy
                        ? null
                        : () => _run(
                            (repo, id) => repo.updateCategory(
                              id,
                              c.id,
                              position: index - 1,
                            ),
                          ),
                    icon: const Icon(Icons.arrow_upward_rounded),
                  ),
                  IconButton(
                    tooltip: 'Renommer',
                    onPressed: _busy ? null : () => _rename(c.id, c.name),
                    icon: const Icon(Icons.edit_outlined),
                  ),
                  IconButton(
                    tooltip: 'Supprimer',
                    onPressed: _busy
                        ? null
                        : () async {
                            final ok = await confirmDialog(
                              context,
                              title: 'Supprimer « ${c.name} » ?',
                              message:
                                  'Ses plats ne sont pas supprimés : ils passent dans « Sans catégorie ».',
                              confirmLabel: 'Supprimer',
                              destructive: true,
                            );
                            if (ok) {
                              await _run(
                                (repo, id) => repo.deleteCategory(id, c.id),
                                done: 'Catégorie supprimée',
                              );
                            }
                          },
                    icon: const Icon(Icons.delete_outline_rounded),
                  ),
                ],
              ),
            ),
          const SizedBox(height: RiiSpace.md),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _name,
                  maxLength: 60,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Nouvelle catégorie',
                    counterText: '',
                  ),
                ),
              ),
              const SizedBox(width: RiiSpace.sm),
              RiiButton(
                label: 'Ajouter',
                expand: false,
                loading: _busy,
                onPressed: () {
                  final name = _name.text.trim();
                  if (name.isEmpty) return;
                  _name.clear();
                  _run(
                    (repo, id) => repo.createCategory(id, name),
                    done: 'Catégorie ajoutée',
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}
