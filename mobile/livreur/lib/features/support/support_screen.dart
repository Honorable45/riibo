import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'package:riiberaka_core/features/chat/chat.dart';

import '../../app/routes.dart';
import '../delivery/delivery_actions.dart';

/// Assistance : conversation avec l'équipe Riiberaka, et parcours d'urgence
/// distinct (l'application ne remplace pas les services d'urgence).
class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  bool _opening = false;

  Future<void> _openChat() async {
    setState(() => _opening = true);
    try {
      final id = await ref.read(chatRepositoryProvider).openSupport();
      if (mounted) {
        await context.push(Routes.chat(id, title: 'Assistance Riiberaka'));
      }
    } on ApiException catch (error) {
      if (mounted) showRiiSnack(context, error.message);
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    return Scaffold(
      appBar: AppBar(title: const Text('Assistance')),
      body: ListView(
        padding: const EdgeInsets.all(RiiSpace.gutter),
        children: [
          RiiCard(
            color: p.dangerSoft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.emergency_outlined, color: p.danger),
                    const SizedBox(width: RiiSpace.sm),
                    Text('Accident ou urgence', style: t.titleMedium),
                  ],
                ),
                const SizedBox(height: RiiSpace.sm),
                Text(
                  'Mettez-vous en sécurité et appelez les secours. Prévenez ensuite Riiberaka.',
                  style: t.bodyMedium,
                ),
                const SizedBox(height: RiiSpace.md),
                Row(
                  children: [
                    Expanded(
                      child: RiiButton(
                        label: 'Police 117',
                        variant: RiiButtonVariant.danger,
                        small: true,
                        onPressed: () => callNumber('117'),
                      ),
                    ),
                    const SizedBox(width: RiiSpace.sm),
                    Expanded(
                      child: RiiButton(
                        label: 'Pompiers 118',
                        variant: RiiButtonVariant.danger,
                        small: true,
                        onPressed: () => callNumber('118'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: RiiSpace.lg),
          Text('Besoin d’aide ?', style: t.titleMedium),
          const SizedBox(height: RiiSpace.xs),
          Text(
            'Problème avec un restaurant, un client, un paiement ou l’application : '
            'écrivez à l’équipe Riiberaka. Pour une course en cours, utilisez aussi '
            '« Signaler un problème » depuis l’écran de la course.',
            style: t.bodyMedium!.copyWith(color: p.inkSoft),
          ),
          const SizedBox(height: RiiSpace.lg),
          RiiButton(
            label: 'Écrire à l’assistance',
            icon: Icons.support_agent_rounded,
            loading: _opening,
            onPressed: _openChat,
          ),
        ],
      ),
    );
  }
}
