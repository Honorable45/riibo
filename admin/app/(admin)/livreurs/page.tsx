'use client';

import { SearchInput } from '@/components/search-input';
import { DataTable, LoadMore, type Column } from '@/components/table';
import { Badge, Card, EmptyState, ErrorState, LoadingRows, PageHeader, Select, StatusBadge } from '@/components/ui';
import { APPROVAL_STATUS, count, formatDate, personName, VEHICLE } from '@/lib/format';
import { useCursorList, useUrlFilters } from '@/lib/hooks';
import type { DriverRow } from '@/lib/types';

const columns: Column<DriverRow>[] = [
  { key: 'name', header: 'Livreur', cell: (d) => personName(d.user) },
  { key: 'status', header: 'Dossier', cell: (d) => <StatusBadge map={APPROVAL_STATUS} value={d.status} /> },
  { key: 'online', header: 'Disponibilité', cell: (d) => (d.isOnline ? <Badge tone="success">En ligne</Badge> : <Badge>Hors ligne</Badge>) },
  { key: 'vehicle', header: 'Véhicule', cell: (d) => `${VEHICLE[d.vehicleType] ?? d.vehicleType}${d.plateNumber ? ` · ${d.plateNumber}` : ''}`, hideOnMobile: true },
  { key: 'done', header: 'Livraisons', cell: (d) => count(d.totalDeliveries), align: 'right' },
  { key: 'phone', header: 'Téléphone', cell: (d) => d.user.phone, hideOnMobile: true },
  { key: 'created', header: 'Inscrit le', cell: (d) => formatDate(d.createdAt), hideOnMobile: true },
];

export default function DriversPage() {
  const [f, set] = useUrlFilters(['q', 'statut'] as const);
  const list = useCursorList<DriverRow>('drivers', '/admin/drivers', { q: f.q || undefined, status: f.statut || undefined, limit: 30 }, 30_000);
  return (
    <>
      <PageHeader title="Livreurs" description="Dossiers, validation et activité des livreurs. La disponibilité est actualisée toutes les 30 secondes." />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput label="Rechercher un livreur" placeholder="Nom ou téléphone" value={f.q} onChange={(q) => set({ q })} />
          <Select aria-label="Statut du dossier" value={f.statut} onChange={(e) => set({ statut: e.target.value })} className="w-auto">
            <option value="">Tous les dossiers</option>
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
          <EmptyState title="Aucun livreur ne correspond" />
        ) : (
          <>
            <DataTable caption="Liste des livreurs" rows={list.items} columns={columns} href={(d) => `/livreurs/${d.id}`} />
            <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
          </>
        )}
      </Card>
    </>
  );
}
