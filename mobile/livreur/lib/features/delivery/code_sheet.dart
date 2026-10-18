import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../driver/driver_models.dart';

/// Saisie d'un code à 6 chiffres VÉRIFIÉ PAR LE SERVEUR (comparaison à temps
/// constant, 5 essais puis blocage 15 min). Rien n'est validé localement :
/// la feuille se ferme uniquement sur la réponse positive du serveur.
Future<ActiveDelivery?> showCodeSheet(
  BuildContext context, {
  required String title,
  required String help,
  required Future<ActiveDelivery> Function(String code) submit,
}) => showRiiSheet<ActiveDelivery>(
  context,
  builder: (_) => CodeSheet(title: title, help: help, submit: submit),
);

class CodeSheet extends StatefulWidget {
  const CodeSheet({
    super.key,
    required this.title,
    required this.help,
    required this.submit,
  });

  final String title;
  final String help;
  final Future<ActiveDelivery> Function(String code) submit;

  @override
  State<CodeSheet> createState() => _CodeSheetState();
}

class _CodeSheetState extends State<CodeSheet> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final code = _code.text.trim();
    if (!RegExp(r'^[0-9]{6}$').hasMatch(code) || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await widget.submit(code);
      if (mounted) Navigator.of(context).pop(updated);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = switch (error.kind) {
          ApiErrorKind.rateLimited =>
            'Trop d’essais. Réessayez dans quelques minutes.',
          ApiErrorKind.validation =>
            error.message.contains('Code')
                ? 'Code incorrect. Vérifiez-le avec votre interlocuteur.'
                : error.message,
          _ => error.message,
        };
        _code.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        0,
        RiiSpace.gutter,
        RiiSpace.xxl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: t.headlineSmall),
          const SizedBox(height: RiiSpace.xs),
          Text(
            widget.help,
            style: t.bodyMedium!.copyWith(color: context.palette.muted),
          ),
          const SizedBox(height: RiiSpace.xl),
          TextField(
            controller: _code,
            enabled: !_busy,
            autofocus: true,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            style: t.headlineMedium!.copyWith(letterSpacing: 12),
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            onChanged: (v) {
              setState(() {});
              if (v.length == 6) _send();
            },
            decoration: const InputDecoration(
              hintText: '······',
              counterText: '',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: RiiSpace.md),
            InlineBanner(message: _error!, tone: BannerTone.danger),
          ],
          const SizedBox(height: RiiSpace.lg),
          RiiButton(
            label: 'Valider',
            loading: _busy,
            onPressed: _code.text.length == 6 ? _send : null,
          ),
        ],
      ),
    );
  }
}
