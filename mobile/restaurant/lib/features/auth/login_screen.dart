import 'package:flutter/material.dart';
import 'package:riiberaka_core/features/auth/pro_login_screen.dart';

/// Connexion restaurateur (écran partagé du socle, rôle RESTAURANT exigé).
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) => const ProLoginScreen(
    requiredRole: 'RESTAURANT',
    appName: 'Riiberaka Restaurant',
    subtitle: 'Saisissez le numéro du compte de votre restaurant.',
    wrongRoleMessage:
        'Ce numéro n’est pas celui d’un compte restaurant Riiberaka.',
    onboardingHint:
        'Pas encore partenaire ? L’inscription et la validation du restaurant se font auprès de l’équipe Riiberaka.',
  );
}
