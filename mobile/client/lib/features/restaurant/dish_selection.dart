import 'restaurant_models.dart';

/// Quantité maximale par ligne (MAX_LINE_QUANTITY du backend).
const maxLineQuantity = 50;

/// Choix en cours d'un plat (options + quantité + précision).
///
/// Reproduit les règles de `resolveSelection` du backend pour guider le
/// client AVANT l'envoi (bouton désactivé, message clair). Le prix affiché est
/// un aperçu : le serveur recalcule et valide tout à l'ajout au panier puis à
/// la commande.
class DishSelection {
  DishSelection(
    this.item, {
    this.quantity = 1,
    Set<String>? optionIds,
    this.note = '',
  }) : optionIds = optionIds ?? _defaults(item);

  final MenuItem item;
  final int quantity;
  final Set<String> optionIds;
  final String note;

  /// Pré-sélectionne l'unique option disponible d'un groupe obligatoire à
  /// choix unique (rien d'autre : jamais de supplément payant ajouté d'office).
  static Set<String> _defaults(MenuItem item) => {
    for (final group in item.optionGroups)
      if (group.minSelect == 1 && group.maxSelect == 1)
        if (group.options.where((o) => o.isAvailable).toList() case [
          final only,
        ])
          only.id,
  };

  int get maxQuantity {
    final limit = item.maxQuantity;
    return limit == null ? maxLineQuantity : limit.clamp(1, maxLineQuantity);
  }

  DishSelection withQuantity(int value) => DishSelection(
    item,
    quantity: value.clamp(1, maxQuantity),
    optionIds: optionIds,
    note: note,
  );

  DishSelection withNote(String value) => DishSelection(
    item,
    quantity: quantity,
    optionIds: optionIds,
    note: value,
  );

  /// Coche/décoche une option en respectant le maximum du groupe : pour un
  /// choix unique, la nouvelle option remplace l'ancienne.
  DishSelection toggle(OptionGroup group, MenuOption option) {
    if (!option.isAvailable) return this;
    final next = {...optionIds};
    if (next.contains(option.id)) {
      // Un choix unique obligatoire ne se décoche pas : on change d'option.
      if (!(group.isSingleChoice && group.isRequired)) next.remove(option.id);
    } else {
      final inGroup = group.options
          .map((o) => o.id)
          .where(next.contains)
          .toList();
      if (group.isSingleChoice) {
        next.removeAll(inGroup);
      } else if (inGroup.length >= group.maxSelect) {
        return this; // maximum atteint : rien ne change
      }
      next.add(option.id);
    }
    return DishSelection(item, quantity: quantity, optionIds: next, note: note);
  }

  int selectedCount(OptionGroup group) =>
      group.options.where((o) => optionIds.contains(o.id)).length;

  bool canAddMore(OptionGroup group) =>
      group.isSingleChoice || selectedCount(group) < group.maxSelect;

  int get unitPrice {
    var total = item.price;
    for (final group in item.optionGroups) {
      for (final option in group.options) {
        if (optionIds.contains(option.id)) total += option.priceDelta;
      }
    }
    return total;
  }

  int get total => unitPrice * quantity;

  /// Premier problème qui empêcherait l'ajout, ou `null`.
  String? get problem {
    if (!item.isAvailable) return '« ${item.name} » n’est plus disponible.';
    for (final group in item.optionGroups) {
      final count = selectedCount(group);
      if (count < group.minSelect) {
        return group.minSelect == 1
            ? 'Choisissez « ${group.name} ».'
            : 'Choisissez au moins ${group.minSelect} « ${group.name} ».';
      }
      if (count > group.maxSelect) {
        return '« ${group.name} » : ${group.maxSelect} au maximum.';
      }
    }
    for (final group in item.optionGroups) {
      for (final option in group.options) {
        if (optionIds.contains(option.id) && !option.isAvailable) {
          return '« ${option.name} » n’est plus disponible.';
        }
      }
    }
    return null;
  }

  bool get isValid => problem == null;

  /// Options choisies, dans l'ordre du menu (identifiants envoyés au serveur).
  List<String> get orderedOptionIds => [
    for (final group in item.optionGroups)
      for (final option in group.options)
        if (optionIds.contains(option.id)) option.id,
  ];
}
