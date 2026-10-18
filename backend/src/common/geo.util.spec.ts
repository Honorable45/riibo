import { boundingBox, haversineKm } from './geo.util';

describe('geo.util', () => {
  const agoe = { latitude: 6.2311, longitude: 1.1953 };
  const tokoin = { latitude: 6.1611, longitude: 1.2229 };

  it('distance nulle entre deux points identiques', () => {
    expect(haversineKm(agoe, agoe)).toBeCloseTo(0, 6);
  });

  it('distance Agoè → Tokoin cohérente (~8 km)', () => {
    const km = haversineKm(agoe, tokoin);
    expect(km).toBeGreaterThan(7);
    expect(km).toBeLessThan(9);
  });

  it('est symétrique', () => {
    expect(haversineKm(agoe, tokoin)).toBeCloseTo(haversineKm(tokoin, agoe), 9);
  });

  it('la boîte englobante contient tout point situé dans le rayon', () => {
    const box = boundingBox(agoe, 10);
    expect(tokoin.latitude).toBeGreaterThanOrEqual(box.minLat);
    expect(tokoin.latitude).toBeLessThanOrEqual(box.maxLat);
    expect(tokoin.longitude).toBeGreaterThanOrEqual(box.minLng);
    expect(tokoin.longitude).toBeLessThanOrEqual(box.maxLng);
  });

  it('la boîte englobante exclut un point très éloigné', () => {
    const box = boundingBox(agoe, 5);
    const kara = { latitude: 9.55, longitude: 1.19 };
    expect(kara.latitude > box.maxLat).toBe(true);
  });
});
