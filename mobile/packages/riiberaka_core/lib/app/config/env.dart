import 'package:flutter/foundation.dart';

/// Configuration d'environnement, fixée à la compilation :
///
///   flutter run --dart-define-from-file=config/dev.json
///
/// `API_BASE_URL` est l'origine du backend, sans `/api/v1`
/// (ex. `https://api.riiberaka.com`). Elle est obligatoire en release : une
/// application de production ne doit jamais retomber sur une adresse locale.
class Env {
  const Env._();

  static const String _apiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const String environment = String.fromEnvironment(
    'APP_ENV',
    defaultValue: kReleaseMode ? 'production' : 'development',
  );

  /// Port local par défaut du backend (`PORT` de backend/.env.example).
  static const int _devPort = 4000;

  /// Origine du backend. En debug sans configuration explicite : l'émulateur
  /// Android joint l'ordinateur via 10.0.2.2 (localhost y désigne le
  /// téléphone lui-même), les autres cibles via localhost. Un téléphone réel
  /// a toujours besoin d'une adresse explicite (IP du poste sur le réseau).
  static Uri get apiOrigin {
    if (_apiBaseUrl.isNotEmpty) return _parseOrigin(_apiBaseUrl);
    if (kReleaseMode) {
      throw const EnvError(
        'API_BASE_URL manquante : compilez avec --dart-define-from-file.',
      );
    }
    final host = defaultTargetPlatform == TargetPlatform.android
        ? '10.0.2.2'
        : 'localhost';
    return Uri(scheme: 'http', host: host, port: _devPort);
  }

  /// Racine REST (`/api/v1`, constante API_PREFIX du backend).
  static Uri get apiBase => apiOrigin.replace(path: '/api/v1');

  /// Adresse affichable d'un média renvoyé par le backend : une URL absolue
  /// (Cloudinary) est gardée telle quelle ; un chemin relatif
  /// (`/api/v1/media/...`, stockage local) est résolu sur l'origine du backend.
  static String? mediaUrl(String? raw) {
    final value = raw?.trim();
    if (value == null || value.isEmpty) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    if (value.startsWith('/')) return apiOrigin.resolve(value).toString();
    return null;
  }

  static Uri _parseOrigin(String raw) {
    final uri = Uri.tryParse(raw.trim());
    if (uri == null ||
        !uri.hasScheme ||
        uri.host.isEmpty ||
        !(uri.scheme == 'http' || uri.scheme == 'https')) {
      throw EnvError('API_BASE_URL invalide : "$raw".');
    }
    if (kReleaseMode && uri.scheme != 'https') {
      throw const EnvError('API_BASE_URL doit être en HTTPS en production.');
    }
    return Uri(
      scheme: uri.scheme,
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
    );
  }
}

class EnvError implements Exception {
  const EnvError(this.message);

  final String message;

  @override
  String toString() => message;
}
