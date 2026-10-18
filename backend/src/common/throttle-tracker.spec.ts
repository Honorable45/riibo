import { JwtService } from '@nestjs/jwt';
import { throttleTracker } from './throttle-tracker';

describe('throttleTracker', () => {
  const secret = 'a'.repeat(40);
  const signer = new JwtService();
  const previous = process.env.JWT_ACCESS_SECRET;
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = secret;
  });
  afterAll(() => {
    process.env.JWT_ACCESS_SECRET = previous;
  });

  it("utilise l'utilisateur quand le jeton (en-tête ou cookie) est valide : deux appareils, une même IP, deux quotas", async () => {
    const token = signer.sign({ sub: 'u1' }, { secret });
    expect(
      await throttleTracker({ ip: '1.2.3.4', headers: { authorization: `Bearer ${token}` } }),
    ).toBe('user:u1');
    expect(
      await throttleTracker({ ip: '1.2.3.4', headers: {}, cookies: { riiberaka_access: token } }),
    ).toBe('user:u1');
    const other = signer.sign({ sub: 'u2' }, { secret });
    expect(
      await throttleTracker({ ip: '1.2.3.4', headers: { authorization: `Bearer ${other}` } }),
    ).toBe('user:u2');
  });

  it("retombe sur l'IP sans jeton, avec un jeton falsifié (mauvaise signature) ou expiré", async () => {
    expect(await throttleTracker({ ip: '1.2.3.4', headers: {} })).toBe('ip:1.2.3.4');
    const forged = signer.sign({ sub: 'victime' }, { secret: 'b'.repeat(40) });
    expect(
      await throttleTracker({ ip: '1.2.3.4', headers: { authorization: `Bearer ${forged}` } }),
    ).toBe('ip:1.2.3.4');
    const expired = signer.sign({ sub: 'u1' }, { secret, expiresIn: -10 });
    expect(
      await throttleTracker({ ip: '1.2.3.4', headers: { authorization: `Bearer ${expired}` } }),
    ).toBe('ip:1.2.3.4');
    expect(await throttleTracker({ headers: { authorization: 'Bearer nimportequoi' } })).toBe(
      'ip:unknown',
    );
  });
});
