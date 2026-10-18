import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Captures prises par le moteur Flutter lui-même (rendu réel, vraies polices,
/// vraies images réseau), renvoyées à l'ordinateur par `flutter drive`
/// (voir test_driver/integration_test.dart). Fonctionne sur téléphone comme
/// sur le bureau Linux.
final GlobalKey screenshotBoundaryKey = GlobalKey();
final Map<String, String> _shots = {};

Widget withScreenshotBoundary(Widget app) =>
    RepaintBoundary(key: screenshotBoundaryKey, child: app);

Future<void> takeScreenshot(WidgetTester tester, String name) async {
  await tester.pump();
  await tester.runAsync(() async {
    final boundary =
        screenshotBoundaryKey.currentContext!.findRenderObject()!
            as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    _shots[name] = base64Encode(bytes!.buffer.asUint8List());
  });
  IntegrationTestWidgetsFlutterBinding.instance.reportData = {
    'screenshots': Map<String, String>.of(_shots),
  };
}
