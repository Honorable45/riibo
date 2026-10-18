import type Redis from 'ioredis';
import { haversineKm } from '../common/geo.util';
import { LOCATION_TTL_MS } from './delivery.constants';

export interface DriverPosition {
  latitude: number;
  longitude: number;
  /** Instant de la mesure (ms epoch). */
  at: number;
}

export interface NearbyDriver {
  driverId: string;
  distanceKm: number;
}

/**
 * Position des livreurs. Jamais écrite en base : elle vit dans Redis avec une
 * durée de vie courte (LOCATION_TTL_MS), donc aucun historique GPS n'existe
 * nulle part, et un livreur qui cesse d'émettre disparaît seul des candidats.
 */
export interface DriverLocationStore {
  set(driverId: string, latitude: number, longitude: number): Promise<void>;
  get(driverId: string): Promise<DriverPosition | null>;
  remove(driverId: string): Promise<void>;
  /** Livreurs dont la position est FRAÎCHE dans ce rayon, du plus proche au plus éloigné. */
  nearby(latitude: number, longitude: number, radiusKm: number, limit: number): Promise<NearbyDriver[]>;
}

export class MemoryDriverLocationStore implements DriverLocationStore {
  private readonly positions = new Map<string, DriverPosition>();

  private fresh(driverId: string): DriverPosition | null {
    const position = this.positions.get(driverId);
    if (!position) return null;
    if (Date.now() - position.at > LOCATION_TTL_MS) {
      this.positions.delete(driverId);
      return null;
    }
    return position;
  }

  async set(driverId: string, latitude: number, longitude: number): Promise<void> {
    this.positions.set(driverId, { latitude, longitude, at: Date.now() });
  }

  async get(driverId: string): Promise<DriverPosition | null> {
    return this.fresh(driverId);
  }

  async remove(driverId: string): Promise<void> {
    this.positions.delete(driverId);
  }

  async nearby(latitude: number, longitude: number, radiusKm: number, limit: number): Promise<NearbyDriver[]> {
    const found: NearbyDriver[] = [];
    for (const driverId of [...this.positions.keys()]) {
      const position = this.fresh(driverId);
      if (!position) continue;
      const distanceKm = haversineKm({ latitude, longitude }, position);
      if (distanceKm <= radiusKm) found.push({ driverId, distanceKm });
    }
    return found.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
  }
}

/**
 * `geo:drivers` (index géographique) + `driver:loc:<id>` (position + TTL).
 * GEOADD n'a pas d'expiration par membre : la fraîcheur se lit sur la clé à
 * TTL, et les membres périmés sont retirés de l'index à la lecture.
 */
export class RedisDriverLocationStore implements DriverLocationStore {
  private static readonly GEO_KEY = 'geo:drivers';

  constructor(private readonly redis: Redis) {}

  private key(driverId: string): string {
    return `driver:loc:${driverId}`;
  }

  async set(driverId: string, latitude: number, longitude: number): Promise<void> {
    await this.redis
      .multi()
      .geoadd(RedisDriverLocationStore.GEO_KEY, longitude, latitude, driverId)
      .set(this.key(driverId), JSON.stringify({ latitude, longitude, at: Date.now() }), 'PX', LOCATION_TTL_MS)
      .exec();
  }

  async get(driverId: string): Promise<DriverPosition | null> {
    const raw = await this.redis.get(this.key(driverId));
    return raw ? (JSON.parse(raw) as DriverPosition) : null;
  }

  async remove(driverId: string): Promise<void> {
    await this.redis.multi().zrem(RedisDriverLocationStore.GEO_KEY, driverId).del(this.key(driverId)).exec();
  }

  async nearby(latitude: number, longitude: number, radiusKm: number, limit: number): Promise<NearbyDriver[]> {
    // On demande davantage que `limit` : certains membres de l'index sont périmés.
    const rows = (await this.redis.geosearch(
      RedisDriverLocationStore.GEO_KEY,
      'FROMLONLAT',
      longitude,
      latitude,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'COUNT',
      limit * 4,
      'WITHDIST',
    )) as Array<[string, string]>;
    if (rows.length === 0) return [];

    const live = await this.redis.mget(rows.map(([driverId]) => this.key(driverId)));
    const result: NearbyDriver[] = [];
    const stale: string[] = [];
    rows.forEach(([driverId, distance], index) => {
      if (live[index]) result.push({ driverId, distanceKm: Number(distance) });
      else stale.push(driverId);
    });
    if (stale.length > 0) await this.redis.zrem(RedisDriverLocationStore.GEO_KEY, ...stale);
    return result.slice(0, limit);
  }
}
