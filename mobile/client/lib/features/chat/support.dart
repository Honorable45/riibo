import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'package:riiberaka_core/features/chat/chat.dart';

/// Ouvre (ou retrouve) la conversation avec l'assistance Riiberaka.
Future<void> openSupportChat(BuildContext context, WidgetRef ref) async {
  try {
    final id = await ref.read(chatRepositoryProvider).openSupport();
    if (context.mounted) {
      await context.push(Routes.chat(id, title: 'Assistance Riiberaka'));
    }
  } on ApiException catch (error) {
    if (context.mounted) showRiiSnack(context, error.message);
  }
}

/// Motifs proposés pour signaler un problème sur une commande.
const reportReasons = [
  'Commande en retard',
  'Article manquant',
  'Commande incorrecte',
  'Problème de paiement',
  'Difficulté de livraison',
  'Autre problème',
];

/// Signalement d'un problème sur une commande (`POST /reports`, traité par
/// l'équipe Riiberaka depuis l'administration).
Future<void> showReportSheet(BuildContext context, {required String orderId}) =>
    showRiiSheet<void>(context, builder: (_) => _ReportSheet(orderId: orderId));

class _ReportSheet extends ConsumerStatefulWidget {
  const _ReportSheet({required this.orderId});

  final String orderId;

  @override
  ConsumerState<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<_ReportSheet> {
  String? _reason;
  final _details = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final reason = _reason;
    if (reason == null) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _sending = true;
      _error = null;
    });
    final details = _details.text.trim();
    final text = details.isEmpty ? reason : '$reason — $details';
    try {
      await ref
          .read(chatRepositoryProvider)
          .reportOrder(
            widget.orderId,
            text.length > 500 ? text.substring(0, 500) : text,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      showRiiSnack(
        context,
        'Signalement envoyé. L’équipe Riiberaka va l’examiner.',
      );
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = error.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        0,
        RiiSpace.gutter,
        RiiSpace.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Signaler un problème', style: t.titleLarge),
          const SizedBox(height: RiiSpace.md),
          Wrap(
            spacing: RiiSpace.sm,
            runSpacing: RiiSpace.sm,
            children: [
              for (final reason in reportReasons)
                ChoiceChip(
                  label: Text(reason),
                  selected: _reason == reason,
                  onSelected: _sending
                      ? null
                      : (_) => setState(() => _reason = reason),
                ),
            ],
          ),
          const SizedBox(height: RiiSpace.lg),
          TextField(
            controller: _details,
            enabled: !_sending,
            maxLines: 3,
            minLines: 2,
            inputFormatters: [LengthLimitingTextInputFormatter(400)],
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Précisez (facultatif)',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: RiiSpace.md),
            InlineBanner(message: _error!, tone: BannerTone.danger),
          ],
          const SizedBox(height: RiiSpace.lg),
          RiiButton(
            label: 'Envoyer le signalement',
            loading: _sending,
            onPressed: _reason == null ? null : _send,
          ),
        ],
      ),
    );
  }
}
