import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/format/money.dart';
import '../cart_controller.dart';

/// Barre flottante « Voir le panier » : visible dès qu'il contient un plat.
class CartBar extends ConsumerWidget {
  const CartBar({super.key, this.bottomSafeArea = true});

  final bool bottomSafeArea;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider).value;
    final p = context.palette;
    final t = context.text;
    final visible = cart != null && !cart.isEmpty;
    return AnimatedSize(
      duration: RiiDurations.normal,
      curve: Curves.easeOutCubic,
      child: !visible
          ? const SizedBox(width: double.infinity)
          : SafeArea(
              top: false,
              bottom: bottomSafeArea,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  RiiSpace.gutter,
                  RiiSpace.sm,
                  RiiSpace.gutter,
                  RiiSpace.sm,
                ),
                child: Semantics(
                  button: true,
                  label:
                      'Voir le panier, ${cart.itemCount} article${cart.itemCount > 1 ? 's' : ''}, ${formatXofLong(cart.subtotal)}',
                  child: Material(
                    color: p.brand,
                    borderRadius: RiiRadius.mdAll,
                    elevation: 0,
                    child: InkWell(
                      borderRadius: RiiRadius.mdAll,
                      onTap: () => context.push(Routes.cart),
                      child: Container(
                        height: 56,
                        padding: const EdgeInsets.symmetric(
                          horizontal: RiiSpace.lg,
                        ),
                        decoration: const BoxDecoration(
                          borderRadius: RiiRadius.mdAll,
                          boxShadow: RiiShadows.floating,
                        ),
                        child: ExcludeSemantics(
                          child: Row(
                            children: [
                              Container(
                                constraints: const BoxConstraints(minWidth: 28),
                                height: 28,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                ),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.18),
                                  borderRadius: RiiRadius.smAll,
                                ),
                                child: Text(
                                  '${cart.itemCount}',
                                  style: t.labelLarge!.copyWith(
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                              const SizedBox(width: RiiSpace.md),
                              Expanded(
                                child: Text(
                                  cart.restaurant?.name == null
                                      ? 'Voir le panier'
                                      : 'Panier · ${cart.restaurant!.name}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: t.labelLarge!.copyWith(
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                              Text(
                                formatXof(cart.subtotal),
                                style: t.labelLarge!.copyWith(
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}
