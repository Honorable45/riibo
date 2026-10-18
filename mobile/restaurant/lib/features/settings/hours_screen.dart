import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../shared/models.dart';
import '../shared/providers.dart';
import '../shared/repository.dart';

const _days = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

String _fmt(TimeOfDay t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
TimeOfDay _parse(String s) => TimeOfDay(
  hour: int.parse(s.substring(0, 2)),
  minute: int.parse(s.substring(3, 5)),
);

/// Horaires de la semaine (fuseau de Lomé). Le serveur vérifie les
/// chevauchements et calcule seul « ouvert / fermé » ; une plage qui finit
/// avant de commencer passe minuit (ex. 18:00 → 02:00).
class HoursScreen extends ConsumerStatefulWidget {
  const HoursScreen({super.key});

  @override
  ConsumerState<HoursScreen> createState() => _HoursScreenState();
}

class _HoursScreenState extends ConsumerState<HoursScreen> {
  List<OpeningRange>? _ranges;
  bool _saving = false;
  String? _error;

  Future<void> _edit(int index) async {
    final r = _ranges![index];
    final opens = await showTimePicker(
      context: context,
      initialTime: _parse(r.opensAt),
      helpText: 'Ouverture (${_days[r.dayOfWeek - 1]})',
    );
    if (opens == null || !mounted) return;
    final closes = await showTimePicker(
      context: context,
      initialTime: _parse(r.closesAt),
      helpText: 'Fermeture (${_days[r.dayOfWeek - 1]})',
    );
    if (closes == null) return;
    setState(
      () => _ranges![index] = OpeningRange(
        dayOfWeek: r.dayOfWeek,
        opensAt: _fmt(opens),
        closesAt: _fmt(closes),
      ),
    );
  }

  void _add(int day) => setState(
    () => _ranges!.add(
      OpeningRange(dayOfWeek: day, opensAt: '11:00', closesAt: '22:00'),
    ),
  );

  Future<void> _save() async {
    final r = ref.read(currentRestaurantProvider);
    if (r == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(restaurantRepositoryProvider).setHours(r.id, _ranges!);
      ref.invalidate(restaurantProfileProvider);
      if (mounted) {
        showRiiSnack(context, 'Horaires enregistrés');
        context.pop();
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(restaurantProfileProvider).value;
    if (profile != null) _ranges ??= [...profile.hours];
    final t = context.text;
    return Scaffold(
      appBar: AppBar(title: const Text('Horaires d’ouverture')),
      body: _ranges == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(RiiSpace.gutter),
              children: [
                for (var d = 1; d <= 7; d++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: RiiSpace.md),
                    child: RiiCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(_days[d - 1], style: t.titleMedium),
                              ),
                              if (_ranges!.every((r) => r.dayOfWeek != d))
                                const Tag(label: 'Fermé'),
                              IconButton(
                                tooltip: 'Ajouter une plage',
                                onPressed: () => _add(d),
                                icon: const Icon(Icons.add_rounded),
                              ),
                            ],
                          ),
                          for (final (i, r) in _ranges!.indexed)
                            if (r.dayOfWeek == d)
                              Row(
                                children: [
                                  Expanded(
                                    child: InkWell(
                                      onTap: () => _edit(i),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                          vertical: RiiSpace.sm,
                                        ),
                                        child: Text(
                                          '${r.opensAt} – ${r.closesAt}${r.closesAt.compareTo(r.opensAt) <= 0 ? ' (lendemain)' : ''}',
                                          style: t.bodyLarge,
                                        ),
                                      ),
                                    ),
                                  ),
                                  IconButton(
                                    tooltip: 'Modifier',
                                    onPressed: () => _edit(i),
                                    icon: const Icon(Icons.schedule_rounded),
                                  ),
                                  IconButton(
                                    tooltip: 'Retirer',
                                    onPressed: () =>
                                        setState(() => _ranges!.removeAt(i)),
                                    icon: const Icon(Icons.close_rounded),
                                  ),
                                ],
                              ),
                        ],
                      ),
                    ),
                  ),
                if (_error != null)
                  InlineBanner(message: _error!, tone: BannerTone.danger),
              ],
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RiiSpace.gutter),
          child: RiiButton(
            label: 'Enregistrer les horaires',
            loading: _saving,
            onPressed: _ranges == null ? null : _save,
          ),
        ),
      ),
    );
  }
}
