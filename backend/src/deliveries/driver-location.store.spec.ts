import { MemoryDriverLocationStore } from './driver-location.store';
import { AttemptLimiter } from './attempt-limiter';

describe('MemoryDriverLocationStore', () => {
  const agoe = { latitude: 6.2311, longitude: 1.1953 };
  const tokoin = { latitude: 6.1611, longitude: 1.2229 }; // ~8 km
  const kara = { latitude: 9.55, longitude: 1.19 }; // très loin

  it('renvoie les livreurs du rayon, du plus proche au plus éloigné', async () => {
    const store = new MemoryDriverLocationStore();
    await store.set('loin', kara.latitude, kara.longitude);
    await store.set('moyen', tokoin.latitude, tokoin.longitude);
    await store.set('proche', agoe.latitude + 0.001, agoe.longitude);

    const found = await store.nearby(agoe.latitude, agoe.longitude, 12, 10);
    expect(found.map((d) => d.driverId)).toEqual(['proche', 'moyen']);
    expect((await store.nearby(agoe.latitude, agoe.longitude, 3, 10)).map((d) => d.driverId)).toEqual(['proche']);
  });

  it('respecte la limite demandée', async () => {
    const store = new MemoryDriverLocationStore();
    for (const id of ['a', 'b', 'c', 'd']) await store.set(id, agoe.latitude, agoe.longitude);
    expect(await store.nearby(agoe.latitude, agoe.longitude, 5, 2)).toHaveLength(2);
  });

  it("oublie un livreur qui n'émet plus (position périmée) et sait le retirer", async () => {
    const store = new MemoryDriverLocationStore();
    jest.useFakeTimers();
    try {
      await store.set('d1', agoe.latitude, agoe.longitude);
      expect(await store.get('d1')).not.toBeNull();
      jest.advanceTimersByTime(91_000);
      expect(await store.get('d1')).toBeNull();
      expect(await store.nearby(agoe.latitude, agoe.longitude, 5, 5)).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
    await store.set('d2', agoe.latitude, agoe.longitude);
    await store.remove('d2');
    expect(await store.get('d2')).toBeNull();
  });
});

describe('AttemptLimiter (mémoire)', () => {
  it('verrouille après le nombre d\'échecs autorisé, puis se réinitialise', async () => {
    const limiter = new AttemptLimiter(null, 3, 60);
    expect(await limiter.isLocked('d1')).toBe(false);
    await limiter.recordFailure('d1');
    await limiter.recordFailure('d1');
    expect(await limiter.isLocked('d1')).toBe(false);
    await limiter.recordFailure('d1');
    expect(await limiter.isLocked('d1')).toBe(true);
    expect(await limiter.isLocked('autre')).toBe(false);
    await limiter.reset('d1');
    expect(await limiter.isLocked('d1')).toBe(false);
  });
});
