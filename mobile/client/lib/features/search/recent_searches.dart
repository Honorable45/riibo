import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../location/delivery_location.dart';

/// Recherches récentes, gardées uniquement sur l'appareil (8 au plus).
class RecentSearchesController extends AsyncNotifier<List<String>> {
  static const _key = 'riiberaka.recent_searches';
  static const _max = 8;

  @override
  Future<List<String>> build() async {
    final prefs = await ref.watch(sharedPreferencesProvider.future);
    return prefs.getStringList(_key) ?? const [];
  }

  Future<void> add(String value) async {
    final text = value.trim();
    if (text.length < 2) return;
    final current = state.value ?? const [];
    final next = [
      text,
      ...current.where((v) => v.toLowerCase() != text.toLowerCase()),
    ].take(_max).toList();
    state = AsyncData(next);
    final prefs = await ref.read(sharedPreferencesProvider.future);
    await prefs.setStringList(_key, next);
  }

  Future<void> clear() async {
    state = const AsyncData([]);
    final prefs = await ref.read(sharedPreferencesProvider.future);
    await prefs.remove(_key);
  }
}

final recentSearchesProvider =
    AsyncNotifierProvider<RecentSearchesController, List<String>>(
      RecentSearchesController.new,
    );
