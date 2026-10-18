import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'address_models.dart';
import 'address_repository.dart';

IconData addressIcon(AddressLabel label) => switch (label) {
  AddressLabel.maison => Icons.home_outlined,
  AddressLabel.travail => Icons.work_outline_rounded,
  AddressLabel.autre => Icons.place_outlined,
};

/// Carnet d'adresses du compte.
class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final addresses = ref.watch(addressesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Mes adresses')),
      body: addresses.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(addressesProvider),
        ),
        data: (list) => list.isEmpty
            ? const EmptyState(
                icon: Icons.place_outlined,
                title: 'Aucune adresse enregistrée',
                message:
                    'Ajoutez votre maison, votre bureau… pour commander plus vite.',
              )
            : ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: RiiSpace.sm),
                itemCount: list.length,
                separatorBuilder: (_, _) =>
                    Divider(indent: 72, color: context.palette.line),
                itemBuilder: (context, index) => AddressTile(
                  address: list[index],
                  onTap: () =>
                      context.push(Routes.addressEdit, extra: list[index]),
                  trailing: PopupMenuButton<String>(
                    tooltip: 'Options',
                    onSelected: (value) async {
                      if (value == 'delete') {
                        final ok = await confirmDialog(
                          context,
                          title: 'Supprimer cette adresse ?',
                          message: list[index].line,
                          confirmLabel: 'Supprimer',
                          destructive: true,
                        );
                        if (!ok) return;
                        try {
                          await ref
                              .read(addressesProvider.notifier)
                              .delete(list[index].id);
                        } on ApiException catch (error) {
                          if (context.mounted) {
                            showRiiSnack(context, error.message);
                          }
                        }
                      } else {
                        await context.push(
                          Routes.addressEdit,
                          extra: list[index],
                        );
                      }
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'edit', child: Text('Modifier')),
                      PopupMenuItem(value: 'delete', child: Text('Supprimer')),
                    ],
                  ),
                ),
              ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RiiSpace.gutter),
          child: RiiButton(
            label: 'Ajouter une adresse',
            icon: Icons.add_rounded,
            variant: RiiButtonVariant.secondary,
            onPressed: () => context.push(Routes.addressNew),
          ),
        ),
      ),
    );
  }
}

class AddressTile extends StatelessWidget {
  const AddressTile({
    super.key,
    required this.address,
    this.onTap,
    this.trailing,
    this.selected = false,
  });

  final Address address;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    return ListTile(
      onTap: onTap,
      selected: selected,
      leading: CircleAvatar(
        backgroundColor: selected ? p.brandSoft : p.canvas,
        foregroundColor: selected ? p.brand : p.inkSoft,
        child: Icon(addressIcon(address.label), size: 22),
      ),
      title: Row(
        children: [
          Flexible(child: Text(address.title, style: t.titleSmall)),
          if (address.isDefault) ...[
            const SizedBox(width: RiiSpace.sm),
            const Tag(label: 'Principale', tone: TagTone.brand),
          ],
        ],
      ),
      subtitle: Text(
        [address.line, ?address.landmark].join('\n'),
        style: t.bodySmall,
        maxLines: 3,
        overflow: TextOverflow.ellipsis,
      ),
      isThreeLine: address.landmark != null,
      trailing:
          trailing ??
          (selected ? Icon(Icons.check_circle_rounded, color: p.brand) : null),
    );
  }
}
