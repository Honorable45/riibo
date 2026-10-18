'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApprovalActions, Documents } from '@/components/approval';
import { useToast } from '@/components/confirm';
import { DishImage } from '@/components/dish-image';
import { Badge, Card, Detail, EmptyState, ErrorState, LoadingRows, Skeleton, Stat, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { APPROVAL_STATUS, count, fcfa, formatDate, formatDateTime, ITEM_ISSUE, ORDER_STATUS, percent, personName } from '@/lib/format';
import type { RestaurantDetail, RestaurantInsights, RestaurantMenu } from '@/lib/types';

const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DOCS = {
  'owner-id-card': 'Pièce d’identité du responsable',
  'business-registration': 'Registre de commerce',
  'storefront-photo': 'Photo de la devanture',
};

export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const restaurant = useQuery({ queryKey: ['restaurant', id], queryFn: () => api<RestaurantDetail>(`/admin/restaurants/${id}`) });
  const insights = useQuery({ queryKey: ['restaurant-insights', id], queryFn: () => api<RestaurantInsights>(`/admin/restaurants/${id}/insights`) });
  const menu = useQuery({ queryKey: ['restaurant-menu', id], queryFn: () => api<RestaurantMenu>(`/admin/restaurants/${id}/menu`) });

  if (restaurant.isPending) return <LoadingRows rows={8} />;
  if (restaurant.error) return <ErrorState error={restaurant.error} onRetry={() => void restaurant.refetch()} />;
  const r = restaurant.data;
  const owner = r.members.find((m) => m.role === 'OWNER')?.user;

  const act = async (action: string, reason?: string) => {
    await api(`/admin/restaurants/${id}/status`, { method: 'PATCH', body: { action, reason } });
    await queryClient.invalidateQueries({ queryKey: ['restaurant', id] });
    void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
    toast('Statut du restaurant mis à jour');
  };

  return (
    <>
      <Link href="/restaurants" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Restaurants
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <DishImage src={r.logoUrl} alt={`Logo de ${r.name}`} className="size-14" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold">{r.name}</h1>
              <StatusBadge map={APPROVAL_STATUS} value={r.status} />
              {r.status === 'APPROVED' && (r.isPaused ? <Badge tone="warning">En pause</Badge> : <Badge tone="success">Accepte les commandes</Badge>)}
            </div>
            <p className="text-sm text-muted">
              Inscrit le {formatDate(r.createdAt)}
              {r.approvedAt && ` · validé le ${formatDate(r.approvedAt)}`}
            </p>
          </div>
        </div>
        <ApprovalActions status={r.status} subject={r.name} onAction={act} />
      </div>
      {r.statusReason && (
        <p className="mb-4 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          <strong>Dernier motif : </strong>
          {r.statusReason}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {insights.data ? (
          <>
            <Stat label="Commandes (total)" value={count(insights.data.orders.total)} href={`/commandes?restaurant=${id}`} />
            <Stat label="Terminées sur 30 jours" value={count(insights.data.last30Days.delivered)} />
            <Stat label="Repas vendus sur 30 jours" value={fcfa(insights.data.last30Days.meals)} hint="Après remises, hors commission" />
            <Stat label="Taux de refus" value={percent(insights.data.rejectionRate)} hint="Commandes terminées refusées" tone={(insights.data.rejectionRate ?? 0) > 0.2 ? 'danger' : undefined} />
          </>
        ) : insights.error ? (
          <div className="col-span-full"><ErrorState error={insights.error} onRetry={() => void insights.refetch()} /></div>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Card title="Menu" padded={false} action={<Link href={`/plats?restaurant=${id}`} className="text-sm font-semibold text-brand">Superviser les plats</Link>}>
            {menu.isPending ? (
              <LoadingRows rows={3} />
            ) : menu.error ? (
              <ErrorState error={menu.error} onRetry={() => void menu.refetch()} />
            ) : [...menu.data.categories.flatMap((c) => c.items), ...menu.data.uncategorized].length === 0 ? (
              <EmptyState title="Aucun plat" message="Le restaurant n’a pas encore créé son menu." />
            ) : (
              <div className="divide-y divide-line">
                {[...menu.data.categories, { id: 'none', name: 'Sans catégorie', items: menu.data.uncategorized }]
                  .filter((c) => c.items.length)
                  .map((c) => (
                    <div key={c.id} className="px-4 py-3">
                      <h3 className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">{c.name}</h3>
                      <ul className="space-y-2">
                        {c.items.map((it) => (
                          <li key={it.id}>
                            <Link href={`/plats/${it.id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-surface-2">
                              <DishImage src={it.imageUrl} alt={it.name} className="size-11" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold">{it.name}</span>
                                <span className="flex flex-wrap gap-1">
                                  {it.issues.map((i) => (
                                    <Badge key={i} tone={i === 'UNAVAILABLE' || i === 'SOLD_OUT' ? 'warning' : 'neutral'}>{ITEM_ISSUE[i] ?? i}</Badge>
                                  ))}
                                </span>
                              </span>
                              <span className="num font-semibold">{fcfa(it.price)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          <Card title="Dernières commandes" padded={false}>
            {!insights.data ? (
              <LoadingRows rows={3} />
            ) : insights.data.recentOrders.length === 0 ? (
              <EmptyState title="Aucune commande" />
            ) : (
              <ul className="divide-y divide-line">
                {insights.data.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/commandes/${o.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <span className="num font-bold">#{o.orderNumber}</span>
                      <StatusBadge map={ORDER_STATUS} value={o.status} />
                      <span className="flex-1 text-sm text-muted">{formatDateTime(o.createdAt)}</span>
                      <span className="num font-semibold">{fcfa(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Informations">
            <dl>
              <Detail label="Téléphone">{r.phone}</Detail>
              <Detail label="Adresse">{r.address}</Detail>
              <Detail label="Quartier">{[r.quarter, r.city].filter(Boolean).join(', ')}</Detail>
              <Detail label="Position">
                {r.latitude != null && r.longitude != null ? (
                  <a className="text-brand hover:underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=17/${r.latitude}/${r.longitude}`}>
                    {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                  </a>
                ) : (
                  'Non renseignée'
                )}
              </Detail>
              <Detail label="Cuisines">{r.categories.map((c) => c.name).join(', ') || '—'}</Detail>
              <Detail label="Frais de livraison">{fcfa(r.deliveryFee)}</Detail>
              <Detail label="Minimum de commande">{fcfa(r.minOrderAmount)}</Detail>
              <Detail label="Préparation">{r.prepTimeMin}–{r.prepTimeMax} min</Detail>
              <Detail label="Note">{r.reviewCount ? `${r.rating.toFixed(1)} / 5 (${r.reviewCount} avis)` : 'Aucun avis'}</Detail>
              <Detail label="Compte de paiement">{r.paymentAccountNumber ?? 'Non renseigné'}</Detail>
            </dl>
            <p className="mt-3 text-xs text-muted">Ces informations sont gérées par le restaurant depuis son application.</p>
          </Card>
          <Card title="Responsables">
            {r.members.length === 0 ? (
              <p className="text-sm text-muted">Aucun membre.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {r.members.map((m) => (
                  <li key={m.user.id} className="flex items-center justify-between gap-2">
                    <Link href={`/clients/${m.user.id}`} className="font-semibold text-brand hover:underline">{personName(m.user)}</Link>
                    <span className="text-muted">
                      {m.role === 'OWNER' ? 'Propriétaire' : 'Équipe'} · {m.user.phone}
                      {!m.user.isActive && ' · suspendu'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!owner && <p className="mt-2 text-xs text-warning">Aucun propriétaire rattaché.</p>}
          </Card>
          <Card title="Horaires">
            {r.hours.length === 0 ? (
              <p className="text-sm text-muted">Aucun horaire : le restaurant apparaît fermé.</p>
            ) : (
              <dl>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const ranges = r.hours.filter((h) => h.dayOfWeek === d);
                  return (
                    <Detail key={d} label={DAYS[d]}>
                      {ranges.length ? ranges.map((h) => `${h.opensAt}–${h.closesAt}`).join(', ') : <span className="text-muted">Fermé</span>}
                    </Detail>
                  );
                })}
              </dl>
            )}
          </Card>
          <Card title="Pièces justificatives">
            <Documents base={`/admin/restaurants/${id}`} docs={r.documents} labels={DOCS} />
            <p className="mt-3 text-xs text-muted">Documents privés : chaque consultation est enregistrée dans le journal d’audit.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
