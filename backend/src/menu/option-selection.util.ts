import { BadRequestException } from '@nestjs/common';

export const MAX_LINE_QUANTITY = 50;

export interface SelectableOption {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

export interface SelectableItem {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  stock: number | null;
  maxQuantity: number | null;
  deletedAt: Date | null;
  optionGroups: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: SelectableOption[];
  }>;
}

export interface ResolvedSelection {
  /** Snapshot des options choisies (id conservé pour « commander à nouveau »). */
  options: Array<{ id: string; name: string; priceDelta: number }>;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Source de vérité UNIQUE pour valider et chiffrer une ligne (plat + options +
 * quantité), utilisée à l'ajout au panier ET à la création de la commande.
 * Les prix viennent toujours de la base : le client n'envoie que des
 * identifiants, jamais un montant.
 */
export function resolveSelection(
  item: SelectableItem,
  optionIds: string[],
  quantity: number,
): ResolvedSelection {
  if (item.deletedAt || !item.isAvailable) {
    throw new BadRequestException(`« ${item.name} » n'est plus disponible.`);
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    throw new BadRequestException(`Quantité invalide (1 à ${MAX_LINE_QUANTITY}).`);
  }
  if (item.maxQuantity !== null && quantity > item.maxQuantity) {
    throw new BadRequestException(
      `« ${item.name} » : ${item.maxQuantity} au maximum par commande.`,
    );
  }
  if (item.stock !== null && quantity > item.stock) {
    throw new BadRequestException(
      item.stock === 0
        ? `« ${item.name} » est épuisé.`
        : `« ${item.name} » : il n'en reste que ${item.stock}.`,
    );
  }
  if (new Set(optionIds).size !== optionIds.length) {
    throw new BadRequestException('Une option est choisie plusieurs fois.');
  }

  const optionById = new Map<string, { groupId: string; option: SelectableOption }>();
  for (const group of item.optionGroups) {
    for (const option of group.options) optionById.set(option.id, { groupId: group.id, option });
  }

  const chosen: ResolvedSelection['options'] = [];
  const countByGroup = new Map<string, number>();
  for (const optionId of optionIds) {
    const entry = optionById.get(optionId);
    // Une option qui n'appartient pas à CE plat est refusée : jamais de
    // supplément d'un autre plat (ou d'un autre restaurant) par id deviné.
    if (!entry) throw new BadRequestException(`« ${item.name} » : option inconnue.`);
    if (!entry.option.isAvailable) {
      throw new BadRequestException(`« ${entry.option.name} » n'est plus disponible.`);
    }
    countByGroup.set(entry.groupId, (countByGroup.get(entry.groupId) ?? 0) + 1);
    chosen.push({
      id: entry.option.id,
      name: entry.option.name,
      priceDelta: entry.option.priceDelta,
    });
  }

  for (const group of item.optionGroups) {
    const count = countByGroup.get(group.id) ?? 0;
    if (count < group.minSelect) {
      throw new BadRequestException(
        group.minSelect === 1
          ? `« ${item.name} » : choisissez « ${group.name} ».`
          : `« ${item.name} » : choisissez au moins ${group.minSelect} « ${group.name} ».`,
      );
    }
    if (count > group.maxSelect) {
      throw new BadRequestException(
        `« ${item.name} » : « ${group.name} » ${group.maxSelect} au maximum.`,
      );
    }
  }

  const unitPrice = item.price + chosen.reduce((sum, option) => sum + option.priceDelta, 0);
  return { options: chosen, unitPrice, lineTotal: unitPrice * quantity };
}
