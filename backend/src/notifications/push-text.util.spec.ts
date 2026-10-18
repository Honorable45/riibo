import { buildPushOptions, buildPushText, buildPushUrl } from './push-text.util';

describe('buildPushOptions', () => {
  it("une offre de course expire en 30 s, en haute urgence — inutile livrée plus tard", () => {
    expect(buildPushOptions('DELIVERY_OFFER', { deliveryId: 'd1' })).toEqual({
      ttlSeconds: 30,
      urgency: 'high',
      tag: 'offer-d1',
    });
  });

  it('une nouvelle commande est urgente pour le restaurant et brève', () => {
    expect(buildPushOptions('ORDER_NEW', { orderId: 'o1' })).toMatchObject({
      ttlSeconds: 600,
      urgency: 'high',
      tag: 'order-o1',
    });
  });

  it("toutes les étapes d'une même commande partagent le même tag : la dernière remplace la précédente à l'écran", () => {
    const tags = (['ORDER_ACCEPTED', 'ORDER_PREPARING', 'ORDER_READY', 'ORDER_ON_THE_WAY', 'ORDER_DELIVERED'] as const).map(
      (type) => buildPushOptions(type, { orderId: 'o1' }).tag,
    );
    expect(new Set(tags)).toEqual(new Set(['order-o1']));
  });

  it('les messages sont regroupés par conversation, en urgence normale', () => {
    expect(buildPushOptions('NEW_MESSAGE', { conversationId: 'c1' })).toEqual({
      ttlSeconds: 86_400,
      urgency: 'normal',
      tag: 'chat-c1',
    });
  });

  it('une promotion est de basse priorité, un type inconnu prend le défaut', () => {
    expect(buildPushOptions('PROMOTION', {}).urgency).toBe('low');
    expect(buildPushOptions('SYSTEM', {})).toEqual({ ttlSeconds: 86_400, urgency: 'normal' });
  });

  it('sans identifiant de commande, aucun tag (jamais « order-undefined »)', () => {
    expect(buildPushOptions('ORDER_READY', {}).tag).toBeUndefined();
  });
});

describe('buildPushText — événements de commande', () => {
  it('un texte court et lisible avec le numéro de commande', () => {
    expect(buildPushText('ORDER_READY', { orderNumber: 1842 })).toEqual({
      title: 'Commande #1842',
      body: '🛍️ Prête',
    });
    expect(buildPushText('ORDER_NEW', { orderNumber: 7 }).title).toContain('#7');
  });

  it("masque l'aperçu d'un message quand l'utilisateur l'a demandé", () => {
    expect(buildPushText('NEW_MESSAGE', { preview: 'secret', actorName: 'Jean' }, true)).toEqual({
      title: 'Riiberaka',
      body: 'Nouveau message',
    });
  });
});

describe('buildPushUrl — un chemin par application', () => {
  it('ouvre la conversation, pour tous les rôles', () => {
    for (const role of ['CLIENT', 'RESTAURANT', 'LIVREUR'] as const) {
      expect(buildPushUrl({ conversationId: 'c1' }, role)).toBe('/messages/c1');
    }
  });

  it('client et restaurant ouvrent la commande, le livreur sa course', () => {
    expect(buildPushUrl({ orderId: 'o1' }, 'CLIENT')).toBe('/orders/o1');
    expect(buildPushUrl({ orderId: 'o1' }, 'RESTAURANT')).toBe('/orders/o1');
    expect(buildPushUrl({ orderId: 'o1', deliveryId: 'd1' }, 'LIVREUR')).toBe('/deliveries/d1');
    expect(buildPushUrl({}, 'LIVREUR')).toBe('/');
  });
});
