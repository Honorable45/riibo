import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/net_image.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/skeleton.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../catalog/widgets/restaurant_card.dart';
import '../restaurant/dish_selection.dart';
import '../restaurant/restaurant_repository.dart';
import '../restaurant/widgets/dish_sheet.dart';
import 'add_to_cart.dart';
import 'cart_controller.dart';
import 'cart_models.dart';

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  @override
  void initState() {
    super.initState();
    // Prix et disponibilités ont pu changer depuis l'ajout : relecture.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ref.read(currentUserProvider) != null) {
        ref.read(cartProvider.notifier).refresh();
      }
    });
  }

  void _report(ApiException? error) {
    if (error != null && mounted) showRiiSnack(context, error.message);
  }

  Future<void> _clear() async {
    final ok = await confirmDialog(
      context,
      title: 'Vider le panier ?',
      message: 'Tous les plats seront retirés.',
      confirmLabel: 'Vider',
      destructive: true,
    );
    if (ok) _report(await ref.read(cartProvider.notifier).clear());
  }

  Future<void> _editLine(Cart cart, CartLine line) async {
    final slug = cart.restaurant?.slug;
    if (slug == null) return;
    try {
      final menu = await ref.read(restaurantMenuProvider(slug).future);
      final item = menu.itemById(line.menuItemId);
      if (!mounted) return;
      if (item == null) {
        showRiiSnack(context, 'Ce plat n’est plus proposé par le restaurant.');
        return;
      }
      await showDishSheet(
        context,
        item: item,
        restaurantOpen: true,
        actionLabel: 'Mettre à jour',
        initial: DishSelection(
          item,
          quantity: line.quantity,
          optionIds: line.options.map((o) => o.id).toSet(),
          note: line.note ?? '',
        ),
        onAdd: (selection) async {
          final error = await ref
              .read(cartProvider.notifier)
              .updateLine(
                line.id,
                quantity: selection.quantity,
                optionIds: selection.orderedOptionIds,
                note: selection.note,
              );
          _report(error);
          return error == null;
        },
      );
    } on ApiException catch (error) {
      _report(error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final cart = ref.watch(cartProvider);
    final hasItems = cart.value?.isEmpty == false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Panier'),
        actions: [
          if (hasItems)
            TextButton(onPressed: _clear, child: const Text('Vider')),
        ],
      ),
      body: user == null
          ? EmptyState(
              icon: Icons.shopping_bag_outlined,
              title: 'Connectez-vous pour commander',
              message: 'Votre panier est enregistré sur votre compte.',
              actionLabel: 'Se connecter',
              onAction: () => ensureSignedIn(context, ref),
            )
          : cart.when(
              skipLoadingOnRefresh: true,
              skipLoadingOnReload: true,
              loading: () => const _CartSkeleton(),
              error: (error, _) => ErrorState(
                error: error,
                onRetry: () => ref.invalidate(cartProvider),
              ),
              data: (cart) => cart.isEmpty
                  ? EmptyState(
                      icon: Icons.shopping_bag_outlined,
                      title: 'Votre panier est vide',
                      message: 'Ajoutez des plats depuis un restaurant.',
                      actionLabel: 'Découvrir les restaurants',
                      onAction: () => context.go(Routes.home),
                    )
                  : RefreshIndicator(
                      onRefresh: ref.read(cartProvider.notifier).refresh,
                      child: _CartContent(
                        cart: cart,
                        onQuantity: (line, q) async => _report(
                          await ref
                              .read(cartProvider.notifier)
                              .setQuantity(line.id, q),
                        ),
                        onRemove: (line) async => _report(
                          await ref.read(cartProvider.notifier).remove(line.id),
                        ),
                        onEdit: (line) => _editLine(cart, line),
                      ),
                    ),
            ),
      bottomNavigationBar: user != null && hasItems
          ? _CheckoutBar(cart: cart.value!)
          : null,
    );
  }
}

class _CartContent extends StatelessWidget {
  const _CartContent({
    required this.cart,
    required this.onQuantity,
    required this.onRemove,
    required this.onEdit,
  });

