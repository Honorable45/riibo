import type { OrderStatus } from '@prisma/client';
import { ActorKind, findTransition, FINAL_STATUSES, OrderAction, TRANSITIONS } from './order-transitions';

const ALL_STATUSES: OrderStatus[] = [
  'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'ON_THE_WAY',
  'DELIVERED', 'CANCELLED', 'REJECTED',
];
const ALL_ACTORS: ActorKind[] = ['CLIENT', 'RESTAURANT', 'DRIVER', 'ADMIN', 'SYSTEM'];
const ALL_ACTIONS = [...new Set(TRANSITIONS.map((rule) => rule.action))] as OrderAction[];

describe('order-transitions', () => {
  it('parcours nominal livraison, étape par étape, avec le bon acteur', () => {
    const steps: Array<[OrderAction, ActorKind, OrderStatus, OrderStatus]> = [
      ['ACCEPT', 'RESTAURANT', 'PENDING', 'ACCEPTED'],
      ['START_PREPARING', 'RESTAURANT', 'ACCEPTED', 'PREPARING'],
      ['MARK_READY', 'RESTAURANT', 'PREPARING', 'READY'],
      ['ASSIGN', 'SYSTEM', 'READY', 'ASSIGNED'],
      ['PICK_UP', 'DRIVER', 'ASSIGNED', 'PICKED_UP'],
      ['ON_THE_WAY', 'DRIVER', 'PICKED_UP', 'ON_THE_WAY'],
      ['DELIVER', 'DRIVER', 'ON_THE_WAY', 'DELIVERED'],
    ];
    for (const [action, actor, from, to] of steps) {
      const result = findTransition(action, actor, from, 'DELIVERY');
      expect(result).toMatchObject({ ok: true, rule: { to } });
    }
  });

  it('retrait sur place : le restaurant remet la commande, sans livreur', () => {
    expect(findTransition('HAND_OVER', 'RESTAURANT', 'READY', 'PICKUP')).toMatchObject({ ok: true });
    expect(findTransition('HAND_OVER', 'RESTAURANT', 'READY', 'DELIVERY')).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(findTransition('ASSIGN', 'SYSTEM', 'READY', 'PICKUP')).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('un client ne peut JAMAIS marquer une commande comme livrée, ni aucune action du restaurant ou du livreur', () => {
    for (const action of ['ACCEPT', 'REJECT', 'START_PREPARING', 'MARK_READY', 'ASSIGN', 'PICK_UP', 'ON_THE_WAY', 'DELIVER', 'HAND_OVER'] as OrderAction[]) {
      for (const from of ALL_STATUSES) {
        expect(findTransition(action, 'CLIENT', from, 'DELIVERY').ok).toBe(false);
        expect(findTransition(action, 'CLIENT', from, 'PICKUP').ok).toBe(false);
      }
    }
  });

  it('un restaurant ne peut pas livrer, et un livreur ne peut pas accepter/préparer', () => {
    for (const from of ALL_STATUSES) {
      expect(findTransition('DELIVER', 'RESTAURANT', from, 'DELIVERY').ok).toBe(false);
      expect(findTransition('ACCEPT', 'DRIVER', from, 'DELIVERY').ok).toBe(false);
      expect(findTransition('MARK_READY', 'DRIVER', from, 'DELIVERY').ok).toBe(false);
    }
  });

  it('on ne saute aucune étape : DELIVERED n\'est atteignable que depuis ON_THE_WAY (livraison)', () => {
    const reaching = TRANSITIONS.filter((rule) => rule.to === 'DELIVERED');
    expect(reaching.map((rule) => [rule.action, rule.from, rule.deliveryType])).toEqual([
      ['HAND_OVER', ['READY'], 'PICKUP'],
      ['DELIVER', ['ON_THE_WAY'], 'DELIVERY'],
    ]);
  });

  it("aucune transition ne part d'un état terminal", () => {
    for (const rule of TRANSITIONS) {
      for (const final of FINAL_STATUSES) expect(rule.from).not.toContain(final);
    }
  });

  it("annulation : le client avant la préparation, le restaurant avant la fin, l'admin partout", () => {
    expect(findTransition('CANCEL', 'CLIENT', 'PENDING', 'DELIVERY').ok).toBe(true);
    expect(findTransition('CANCEL', 'CLIENT', 'ACCEPTED', 'DELIVERY').ok).toBe(true);
    expect(findTransition('CANCEL', 'CLIENT', 'PREPARING', 'DELIVERY')).toEqual({ ok: false, reason: 'WRONG_STATE' });
    expect(findTransition('CANCEL', 'RESTAURANT', 'PREPARING', 'DELIVERY').ok).toBe(true);
    expect(findTransition('CANCEL', 'RESTAURANT', 'READY', 'DELIVERY')).toEqual({ ok: false, reason: 'WRONG_STATE' });
    expect(findTransition('CANCEL', 'ADMIN', 'ON_THE_WAY', 'DELIVERY').ok).toBe(true);
    expect(findTransition('CANCEL', 'ADMIN', 'DELIVERED', 'DELIVERY')).toEqual({ ok: false, reason: 'WRONG_STATE' });
  });

  it('chaque couple (action, état) hors règle est refusé — jamais de transition implicite', () => {
    let allowed = 0;
    for (const action of ALL_ACTIONS) {
      for (const actor of ALL_ACTORS) {
        for (const from of ALL_STATUSES) {
          for (const type of ['DELIVERY', 'PICKUP'] as const) {
            const result = findTransition(action, actor, from, type);
            if (result.ok) {
              allowed += 1;
              expect(result.rule.from).toContain(from);
              expect(result.rule.actors).toContain(actor);
            }
          }
        }
      }
    }
    expect(allowed).toBeGreaterThan(0);
  });
});
