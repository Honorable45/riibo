import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../addresses/address_models.dart';
import '../addresses/address_repository.dart';
import '../addresses/addresses_screen.dart';
import '../cart/cart_controller.dart';
import '../cart/cart_models.dart';
import '../orders/order_models.dart';
import '../orders/orders_providers.dart';
import '../orders/orders_repository.dart';
import 'order_submission.dart';

enum _Phase { editing, submitting, verifying, uncertain }

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  DeliveryType _type = DeliveryType.delivery;
  String? _addressId;
  final _contact = TextEditingController();
  final _notes = TextEditingController();
  _Phase _phase = _Phase.editing;
  String? _error;
  late final OrderSubmitter _submitter = OrderSubmitter(
    ref.read(ordersRepositoryProvider),
  );

  @override
  void dispose() {
    _contact.dispose();
    _notes.dispose();
    super.dispose();
  }

  bool get _busy => _phase != _Phase.editing;

  String? _selectedAddressId(List<Address> addresses) {
    if (_addressId != null && addresses.any((a) => a.id == _addressId)) {
      return _addressId;
    }
    return addresses.isEmpty ? null : addresses.first.id;
  }

  Future<void> _addAddress() async {
    final created = await context.push<Address>(Routes.addressNew);
    if (created != null && mounted) setState(() => _addressId = created.id);
  }

  Future<void> _submit(Cart cart, List<Address> addresses) async {
    if (_busy) return; // jamais deux envois
    final addressId = _selectedAddressId(addresses);
    if (_type == DeliveryType.delivery && addressId == null) {
      setState(() => _error = 'Ajoutez une adresse de livraison.');
      return;
    }
    String? contact;
    if (_contact.text.trim().isNotEmpty) {
      contact = PhoneNumbers.normalize(_contact.text);
      if (contact == null) {
        setState(() => _error = 'Numéro de contact invalide.');
        return;
      }
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _phase = _Phase.submitting;
      _error = null;
    });
    final outcome = await _submitter.submit(
      PlaceOrderRequest(
        deliveryType: _type,
        paymentMethod: PaymentMethod.cashOnDelivery,
        addressId: addressId,
        contactPhone: contact,
        notes: _notes.text,
      ),
      restaurantId: cart.restaurant!.id,
    );
    _handle(outcome);
  }

  Future<void> _verifyAgain(Cart cart) async {
    setState(() => _phase = _Phase.verifying);
    _handle(await _submitter.verify(restaurantId: cart.restaurant!.id));
  }

  void _handle(SubmissionOutcome outcome) {
    if (!mounted) return;
    switch (outcome) {
      case OrderPlaced(:final orderId):
        HapticFeedback.mediumImpact();
        // Le panier a été consommé par le serveur : relecture.
        ref.invalidate(cartProvider);
        ref.invalidate(activeOrdersProvider);
        context.pushReplacement(Routes.order(orderId, justPlaced: true));
      case OrderRejected(:final error):
        // Panier modifié côté serveur (prix, stock…) : on le relit.
        ref.read(cartProvider.notifier).refresh();
        setState(() {
          _phase = _Phase.editing;
          _error = error.message;
        });
      case OrderUncertain():
        setState(() => _phase = _Phase.uncertain);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final cart = ref.watch(cartProvider).value;
    final addresses = ref.watch(addressesProvider);

    if (user == null ||
        cart == null ||
        cart.isEmpty ||
        cart.restaurant == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Commande')),
        body: EmptyState(
          icon: Icons.shopping_bag_outlined,
          title: 'Votre panier est vide',
          actionLabel: 'Retour à l’accueil',
          onAction: () => context.go(Routes.home),
        ),
      );
    }

    if (_phase == _Phase.uncertain || _phase == _Phase.verifying) {
      return PopScope(
        canPop: false,
        child: Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            title: const Text('Commande'),
          ),
          body: Padding(
            padding: const EdgeInsets.all(RiiSpace.xxl),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.wifi_off_rounded,
                  size: 40,
                  color: context.palette.warning,
                ),
                const SizedBox(height: RiiSpace.lg),
                Text(
                  'Connexion interrompue',
                  style: context.text.titleLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: RiiSpace.sm),
                Text(
                  'Nous ne savons pas encore si votre commande a été enregistrée. '
                  'Ne la renvoyez pas : vérifiez d’abord son état.',
                  style: context.text.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: RiiSpace.xxl),
                RiiButton(
                  label: 'Vérifier ma commande',
                  loading: _phase == _Phase.verifying,
                  onPressed: () => _verifyAgain(cart),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final addressList = addresses.value ?? const <Address>[];
    final selectedAddress = _selectedAddressId(addressList);
    final deliveryFee = _type == DeliveryType.delivery ? cart.deliveryFee : 0;
    final total = cart.subtotal - cart.discount + deliveryFee;
    final t = context.text;

    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(title: const Text('Finaliser la commande')),
        body: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.only(bottom: RiiSpace.xxl),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                RiiSpace.gutter,
                RiiSpace.sm,
                RiiSpace.gutter,
                0,
              ),
              child: SegmentedButton<DeliveryType>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(
                    value: DeliveryType.delivery,
                    icon: Icon(Icons.delivery_dining_outlined),
                    label: Text('Livraison'),
                  ),
                  ButtonSegment(
                    value: DeliveryType.pickup,
                    icon: Icon(Icons.storefront_outlined),
                    label: Text('À emporter'),
                  ),
                ],
                selected: {_type},
                onSelectionChanged: _busy
                    ? null
                    : (v) => setState(() => _type = v.first),
              ),
            ),
            if (_type == DeliveryType.delivery) ...[
              const SectionHeader(title: 'Adresse de livraison'),
              addresses.when(
                loading: () => const Padding(
                  padding: EdgeInsets.all(RiiSpace.lg),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (error, _) => ErrorState(
                  error: error,
                  compact: true,
                  onRetry: () => ref.invalidate(addressesProvider),
                ),
                data: (list) => Column(
                  children: [
                    for (final address in list)
                      AddressTile(
                        address: address,
                        selected: address.id == selectedAddress,
                        onTap: _busy
                            ? null
                            : () => setState(() => _addressId = address.id),
                      ),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: RiiSpace.gutter,
                      ),
                      child: RiiButton(
                        label: list.isEmpty
                            ? 'Ajouter mon adresse'
                            : 'Ajouter une autre adresse',
                        icon: Icons.add_location_alt_outlined,
                        variant: list.isEmpty
                            ? RiiButtonVariant.primary
                            : RiiButtonVariant.ghost,
                        onPressed: _busy ? null : _addAddress,
                      ),
                    ),
                  ],
                ),
              ),
            ] else ...[
              const SectionHeader(title: 'Retrait au restaurant'),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: RiiSpace.gutter,
                ),
                child: InlineBanner(
                  message:
                      'Vous récupérez la commande chez ${cart.restaurant!.name} quand elle est prête.',
                  icon: Icons.storefront_outlined,
                ),
              ),
            ],
            const SectionHeader(title: 'Contact'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
              child: Column(
                children: [
                  TextField(
                    controller: _contact,
                    enabled: !_busy,
                    keyboardType: TextInputType.phone,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
                      LengthLimitingTextInputFormatter(20),
                    ],
                    decoration: InputDecoration(
                      labelText: 'Numéro joignable (facultatif)',
                      hintText: user.phone == null
                          ? null
                          : PhoneNumbers.display(user.phone!),
                      helperText: 'Par défaut : le numéro de votre compte.',
                    ),
                  ),
                  const SizedBox(height: RiiSpace.md),
                  TextField(
                    controller: _notes,
                    enabled: !_busy,
                    maxLength: 300,
                    maxLines: 3,
                    minLines: 1,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'Précision pour la commande (facultatif)',
                    ),
                  ),
                ],
              ),
            ),
            const SectionHeader(title: 'Paiement'),
            for (final method in PaymentMethod.values)
              _PaymentTile(
                method: method,
                selected: method == PaymentMethod.cashOnDelivery,
              ),
            const SectionHeader(title: 'Récapitulatif'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
              child: Column(
                children: [
                  for (final line in cart.items)
                    _Row(
                      '${line.quantity} × ${line.name}',
                      formatXof(line.lineTotal),
                    ),
                  Divider(height: RiiSpace.xl, color: context.palette.line),
                  _Row('Sous-total', formatXof(cart.subtotal)),
                  if (cart.discount > 0)
                    _Row(
                      'Remise (${cart.promoCode})',
                      '−${formatXof(cart.discount)}',
                    ),
                  _Row(
                    'Livraison',
                    deliveryFee == 0 ? 'Offerte' : formatXof(deliveryFee),
                  ),
                  const SizedBox(height: RiiSpace.xs),
                  _Row('Total à payer', formatXof(total), style: t.titleMedium),
                ],
              ),
            ),
            if (cart.blockers.isNotEmpty || !cart.canCheckout)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  RiiSpace.gutter,
                  RiiSpace.lg,
                  RiiSpace.gutter,
                  0,
                ),
                child: InlineBanner(
                  tone: BannerTone.warning,
                  message: cart.blockers.isEmpty
                      ? 'Votre panier doit être corrigé avant de commander.'
                      : cart.blockers.join('\n'),
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  RiiSpace.gutter,
                  RiiSpace.lg,
                  RiiSpace.gutter,
                  0,
                ),
                child: InlineBanner(message: _error!, tone: BannerTone.danger),
              ),
          ],
        ),
        bottomNavigationBar: DecoratedBox(
          decoration: BoxDecoration(
            color: context.palette.surface,
            border: Border(top: BorderSide(color: context.palette.line)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(RiiSpace.gutter),
              child: RiiButton(
                label: 'Confirmer la commande',
                trailing: Text(formatXof(total)),
                loading: _phase == _Phase.submitting,
                onPressed: cart.canCheckout
                    ? () => _submit(cart, addressList)
                    : null,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.style});

  final String label;
  final String value;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final s = style ?? context.text.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label, style: s)),
          const SizedBox(width: RiiSpace.md),
          Text(value, style: s),
        ],
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.method, required this.selected});

  final PaymentMethod method;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = context.text;
    final icon = switch (method) {
      PaymentMethod.cashOnDelivery => Icons.payments_outlined,
      _ => Icons.phone_android_rounded,
    };
    return Semantics(
      enabled: method.available,
      selected: selected,
      child: ListTile(
        enabled: method.available,
        leading: Icon(icon, color: method.available ? p.inkSoft : p.subtle),
        title: Text(
          method.label,
          style: t.titleSmall!.copyWith(
            color: method.available ? p.ink : p.subtle,
          ),
        ),
        subtitle: Text(
          method.available
              ? 'Réglez en espèces à la remise de la commande.'
              : 'Pas encore disponible',
          style: t.bodySmall,
        ),
        trailing: method.available
            ? Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_off_rounded,
                color: selected ? p.brand : p.muted,
              )
            : const Tag(label: 'Bientôt'),
      ),
    );
  }
}
