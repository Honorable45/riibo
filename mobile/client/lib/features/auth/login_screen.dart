import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/routes.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/format/phone.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/states.dart';
import 'auth_repository.dart';

/// Connexion / inscription par numéro de téléphone et code SMS.
/// Se ferme avec `true` quand le client est connecté.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.reason});

  /// Pourquoi la connexion est demandée (« pour commander »…).
  final String? reason;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

enum _Step { phone, code }

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _codeFocus = FocusNode();

  _Step _step = _Step.phone;
  OtpPurpose _purpose = OtpPurpose.login;
  String? _normalizedPhone;
  String? _error;
  bool _busy = false;
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _code.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _timer?.cancel();
    setState(() => _resendIn = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() => _resendIn--);
      if (_resendIn <= 0) timer.cancel();
    });
  }

  Future<void> _requestCode() async {
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
      final purpose = await ref.read(authRepositoryProvider).requestCode(phone);
      if (!mounted) return;
      setState(() {
        _normalizedPhone = phone;
        _purpose = purpose;
        _step = _Step.code;
        _busy = false;
        _code.clear();
      });
      _startCountdown();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_purpose == OtpPurpose.login) _codeFocus.requestFocus();
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.message;
      });
    }
  }

  Future<void> _verify() async {
    final phone = _normalizedPhone!;
    final code = _code.text.trim();
    if (!RegExp(r'^[0-9]{6}$').hasMatch(code)) {
      setState(() => _error = 'Saisissez le code à 6 chiffres reçu par SMS.');
      return;
    }
    if (_purpose == OtpPurpose.register && _firstName.text.trim().isEmpty) {
      setState(() => _error = 'Indiquez votre prénom.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final repo = ref.read(authRepositoryProvider);
    final session = ref.read(sessionProvider.notifier);
    try {
      final response = _purpose == OtpPurpose.login
          ? await repo.verifyLogin(phone: phone, code: code)
          : await repo.verifyRegister(
              phone: phone,
              code: code,
              firstName: _firstName.text.trim(),
              lastName: _lastName.text.trim(),
            );
      final role = (response['user'] as Map<String, dynamic>)['role'];
      await session.signIn(response);
      if (role != 'CLIENT') {
        // Compte restaurant/livreur/admin : session révoquée aussitôt.
        await session.signOut();
        if (!mounted) return;
        setState(() {
          _busy = false;
          _error =
              'Ce numéro est lié à un compte professionnel Riiberaka. '
              'Utilisez l’application dédiée ou un autre numéro.';
        });
        return;
      }
      if (!mounted) return;
      TextInput.finishAutofillContext();
      FocusScope.of(context).unfocus();
      if (context.canPop()) {
        context.pop(true);
      } else {
        context.go(Routes.home);
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.kind == ApiErrorKind.unauthorized
            ? 'Code incorrect ou expiré.'
            : error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final p = context.palette;
    final reason = widget.reason;
    return PopScope(
      canPop: _step == _Step.phone && !_busy,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _step == _Step.code && !_busy) {
          setState(() {
            _step = _Step.phone;
            _error = null;
          });
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: _step == _Step.phone ? 'Fermer' : 'Retour',
            icon: Icon(
              _step == _Step.phone
                  ? Icons.close_rounded
                  : Icons.arrow_back_rounded,
            ),
            onPressed: _busy ? null : () => Navigator.of(context).maybePop(),
          ),
        ),
        body: SafeArea(
          child: AutofillGroup(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                RiiSpace.xxl,
                RiiSpace.sm,
                RiiSpace.xxl,
                RiiSpace.xxl,
              ),
              children: [
                if (_step == _Step.phone) ...[
                  Text('Votre numéro de téléphone', style: t.headlineSmall),
                  const SizedBox(height: RiiSpace.sm),
                  Text(
                    reason ??
                        'Nous vous envoyons un code par SMS pour vous connecter '
                            'ou créer votre compte.',
                    style: t.bodyMedium!.copyWith(color: p.muted),
                  ),
                  const SizedBox(height: RiiSpace.xxl),
                  TextField(
                    controller: _phone,
                    enabled: !_busy,
                    autofocus: true,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    textInputAction: TextInputAction.done,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
                      LengthLimitingTextInputFormatter(20),
                    ],
                    onSubmitted: (_) => _requestCode(),
                    onChanged: (_) => setState(() => _error = null),
                    style: t.titleMedium,
                    decoration: InputDecoration(
                      labelText: 'Numéro',
                      hintText: '90 12 34 56',
                      // Indicatif togolais implicite, masqué dès qu'un autre
                      // indicatif est saisi.
                      prefixIcon:
                          _phone.text.startsWith('+') ||
                              _phone.text.startsWith('00')
                          ? null
                          : Padding(
                              padding: const EdgeInsets.only(
                                left: RiiSpace.lg,
                                right: RiiSpace.sm,
                              ),
                              child: Text(
                                '+228',
                                style: t.titleMedium!.copyWith(color: p.muted),
                              ),
                            ),
                      prefixIconConstraints: const BoxConstraints(
                        minWidth: 0,
                        minHeight: 0,
                      ),
                      helperText:
                          'Autre pays : saisissez l’indicatif, ex. +33…',
                    ),
                  ),
                ] else ...[
                  Text(
                    _purpose == OtpPurpose.register
                        ? 'Créer votre compte'
                        : 'Code de connexion',
                    style: t.headlineSmall,
                  ),
                  const SizedBox(height: RiiSpace.sm),
                  Text(
                    'Code envoyé par SMS au ${PhoneNumbers.display(_normalizedPhone!)}.',
                    style: t.bodyMedium!.copyWith(color: p.muted),
                  ),
                  const SizedBox(height: RiiSpace.xxl),
                  if (_purpose == OtpPurpose.register) ...[
                    TextField(
                      controller: _firstName,
                      enabled: !_busy,
                      autofocus: true,
                      textCapitalization: TextCapitalization.words,
                      autofillHints: const [AutofillHints.givenName],
                      textInputAction: TextInputAction.next,
                      inputFormatters: [LengthLimitingTextInputFormatter(80)],
                      decoration: const InputDecoration(labelText: 'Prénom'),
                    ),
                    const SizedBox(height: RiiSpace.md),
                    TextField(
                      controller: _lastName,
                      enabled: !_busy,
                      textCapitalization: TextCapitalization.words,
                      autofillHints: const [AutofillHints.familyName],
                      textInputAction: TextInputAction.next,
                      inputFormatters: [LengthLimitingTextInputFormatter(80)],
                      decoration: const InputDecoration(
                        labelText: 'Nom (facultatif)',
                      ),
                    ),
                    const SizedBox(height: RiiSpace.md),
                  ],
                  TextField(
                    controller: _code,
                    focusNode: _codeFocus,
                    enabled: !_busy,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    textInputAction: TextInputAction.done,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
                    onChanged: (value) {
                      if (value.length == 6 && _purpose == OtpPurpose.login) {
                        _verify();
                      }
                    },
                    onSubmitted: (_) => _verify(),
                    style: t.headlineSmall!.copyWith(letterSpacing: 8),
                    decoration: const InputDecoration(
                      labelText: 'Code à 6 chiffres',
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: RiiSpace.sm),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: _busy || _resendIn > 0 ? null : _requestCode,
                      style: TextButton.styleFrom(padding: EdgeInsets.zero),
                      child: Text(
                        _resendIn > 0
                            ? 'Renvoyer le code dans $_resendIn s'
                            : 'Renvoyer le code',
                      ),
                    ),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: RiiSpace.lg),
                  InlineBanner(message: _error!, tone: BannerTone.danger),
                ],
                const SizedBox(height: RiiSpace.xxl),
                RiiButton(
                  label: _step == _Step.phone
                      ? 'Recevoir un code'
                      : (_purpose == OtpPurpose.register
                            ? 'Créer mon compte'
                            : 'Se connecter'),
                  loading: _busy,
                  onPressed: _step == _Step.phone ? _requestCode : _verify,
                ),
                if (_step == _Step.code) ...[
                  const SizedBox(height: RiiSpace.sm),
                  RiiButton(
                    label: 'Changer de numéro',
                    variant: RiiButtonVariant.ghost,
                    onPressed: _busy
                        ? null
                        : () => setState(() {
                            _step = _Step.phone;
                            _error = null;
                          }),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
