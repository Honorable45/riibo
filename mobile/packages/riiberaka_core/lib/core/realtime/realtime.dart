import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../app/config/env.dart';
import '../api/json.dart';
import '../auth/session.dart';
import '../providers.dart';

/// Événement temps réel reçu du backend (EventsGateway).
class RealtimeEvent {
  const RealtimeEvent(this.name, this.data);

  final String name;
  final Json data;

  String? get orderId => data['orderId'] as String?;
}

/// Événements écoutés par le client (voir docs/API_AUDIT.md).
const _eventNames = [
  'order:new',
  'order:accepted',
  'order:rejected',
  'order:preparing',
  'order:ready',
  'order:assigned',
  'order:picked-up',
  'order:on-the-way',
  'order:delivered',
  'order:cancelled',
  'delivery:location',
  'delivery:at-restaurant',
  'delivery:arrived',
  'delivery:no-driver',
  'delivery:assigned',
  // Livreur : offres de course.
  'delivery:offer',
  'delivery:offer-expired',
  'conversation:new',
  'notification:new',
  'message:new',
  'session:revoked',
];

/// Connexion Socket.IO tant qu'un client est connecté.
///
/// Authentification : jeton court (2 min) demandé à `POST /auth/socket-token`
/// à CHAQUE (re)connexion et transmis dans le paquet CONNECT (`auth.token`),
/// jamais dans l'URL. Coupée quand l'application passe en arrière-plan,
/// rétablie au retour (avec un signal de resynchronisation).
class RealtimeConnection {
  RealtimeConnection(this._ref) {
    _lifecycle = AppLifecycleListener(
      onPause: () => _socket?.disconnect(),
      onResume: () {
        _socket?.connect();
        if (!_stream.isClosed) {
          _stream.add(const RealtimeEvent('app:resumed', {}));
        }
      },
    );
  }

  final Ref _ref;
  late final AppLifecycleListener _lifecycle;
  io.Socket? _socket;
  final _stream = StreamController<RealtimeEvent>.broadcast();
  final _connected = ValueNotifier(false);

  Stream<RealtimeEvent> get events => _stream.stream;
  ValueListenable<bool> get connected => _connected;

  void start() {
    if (_socket != null) return;
    final socket = io.io(
      Env.apiOrigin.toString(),
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(2000)
          .setReconnectionDelayMax(30000)
          .setAuthFn((callback) async {
            try {
              final api = _ref.read(apiClientProvider);
              final data = await api.post<Json>('/auth/socket-token');
              callback({'token': data['token']});
            } catch (_) {
              // Hors ligne ou session expirée : connexion refusée, nouvelle
              // tentative automatique plus tard.
              callback(<String, dynamic>{});
            }
          })
          .build(),
    );
    socket.onConnect((_) {
      final wasConnected = _connected.value;
      _connected.value = true;
      // Reconnexion : des événements ont pu être manqués.
      if (!wasConnected && !_stream.isClosed) {
        _stream.add(const RealtimeEvent('socket:connected', {}));
      }
    });
    socket.onDisconnect((_) => _connected.value = false);
    for (final name in _eventNames) {
      socket.on(name, (data) {
        if (_stream.isClosed) return;
        _stream.add(
          RealtimeEvent(name, data is Map ? Json.from(data) : const {}),
        );
      });
    }
    _socket = socket..connect();
  }

  void stop() {
    _socket?.dispose();
    _socket = null;
    _connected.value = false;
  }

  void dispose() {
    stop();
    _lifecycle.dispose();
    _stream.close();
    _connected.dispose();
  }
}

final realtimeProvider = Provider<RealtimeConnection>((ref) {
  final connection = RealtimeConnection(ref);
  ref.onDispose(connection.dispose);
  ref.listen(currentUserProvider.select((u) => u?.id), (_, userId) {
    if (userId == null || userId.isEmpty) {
      connection.stop();
    } else {
      connection.start();
    }
  }, fireImmediately: true);
  return connection;
});

/// Flux d'événements temps réel.
final realtimeEventsProvider = StreamProvider<RealtimeEvent>(
  (ref) => ref.watch(realtimeProvider).events,
);
