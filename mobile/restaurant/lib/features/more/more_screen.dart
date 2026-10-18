import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';

import '../../app/routes.dart';
import '../shared/providers.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final restaurants = ref.watch(myRestaurantsProvider).value ?? const [];
    final current = ref.watch(currentRestaurantProvider);
    final unread = ref.watch(unreadNotificationsProvider).value ?? 0;
    final t = context.text;
    final p = context.palette;
    Widget entry(IconData icon, String label, String route, {int badge = 0}) =>
        ListTile(
          leading: Icon(icon),
          title: Text(label, style: t.bodyLarge),
          trailing: badge > 0
              ? Badge(label: Text('$badge'))
              : Icon(Icons.chevron_right_rounded, color: p.subtle),
          onTap: () => context.push(route),
        );
    return Scaffold(
      appBar: AppBar(title: const Text('Plus')),
      body: ListView(
        padding: const EdgeInsets.all(RiiSpace.gutter),
        children: [
          if (user != null)
            Padding(
              padding: const EdgeInsets.only(bottom: RiiSpace.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user.displayName.isEmpty ? 'Mon compte' : user.displayName,
                    style: t.titleLarge,
                  ),
                  if (user.phone != null)
                    Text(
                      PhoneNumbers.display(user.phone!),
                      style: t.bodyMedium!.copyWith(color: p.muted),
                    ),
                  if (current != null)
                    Text(
                      '${current.name} · ${current.isOwner ? 'Propriétaire' : 'Équipe'}',
                      style: t.bodySmall,
                    ),
                ],
              ),
            ),
          if (restaurants.length > 1) ...[
            Text('Restaurant', style: t.titleSmall),
            RadioGroup<String>(
              groupValue: current?.id,
              onChanged: (v) {
                if (v != null) {
                  ref.read(selectedRestaurantIdProvider.notifier).select(v);
                }
              },
              child: Column(
                children: [
                  for (final r in restaurants)
                    RadioListTile<String>(
                      value: r.id,
                      title: Text(r.name),
                      subtitle: Text(r.statusLabel),
                    ),
                ],
              ),
            ),
            const SizedBox(height: RiiSpace.md),
          ],
          RiiCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                entry(
                  Icons.insights_outlined,
                  'Statistiques du jour',
                  Routes.stats,
                ),
                entry(
                  Icons.history_rounded,
                  'Historique des commandes',
                  Routes.history,
                ),
                entry(
                  Icons.star_outline_rounded,
                  'Avis des clients',
                  Routes.reviews,
                ),
                entry(
                  Icons.notifications_none_rounded,
                  'Notifications',
                  Routes.notifications,
                  badge: unread,
                ),
                entry(
                  Icons.support_agent_rounded,
                  'Assistance',
                  Routes.support,
                ),
              ],
            ),
          ),
          const SizedBox(height: RiiSpace.lg),
          RiiButton(
            label: 'Se déconnecter',
            icon: Icons.logout_rounded,
            variant: RiiButtonVariant.secondary,
            onPressed: () async {
              final ok = await confirmDialog(
                context,
                title: 'Se déconnecter ?',
                message:
                    'Vous ne recevrez plus les nouvelles commandes sur ce téléphone.',
                confirmLabel: 'Se déconnecter',
              );
              if (ok) await ref.read(sessionProvider.notifier).signOut();
            },
          ),
        ],
      ),
    );
  }
}
