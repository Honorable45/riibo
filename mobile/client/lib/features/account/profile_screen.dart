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

/// Profil complet relu sur le serveur (`GET /users/me`).
final myProfileProvider = FutureProvider.autoDispose<Json>(
  (ref) => ref.watch(apiClientProvider).get<Json>('/users/me'),
);

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  TextEditingController? _first;
  TextEditingController? _last;
  TextEditingController? _email;
  bool _saving = false;
  bool _savingPref = false;
  String? _error;

  @override
  void dispose() {
    _first?.dispose();
    _last?.dispose();
    _email?.dispose();
    super.dispose();
  }

  void _init(Json me) {
    _first ??= TextEditingController(text: me.strOrNull('firstName'));
    _last ??= TextEditingController(text: me.strOrNull('lastName'));
    _email ??= TextEditingController(text: me.strOrNull('email'));
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final email = _email!.text.trim();
      final last = _last!.text.trim();
      final updated = await ref
          .read(apiClientProvider)
          .patch<Json>(
            '/users/me',
            body: {
              'firstName': _first!.text.trim(),
              if (last.isNotEmpty) 'lastName': last,
              if (email.isNotEmpty) 'email': email,
            },
          );
      ref.read(sessionProvider.notifier).updateUser(AuthUser.fromJson(updated));
      ref.invalidate(myProfileProvider);
      if (mounted) showRiiSnack(context, 'Profil enregistré');
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _setNotifications(bool enabled) async {
    setState(() => _savingPref = true);
    try {
      await ref
          .read(apiClientProvider)
          .patch<Json>(
            '/users/me/profile',
            body: {'notificationsEnabled': enabled},
          );
      ref.invalidate(myProfileProvider);
    } on ApiException catch (error) {
      if (mounted) showRiiSnack(context, error.message);
    } finally {
      if (mounted) setState(() => _savingPref = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myProfileProvider);
    final t = context.text;
    return Scaffold(
      appBar: AppBar(title: const Text('Mon profil')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(myProfileProvider),
        ),
        data: (me) {
          _init(me);
          final profile = me.objOrNull('profile') ?? const {};
          final notificationsOn =
              profile['notificationsEnabled'] as bool? ?? true;
          return Form(
            key: _formKey,
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.all(RiiSpace.gutter),
              children: [
                TextFormField(
                  controller: _first,
                  enabled: !_saving,
                  textCapitalization: TextCapitalization.words,
                  inputFormatters: [LengthLimitingTextInputFormatter(80)],
                  validator: (v) => (v?.trim().isEmpty ?? true)
                      ? 'Indiquez votre prénom.'
                      : null,
                  decoration: const InputDecoration(labelText: 'Prénom'),
                ),
                const SizedBox(height: RiiSpace.md),
                TextFormField(
                  controller: _last,
                  enabled: !_saving,
                  textCapitalization: TextCapitalization.words,
                  inputFormatters: [LengthLimitingTextInputFormatter(80)],
                  decoration: const InputDecoration(labelText: 'Nom'),
                ),
                const SizedBox(height: RiiSpace.md),
                TextFormField(
                  controller: _email,
                  enabled: !_saving,
                  keyboardType: TextInputType.emailAddress,
                  validator: (v) {
                    final value = v?.trim() ?? '';
                    if (value.isEmpty) return null;
                    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value)
                        ? null
                        : 'Adresse e-mail invalide.';
                  },
                  decoration: const InputDecoration(
                    labelText: 'E-mail (facultatif)',
                  ),
                ),
                const SizedBox(height: RiiSpace.md),
                TextFormField(
                  initialValue: PhoneNumbers.display(
                    me.strOrNull('phone') ?? '',
                  ),
                  enabled: false,
                  decoration: const InputDecoration(
                    labelText: 'Téléphone',
                    helperText: 'Votre numéro sert à vous connecter.',
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: RiiSpace.md),
                  InlineBanner(message: _error!, tone: BannerTone.danger),
                ],
                const SizedBox(height: RiiSpace.lg),
                RiiButton(
                  label: 'Enregistrer',
                  loading: _saving,
                  onPressed: _save,
                ),
                const SizedBox(height: RiiSpace.xxl),
                Text('Notifications', style: t.titleMedium),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: notificationsOn,
                  onChanged: _savingPref ? null : _setNotifications,
                  title: Text(
                    'Recevoir les notifications',
                    style: t.titleSmall,
                  ),
                  subtitle: Text(
                    'Si vous les désactivez, vous ne serez plus prévenu de l’avancement '
                    'de vos commandes, ni dans l’application ni sur le téléphone.',
                    style: t.bodySmall,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
