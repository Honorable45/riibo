import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

import '../../app/routes.dart';
import 'models.dart';
import 'providers.dart';

/// Étiquette d'état : couleur ET libellé (jamais la couleur seule).
Widget orderStateTag(OrderState state) => Tag(
  label: state.label,
  tone: switch (state) {
    OrderState.pending => TagTone.warning,
    OrderState.accepted || OrderState.preparing => TagTone.brand,
    OrderState.ready || OrderState.assigned => TagTone.success,
    OrderState.cancelled || OrderState.rejected => TagTone.danger,
    _ => TagTone.neutral,
  },
  solid: state == OrderState.pending,
);

/// Affiche [builder] seulement quand le restaurant de l'utilisateur est
/// connu ET validé ; sinon chargement, erreur ou explication du statut.
class RestaurantGate extends ConsumerWidget {
  const RestaurantGate({
    super.key,
    required this.builder,
    this.allowUnapproved = false,
  });

  final Widget Function(BuildContext context, MyRestaurant restaurant) builder;
  final bool allowUnapproved;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(myRestaurantsProvider);
    final current = ref.watch(currentRestaurantProvider);
    if (list.isLoading && current == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (list.hasError && current == null) {
      return ErrorState(
        error: list.error!,
        onRetry: () => ref.invalidate(myRestaurantsProvider),
      );
    }
    if (current == null) {
      return const EmptyState(
        icon: Icons.storefront_outlined,
        title: 'Aucun restaurant lié à ce compte',
        message:
            'Contactez l’équipe Riiberaka pour rattacher votre établissement.',
      );
    }
    if (!current.isApproved && !allowUnapproved) {
      return EmptyState(
        icon: Icons.hourglass_top_rounded,
        title: '${current.name} : ${current.statusLabel.toLowerCase()}',
        message:
            'Les commandes et le tableau de bord seront disponibles dès la validation par Riiberaka.',
        actionLabel: 'Contacter l’assistance',
        onAction: () => context.push(Routes.support),
      );
    }
    return builder(context, current);
  }
}

/// Motif de refus ou d'annulation (exigé par le serveur, 3 à 300 caractères).
Future<String?> askReason(
  BuildContext context, {
  required String title,
  required List<String> presets,
}) => showRiiSheet<String>(
  context,
  builder: (_) => _ReasonSheet(title: title, presets: presets),
);

class _ReasonSheet extends StatefulWidget {
  const _ReasonSheet({required this.title, required this.presets});

  final String title;
  final List<String> presets;

  @override
  State<_ReasonSheet> createState() => _ReasonSheetState();
}

class _ReasonSheetState extends State<_ReasonSheet> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final valid = _text.text.trim().length >= 3;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        RiiSpace.gutter,
        0,
        RiiSpace.gutter,
        RiiSpace.xxl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: t.titleLarge),
          const SizedBox(height: RiiSpace.xs),
          Text('Le client verra ce motif.', style: t.bodySmall),
          const SizedBox(height: RiiSpace.md),
          Wrap(
            spacing: RiiSpace.sm,
            runSpacing: RiiSpace.sm,
            children: [
              for (final p in widget.presets)
                ChoiceChip(
                  label: Text(p),
                  selected: _text.text == p,
                  onSelected: (_) => setState(() => _text.text = p),
                ),
            ],
          ),
          const SizedBox(height: RiiSpace.md),
          TextField(
            controller: _text,
            maxLength: 300,
            minLines: 1,
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Motif'),
          ),
          const SizedBox(height: RiiSpace.sm),
          RiiButton(
            label: 'Confirmer',
            variant: RiiButtonVariant.danger,
            onPressed: valid
                ? () => Navigator.of(context).pop(_text.text.trim())
                : null,
          ),
        ],
      ),
    );
  }
}

/// Choisit une photo dans la galerie (réduite à 1600 px, JPEG ~82 %) et la
/// prépare pour l'envoi. `null` si l'utilisateur annule. Le serveur vérifie
/// le format réel et la taille (8 Mo max).
Future<MultipartFile?> pickPhoto(BuildContext context) async {
  try {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 82,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    if (bytes.length > 8 * 1024 * 1024) {
      if (context.mounted) {
        showRiiSnack(context, 'Image trop lourde (8 Mo maximum).');
      }
      return null;
    }
    final name = file.name.isEmpty ? 'photo.jpg' : file.name;
    return MultipartFile.fromBytes(bytes, filename: name);
  } on PlatformException {
    if (context.mounted) {
      showRiiSnack(
        context,
        'Accès aux photos refusé. Autorisez-le dans les réglages.',
      );
    }
    return null;
  }
}

/// Envoi d'une image avec progression ; vrai si le serveur l'a acceptée.
Future<bool> uploadWithProgress(
  BuildContext context,
  Future<void> Function(void Function(double) onProgress) upload,
) async {
  final progress = ValueNotifier<double>(0);
  var done = false;
  final dialog = showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (context) => AlertDialog(
      title: const Text('Envoi de l’image'),
      content: ValueListenableBuilder<double>(
        valueListenable: progress,
        builder: (_, v, _) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            LinearProgressIndicator(value: v == 0 ? null : v),
            const SizedBox(height: RiiSpace.sm),
            Text('${(v * 100).round()} %'),
          ],
        ),
      ),
    ),
  );
  try {
    await upload((v) => progress.value = v);
    done = true;
  } on ApiException catch (error) {
    if (context.mounted) showRiiSnack(context, error.message);
  } finally {
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
    await dialog;
    progress.dispose();
  }
  if (done && context.mounted) showRiiSnack(context, 'Image enregistrée');
  return done;
}
