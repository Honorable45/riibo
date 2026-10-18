import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/harness.dart';
import 'support/screenshots.dart';

/// Parcours OTP RÉEL (bureau Linux uniquement) : le backend de développement
/// (`SMS_PROVIDER=none`) écrit le code dans son journal, lu ici via
/// `--dart-define=BACKEND_LOG=chemin`.
const backendLog = String.fromEnvironment('BACKEND_LOG');

String latestOtp() {
  final lines = File(backendLog).readAsLinesSync().reversed;
  for (final line in lines) {
    final match = RegExp(r'code OTP pour .* : (\d{6})').firstMatch(line);
    if (match != null) return match.group(1)!;
  }
  throw StateError('Aucun code OTP dans $backendLog');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(initIntegration);

  testWidgets('connexion par SMS puis déconnexion', (tester) async {
    if (backendLog.isEmpty) {
      markTestSkipped('BACKEND_LOG non défini');
      return;
    }
    useViewport(tester);
    await launchApp(tester);
    await tester.tap(find.text('Compte').last);
    await settle(tester);
    await tester.tap(find.text('Se connecter'));
    await settle(tester);

    // Numéro saisi au format local togolais.
    await tester.enterText(find.byType(TextField), '90 10 00 01');
    await tester.tap(find.text('Recevoir un code'));
    await pumpUntilFound(tester, find.text('Code de connexion'));
    await takeScreenshot(tester, 'otp_code');

    // Mauvais code : refus clair.
    await tester.enterText(find.byType(TextField).last, '000000');
    await pumpUntilFound(tester, find.text('Code incorrect ou expiré.'));

    final code = await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      return latestOtp();
    });
    await tester.enterText(find.byType(TextField).last, code!);
    await pumpUntilFound(tester, find.text('Jean Client'));
    expect(find.text('+228 90 10 00 01'), findsOneWidget);
    await takeScreenshot(tester, 'account_signed_in');

    await tester.tap(find.text('Se déconnecter').first);
    await settle(tester);
    await tester.tap(find.text('Se déconnecter').last);
    await pumpUntilFound(tester, find.text('Bienvenue sur Riiberaka'));
  });
}
