import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/json.dart';
import '../providers.dart';
import 'token_store.dart';

class AuthUser {
  const AuthUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.role,
    this.phone,
    this.email,
  });

  factory AuthUser.fromJson(Json json) => AuthUser(
    id: json.str('id'),
    firstName: json.strOrNull('firstName') ?? '',
    lastName: json.strOrNull('lastName') ?? '',
    phone: json.strOrNull('phone'),
    email: json.strOrNull('email'),
    role: json.strOrNull('role') ?? 'CLIENT',
  );

  final String id;
  final String firstName;
  final String lastName;
  final String? phone;
  final String? email;

  /// Rôle tel que renvoyé par le serveur — affiché, jamais utilisé pour
  /// autoriser quoi que ce soit côté application.
  final String role;

  String get displayName =>
      [firstName, lastName].where((s) => s.trim().isNotEmpty).join(' ');

  Json toJson() => {
    'id': id,
    'firstName': firstName,
    'lastName': lastName,
    'phone': phone,
    'email': email,
    'role': role,
  };
}

sealed class SessionState {
  const SessionState();
}

/// Démarrage : session pas encore relue depuis le stockage.
class SessionRestoring extends SessionState {
  const SessionRestoring();
}

class SignedOut extends SessionState {
  const SignedOut({this.reason});

  /// Message à afficher (« Votre session a expiré »…), ou `null`.
  final String? reason;
}

class SignedIn extends SessionState {
  const SignedIn(this.user);
  final AuthUser user;
}

class SessionController extends Notifier<SessionState> {
  late ApiClient _api;
  late TokenStore _store;
  StreamSubscription<void>? _ended;

  /// Incrémenté à chaque connexion/déconnexion : une restauration plus
  /// ancienne, terminée en retard, n'a alors plus le droit de modifier l'état.
  int _generation = 0;
  StreamSubscription<JsonMap?>? _rotated;

  @override
  SessionState build() {
    _api = ref.watch(apiClientProvider);
    _store = ref.watch(tokenStoreProvider);
    _ended = _api.onSessionEnded.listen(
      (_) => state = const SignedOut(
        reason: 'Votre session a expiré. Reconnectez-vous.',
      ),
    );
    _rotated = _api.onTokensRotated.listen((user) {
      if (user != null && state is SignedIn) _setUser(AuthUser.fromJson(user));
    });
    ref.onDispose(() {
      _ended?.cancel();
      _rotated?.cancel();
    });
    unawaited(_restore());
    return const SessionRestoring();
  }

  Future<void> _restore() async {
    final generation = _generation;
    bool stale() => generation != _generation;
    AuthTokens? tokens;
    try {
      tokens = await _api.loadTokens();
    } catch (_) {
      tokens = null; // stockage sécurisé illisible : on repart déconnecté
    }
    if (stale()) return;
    if (tokens == null) {
      state = const SignedOut();
      return;
    }
    // Affiche tout de suite l'utilisateur mis en cache (démarrage hors ligne),
    // puis confirme auprès du serveur.
    final cached = await _readCachedUser();
    if (stale()) return;
    state = cached != null ? SignedIn(cached) : state;
    try {
      final me = await _api.get<Json>('/users/me');
      if (stale()) return;
      _setUser(AuthUser.fromJson(me));
    } on ApiException catch (error) {
      if (stale()) return;
      if (error.kind == ApiErrorKind.unauthorized) {
        await _api.clearTokens();
        state = const SignedOut(
          reason: 'Votre session a expiré. Reconnectez-vous.',
        );
      } else if (cached == null) {
        // Hors ligne sans profil en cache : on garde la session, le profil
        // sera relu plus tard.
        state = SignedIn(
          const AuthUser(id: '', firstName: '', lastName: '', role: 'CLIENT'),
        );
      }
    }
  }

  Future<AuthUser?> _readCachedUser() async {
    try {
      final raw = await _store.readUserJson();
      return raw == null ? null : AuthUser.fromJson(jsonDecode(raw) as Json);
    } catch (_) {
      return null;
    }
  }

  void _setUser(AuthUser user) {
    state = SignedIn(user);
    unawaited(_store.writeUserJson(jsonEncode(user.toJson())));
  }

  /// Après une vérification OTP réussie (`{ user, accessToken, refreshToken }`).
  Future<void> signIn(Json response) async {
    _generation++;
    await _api.saveTokens(
      AuthTokens(
        accessToken: response.str('accessToken'),
        refreshToken: response.str('refreshToken'),
      ),
    );
    _setUser(AuthUser.fromJson(response.obj('user')));
  }

  void updateUser(AuthUser user) => _setUser(user);

  /// Déconnexion : révoque la session côté serveur si possible, et efface
  /// TOUJOURS les jetons locaux (même hors ligne).
  Future<void> signOut() async {
    _generation++;
    if (_api.hasSession) {
      try {
        await _api.post<void>('/auth/logout');
      } catch (_) {
        // Hors ligne : la session expirera d'elle-même côté serveur.
      }
    }
    await _api.clearTokens();
    state = const SignedOut();
  }
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);

/// Utilisateur connecté, ou `null`.
final currentUserProvider = Provider<AuthUser?>((ref) {
  final session = ref.watch(sessionProvider);
  return session is SignedIn ? session.user : null;
});
