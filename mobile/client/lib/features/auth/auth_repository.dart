import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/providers.dart';

enum OtpPurpose { login, register }

/// Parcours téléphone + code SMS du backend (AuthController) :
/// `POST /auth/otp/request` décide connexion ou inscription.
class AuthRepository {
  const AuthRepository(this._api);

  final ApiClient _api;

  static String get _deviceLabel => switch (defaultTargetPlatform) {
    TargetPlatform.android => 'Application Android',
    TargetPlatform.iOS => 'Application iPhone',
    _ => 'Application Riiberaka',
  };

  Future<OtpPurpose> requestCode(String phone) async {
    final data = await _api.post<Json>(
      '/auth/otp/request',
      body: {'phone': phone},
    );
    return data['purpose'] == 'REGISTER'
        ? OtpPurpose.register
        : OtpPurpose.login;
  }

  /// Renvoie `{ user, accessToken, refreshToken }`.
  Future<Json> verifyLogin({required String phone, required String code}) =>
      _api.post<Json>(
        '/auth/login/verify-otp',
        body: {'phone': phone, 'code': code, 'deviceLabel': _deviceLabel},
      );

  /// Inscription d'un CLIENT (rôle imposé par le serveur).
  Future<Json> verifyRegister({
    required String phone,
    required String code,
    required String firstName,
    String? lastName,
  }) => _api.post<Json>(
    '/auth/register/verify-otp',
    body: {
      'phone': phone,
      'code': code,
      'firstName': firstName,
      if (lastName != null && lastName.isNotEmpty) 'lastName': lastName,
      'deviceLabel': _deviceLabel,
    },
  );
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider)),
);
