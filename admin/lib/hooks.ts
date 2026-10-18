'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, type CursorPage, type RequestOptions } from './api';
import type { DriverRow, RestaurantRow } from './types';

/** Liste paginée par curseur (« Afficher plus »), relancée quand les filtres changent. */
export function useCursorList<T>(key: string, path: string, query: RequestOptions['query'], refetchInterval?: number) {
  const result = useInfiniteQuery({
    queryKey: [key, query],
    queryFn: ({ pageParam, signal }) =>
      api<CursorPage<T>>(path, { query: { ...query, cursor: pageParam ?? undefined }, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval,
  });
  const items = result.data?.pages.flatMap((p) => p.items) ?? [];
  return { ...result, items };
}

/** Filtres lus et écrits dans l'URL : une vue filtrée se partage par lien. */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>;
  const set = useCallback(
    (patch: Partial<Record<K, string>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch) as Array<[K, string | undefined]>) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return [values, set] as const;
}

/** Saisie de recherche : n'interroge le serveur qu'après une courte pause. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Listes de référence pour les filtres (100 maximum, limite du serveur). */
export function useRestaurantOptions() {
  return useQuery({
    queryKey: ['restaurant-options'],
    queryFn: () => api<CursorPage<RestaurantRow>>('/admin/restaurants', { query: { limit: 100 } }),
    staleTime: 5 * 60_000,
    select: (d) => d.items.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  });
}

export function useDriverOptions() {
  return useQuery({
    queryKey: ['driver-options'],
    queryFn: () => api<CursorPage<DriverRow>>('/admin/drivers', { query: { limit: 100 } }),
    staleTime: 5 * 60_000,
    select: (d) => d.items,
  });
}
