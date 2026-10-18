import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/config/env.dart';
import 'api/api_client.dart';
import 'auth/token_store.dart';

/// Points d'injection de bas niveau : remplacés dans les tests par
/// `ProviderScope(overrides: ...)`.
final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(
    baseUrl: Env.apiBase,
    tokenStore: ref.watch(tokenStoreProvider),
  );
  ref.onDispose(client.dispose);
  return client;
});
