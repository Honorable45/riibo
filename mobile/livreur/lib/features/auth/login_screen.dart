import 'package:flutter/material.dart';
import 'package:riiberaka_core/features/auth/pro_login_screen.dart';

/// Connexion livreur (écran partagé du socle, rôle LIVREUR exigé).
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) => const ProLoginScreen(
    requiredRole: 'LIVREUR',
    appName: 'Riiberaka Livreur',
    subtitle: 'Saisissez le numéro de votre compte livreur.',
    wrongRoleMessage: 'Ce numéro n’est pas celui d’un compte livreur Riiberaka.',
    onboardingHint:
        'Pas encore livreur ? L’inscription et la validation du dossier se font auprès de l’équipe Riiberaka.',
  );
}
