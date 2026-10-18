import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthTokens {
  const AuthTokens({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;
}

/// Conservation des jetons de session. Uniquement dans le stockage sécurisé
/// du système (Keystore Android / Keychain iOS) : jamais dans
/// SharedPreferences, jamais dans un journal.
abstract class TokenStore {
  Future<AuthTokens?> read();
  Future<void> write(AuthTokens tokens);
  Future<void> clear();

  /// Profil minimal mis en cache (prénom, téléphone) pour afficher l'état
  /// connecté au démarrage sans réseau. Le serveur reste l'autorité.
  Future<String?> readUserJson();
  Future<void> writeUserJson(String json);
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessKey = 'riiberaka.access_token';
  static const _refreshKey = 'riiberaka.refresh_token';
  static const _userKey = 'riiberaka.user';

  @override
  Future<AuthTokens?> read() async {
    final access = await _storage.read(key: _accessKey);
    final refresh = await _storage.read(key: _refreshKey);
    if (access == null || refresh == null) return null;
    return AuthTokens(accessToken: access, refreshToken: refresh);
  }

  @override
  Future<void> write(AuthTokens tokens) async {
    await _storage.write(key: _accessKey, value: tokens.accessToken);
    await _storage.write(key: _refreshKey, value: tokens.refreshToken);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _userKey);
  }

  @override
  Future<String?> readUserJson() => _storage.read(key: _userKey);

  @override
  Future<void> writeUserJson(String json) =>
      _storage.write(key: _userKey, value: json);
}

/// Implémentation en mémoire (tests, et repli si le stockage sécurisé est
/// indisponible : la session ne survit alors simplement pas au redémarrage).
class MemoryTokenStore implements TokenStore {
  AuthTokens? _tokens;
  String? _user;

  @override
  Future<AuthTokens?> read() async => _tokens;

  @override
  Future<void> write(AuthTokens tokens) async => _tokens = tokens;

  @override
  Future<void> clear() async {
    _tokens = null;
    _user = null;
  }

  @override
  Future<String?> readUserJson() async => _user;

  @override
  Future<void> writeUserJson(String json) async => _user = json;
}
