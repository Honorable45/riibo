import 'package:flutter/material.dart';

import 'package:riiberaka_core/app/theme/app_theme.dart';
import 'package:riiberaka_core/app/theme/tokens.dart';
import 'package:riiberaka_core/core/api/api_exception.dart';
import 'package:riiberaka_core/core/format/money.dart';
import 'package:riiberaka_core/core/widgets/buttons.dart';
import 'package:riiberaka_core/core/widgets/primitives.dart';
import 'package:riiberaka_core/core/widgets/skeleton.dart';
import 'package:riiberaka_core/core/widgets/states.dart';

/// Catalogue des composants (debug uniquement) : vérification visuelle du
/// système de design. Aucune donnée affichée ici n'est présentée comme réelle.
class DesignCatalogScreen extends StatefulWidget {
  const DesignCatalogScreen({super.key});

  @override
  State<DesignCatalogScreen> createState() => _DesignCatalogScreenState();
}

class _DesignCatalogScreenState extends State<DesignCatalogScreen> {
  int _quantity = 1;
  bool _loading = false;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = context.text;
    return Scaffold(
      appBar: AppBar(title: const Text('Système de design')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: RiiSpace.xxxl),
        children: [
          const SectionHeader(title: 'Typographie'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Titre d’écran', style: t.headlineMedium),
                Text('Titre de section', style: t.titleLarge),
                Text('Titre de carte', style: t.titleMedium),
                Text(
                  'Texte courant : poulet braisé, attiéké et piment frais, '
                  'préparé à la commande.',
                  style: t.bodyMedium,
                ),
                Text('Texte secondaire · 20–35 min', style: t.bodySmall),
                const SizedBox(height: RiiSpace.xs),
                Text(formatXof(4500), style: t.titleMedium),
              ],
            ),
          ),
          const SectionHeader(title: 'Couleurs'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            child: Wrap(
              spacing: RiiSpace.sm,
              runSpacing: RiiSpace.sm,
              children: [
                for (final (name, color) in [
                  ('Marque', p.brand),
                  ('Encre', p.ink),
                  ('Atténué', p.muted),
                  ('Ligne', p.line),
                  ('Fond', p.canvas),
                  ('Succès', p.success),
                  ('Attention', p.warning),
                  ('Danger', p.danger),
                ])
                  Column(
                    children: [
                      Container(
                        width: 72,
                        height: 44,
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: RiiRadius.smAll,
                          border: Border.all(color: p.line),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(name, style: t.labelSmall),
                    ],
                  ),
              ],
            ),
          ),
          const SectionHeader(title: 'Boutons'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            child: Column(
              children: [
                RiiButton(
                  label: 'Commander',
                  trailing: Text(formatXof(4500)),
                  loading: _loading,
                  onPressed: () async {
                    setState(() => _loading = true);
                    await Future<void>.delayed(const Duration(seconds: 1));
                    if (mounted) setState(() => _loading = false);
                  },
                ),
                const SizedBox(height: RiiSpace.sm),
                RiiButton(
                  label: 'Ajouter une adresse',
                  icon: Icons.add_location_alt_outlined,
                  variant: RiiButtonVariant.secondary,
                  onPressed: () {},
                ),
                const SizedBox(height: RiiSpace.sm),
                const RiiButton(label: 'Indisponible', onPressed: null),
                const SizedBox(height: RiiSpace.sm),
                Row(
                  children: [
                    RiiButton(
                      label: 'Annuler la commande',
                      variant: RiiButtonVariant.danger,
                      small: true,
                      expand: false,
                      onPressed: () {},
                    ),
                    const SizedBox(width: RiiSpace.sm),
                    RiiButton(
                      label: 'Voir tout',
                      variant: RiiButtonVariant.ghost,
                      small: true,
                      expand: false,
                      onPressed: () {},
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SectionHeader(title: 'Champs'),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            child: Column(
              children: [
                TextField(
                  decoration: InputDecoration(
                    labelText: 'Quartier',
                    hintText: 'Ex. Agoè, Bè, Tokoin',
                  ),
                ),
                SizedBox(height: RiiSpace.md),
                TextField(
                  decoration: InputDecoration(
                    labelText: 'Repère',
                    errorText: 'Indiquez un repère pour le livreur.',
                  ),
                ),
              ],
            ),
          ),
          const SectionHeader(title: 'Étiquettes et quantités'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            child: Wrap(
              spacing: RiiSpace.sm,
              runSpacing: RiiSpace.sm,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const Tag(label: 'Ouvert', tone: TagTone.success),
                const Tag(label: 'Fermé', tone: TagTone.danger),
                const Tag(label: 'En préparation', tone: TagTone.warning),
                const Tag(label: 'Nouveau', tone: TagTone.brand),
                const Tag(
                  label: 'Livraison',
                  icon: Icons.delivery_dining_outlined,
                ),
                const RatingLabel(rating: 4.6, count: 128),
                QuantityStepper(
                  value: _quantity,
                  onChanged: (v) => setState(() => _quantity = v),
                  onRemove: () {},
                ),
              ],
            ),
          ),
          const SectionHeader(title: 'Bandeaux'),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            child: Column(
              children: [
                InlineBanner(
                  message: 'Commande minimum : 1 000 F.',
                  tone: BannerTone.warning,
                ),
                SizedBox(height: RiiSpace.sm),
                InlineBanner(
                  title: 'Restaurant fermé',
                  message: 'Ouvre demain à 10:00.',
                  tone: BannerTone.danger,
                ),
                SizedBox(height: RiiSpace.sm),
                InlineBanner(
                  message: 'Paiement à la livraison, en espèces.',
                  tone: BannerTone.info,
                ),
              ],
            ),
          ),
          const SectionHeader(title: 'Carte et chargement'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            child: Column(
              children: [
                RiiCard(
                  onTap: () {},
                  child: Row(
                    children: [
                      const SkeletonScope(
                        child: SkeletonBox(width: 56, height: 56, radius: 10),
                      ),
                      const SizedBox(width: RiiSpace.md),
                      Expanded(
                        child: SkeletonScope(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: const [
                              SkeletonBox(width: 140, height: 14),
                              SizedBox(height: 8),
                              SkeletonBox(width: 90, height: 12),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SectionHeader(title: 'États'),
          const EmptyState(
            icon: Icons.receipt_long_outlined,
            title: 'Aucune commande pour l’instant',
            message: 'Vos commandes apparaîtront ici.',
            compact: true,
          ),
          ErrorState(
            error: const ApiException(
              ApiErrorKind.offline,
              'Connexion impossible. Vérifiez votre accès à Internet.',
            ),
            onRetry: () {},
            compact: true,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: RiiSpace.gutter),
            child: RiiButton(
              label: 'Ouvrir une feuille',
              variant: RiiButtonVariant.secondary,
              onPressed: () => showRiiSheet<void>(
                context,
                builder: (context) => Padding(
                  padding: const EdgeInsets.fromLTRB(
                    RiiSpace.gutter,
                    0,
                    RiiSpace.gutter,
                    RiiSpace.xxl,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Feuille inférieure', style: t.titleLarge),
                      const SizedBox(height: RiiSpace.sm),
                      Text(
                        'Utilisée pour les options d’un plat et les choix rapides.',
                        style: t.bodyMedium,
                      ),
                      const SizedBox(height: RiiSpace.xl),
                      RiiButton(
                        label: 'Fermer',
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
