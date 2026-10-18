import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver.dart';

/// Pilote côté ordinateur : reçoit les captures prises par l'application
/// (sur téléphone ou bureau) et les écrit dans $SCREENSHOT_DIR.
Future<void> main() => integrationDriver(
  responseDataCallback: (data) async {
    final dir = Platform.environment['SCREENSHOT_DIR'];
    final shots = data?['screenshots'];
    if (dir == null || shots is! Map) return;
    for (final entry in shots.entries) {
      final file = File('$dir/${entry.key}.png');
      await file.parent.create(recursive: true);
      await file.writeAsBytes(base64Decode(entry.value as String));
    }
  },
);
