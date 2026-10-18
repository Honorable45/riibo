import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'order_models.dart';

/// Demande de commande : le corps ne contient NI plat, NI prix, NI total
/// (CreateOrderDto) — la commande est construite à partir du panier serveur.
class PlaceOrderRequest {
  const PlaceOrderRequest({
    required this.deliveryType,
    required this.paymentMethod,
    this.addressId,
    this.contactPhone,
    this.notes,
  });

  final DeliveryType deliveryType;
  final PaymentMethod paymentMethod;
  final String? addressId;
  final String? contactPhone;
  final String? notes;

  Json toJson() => {
    'deliveryType': deliveryType.api,
    'paymentMethod': paymentMethod.api,
    if (deliveryType == DeliveryType.delivery) 'addressId': ?addressId,
    'contactPhone': ?contactPhone,
    if (notes != null && notes!.trim().isNotEmpty) 'notes': notes!.trim(),
  };
}

class OrdersRepository {
  const OrdersRepository(this._api);

  final ApiClient _api;

  Future<OrderDetail> place(PlaceOrderRequest request) async =>
      OrderDetail.fromJson(
        await _api.post<Json>('/orders', body: request.toJson()),
      );

  Future<CursorPage<OrderSummary>> list({
    required bool active,
    String? cursor,
    int limit = 20,
  }) async => CursorPage.fromJson(
    await _api.get<Json>(
      '/orders',
      query: {
        'scope': active ? 'active' : 'past',
        'cursor': cursor,
        'limit': limit,
      },
    ),
    OrderSummary.fromJson,
  );

  Future<OrderDetail> get(String id) async => OrderDetail.fromJson(
    await _api.get<Json>('/orders/${Uri.encodeComponent(id)}'),
  );

  /// Annulation par le client. Le serveur renvoie `{ id, status }` (et non
  /// le détail) : l'écran relit ensuite la commande.
  Future<OrderStatus> cancel(String id, {String? reason}) async {
    final data = await _api.post<Json>(
      '/orders/${Uri.encodeComponent(id)}/cancel',
      body: {
        if (reason != null && reason.trim().length >= 3)
          'reason': reason.trim(),
      },
    );
    return OrderStatus.parse(data['status'] as String?);
  }

  /// « Commander à nouveau » : remplit le panier avec ce qui est encore
  /// disponible ; renvoie les articles écartés et leur motif.
  Future<List<({String name, String reason})>> reorder(String id) async {
    final data = await _api.post<Json>(
      '/orders/${Uri.encodeComponent(id)}/reorder',
    );
    return ((data['skipped'] as List<dynamic>?) ?? const [])
        .cast<Json>()
        .map((s) => (name: s.str('name'), reason: s.str('reason')))
        .toList();
  }

  Future<Tracking> tracking(String id) async => Tracking.fromJson(
    await _api.get<Json>('/orders/${Uri.encodeComponent(id)}/tracking'),
  );

  Future<void> review(String orderId, {required int rating, String? comment}) =>
      _api.post<void>(
        '/orders/${Uri.encodeComponent(orderId)}/review',
        body: {
          'rating': rating,
          if (comment != null && comment.trim().isNotEmpty)
            'comment': comment.trim(),
        },
      );
}

final ordersRepositoryProvider = Provider<OrdersRepository>(
  (ref) => OrdersRepository(ref.watch(apiClientProvider)),
);
