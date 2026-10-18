import { isAllowedPushEndpoint } from './push-endpoint.util';

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGxyz',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('accepte le service de push officiel %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ['http (non chiffré)', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['localhost', 'https://localhost/x'],
    ['loopback IPv4', 'https://127.0.0.1/x'],
    ['réseau privé', 'https://10.0.0.5/x'],
    ['métadonnées cloud', 'https://169.254.169.254/latest/meta-data/'],
    ['IPv6', 'https://[::1]/x'],
    ['hôte quelconque', 'https://evil.example.com/x'],
    ['suffixe trompeur', 'https://fcm.googleapis.com.evil.com/x'],
    ['préfixe trompeur', 'https://evilfcm.googleapis.com.attacker.io/x'],
    ['identifiants dans l\'URL', 'https://fcm.googleapis.com@evil.com/x'],
    ['mot de passe dans l\'URL', 'https://user:pass@fcm.googleapis.com/x'],
    ['port inhabituel', 'https://fcm.googleapis.com:8443/x'],
    ['schéma file', 'file:///etc/passwd'],
    ['chaîne vide', ''],
    ['pas une URL', 'pas-une-url'],
  ])('refuse : %s', (_label, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it('refuse un endpoint démesuré et un type inattendu', () => {
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${'a'.repeat(3000)}`)).toBe(false);
    expect(isAllowedPushEndpoint(undefined)).toBe(false);
    expect(isAllowedPushEndpoint(42)).toBe(false);
  });

  it('accepte un hôte supplémentaire configuré explicitement, sans jamais élargir le reste', () => {
    process.env.PUSH_ENDPOINT_ALLOWED_HOSTS = 'push.exemple-interne.tg';
    try {
      expect(isAllowedPushEndpoint('https://push.exemple-interne.tg/x')).toBe(true);
      expect(isAllowedPushEndpoint('https://autre.tg/x')).toBe(false);
    } finally {
      delete process.env.PUSH_ENDPOINT_ALLOWED_HOSTS;
    }
  });
});
