import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'package:riiberaka_core/core/realtime/realtime.dart';

/// Message d'une conversation (texte ou événement système de commande).
/// Médias, vocaux et positions existent côté serveur mais ne sont pas
/// proposés dans cette première version : ils sont signalés comme tels.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.senderId,
    required this.type,
    required this.sentAt,
    this.text,
    this.systemAction,
    this.pending = false,
    this.failed = false,
    this.clientId,
  });

  factory ChatMessage.fromJson(Json json) => ChatMessage(
    id: json.str('id'),
    senderId: json.strOrNull('senderId') ?? '',
    type: json.strOrNull('type') ?? 'TEXT',
    text: json.strOrNull('text'),
    systemAction: json.strOrNull('systemAction'),
    sentAt:
        (json.dateOrNull('sentAt') ?? json.dateOrNull('createdAt')) ??
        DateTime.now(),
    clientId: json.strOrNull('clientId'),
  );

  final String id;
  final String senderId;
  final String type;
  final String? text;
  final String? systemAction;
  final DateTime sentAt;
  final bool pending;
  final bool failed;
  final String? clientId;

  bool get isSystem => type == 'SYSTEM';

  /// Texte affiché pour un message système ou non textuel.
  String get displayText {
    if (isSystem) {
      final label = switch (systemAction) {
        'ORDER_ACCEPTED' => 'Commande acceptée',
        'ORDER_PREPARING' => 'Commande en préparation',
        'ORDER_READY' => 'Commande prête',
        'ORDER_READY_PICKUP' => 'Commande prête à récupérer',
        'DRIVER_ASSIGNED' => 'Un livreur a pris la course',
        'DRIVER_PICKED_UP' => 'Commande récupérée par le livreur',
        'DRIVER_ON_THE_WAY' => 'Livreur en route',
        'ORDER_DELIVERED' => 'Commande livrée',
        'ORDER_REJECTED' => 'Commande refusée',
        'ORDER_CANCELLED' => 'Commande annulée',
        _ => 'Mise à jour de la commande',
      };
      return text == null || text!.isEmpty ? label : '$label — $text';
    }
    if (text != null && text!.isNotEmpty) return text!;
    return switch (type) {
      'VOICE' => 'Message vocal (à écouter sur le web pour le moment)',
      'IMAGE' ||
      'MEDIA' ||
      'FILE' => 'Pièce jointe (non affichable ici pour le moment)',
      'LOCATION' => 'Position partagée',
      _ => 'Message',
    };
  }

  ChatMessage copyWith({bool? pending, bool? failed}) => ChatMessage(
    id: id,
    senderId: senderId,
    type: type,
    text: text,
    systemAction: systemAction,
    sentAt: sentAt,
    pending: pending ?? this.pending,
    failed: failed ?? this.failed,
    clientId: clientId,
  );
}

class ChatRepository {
  const ChatRepository(this._api);

  final ApiClient _api;

  Future<CursorPage<ChatMessage>> messages(
    String conversationId, {
    String? cursor,
  }) async => CursorPage.fromJson(
    await _api.get<Json>(
      '/conversations/${Uri.encodeComponent(conversationId)}/messages',
      query: {'cursor': cursor, 'limit': 30},
    ),
    ChatMessage.fromJson,
  );

  /// `clientId` identique en cas de renvoi : le serveur ne crée jamais deux
  /// fois le même message (MessagesService.findExistingByClientId).
  Future<ChatMessage> send(
    String conversationId,
    String text,
    String clientId,
  ) async => ChatMessage.fromJson(
    await _api.post<Json>(
      '/messages',
      body: {
        'conversationId': conversationId,
        'text': text,
        'clientId': clientId,
      },
    ),
  );

  Future<void> markRead(String conversationId) => _api.post<void>(
    '/conversations/${Uri.encodeComponent(conversationId)}/read',
  );

  Future<String> openSupport() async =>
      (await _api.post<Json>('/conversations/support')).str('id');

  Future<Json> conversation(String id) =>
      _api.get<Json>('/conversations/${Uri.encodeComponent(id)}');

  /// Signalement d'un problème sur une commande (`POST /reports`).
  Future<void> reportOrder(String orderId, String reason) => _api.post<void>(
    '/reports',
    body: {'targetType': 'ORDER', 'targetId': orderId, 'reason': reason},
  );
}

final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => ChatRepository(ref.watch(apiClientProvider)),
);

class ChatState {
  const ChatState({
    required this.messages,
    required this.nextCursor,
    this.loadingOlder = false,
  });

