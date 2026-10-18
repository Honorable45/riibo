import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';
import 'package:riiberaka_core/features/chat/chat.dart';
import 'package:riiberaka_core/features/notifications/notifications.dart';

class _SignedIn extends SessionController {
  @override
  SessionState build() => const SignedIn(
    AuthUser(id: 'me', firstName: 'Jean', lastName: '', role: 'CLIENT'),
  );
}

Json msg(String id, {String sender = 'me', String text = 'Bonjour'}) => {
  'id': id,
  'conversationId': 'c1',
  'senderId': sender,
  'type': 'TEXT',
  'text': text,
  'sentAt': DateTime.now().toUtc().toIso8601String(),
};

class FakeChatRepository implements ChatRepository {
  final sent = <String>[];
  Completer<void>? gate;
  ApiException? error;

  @override
  Future<CursorPage<ChatMessage>> messages(
    String conversationId, {
    String? cursor,
  }) async => CursorPage(
    items: [
      ChatMessage.fromJson(msg('m0', sender: 'resto', text: 'Bienvenue')),
    ],
    nextCursor: null,
  );

  @override
  Future<ChatMessage> send(
    String conversationId,
    String text,
    String clientId,
  ) async {
    sent.add(clientId);
    if (gate != null) await gate!.future;
    if (error != null) throw error!;
    return ChatMessage.fromJson(msg('m1', text: text));
  }

  @override
  Future<void> markRead(String conversationId) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

void main() {
  group('Notifications', () {
    test('titres lisibles depuis le type et le contenu réels', () {
      AppNotification n(String type, Json payload) => AppNotification.fromJson({
        'id': 'n',
        'type': type,
        'payload': payload,
        'readAt': null,
        'createdAt': '2026-09-25T01:29:13.518Z',
      });
      final delivered = n('ORDER_DELIVERED', {
        'orderId': 'o1',
        'orderNumber': 15,
        'restaurantName': 'Chez Maman',
      });
      expect(delivered.title, 'Commande #15 livrée');
      expect(delivered.body, 'Chez Maman');
      expect(delivered.orderId, 'o1');
      expect(
        n('ORDER_ON_THE_WAY', {'body': 'Votre livreur est arrivé.'}).body,
        'Votre livreur est arrivé.',
      );
      expect(n('TYPE_INCONNU', {}).title, 'Notification');
    });
  });

  group('Messagerie', () {
    late StreamController<RealtimeEvent> events;
    late FakeChatRepository repo;
    late ProviderContainer c;

    setUp(() {
      events = StreamController<RealtimeEvent>.broadcast();
      repo = FakeChatRepository();
      c = ProviderContainer(
        overrides: [
          chatRepositoryProvider.overrideWithValue(repo),
          sessionProvider.overrideWith(_SignedIn.new),
          realtimeEventsProvider.overrideWith((ref) => events.stream),
        ],
        retry: (_, _) => null,
      );
      c.listen(chatProvider('c1'), (_, _) {});
    });

    tearDown(() {
      c.dispose();
      events.close();
    });

    List<String> ids() =>
        c.read(chatProvider('c1')).value!.messages.map((m) => m.id).toList();

    test('écho temps réel AVANT la réponse HTTP : un seul message', () async {
      await c.read(chatProvider('c1').future);
      repo.gate = Completer<void>();
      final sending = c.read(chatProvider('c1').notifier).send('Bonjour');
      await Future<void>.delayed(Duration.zero);
      expect(c.read(chatProvider('c1')).value!.messages.last.pending, isTrue);
      events.add(RealtimeEvent('message:new', msg('m1')));
      await Future<void>.delayed(Duration.zero);
      repo.gate!.complete();
      await sending;
      expect(ids(), ['m0', 'm1']);
    });

    test('écho temps réel APRÈS la réponse HTTP : un seul message', () async {
      await c.read(chatProvider('c1').future);
      await c.read(chatProvider('c1').notifier).send('Bonjour');
      events.add(RealtimeEvent('message:new', msg('m1')));
      await Future<void>.delayed(Duration.zero);
      expect(ids(), ['m0', 'm1']);
    });

    test('échec : message marqué, renvoyé avec le même identifiant', () async {
      await c.read(chatProvider('c1').future);
      repo.error = const ApiException(ApiErrorKind.offline, 'hors ligne');
      await c.read(chatProvider('c1').notifier).send('Bonjour');
      final failed = c.read(chatProvider('c1')).value!.messages.last;
      expect(failed.failed, isTrue);

      repo.error = null;
      await c
          .read(chatProvider('c1').notifier)
          .send('Bonjour', retryClientId: failed.clientId);
      expect(repo.sent, [failed.clientId, failed.clientId]);
      expect(ids(), ['m0', 'm1']);
    });

    test('message d’un autre conversation ignoré', () async {
      await c.read(chatProvider('c1').future);
      events.add(
        RealtimeEvent('message:new', {...msg('x9'), 'conversationId': 'autre'}),
      );
      await Future<void>.delayed(Duration.zero);
      expect(ids(), ['m0']);
    });

    test('message système de commande lisible', () {
      final m = ChatMessage.fromJson({
        ...msg('s1'),
        'type': 'SYSTEM',
        'text': null,
        'systemAction': 'ORDER_ACCEPTED',
      });
      expect(m.displayText, 'Commande acceptée');
    });
  });
}