  final Cart cart;
  final void Function(CartLine, int) onQuantity;
  final ValueChanged<CartLine> onRemove;
  final ValueChanged<CartLine> onEdit;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final restaurant = cart.restaurant;
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: RiiSpace.xxl),
      children: [
        if (restaurant != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              RiiSpace.gutter,
              RiiSpace.sm,
              RiiSpace.gutter,
              RiiSpace.md,
            ),
            child: Row(
              children: [
                SizedBox.square(
                  dimension: 44,
                  child: ClipRRect(
                    borderRadius: RiiRadius.smAll,
                    child: restaurant.logoUrl != null
                        ? NetImage(url: restaurant.logoUrl, fit: BoxFit.contain)
                        : RestaurantMonogram(
                            name: restaurant.name,
                            small: true,
                          ),
                  ),
                ),
                const SizedBox(width: RiiSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(restaurant.name, style: t.titleMedium),
                      Text(
                        restaurant.isOpen ? 'Ouvert' : 'Fermé pour le moment',
                        style: t.bodySmall!.copyWith(
                          color: restaurant.isOpen ? p.success : p.danger,
                        ),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () =>
                      context.push(Routes.restaurant(restaurant.slug)),
                  child: const Text('Ajouter'),
                ),
              ],
            ),
          ),
        for (final blocker in cart.blockers)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              RiiSpace.gutter,
              0,
              RiiSpace.gutter,
              RiiSpace.sm,
            ),
            child: InlineBanner(message: blocker, tone: BannerTone.warning),
          ),
        const SizedBox(height: RiiSpace.xs),
        for (final line in cart.items) ...[
          _LineTile(
            line: line,
            onQuantity: (q) => onQuantity(line, q),
            onRemove: () => onRemove(line),
            onEdit: () => onEdit(line),
          ),
          Divider(
            indent: RiiSpace.gutter,
            endIndent: RiiSpace.gutter,
            color: p.line,
          ),
        ],
        _PromoSection(cart: cart),
        _Summary(cart: cart),
      ],
    );
  }
}

class _LineTile extends StatelessWidget {
  const _LineTile({
    required this.line,
    required this.onQuantity,
    required this.onRemove,
    required this.onEdit,
  });

