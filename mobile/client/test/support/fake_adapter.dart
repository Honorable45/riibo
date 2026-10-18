import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Réponse simulée : statut + corps JSON, ou exception réseau.
class FakeReply {
  const FakeReply(this.status, [this.body]) : error = null;
  const FakeReply.network(this.error) : status = 0, body = null;

  final int status;
  final Object? body;
  final DioExceptionType? error;
}

typedef FakeHandler = FakeReply Function(RequestOptions options);

/// Adaptateur HTTP en mémoire pour tester le client sans serveur réel
/// (tests unitaires — à ne pas confondre avec les tests d'intégration qui
/// visent le vrai backend).
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);

  FakeHandler handler;
  final List<RequestOptions> requests = [];

  /// Si défini, chaque réponse attend ce signal (simule un réseau lent).
  Completer<void>? hold;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (hold != null) await hold!.future;
    final reply = handler(options);
    if (reply.error != null) {
      throw DioException(requestOptions: options, type: reply.error!);
    }
    return ResponseBody.fromString(
      reply.body == null ? '' : jsonEncode(reply.body),
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
