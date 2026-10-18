'use client';

import { SearchInput } from '@/components/search-input';
import { DataTable, LoadMore, type Column } from '@/components/table';
import { Card, EmptyState, ErrorState, LoadingRows, PageHeader, Select, StatusBadge } from '@/components/ui';
import { APPROVAL_STATUS, formatDate, personName } from '@/lib/format';
import { useCursorList, useUrlFilters } from '@/lib/hooks';
import type { RestaurantRow } from '@/lib/types';

const columns: Column<RestaurantRow>[] = [
  { key: 'name', header: 'Restaurant', cell: (r) => r.name },
  { key: 'status', header: 'Statut', cell: (r) => <StatusBadge map={APPROVAL_STATUS} value={r.status} /> },
  { key: 'place', header: 'Lieu', cell: (r) => [r.quarter, r.city].filter(Boolean).join(', ') },
  {
    key: 'owner',
    header: 'Responsable',
    cell: (r) => (
      <span>
        {personName(r.owner)}
        <span className="block text-xs text-muted">{r.owner?.phone}</span>
      </span>
    ),
    hideOnMobile: true,
  },
  { key: 'created', header: 'Inscrit le', cell: (r) => formatDate(r.createdAt), hideOnMobile: true },
];

export default function RestaurantsPage() {
  const [f, set] = useUrlFilters(['q', 'statut'] as const);
  const list = useCursorList<RestaurantRow>('restaurants', '/admin/restaurants', { q: f.q || undefined, status: f.statut || undefined, limit: 30 });
  return (
    <>
      <PageHeader title="Restaurants" description="Dossiers d’inscription, validation, suspension et suivi des établissements partenaires." />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput label="Rechercher un restaurant" placeholder="Nom du restaurant" value={f.q} onChange={(q) => set({ q })} />
          <Select aria-label="Statut" value={f.statut} onChange={(e) => set({ statut: e.target.value })} className="w-auto">
            <option value="">Tous les statuts</option>
            {Object.entries(APPROVAL_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        {list.isPending ? (
          <LoadingRows />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="Aucun restaurant ne correspond" />
        ) : (
          <>
            <DataTable caption="Liste des restaurants" rows={list.items} columns={columns} href={(r) => `/restaurants/${r.id}`} />
            <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
          </>
        )}
      </Card>
    </>
  );
}