  final CartLine line;
  final ValueChanged<int> onQuantity;
  final VoidCallback onRemove;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final options = line.options
        .map(
          (o) => o.priceDelta > 0
              ? '${o.name} (+${formatXof(o.priceDelta)})'
              : o.name,
        )
        .join(', ');
    return InkWell(
      onTap: line.issue == null ? onEdit : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: RiiSpace.gutter,
          vertical: RiiSpace.md,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (line.imageUrl != null) ...[
                  SizedBox.square(
                    dimension: 56,
                    child: NetImage(
                      url: line.imageUrl,
                      borderRadius: RiiRadius.smAll,
                    ),
                  ),
                  const SizedBox(width: RiiSpace.md),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(line.name, style: t.titleSmall),
                      if (options.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(options, style: t.bodySmall),
                        ),
                      if (line.note != null && line.note!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            '« ${line.note} »',
                            style: t.bodySmall!.copyWith(
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ),
                      const SizedBox(height: 4),
                      Text(
                        '${formatXof(line.unitPrice)} l’unité',
                        style: t.bodySmall,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: RiiSpace.md),
                Text(
                  formatXof(line.lineTotal),
                  style: t.labelLarge!.copyWith(
                    color: line.issue == null ? p.ink : p.subtle,
                    decoration: line.issue == null
                        ? null
                        : TextDecoration.lineThrough,
                  ),
                ),
              ],
            ),
            if (line.issue != null) ...[
              const SizedBox(height: RiiSpace.sm),
              InlineBanner(
                message: line.issue!,
                tone: BannerTone.danger,
                action: TextButton(
                  onPressed: onRemove,
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 36),
                  ),
                  child: const Text('Retirer cet article'),
                ),
              ),
            ],
            const SizedBox(height: RiiSpace.sm),
            Row(
              children: [
                QuantityStepper(
                  value: line.quantity,
                  max: maxLineQuantity,
                  dense: true,
                  onChanged: onQuantity,
                  onRemove: onRemove,
                ),
                const Spacer(),
                if (line.issue == null)
                  TextButton(onPressed: onEdit, child: const Text('Modifier')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PromoSection extends ConsumerStatefulWidget {
  const _PromoSection({required this.cart});

  final Cart cart;

  @override
  ConsumerState<_PromoSection> createState() => _PromoSectionState();
}

class _PromoSectionState extends ConsumerState<_PromoSection> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    final code = _code.text.trim();
    if (code.isEmpty) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await ref.read(cartProvider.notifier).applyPromo(code);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error?.message;
    });
    if (error == null) _code.clear();
  }

  Future<void> _remove() async {
    setState(() => _busy = true);
    final error = await ref.read(cartProvider.notifier).removePromo();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error?.message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final cart = widget.cart;
    final t = context.text;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        RiiSpace.lg,
        RiiSpace.gutter,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Code promo', style: t.titleSmall),
          const SizedBox(height: RiiSpace.sm),
          if (cart.promoCode != null)
            RiiCard(
              padding: const EdgeInsets.symmetric(
                horizontal: RiiSpace.md,
                vertical: RiiSpace.xs,
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.local_offer_outlined,
                    size: 20,
                    color: context.palette.success,
                  ),
                  const SizedBox(width: RiiSpace.sm),
                  Expanded(
                    child: Text(
                      '${cart.promoCode} · −${formatXof(cart.discount)}',
                      style: t.labelLarge,
                    ),
                  ),
                  TextButton(
                    onPressed: _busy ? null : _remove,
                    child: const Text('Retirer'),
                  ),
                ],
              ),
            )
          else
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _code,
                    enabled: !_busy,
                    textCapitalization: TextCapitalization.characters,
                    inputFormatters: [LengthLimitingTextInputFormatter(40)],
                    onSubmitted: (_) => _apply(),
                    decoration: const InputDecoration(
                      hintText: 'Saisir un code',
                    ),
                  ),
                ),
                const SizedBox(width: RiiSpace.sm),
                RiiButton(
                  label: 'Appliquer',
                  expand: false,
                  variant: RiiButtonVariant.secondary,
                  loading: _busy,
                  onPressed: _apply,
                ),
              ],
            ),
          if (cart.promoIssue != null) ...[
            const SizedBox(height: RiiSpace.sm),
            InlineBanner(
              message: cart.promoIssue!,
              tone: BannerTone.warning,
              action: TextButton(
                onPressed: _busy ? null : _remove,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 36),
                ),
                child: const Text('Retirer le code'),
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: RiiSpace.sm),
            InlineBanner(message: _error!, tone: BannerTone.danger),
          ],
        ],
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    Widget row(String label, String value, {TextStyle? style}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style ?? t.bodyMedium)),
          Text(value, style: style ?? t.bodyMedium),
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        RiiSpace.xl,
        RiiSpace.gutter,
        0,
      ),
      child: Column(
        children: [
          row('Sous-total', formatXof(cart.subtotal)),
          if (cart.discount > 0) row('Remise', '−${formatXof(cart.discount)}'),
          row(
            'Livraison',
            cart.deliveryFee == 0 ? 'Offerte' : formatXof(cart.deliveryFee),
          ),
          Divider(height: RiiSpace.xl, color: p.line),
          row('Total estimé', formatXof(cart.total), style: t.titleMedium),
          const SizedBox(height: RiiSpace.xs),
          Text(
            'Le montant final est recalculé par Riiberaka au moment de la commande, avec les prix en vigueur.',
            style: t.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _CheckoutBar extends StatelessWidget {
  const _CheckoutBar({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: p.surface,
        border: Border(top: BorderSide(color: p.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(RiiSpace.gutter),
          child: RiiButton(
            label: cart.canCheckout
                ? 'Continuer'
                : 'Commande impossible pour le moment',
            trailing: cart.canCheckout ? Text(formatXof(cart.total)) : null,
            onPressed: cart.canCheckout
                ? () => context.push(Routes.checkout)
                : null,
          ),
        ),
      ),
    );
  }
}

class _CartSkeleton extends StatelessWidget {
  const _CartSkeleton();

  @override
  Widget build(BuildContext context) => const SkeletonScope(
    child: Padding(
      padding: EdgeInsets.all(RiiSpace.gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SkeletonBox(width: 180, height: 18),
          SizedBox(height: RiiSpace.xl),
          SkeletonBox(height: 64, radius: RiiRadius.md),
          SizedBox(height: RiiSpace.md),
          SkeletonBox(height: 64, radius: RiiRadius.md),
        ],
      ),
    ),
  );
}
