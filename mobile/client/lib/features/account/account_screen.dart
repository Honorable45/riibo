import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import '../cart/add_to_cart.dart';
import '../chat/support.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';

/// Onglet « Compte ».
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final t = context.text;
    final p = context.palette;
    final user = session is SignedIn ? session.user : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Compte')),
      body: ListView(
        children: [
          if (user == null)
            Padding(
              padding: const EdgeInsets.all(RiiSpace.gutter),
              child: RiiCard(
                padding: const EdgeInsets.all(RiiSpace.xl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Bienvenue sur Riiberaka', style: t.titleLarge),
                    const SizedBox(height: RiiSpace.xs),
                    Text(
                      'Connectez-vous avec votre numéro pour commander, suivre vos '
                      'livraisons et retrouver vos adresses.',
                      style: t.bodyMedium!.copyWith(color: p.muted),
                    ),
                    if (session case SignedOut(:final reason?)) ...[
                      const SizedBox(height: RiiSpace.md),
                      InlineBanner(message: reason, tone: BannerTone.warning),
                    ],
                    const SizedBox(height: RiiSpace.lg),
                    RiiButton(
                      label: 'Se connecter',
                      onPressed: () => ensureSignedIn(context, ref),
                    ),
                  ],
                ),
              ),
            )
          else ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(
                RiiSpace.gutter,
                RiiSpace.sm,
                RiiSpace.gutter,
                RiiSpace.lg,
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: p.brandSoft,
                    child: Text(
                      user.firstName.isEmpty
                          ? '?'
                          : user.firstName[0].toUpperCase(),
                      style: t.titleLarge!.copyWith(color: p.brand),
                    ),
                  ),
                  const SizedBox(width: RiiSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.displayName.isEmpty
                              ? 'Mon compte'
                              : user.displayName,
                          style: t.titleLarge,
                        ),
                        if (user.phone != null)
                          Text(
                            PhoneNumbers.display(user.phone!),
                            style: t.bodyMedium!.copyWith(color: p.muted),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            _Section(
              children: [
                _Entry(
                  icon: Icons.receipt_long_outlined,
                  label: 'Mes commandes',
                  onTap: () => context.go(Routes.orders),
                ),
                _Entry(
                  icon: Icons.place_outlined,
                  label: 'Mes adresses',
                  onTap: () => context.push(Routes.addresses),
                ),
                _Entry(
                  icon: Icons.favorite_border_rounded,
                  label: 'Mes favoris',
                  onTap: () => context.push(Routes.favorites),
                ),
                _Entry(
                  icon: Icons.notifications_none_rounded,
                  label: 'Notifications',
                  badge: ref.watch(unreadNotificationsProvider).value ?? 0,
                  onTap: () => context.push(Routes.notifications),
                ),
                _Entry(
                  icon: Icons.person_outline_rounded,
                  label: 'Mon profil',
                  onTap: () => context.push(Routes.profile),
                ),
                _Entry(
                  icon: Icons.support_agent_rounded,
                  label: 'Assistance',
                  onTap: () => openSupportChat(context, ref),
                ),
              ],
            ),
          ],
          if (kDebugMode)
            _Section(
              children: [
                _Entry(
                  icon: Icons.palette_outlined,
                  label: 'Système de design',
                  onTap: () => context.push(Routes.design),
                ),
              ],
            ),
          if (user != null)
            Padding(
              padding: const EdgeInsets.all(RiiSpace.gutter),
              child: RiiButton(
                label: 'Se déconnecter',
                variant: RiiButtonVariant.secondary,
                icon: Icons.logout_rounded,
                onPressed: () async {
                  final ok = await confirmDialog(
                    context,
                    title: 'Se déconnecter ?',
                    message:
                        'Vous devrez recevoir un nouveau code pour vous reconnecter.',
                    confirmLabel: 'Se déconnecter',
                  );
                  if (ok) await ref.read(sessionProvider.notifier).signOut();
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        0,
        RiiSpace.gutter,
        RiiSpace.md,
      ),
      child: RiiCard(
        padding: EdgeInsets.zero,
        child: Column(
          children: [
            for (final (index, child) in children.indexed) ...[
              if (index > 0) Divider(indent: 56, color: context.palette.line),
              child,
            ],
          ],
        ),
      ),
    );
  }
}

class _Entry extends StatelessWidget {
  const _Entry({
    required this.icon,
    required this.label,
    required this.onTap,
    this.badge = 0,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon),
      title: Text(label, style: context.text.bodyLarge),
      trailing: badge > 0
          ? Badge(
              label: Text(badge > 99 ? '99+' : '$badge'),
              backgroundColor: context.palette.brand,
            )
          : Icon(Icons.chevron_right_rounded, color: context.palette.subtle),
      onTap: onTap,
    );
  }
}
