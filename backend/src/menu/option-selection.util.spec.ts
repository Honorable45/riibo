import { BadRequestException } from '@nestjs/common';
import { resolveSelection, SelectableItem } from './option-selection.util';

const item = (overrides: Partial<SelectableItem> = {}): SelectableItem => ({
  id: 'i1',
  name: 'Poulet braisé',
  price: 2500,
  isAvailable: true,
  stock: null,
  maxQuantity: null,
  deletedAt: null,
  optionGroups: [
    {
      id: 'g1',
      name: 'Accompagnement',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'o-alloco', name: 'Alloco', priceDelta: 0, isAvailable: true },
        { id: 'o-frites', name: 'Frites', priceDelta: 300, isAvailable: true },
        { id: 'o-riz', name: 'Riz', priceDelta: 0, isAvailable: false },
      ],
    },
    {
      id: 'g2',
      name: 'Suppléments',
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'o-oeuf', name: 'Œuf', priceDelta: 200, isAvailable: true },
        { id: 'o-piment', name: 'Piment', priceDelta: 0, isAvailable: true },
        { id: 'o-fromage', name: 'Fromage', priceDelta: 400, isAvailable: true },
      ],
    },
  ],
  ...overrides,
});

describe('resolveSelection', () => {
  it('chiffre le plat avec ses suppléments, depuis les prix de la base', () => {
    const result = resolveSelection(item(), ['o-frites', 'o-oeuf'], 2);
    expect(result.unitPrice).toBe(2500 + 300 + 200);
    expect(result.lineTotal).toBe(3000 * 2);
    expect(result.options.map((o) => o.name)).toEqual(['Frites', 'Œuf']);
  });

  it('exige un choix dans un groupe obligatoire', () => {
    expect(() => resolveSelection(item(), [], 1)).toThrow(/choisissez « Accompagnement »/);
  });

  it("refuse plus d'options que le maximum du groupe", () => {
    expect(() =>
      resolveSelection(item(), ['o-alloco', 'o-frites'], 1),
    ).toThrow(/« Accompagnement » 1 au maximum/);
    expect(() =>
      resolveSelection(item(), ['o-alloco', 'o-oeuf', 'o-piment', 'o-fromage'], 1),
    ).toThrow(/« Suppléments » 2 au maximum/);
  });

  it("refuse une option d'un autre plat (id inconnu) ou indisponible", () => {
    expect(() => resolveSelection(item(), ['o-alloco', 'option-autre-plat'], 1)).toThrow(/option inconnue/);
    expect(() => resolveSelection(item(), ['o-riz'], 1)).toThrow(/n'est plus disponible/);
  });

  it('refuse une option choisie deux fois', () => {
    expect(() => resolveSelection(item(), ['o-alloco', 'o-alloco'], 1)).toThrow(BadRequestException);
  });

  it.each([0, -1, 1.5, 51])('refuse la quantité %p', (quantity) => {
    expect(() => resolveSelection(item(), ['o-alloco'], quantity)).toThrow(/Quantité invalide/);
  });

  it('applique la limite par commande et le stock', () => {
    expect(() => resolveSelection(item({ maxQuantity: 3 }), ['o-alloco'], 4)).toThrow(/3 au maximum/);
    expect(() => resolveSelection(item({ stock: 2 }), ['o-alloco'], 3)).toThrow(/il n'en reste que 2/);
    expect(() => resolveSelection(item({ stock: 0 }), ['o-alloco'], 1)).toThrow(/épuisé/);
    expect(resolveSelection(item({ stock: 2 }), ['o-alloco'], 2).lineTotal).toBe(5000);
  });

  it('refuse un plat indisponible ou supprimé', () => {
    expect(() => resolveSelection(item({ isAvailable: false }), ['o-alloco'], 1)).toThrow(/n'est plus disponible/);
    expect(() => resolveSelection(item({ deletedAt: new Date() }), ['o-alloco'], 1)).toThrow(/n'est plus disponible/);
  });
});
