import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/auth/token_store.dart';
import 'package:riiberaka_client/features/orders/order_models.dart';
import 'package:riiberaka_client/features/orders/orders_repository.dart';

import '../support/fake_adapter.dart';

void main() {
  test('annulation : lit la réponse réelle { id, status }', () async {
    final adapter = FakeAdapter(
      (o) => FakeReply(200, {'id': 'o1', 'status': 'CANCELLED'}),
    );
    final repo = OrdersRepository(
      ApiClient(
        baseUrl: Uri.parse('http://test/api/v1'),
        tokenStore: MemoryTokenStore(),
        dio: Dio()..httpClientAdapter = adapter,
      ),
    );
    expect(await repo.cancel('o1'), OrderStatus.cancelled);
    expect(adapter.requests.single.path, '/orders/o1/cancel');
  });

  test('recommande : lit les articles écartés de { cart, skipped }', () async {
    final adapter = FakeAdapter(
      (o) => const FakeReply(200, {
        'cart': {},
        'skipped': [
          {'name': 'Riz gras', 'reason': '« Riz gras » est épuisé.'},
        ],
      }),
    );
    final repo = OrdersRepository(
      ApiClient(
        baseUrl: Uri.parse('http://test/api/v1'),
        tokenStore: MemoryTokenStore(),
        dio: Dio()..httpClientAdapter = adapter,
      ),
    );
    final skipped = await repo.reorder('o1');
    expect(skipped.single.name, 'Riz gras');
  });
}
