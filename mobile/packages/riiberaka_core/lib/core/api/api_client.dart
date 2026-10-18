import 'dart:async';

import 'package:dio/dio.dart';

import '../auth/token_store.dart';
import 'api_exception.dart';

typedef JsonMap = Map<String, dynamic>;

/// Résultat d'un rafraîchissement de session.
enum RefreshOutcome {
  /// Nouveaux jetons obtenus.
  refreshed,

  /// Le serveur a refusé le refresh token (révoqué, expiré, rejoué) :
  /// la session est terminée.
  rejected,

  /// Échec réseau : la session n'est PAS considérée perdue.
  failed,
}

/// Client HTTP unique de l'application.
///
/// Authentification « native » prévue par le backend : jeton d'accès dans
/// l'en-tête `Authorization: Bearer` (jamais de cookie) et refresh token
/// envoyé dans le corps de `POST /auth/refresh` (voir AuthController.refresh).
class ApiClient {
  ApiClient({
    required Uri baseUrl,
    required TokenStore tokenStore,
    Dio? dio,
    Dio? refreshDio,
  }) : _tokenStore = tokenStore, // ignore: prefer_initializing_formals
       dio = dio ?? Dio(),
       _refreshDio = refreshDio ?? Dio() {
    final options = BaseOptions(
      baseUrl: baseUrl.toString(),
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 25),
      responseType: ResponseType.json,
      contentType: Headers.jsonContentType,
      headers: {'Accept': 'application/json'},
    );
    this.dio.options = options;
    _refreshDio.options = options.copyWith();
    this.dio.interceptors.add(
      InterceptorsWrapper(onRequest: _onRequest, onError: _onError),
    );
  }

  final Dio dio;
  final Dio _refreshDio;
  final TokenStore _tokenStore;

  AuthTokens? _tokens;
  bool _tokensLoaded = false;
  Future<RefreshOutcome>? _refreshing;

  final _sessionEnded = StreamController<void>.broadcast();
  final _tokensRotated = StreamController<JsonMap?>.broadcast();

  /// Émis quand le serveur a définitivement refusé la session.
  Stream<void> get onSessionEnded => _sessionEnded.stream;

  /// Émis à chaque rotation de jetons, avec l'utilisateur renvoyé par le
  /// serveur (profil à jour).
  Stream<JsonMap?> get onTokensRotated => _tokensRotated.stream;

  bool get hasSession => _tokens != null;

  Future<AuthTokens?> loadTokens() async {
    if (!_tokensLoaded) {
      final stored = await _tokenStore.read();
      // Des jetons ont pu être enregistrés (connexion) pendant la lecture :
      // la valeur lue, plus ancienne, ne doit jamais les remplacer.
      if (!_tokensLoaded) {
        _tokens = stored;
        _tokensLoaded = true;
      }
    }
    return _tokens;
  }

  Future<void> saveTokens(AuthTokens tokens) async {
    _tokens = tokens;
    _tokensLoaded = true;
    await _tokenStore.write(tokens);
  }

  Future<void> clearTokens() async {
    _tokens = null;
    _tokensLoaded = true;
    await _tokenStore.clear();
  }

  // ---------------------------------------------------------------------------
  // Requêtes
  // ---------------------------------------------------------------------------

  Future<T> get<T>(String path, {Map<String, Object?>? query}) =>
      _send<T>(() => dio.get<T>(path, queryParameters: _clean(query)));

  Future<T> post<T>(String path, {Object? body}) =>
      _send<T>(() => dio.post<T>(path, data: body));

  Future<T> patch<T>(String path, {Object? body}) =>
      _send<T>(() => dio.patch<T>(path, data: body));

  Future<T> put<T>(String path, {Object? body}) =>
      _send<T>(() => dio.put<T>(path, data: body));

  Future<T> delete<T>(String path, {Object? body}) =>
      _send<T>(() => dio.delete<T>(path, data: body));

  /// Envoi de fichier (multipart). [onProgress] reçoit 0 → 1. Jamais
  /// rejoué automatiquement.
  Future<T> upload<T>(
    String path,
    FormData form, {
    void Function(double progress)? onProgress,
    CancelToken? cancelToken,
  }) => _send<T>(
    () => dio.post<T>(
      path,
      data: form,
      cancelToken: cancelToken,
      options: Options(
        contentType: 'multipart/form-data',
        sendTimeout: const Duration(minutes: 2),
      ),
      onSendProgress: onProgress == null
          ? null
          : (sent, total) {
              if (total > 0) onProgress(sent / total);
            },
    ),
  );

  Future<T> _send<T>(Future<Response<T>> Function() call) async {
    try {
      final response = await call();
      return response.data as T;
    } on DioException catch (error) {
      final inner = error.error;
      if (inner is ApiException) throw inner;
      throw ApiException.fromDio(error);
    }
  }

  static Map<String, Object?>? _clean(Map<String, Object?>? query) {
    if (query == null) return null;
    return {
      for (final entry in query.entries)
        if (entry.value != null && entry.value != '') entry.key: entry.value,
    };
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  static const _noAuthPaths = <String>{
    '/auth/refresh',
    '/auth/otp/request',
    '/auth/login/verify-otp',
    '/auth/register/verify-otp',
    '/auth/login',
    '/auth/register',
  };

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!_noAuthPaths.contains(options.path)) {
      final tokens = await loadTokens();
      if (tokens != null) {
        options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
      }
    }
    handler.next(options);
  }

  Future<void> _onError(
    DioException error,
    ErrorInterceptorHandler handler,
  ) async {
    final options = error.requestOptions;
    final sentToken = options.headers['Authorization'];
    final eligible =
        error.response?.statusCode == 401 &&
        sentToken is String &&
        options.extra['retried'] != true;
    if (!eligible) return handler.next(error);

    // Une autre requête a peut-être déjà renouvelé la session pendant que
    // celle-ci était en vol : on réessaie directement avec le jeton actuel.
    final current = _tokens;
    final alreadyRotated =
        current != null && sentToken != 'Bearer ${current.accessToken}';
    final outcome = alreadyRotated
        ? RefreshOutcome.refreshed
        : await refreshSession();

    switch (outcome) {
      case RefreshOutcome.refreshed:
        options.extra['retried'] = true;
        options.headers['Authorization'] = 'Bearer ${_tokens!.accessToken}';
        try {
          final response = await dio.fetch<dynamic>(options);
          return handler.resolve(response);
        } on DioException catch (retryError) {
          return handler.next(retryError);
        }
      case RefreshOutcome.rejected:
        return handler.next(error);
      case RefreshOutcome.failed:
        return handler.next(
          error.copyWith(
            error: const ApiException(
              ApiErrorKind.offline,
              'Connexion impossible. Vérifiez votre accès à Internet.',
            ),
          ),
        );
    }
  }

  /// Rafraîchit la session une seule fois même si plusieurs requêtes
  /// échouent en même temps (le backend fait tourner le refresh token :
  /// deux rotations concurrentes avec le même jeton seraient vues comme un
  /// rejeu au-delà de sa fenêtre de grâce).
  Future<RefreshOutcome> refreshSession() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<RefreshOutcome> _doRefresh() async {
    final tokens = await loadTokens();
    if (tokens == null) return RefreshOutcome.rejected;
    // Une connexion (ou une déconnexion) a pu remplacer les jetons pendant
    // ce renouvellement : son résultat ne doit alors jamais écraser ni
    // effacer les jetons plus récents.
    bool superseded() => _tokens?.refreshToken != tokens.refreshToken;
    try {
      final response = await _refreshDio.post<JsonMap>(
        '/auth/refresh',
        data: {'refreshToken': tokens.refreshToken},
      );
      if (superseded()) {
        return _tokens == null
            ? RefreshOutcome.rejected
            : RefreshOutcome.refreshed;
      }
      final data = response.data!;
      await saveTokens(
        AuthTokens(
          accessToken: data['accessToken'] as String,
          refreshToken: data['refreshToken'] as String,
        ),
      );
      _tokensRotated.add(data['user'] as JsonMap?);
      return RefreshOutcome.refreshed;
    } on DioException catch (error) {
      if (superseded()) {
        return _tokens == null
            ? RefreshOutcome.rejected
            : RefreshOutcome.refreshed;
      }
      final status = error.response?.statusCode;
      if (status == 401 || status == 403) {
        await clearTokens();
        _sessionEnded.add(null);
        return RefreshOutcome.rejected;
      }
      return RefreshOutcome.failed;
    }
  }

  void dispose() {
    _sessionEnded.close();
    _tokensRotated.close();
    dio.close();
    _refreshDio.close();
  }
}
