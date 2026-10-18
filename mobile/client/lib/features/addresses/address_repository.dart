import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:riiberaka_core/core/api/api_client.dart';
import 'package:riiberaka_core/core/api/json.dart';
import 'package:riiberaka_core/core/auth/session.dart';
import 'package:riiberaka_core/core/providers.dart';
import 'address_models.dart';

class AddressRepository {
  const AddressRepository(this._api);

  final ApiClient _api;

  Future<List<Address>> list() async {
    final data = await _api.get<List<dynamic>>('/addresses');
    return data.cast<Json>().map(Address.fromJson).toList();
  }

  Future<Address> create(AddressInput input) async => Address.fromJson(
    await _api.post<Json>('/addresses', body: input.toJson()),
  );

  Future<Address> update(String id, AddressInput input) async =>
      Address.fromJson(
        await _api.patch<Json>(
          '/addresses/${Uri.encodeComponent(id)}',
          body: input.toJson(forUpdate: true),
        ),
      );

  Future<void> delete(String id) =>
      _api.delete<void>('/addresses/${Uri.encodeComponent(id)}');
}

final addressRepositoryProvider = Provider<AddressRepository>(
  (ref) => AddressRepository(ref.watch(apiClientProvider)),
);

/// Adresses du client connecté (adresse principale en premier).
class AddressesController extends AsyncNotifier<List<Address>> {
  @override
  Future<List<Address>> build() async {
    final userId = ref.watch(currentUserProvider.select((u) => u?.id));
    if (userId == null || userId.isEmpty) return const [];
    return _sorted(await ref.watch(addressRepositoryProvider).list());
  }

  static List<Address> _sorted(List<Address> list) =>
      [...list]..sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));

  AddressRepository get _repo => ref.read(addressRepositoryProvider);

  Future<Address> create(AddressInput input) async {
    final created = await _repo.create(input);
    await _reload();
    return created;
  }

  Future<Address> save(String id, AddressInput input) async {
    final updated = await _repo.update(id, input);
    await _reload();
    return updated;
  }

  Future<void> delete(String id) async {
    await _repo.delete(id);
    await _reload();
  }

  Future<void> _reload() async {
    final list = _sorted(await _repo.list());
    if (ref.mounted) state = AsyncData(list);
  }
}

final addressesProvider =
    AsyncNotifierProvider<AddressesController, List<Address>>(
      AddressesController.new,
    );
