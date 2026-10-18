import 'package:dio/dio.dart';

enum ApiErrorKind {
  /// Pas de réseau, DNS, connexion refusée : la requête n'est jamais partie.
  offline,

  /// Délai dépassé : la requête a pu (ou non) être traitée par le serveur.
  timeout,

  /// 401 : session absente, expirée ou révoquée.
  unauthorized,

  /// 403.
  forbidden,

  /// 404.
  notFound,

  /// 409 : conflit d'état (panier d'un autre restaurant, commande déjà envoyée…).
  conflict,

  /// 400/422 : requête refusée par la validation du serveur.
  validation,

  /// 429.
  rateLimited,

  /// 5xx.
  server,

  /// Réponse illisible ou cas imprévu.
  unknown,
}

/// Erreur d'API normalisée. Le message vient du backend quand il en fournit
/// un (déjà rédigé pour l'utilisateur, voir HttpExceptionFilter), sinon d'un
/// texte générique : jamais une trace technique brute.
class ApiException implements Exception {
  const ApiException(this.kind, this.message, {this.statusCode, this.code});

  final ApiErrorKind kind;
  final String message;
  final int? statusCode;

  /// Code métier optionnel (`CART_OTHER_RESTAURANT`…).
  final String? code;

  /// Vrai quand le serveur a pu traiter la requête sans que nous le sachions :
  /// une opération sensible (création de commande) doit alors être
  /// VÉRIFIÉE, jamais renvoyée à l'aveugle.
  bool get isUncertain =>
      kind == ApiErrorKind.timeout ||
      (kind == ApiErrorKind.server && statusCode == 502) ||
      (kind == ApiErrorKind.server && statusCode == 504);

  bool get isNetwork =>
      kind == ApiErrorKind.offline || kind == ApiErrorKind.timeout;

  factory ApiException.fromDio(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
        // La connexion n'a jamais abouti : rien n'a été envoyé.
        return const ApiException(
          ApiErrorKind.offline,
          'Connexion impossible. Vérifiez votre accès à Internet.',
        );
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const ApiException(
          ApiErrorKind.timeout,
          'Le serveur met trop de temps à répondre.',
        );
      case DioExceptionType.connectionError:
        return const ApiException(
          ApiErrorKind.offline,
          'Connexion impossible. Vérifiez votre accès à Internet.',
        );
      case DioExceptionType.badCertificate:
        return const ApiException(
          ApiErrorKind.offline,
          'Connexion non sécurisée refusée.',
        );
      case DioExceptionType.cancel:
        return const ApiException(ApiErrorKind.unknown, 'Requête annulée.');
      case DioExceptionType.badResponse:
      case DioExceptionType.unknown:
        final response = error.response;
        if (response == null) {
          return const ApiException(
            ApiErrorKind.offline,
            'Connexion impossible. Vérifiez votre accès à Internet.',
          );
        }
        return ApiException.fromResponse(response.statusCode, response.data);
    }
  }

  /// Lit le corps `{ statusCode, message, timestamp }` du HttpExceptionFilter,
  /// où `message` est une chaîne, un objet de validation Nest
  /// (`{ message: string | string[] }`) ou un objet métier (`{ code, message }`).
  factory ApiException.fromResponse(int? statusCode, Object? body) {
    String? message;
    String? code;
    if (body is Map) {
      final raw = body['message'];
      if (raw is String) {
        message = raw;
      } else if (raw is List) {
        message = raw.whereType<String>().join('\n');
      } else if (raw is Map) {
        final inner = raw['message'];
        if (inner is String) message = inner;
        if (inner is List) message = inner.whereType<String>().join('\n');
        final innerCode = raw['code'];
        if (innerCode is String) code = innerCode;
      }
      final topCode = body['code'];
      if (code == null && topCode is String) code = topCode;
    }

    final kind = switch (statusCode) {
      401 => ApiErrorKind.unauthorized,
      403 => ApiErrorKind.forbidden,
      404 => ApiErrorKind.notFound,
      409 => ApiErrorKind.conflict,
      400 || 422 => ApiErrorKind.validation,
      429 => ApiErrorKind.rateLimited,
      final s? when s >= 500 => ApiErrorKind.server,
      _ => ApiErrorKind.unknown,
    };

    final fallback = switch (kind) {
      ApiErrorKind.unauthorized => 'Votre session a expiré. Reconnectez-vous.',
      ApiErrorKind.forbidden => 'Action non autorisée.',
      ApiErrorKind.notFound => 'Élément introuvable.',
      ApiErrorKind.rateLimited =>
        'Trop de tentatives. Patientez un instant puis réessayez.',
      ApiErrorKind.server =>
        'Le service est momentanément indisponible. Réessayez.',
      _ => 'Une erreur est survenue. Réessayez.',
    };

    final useServerMessage =
        message != null &&
        message.trim().isNotEmpty &&
        kind != ApiErrorKind.rateLimited &&
        kind != ApiErrorKind.server;

    return ApiException(
      kind,
      useServerMessage ? message.trim() : fallback,
      statusCode: statusCode,
      code: code,
    );
  }

  @override
  String toString() => 'ApiException($kind, $statusCode, $code)';
}
