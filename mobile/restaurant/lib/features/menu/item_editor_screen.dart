import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/net_image.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../../app/routes.dart';
import '../shared/models.dart';
import '../shared/providers.dart';
import '../shared/repository.dart';
import '../shared/widgets.dart';

/// Création ou modification d'un plat (champs de CreateMenuItemDto /
/// UpdateMenuItemDto, rien de plus).
class ItemEditorScreen extends ConsumerStatefulWidget {
  const ItemEditorScreen({super.key, this.itemId});

  final String? itemId;

  @override
  ConsumerState<ItemEditorScreen> createState() => _ItemEditorScreenState();
}

class _ItemEditorScreenState extends ConsumerState<ItemEditorScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _stock = TextEditingController();
  final _max = TextEditingController();
  String? _categoryId;
  bool _available = true;
  bool _initialised = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _description, _price, _stock, _max]) {
      c.dispose();
    }
    super.dispose();
  }

  MenuItem? _find(OwnerMenu? menu) {
    if (menu == null || widget.itemId == null) return null;
    for (final s in menu.sections) {
      for (final i in s.items) {
        if (i.id == widget.itemId) return i;
      }
    }
    return null;
  }

  void _init(MenuItem? item) {
    if (_initialised) return;
    _initialised = true;
    if (item == null) return;
    _name.text = item.name;
    _description.text = item.description ?? '';
    _price.text = '${item.price}';
    _stock.text = item.stock?.toString() ?? '';
    _max.text = item.maxQuantity?.toString() ?? '';
    _categoryId = item.categoryId;
    _available = item.isAvailable;
  }

  int? _int(TextEditingController c) =>
      c.text.trim().isEmpty ? null : int.tryParse(c.text.trim());

  Future<void> _save(MenuItem? existing) async {
    FocusScope.of(context).unfocus();
    if (!_form.currentState!.validate()) return;
    final r = ref.read(currentRestaurantProvider);
    if (r == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final Json data = {
      'name': _name.text.trim(),
      'description': _description.text.trim(),
      'price': _int(_price),
      'isAvailable': _available,
      // Champ vide = illimité / sans maximum (null accepté par le serveur).
      'stock': _int(_stock),
      'maxQuantity': _int(_max),
    };
    final repo = ref.read(restaurantRepositoryProvider);
    try {
      if (existing == null) {
        final created = await repo.createItem(r.id, {
          ...data,
          'categoryId': ?_categoryId,
        });
        ref.invalidate(ownerMenuProvider);
        if (mounted) context.pushReplacement(Routes.item(created.id));
        if (mounted) {
          showRiiSnack(
            context,
            'Plat ajouté. Vous pouvez maintenant ajouter sa photo.',
          );
        }
      } else {
        await repo.updateItem(r.id, existing.id, {
          ...data,
          'categoryId': _categoryId,
        });
        ref.invalidate(ownerMenuProvider);
        if (mounted) showRiiSnack(context, 'Modifications enregistrées');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _photo(MenuItem item) async {
    final r = ref.read(currentRestaurantProvider);
    if (r == null) return;
    final file = await pickPhoto(context);
    if (file == null || !mounted) return;
    final ok = await uploadWithProgress(
      context,
      (progress) => ref
          .read(restaurantRepositoryProvider)
          .uploadItemImage(r.id, item.id, file, onProgress: progress),
    );
    if (ok) ref.invalidate(ownerMenuProvider);
  }

  Future<void> _delete(MenuItem item) async {
    final r = ref.read(currentRestaurantProvider);
    if (r == null) return;
    final ok = await confirmDialog(
      context,
      title: 'Supprimer « ${item.name} » ?',
      message:
          'Le plat ne sera plus proposé. Les commandes passées gardent leur détail.',
      confirmLabel: 'Supprimer',
      destructive: true,
    );
    if (!ok) return;
    try {
      await ref.read(restaurantRepositoryProvider).deleteItem(r.id, item.id);
      ref.invalidate(ownerMenuProvider);
      if (mounted) context.pop();
    } on ApiException catch (e) {
      if (mounted) showRiiSnack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(ownerMenuProvider).value;
    final item = _find(menu);
    if (widget.itemId != null && menu == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    _init(item);
    final t = context.text;
    final categories = menu?.categories ?? const [];
    return Scaffold(
      appBar: AppBar(
        title: Text(item == null ? 'Nouveau plat' : 'Modifier le plat'),
        actions: [
          if (item != null)
            IconButton(
              tooltip: 'Supprimer',
              onPressed: () => _delete(item),
              icon: const Icon(Icons.delete_outline_rounded),
            ),
        ],
      ),
      body: Form(
        key: _form,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.all(RiiSpace.gutter),
          children: [
            if (item != null) ...[
              AspectRatio(
                aspectRatio: 16 / 9,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    NetImage(
                      url: item.imageUrl,
                      borderRadius: RiiRadius.mdAll,
                      fallbackIcon: Icons.add_a_photo_outlined,
                    ),
                    Positioned(
                      right: RiiSpace.sm,
                      bottom: RiiSpace.sm,
                      child: RiiButton(
                        label: item.imageUrl == null
                            ? 'Ajouter une photo'
                            : 'Changer la photo',
                        icon: Icons.photo_library_outlined,
                        small: true,
                        expand: false,
                        onPressed: () => _photo(item),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: RiiSpace.lg),
            ],
            TextFormField(
              controller: _name,
              enabled: !_saving,
              maxLength: 120,
              textCapitalization: TextCapitalization.sentences,
              validator: (v) => (v?.trim().isEmpty ?? true)
                  ? 'Le nom est obligatoire.'
                  : null,
              decoration: const InputDecoration(
                labelText: 'Nom du plat *',
                counterText: '',
              ),
            ),
            const SizedBox(height: RiiSpace.md),
            TextFormField(
              controller: _price,
              enabled: !_saving,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) {
                final n = int.tryParse(v?.trim() ?? '');
                if (n == null) return 'Le prix est obligatoire.';
                if (n > 1000000) {
                  return 'Prix trop élevé (1 000 000 FCFA maximum).';
                }
                return null;
              },
              decoration: const InputDecoration(
                labelText: 'Prix *',
                suffixText: 'FCFA',
              ),
            ),
            const SizedBox(height: RiiSpace.md),
            DropdownButtonFormField<String?>(
              initialValue: categories.any((c) => c.id == _categoryId)
                  ? _categoryId
                  : null,
              decoration: const InputDecoration(labelText: 'Catégorie'),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('Sans catégorie'),
                ),
                for (final c in categories)
                  DropdownMenuItem<String?>(value: c.id, child: Text(c.name)),
              ],
              onChanged: _saving
                  ? null
                  : (v) => setState(() => _categoryId = v),
            ),
            const SizedBox(height: RiiSpace.md),
            TextFormField(
              controller: _description,
              enabled: !_saving,
              maxLength: 300,
              minLines: 2,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Description'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _available,
              onChanged: _saving ? null : (v) => setState(() => _available = v),
              title: Text('Disponible à la commande', style: t.titleSmall),
            ),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _stock,
                    enabled: !_saving,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(
                      labelText: 'Stock',
                      helperText: 'Vide = illimité',
                    ),
                  ),
                ),
                const SizedBox(width: RiiSpace.md),
                Expanded(
                  child: TextFormField(
                    controller: _max,
                    enabled: !_saving,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    validator: (v) {
                      final n = int.tryParse(v?.trim() ?? '');
                      if (v == null || v.trim().isEmpty) return null;
                      return n == null || n < 1 || n > 100
                          ? 'Entre 1 et 100.'
                          : null;
                    },
                    decoration: const InputDecoration(
                      labelText: 'Max par commande',
                      helperText: 'Vide = 50',
                    ),
                  ),
                ),
              ],
            ),
            if (item != null) ...[
              const SizedBox(height: RiiSpace.lg),
              RiiCard(
                onTap: () => context.push(Routes.options(item.id)),
                child: Row(
                  children: [
                    const Icon(Icons.tune_rounded),
                    const SizedBox(width: RiiSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Options et suppléments', style: t.titleSmall),
                          Text(
                            item.optionGroups.isEmpty
                                ? 'Aucune option'
                                : item.optionGroups
                                      .map((g) => g.name)
                                      .join(', '),
                            style: t.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded),
                  ],
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: RiiSpace.md),
              InlineBanner(message: _error!, tone: BannerTone.danger),
            ],
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RiiSpace.gutter),
          child: RiiButton(
            label: item == null ? 'Créer le plat' : 'Enregistrer',
            loading: _saving,
            onPressed: () => _save(item),
          ),
        ),
      ),
    );
  }
}