  /// Du plus ancien au plus récent.
  final List<ChatMessage> messages;
  final String? nextCursor;
  final bool loadingOlder;
}

String _newClientId() {
  final r = Random.secure();
  return List.generate(
    16,
    (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

class ChatController extends AsyncNotifier<ChatState> {
  ChatController(this.conversationId);

  final String conversationId;

  ChatRepository get _repo => ref.read(chatRepositoryProvider);

  @override
  Future<ChatState> build() async {
    ref.listen(realtimeEventsProvider, (_, next) {
      final event = next.value;
      if (event == null) return;
      if (event.name == 'message:new' &&
          event.data['conversationId'] == conversationId) {
        _receive(ChatMessage.fromJson(event.data));
      } else if (event.name == 'socket:connected' ||
          event.name == 'app:resumed') {
        ref.invalidateSelf();
      }
    });
    final page = await ref
        .watch(chatRepositoryProvider)
        .messages(conversationId);
    unawaited(_repo.markRead(conversationId).catchError((_) {}));
    return ChatState(messages: page.items, nextCursor: page.nextCursor);
  }

  /// Ajoute un message reçu (temps réel) s'il n'est pas déjà affiché.
  void _receive(ChatMessage message) {
    final current = state.value;
    if (current == null) return;
    if (current.messages.any((m) => m.id == message.id)) return;
    state = AsyncData(
      ChatState(
        messages: [...current.messages, message],
        nextCursor: current.nextCursor,
      ),
    );
    if (message.senderId != ref.read(currentUserProvider)?.id) {
      unawaited(_repo.markRead(conversationId).catchError((_) {}));
    }
  }

  /// Remplace le message local par celui du serveur. L'écho temps réel a pu
  /// arriver avant la réponse HTTP : jamais de doublon dans un cas comme dans
  /// l'autre (le serveur ne renvoie pas `clientId`, on compare l'identifiant).
  void _confirm(String clientId, ChatMessage saved) {
    final current = state.value;
    if (current == null) return;
    final alreadyThere = current.messages.any((m) => m.id == saved.id);
    final messages = <ChatMessage>[];
    for (final m in current.messages) {
      final isLocal = m.clientId == clientId && m.id.startsWith('local-');
      if (!isLocal) {
        messages.add(m);
      } else if (!alreadyThere) {
        messages.add(saved);
      }
    }
    state = AsyncData(
      ChatState(messages: messages, nextCursor: current.nextCursor),
    );
  }

  Future<void> loadOlder() async {
    final current = state.value;
    if (current == null || current.nextCursor == null || current.loadingOlder) {
      return;
    }
    state = AsyncData(
      ChatState(
        messages: current.messages,
        nextCursor: current.nextCursor,
        loadingOlder: true,
      ),
    );
    try {
      final page = await _repo.messages(
        conversationId,
        cursor: current.nextCursor,
      );
      if (!ref.mounted) return;
      state = AsyncData(
        ChatState(
          messages: [...page.items, ...current.messages],
          nextCursor: page.nextCursor,
        ),
      );
    } catch (_) {
      if (ref.mounted) state = AsyncData(current);
    }
  }

  /// Envoi : affiché aussitôt « en cours », remplacé par la réponse du
  /// serveur ; en échec, marqué pour un renvoi avec le MÊME identifiant.
  Future<void> send(String text, {String? retryClientId}) async {
    final body = text.trim();
    if (body.isEmpty) return;
    final clientId = retryClientId ?? _newClientId();
    final me = ref.read(currentUserProvider)?.id ?? '';
    final local = ChatMessage(
      id: 'local-$clientId',
      senderId: me,
      type: 'TEXT',
      text: body,
      sentAt: DateTime.now(),
      pending: true,
      clientId: clientId,
    );
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      ChatState(
        messages: [
          ...current.messages.where((m) => m.clientId != clientId),
          local,
        ],
        nextCursor: current.nextCursor,
      ),
    );
    try {
      final saved = await _repo.send(conversationId, body, clientId);
      if (ref.mounted) _confirm(clientId, saved);
    } on ApiException {
      final now = state.value;
      if (now == null || !ref.mounted) return;
      state = AsyncData(
        ChatState(
          messages: [
            for (final m in now.messages)
              m.clientId == clientId
                  ? m.copyWith(pending: false, failed: true)
                  : m,
          ],
          nextCursor: now.nextCursor,
        ),
      );
    }
  }
}

final chatProvider = AsyncNotifierProvider.autoDispose
    .family<ChatController, ChatState, String>(ChatController.new);
