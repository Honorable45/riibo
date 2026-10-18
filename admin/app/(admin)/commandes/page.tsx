'use client';

import { SearchInput } from '@/components/search-input';
import { DataTable, LoadMore, type Column } from '@/components/table';
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingRows, PageHeader, Select, StatusBadge } from '@/components/ui';
import {
  DELIVERY_TYPE,
  fcfa,
  formatDateTime,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  personName,
} from '@/lib/format';
import { useCursorList, useDriverOptions, useRestaurantOptions, useUrlFilters } from '@/lib/hooks';
import type { OrderRow } from '@/lib/types';

const ACTIVE = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'ON_THE_WAY'];
const KEYS = ['q', 'etat', 'restaurant', 'livreur', 'type', 'du', 'au'] as const;

const columns: Column<OrderRow>[] = [
  { key: 'n', header: 'Commande', cell: (o) => <span className="num">#{o.orderNumber}</span> },
  { key: 'status', header: 'État', cell: (o) => <StatusBadge map={ORDER_STATUS} value={o.status} /> },
  { key: 'date', header: 'Passée le', cell: (o) => <span className="whitespace-nowrap text-ink-2">{formatDateTime(o.createdAt)}</span> },
  { key: 'resto', header: 'Restaurant', cell: (o) => o.restaurant.name },
  {
    key: 'client',
    header: 'Client',
    cell: (o) => (
      <span>
        {personName(o.client)}
        <span className="block text-xs text-muted">{o.client.phone}</span>
      </span>
    ),
    hideOnMobile: true,
  },
  {
    key: 'type',
    header: 'Mode',
    cell: (o) => (
      <span className="text-ink-2">
        {DELIVERY_TYPE[o.deliveryType]}
        {o.delivery?.driver && <span className="block text-xs text-muted">{o.delivery.driver.name}</span>}
      </span>
    ),
    hideOnMobile: true,
  },
  {
    key: 'pay',
    header: 'Paiement',
    cell: (o) => (
      <span className="inline-flex flex-col items-end gap-0.5 md:items-start">
        <StatusBadge map={PAYMENT_STATUS} value={o.paymentStatus} />
        <span className="text-xs text-muted">{PAYMENT_METHOD[o.paymentMethod] ?? o.paymentMethod}</span>
      </span>
    ),
    hideOnMobile: true,
  },
  { key: 'total', header: 'Total', cell: (o) => <span className="font-semibold">{fcfa(o.total)}</span>, align: 'right' },
];

export default function OrdersPage() {
  const [f, set] = useUrlFilters(KEYS);
  const restaurants = useRestaurantOptions();
  const drivers = useDriverOptions();

  const status = f.etat === 'actives' ? ACTIVE : f.etat ? [f.etat] : undefined;
  const query = {
    q: f.q || undefined,
    status,
    restaurantId: f.restaurant || undefined,
    driverId: f.livreur || undefined,
    deliveryType: f.type || undefined,
    from: f.du ? `${f.du}T00:00:00.000Z` : undefined,
    to: f.au ? new Date(Date.parse(`${f.au}T00:00:00Z`) + 86_400_000).toISOString() : undefined,
    limit: 30,
  };
  const list = useCursorList<OrderRow>('orders', '/admin/orders', query, f.etat === 'actives' ? 20_000 : undefined);
  const filtered = KEYS.some((k) => f[k]);

  return (
    <>
      <PageHeader
        title="Commandes"
        description="Toutes les commandes de la plateforme. Les statuts suivent la machine à états du serveur ; seule l’annulation motivée est possible ici."
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
          <SearchInput label="Rechercher une commande" placeholder="N°, nom ou téléphone du client" value={f.q} onChange={(q) => set({ q })} />
          <Select aria-label="État" value={f.etat} onChange={(e) => set({ etat: e.target.value })} className="w-auto">
            <option value="">Tous les états</option>
            <option value="actives">En cours (non terminées)</option>
            {Object.entries(ORDER_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Restaurant" value={f.restaurant} onChange={(e) => set({ restaurant: e.target.value })} className="w-auto max-w-[14rem]">
            <option value="">Tous les restaurants</option>
            {restaurants.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Livreur" value={f.livreur} onChange={(e) => set({ livreur: e.target.value })} className="w-auto max-w-[14rem]">
            <option value="">Tous les livreurs</option>
            {drivers.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {personName(d.user)}
              </option>
            ))}
          </Select>
          <Select aria-label="Mode" value={f.type} onChange={(e) => set({ type: e.target.value })} className="w-auto">
            <option value="">Livraison et à emporter</option>
            <option value="DELIVERY">Livraison</option>
            <option value="PICKUP">À emporter</option>
          </Select>
          <div className="flex items-center gap-1.5">
            <Input type="date" aria-label="Du" value={f.du} max={f.au || undefined} onChange={(e) => set({ du: e.target.value })} className="w-auto" />
            <span className="text-sm text-muted">au</span>
            <Input type="date" aria-label="Au" value={f.au} min={f.du || undefined} onChange={(e) => set({ au: e.target.value })} className="w-auto" />
          </div>
          {filtered && (
            <Button variant="ghost" onClick={() => set(Object.fromEntries(KEYS.map((k) => [k, ''])))}>
              Effacer les filtres
            </Button>
          )}
        </div>
        {f.etat === 'actives' && (
          <p className="border-b border-line px-4 py-2 text-xs text-muted">
            <Badge tone="brand">Suivi</Badge> <span className="ml-1">Liste actualisée toutes les 20 secondes.</span>
          </p>
        )}
        {list.isPending ? (
          <LoadingRows />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <EmptyState
            title={filtered ? 'Aucune commande ne correspond' : 'Aucune commande pour le moment'}
            message={filtered ? 'Modifiez ou effacez les filtres.' : undefined}
          />
        ) : (
          <>
            <DataTable caption="Liste des commandes" rows={list.items} columns={columns} href={(o) => `/commandes/${o.id}`} />
            <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
          </>
        )}
      </Card>
    </>
  );
}
