'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DishImage } from '@/components/dish-image';
import { SearchInput } from '@/components/search-input';
import { LoadMore } from '@/components/table';
import { Badge, Card, cx, EmptyState, ErrorState, LoadingRows, PageHeader, Select } from '@/components/ui';
import { count, fcfa, ITEM_ISSUE } from '@/lib/format';
import { useCursorList, useRestaurantOptions, useUrlFilters } from '@/lib/hooks';
import type { MenuItemRow, MenuSummary } from '@/lib/types';

const ISSUE_FILTERS: Array<{ key: string; label: string; summary: keyof MenuSummary }> = [
  { key: '', label: 'Tous', summary: 'total' },
  { key: 'NO_IMAGE', label: 'Sans image', summary: 'noImage' },
  { key: 'UNAVAILABLE', label: 'Indisponibles', summary: 'unavailable' },
  { key: 'SOLD_OUT', label: 'Épuisés', summary: 'soldOut' },
  { key: 'NO_DESCRIPTION', label: 'Sans description', summary: 'noDescription' },
];

export default function DishesPage() {
  const [f, set] = useUrlFilters(['q', 'restaurant', 'defaut', 'dispo'] as const);
  const restaurants = useRestaurantOptions();
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const query = {
    q: f.q || undefined,
    restaurantId: f.restaurant || undefined,
    issue: f.defaut || undefined,
    available: f.dispo || undefined,
    limit: 24,
  };
  const list = useCursorList<MenuItemRow>('menu-items', '/admin/menu-items', query);
  const summary = (list.data?.pages[0] as unknown as { summary?: MenuSummary } | undefined)?.summary;

  return (
    <>
      <PageHeader
        title="Plats"
        description="Supervision des menus de tous les restaurants. Le contenu et les prix restent gérés par chaque restaurant ; l’administration peut retirer un plat de la vente et gérer son image."
      />
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Défauts de fiche">
        {ISSUE_FILTERS.map((i) => (
          <button
            key={i.key}
            type="button"
            aria-pressed={f.defaut === i.key}
            onClick={() => set({ defaut: i.key })}
            className={cx(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
              f.defaut === i.key ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {i.label}
            {summary && <span className="num opacity-70">{count(summary[i.summary])}</span>}
          </button>
        ))}
        {broken.size > 0 && <Badge tone="danger">{broken.size} image{broken.size > 1 ? 's' : ''} introuvable{broken.size > 1 ? 's' : ''} sur cette page</Badge>}
      </div>
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput label="Rechercher un plat" placeholder="Plat ou restaurant" value={f.q} onChange={(q) => set({ q })} />
          <Select aria-label="Restaurant" value={f.restaurant} onChange={(e) => set({ restaurant: e.target.value })} className="w-auto max-w-[16rem]">
            <option value="">Tous les restaurants</option>
            {restaurants.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Disponibilité" value={f.dispo} onChange={(e) => set({ dispo: e.target.value })} className="w-auto">
            <option value="">Disponibles et indisponibles</option>
            <option value="true">Disponibles</option>
            <option value="false">Indisponibles</option>
          </Select>
        </div>
        {list.isPending ? (
          <LoadingRows />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="Aucun plat ne correspond" message="Modifiez ou effacez les filtres." />
        ) : (
          <>
            <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.items.map((it) => {
                const issues = broken.has(it.id) ? ['BROKEN_IMAGE', ...it.issues] : it.issues;
                return (
                  <li key={it.id}>
                    <Link href={`/plats/${it.id}`} className="flex h-full gap-3 rounded-lg border border-line p-2.5 hover:border-line-strong hover:bg-surface-2">
                      <DishImage
                        src={it.imageUrl}
                        alt={it.name}
                        className="aspect-[4/3] w-28"
                        onBroken={() => setBroken((s) => new Set(s).add(it.id))}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{it.name}</p>
                        <p className="truncate text-sm text-muted">
                          {it.restaurant.name}
                          {it.category && ` · ${it.category.name}`}
                        </p>
                        <p className="num mt-0.5 font-semibold">{fcfa(it.price)}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {issues.map((i) => (
                            <Badge key={i} tone={i === 'BROKEN_IMAGE' || i === 'INVALID_PRICE' ? 'danger' : i === 'UNAVAILABLE' || i === 'SOLD_OUT' ? 'warning' : 'neutral'}>
                              {ITEM_ISSUE[i] ?? i}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
          </>
        )}
      </Card>
    </>
  );
}
