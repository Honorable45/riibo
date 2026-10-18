import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'package:riiberaka_core/features/chat/chat.dart';

import '../../app/routes.dart';

/// Assistance : conversation avec l'équipe Riiberaka. Les problèmes liés à
/// une commande se signalent aussi depuis la commande (chat client/livreur).
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
          Text('Besoin d’aide ?', style: t.titleMedium),
          const SizedBox(height: RiiSpace.xs),
          Text(
            'Problème technique, commande, livreur ou paiement : écrivez à l’équipe '
            'Riiberaka. Votre message est conservé dans la conversation d’assistance.',
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
