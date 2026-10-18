import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/auth/token_store.dart';

import '../support/fake_adapter.dart';

void main() {
  late MemoryTokenStore store;
  late FakeAdapter adapter;
  late FakeAdapter refreshAdapter;
  late ApiClient client;

  ApiClient build() {
    final dio = Dio()..httpClientAdapter = adapter;
    final refreshDio = Dio()..httpClientAdapter = refreshAdapter;
    return ApiClient(
      baseUrl: Uri.parse('http://test.local/api/v1'),
      tokenStore: store,
      dio: dio,
      refreshDio: refreshDio,
    );
  }

  setUp(() {
    store = MemoryTokenStore();
    adapter = FakeAdapter((_) => const FakeReply(200, {'ok': true}));
    refreshAdapter = FakeAdapter((_) => const FakeReply(500));
    client = build();
  });

  test('envoie le jeton d’accès en en-tête Bearer', () async {
    await store.write(const AuthTokens(accessToken: 'A1', refreshToken: 'R1'));
    await client.get<Map<String, dynamic>>('/users/me');
    expect(adapter.requests.single.headers['Authorization'], 'Bearer A1');
  });

  test('n’envoie aucun jeton aux routes d’authentification', () async {
    await store.write(const AuthTokens(accessToken: 'A1', refreshToken: 'R1'));
    await client.post<Map<String, dynamic>>('/auth/otp/request', body: {});
    expect(
      adapter.requests.single.headers.containsKey('Authorization'),
      isFalse,
    );
  });

  test('401 : rafraîchit une seule fois puis rejoue la requête', () async {
    await store.write(const AuthTokens(accessToken: 'old', refreshToken: 'R1'));
    adapter.handler = (o) => o.headers['Authorization'] == 'Bearer new'
        ? const FakeReply(200, {'ok': true})
        : const FakeReply(401, {'statusCode': 401, 'message': 'expiré'});
    refreshAdapter.handler = (o) {
      expect((o.data as Map)['refreshToken'], 'R1');
      return const FakeReply(200, {
        'accessToken': 'new',
        'refreshToken': 'R2',
        'user': {'id': 'u1'},
      });
    };

    // Trois requêtes simultanées : un seul refresh (rotation unique).
    final results = await Future.wait([
      client.get<Map<String, dynamic>>('/a'),
      client.get<Map<String, dynamic>>('/b'),
      client.get<Map<String, dynamic>>('/c'),
    ]);

    expect(results, everyElement(containsPair('ok', true)));
    expect(refreshAdapter.requests, hasLength(1));
    final saved = await store.read();
    expect(saved!.accessToken, 'new');
    expect(saved.refreshToken, 'R2');
  });

  test('refresh refusé : session terminée et jetons effacés', () async {
    await store.write(const AuthTokens(accessToken: 'old', refreshToken: 'R1'));
    adapter.handler = (_) => const FakeReply(401, {'message': 'expiré'});
    refreshAdapter.handler = (_) => const FakeReply(401, {'message': 'non'});

    var ended = false;
    client.onSessionEnded.listen((_) => ended = true);

    await expectLater(
      client.get<Map<String, dynamic>>('/users/me'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.kind,
          'kind',
          ApiErrorKind.unauthorized,
        ),
      ),
    );
    await Future<void>.delayed(Duration.zero);
    expect(ended, isTrue);
    expect(await store.read(), isNull);
  });

  test('refresh impossible (réseau) : la session est conservée', () async {
    await store.write(const AuthTokens(accessToken: 'old', refreshToken: 'R1'));
    adapter.handler = (_) => const FakeReply(401, {'message': 'expiré'});
    refreshAdapter.handler = (_) =>
        const FakeReply.network(DioExceptionType.connectionError);

    await expectLater(
      client.get<Map<String, dynamic>>('/users/me'),
      throwsA(
        isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.offline),
      ),
    );
    expect(await store.read(), isNotNull);
  });

  test(
    'un ancien renouvellement refusé n’efface pas une nouvelle connexion',
    () async {
      await store.write(
        const AuthTokens(accessToken: 'old', refreshToken: 'R-old'),
      );
      final gate = Completer<void>();
      adapter.handler = (o) => o.headers['Authorization'] == 'Bearer new'
          ? const FakeReply(200, {'ok': true})
          : const FakeReply(401, {'message': 'expiré'});
      refreshAdapter = FakeAdapter(
        (_) => const FakeReply(401, {'message': 'révoqué'}),
      )..hold = gate;
      client = build();
      await client.loadTokens(); // session existante déjà chargée
      final slowRefresh = client.refreshSession();
      // Pendant ce temps, une nouvelle connexion réussit.
      await client.saveTokens(
        const AuthTokens(accessToken: 'new', refreshToken: 'R-new'),
      );
      gate.complete();
      expect(await slowRefresh, RefreshOutcome.refreshed);
      expect((await store.read())!.refreshToken, 'R-new');
      expect(
        await client.get<Map<String, dynamic>>('/users/me'),
        containsPair('ok', true),
      );
    },
  );

  test(
    'un ancien renouvellement réussi n’écrase pas une nouvelle connexion',
    () async {
      await store.write(
        const AuthTokens(accessToken: 'old', refreshToken: 'R-old'),
      );
      final gate = Completer<void>();
      refreshAdapter = FakeAdapter(
        (_) => const FakeReply(200, {
          'accessToken': 'A-old2',
          'refreshToken': 'R-old2',
        }),
      )..hold = gate;
      client = build();
      await client.loadTokens(); // session existante déjà chargée
      final slowRefresh = client.refreshSession();
      await client.saveTokens(
        const AuthTokens(accessToken: 'new', refreshToken: 'R-new'),
      );
      gate.complete();
      await slowRefresh;
      expect((await store.read())!.accessToken, 'new');
    },
  );

  test('erreur réseau convertie en ApiException hors ligne', () async {
    adapter.handler = (_) =>
        const FakeReply.network(DioExceptionType.connectionError);
    await expectLater(
      client.get<Object?>('/restaurants'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.kind, 'kind', ApiErrorKind.offline)
            .having((e) => e.isUncertain, 'isUncertain', isFalse),
      ),
    );
  });

  test('délai de réponse dépassé : résultat incertain', () async {
    adapter.handler = (_) =>
        const FakeReply.network(DioExceptionType.receiveTimeout);
    await expectLater(
      client.post<Object?>('/orders', body: {}),
      throwsA(isA<ApiException>().having((e) => e.isUncertain, 'u', isTrue)),
    );
  });

  test('les paramètres de requête vides sont retirés', () async {
    await client.get<Object?>(
      '/restaurants',
      query: {'q': '', 'category': null, 'page': 2},
    );
    expect(adapter.requests.single.queryParameters, {'page': 2});
  });
}
