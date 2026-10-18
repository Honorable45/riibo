import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

/// Connexion des applications professionnelles (livreur, restaurant) :
/// numéro + code SMS sur un compte EXISTANT, du rôle attendu.
///
/// `POST /auth/login/request-otp` ne révèle pas si le numéro existe et
/// n'envoie rien pour un numéro inconnu. Les comptes professionnels sont créés
/// et validés par Riiberaka : l'application ne permet pas de choisir son rôle.
/// Un compte d'un autre rôle est refusé et sa session révoquée aussitôt.
class ProLoginScreen extends ConsumerStatefulWidget {
  const ProLoginScreen({
    super.key,
    required this.requiredRole,
    required this.appName,
    required this.wrongRoleMessage,
    required this.onboardingHint,
    required this.subtitle,
  });

  /// Rôle exigé (`LIVREUR`, `RESTAURANT`) — le serveur le revérifie à
  /// chaque requête ; ce contrôle ne sert qu'à refuser poliment.
  final String requiredRole;
  final String appName;
  final String wrongRoleMessage;
  final String onboardingHint;
  final String subtitle;

  @override
  ConsumerState<ProLoginScreen> createState() => _ProLoginScreenState();
}

class _ProLoginScreenState extends ConsumerState<ProLoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _codeFocus = FocusNode();
  String? _normalized;
  bool _busy = false;
  String? _error;
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _code.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  Future<void> _request() async {
    final phone = PhoneNumbers.normalize(_phone.text);
    if (phone == null) {
      setState(() => _error = 'Numéro invalide. Exemple : 90 12 34 56.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(apiClientProvider)
          .post<void>('/auth/login/request-otp', body: {'phone': phone});
      if (!mounted) return;
      setState(() {
        _normalized = phone;
        _busy = false;
        _code.clear();
        _resendIn = 60;
      });
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) return t.cancel();
        setState(() => _resendIn--);
        if (_resendIn <= 0) t.cancel();
      });
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _codeFocus.requestFocus(),
      );
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = error.message;
        });
      }
    }
  }

  Future<void> _verify() async {
    final code = _code.text.trim();
    if (!RegExp(r'^[0-9]{6}$').hasMatch(code) || _busy) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    final session = ref.read(sessionProvider.notifier);
    try {
      final response = await ref
          .read(apiClientProvider)
          .post<Json>(
            '/auth/login/verify-otp',
            body: {
              'phone': _normalized,
              'code': code,
              'deviceLabel': 'Application ${widget.appName}',
            },
          );
      final role = (response['user'] as Json?)?['role'];
      await session.signIn(response);
      if (role != widget.requiredRole) {
        // Compte d'un autre rôle : session révoquée aussitôt.
        await session.signOut();
        if (!mounted) return;
        setState(() {
          _busy = false;
          _error = widget.wrongRoleMessage;
        });
      }
      // Bon rôle : le routeur de l'application bascule de lui-même.
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = error.kind == ApiErrorKind.unauthorized
              ? 'Code incorrect ou expiré.'
              : error.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final reason = switch (ref.watch(sessionProvider)) {
      SignedOut(:final reason?) => reason,
      _ => null,
    };
    final codeStep = _normalized != null;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            RiiSpace.xxl,
            RiiSpace.xxxl,
            RiiSpace.xxl,
            RiiSpace.xxl,
          ),
          children: [
            Row(
              children: [
                Image.asset('assets/images/logo_mark.png', height: 40),
                const SizedBox(width: RiiSpace.md),
                Text(widget.appName, style: t.titleLarge),
              ],
            ),
            const SizedBox(height: RiiSpace.xxxl),
            Text(
              codeStep ? 'Code reçu par SMS' : 'Connexion',
              style: t.headlineMedium,
            ),
            const SizedBox(height: RiiSpace.sm),
            Text(
              codeStep
                  ? 'Si ce numéro correspond à un compte, un code a été envoyé au '
                        '${PhoneNumbers.display(_normalized!)}.'
                  : widget.subtitle,
              style: t.bodyLarge!.copyWith(color: p.muted),
            ),
            if (reason != null && !codeStep) ...[
              const SizedBox(height: RiiSpace.lg),
              InlineBanner(message: reason, tone: BannerTone.warning),
            ],
            const SizedBox(height: RiiSpace.xxl),
            if (!codeStep)
              TextField(
                controller: _phone,
                enabled: !_busy,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumber],
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
                  LengthLimitingTextInputFormatter(20),
                ],
                style: t.titleLarge,
                onSubmitted: (_) => _request(),
                decoration: const InputDecoration(
                  labelText: 'Numéro de téléphone',
                  hintText: '90 12 34 56',
                  prefixText: '+228 ',
                ),
              )
            else ...[
              TextField(
                controller: _code,
                focusNode: _codeFocus,
                enabled: !_busy,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                style: t.headlineMedium!.copyWith(letterSpacing: 10),
                textAlign: TextAlign.center,
                onChanged: (v) {
                  if (v.length == 6) _verify();
                },
                decoration: const InputDecoration(
                  labelText: 'Code à 6 chiffres',
                  counterText: '',
                ),
              ),
              Row(
                children: [
                  TextButton(
                    onPressed: _busy || _resendIn > 0 ? null : _request,
                    child: Text(
                      _resendIn > 0
                          ? 'Renvoyer dans $_resendIn s'
                          : 'Renvoyer le code',
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => setState(() => _normalized = null),
                    child: const Text('Changer de numéro'),
                  ),
                ],
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: RiiSpace.md),
              InlineBanner(message: _error!, tone: BannerTone.danger),
            ],
            const SizedBox(height: RiiSpace.xl),
            RiiButton(
              label: codeStep ? 'Se connecter' : 'Recevoir un code',
              loading: _busy,
              onPressed: codeStep ? _verify : _request,
            ),
            const SizedBox(height: RiiSpace.xxl),
            Text(
              widget.onboardingHint,
              style: t.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
