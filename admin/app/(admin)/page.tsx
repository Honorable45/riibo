'use client';

import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BarChart, ShareBar } from '@/components/charts';
import { PeriodPicker } from '@/components/period-picker';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, Stat, StatusBadge } from '@/components/ui';
import { api, type CursorPage } from '@/lib/api';
import { count, fcfa, formatDay, ORDER_STATUS, plural, relative } from '@/lib/format';
import { presetPeriod, toRange, type Period } from '@/lib/period';
import type { Finance, OrderRow, Overview } from '@/lib/types';

const ACTIVE = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'ON_THE_WAY'];

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>(() => presetPeriod('7d'));
  const range = toRange(period);

  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<Overview>('/admin/overview'),
    refetchInterval: 30_000,
  });
  const finance = useQuery({
    queryKey: ['finance', range],
    queryFn: () => api<Finance>('/admin/finance', { query: range }),
  });
  const live = useQuery({
    queryKey: ['orders', 'live'],
    queryFn: () => api<CursorPage<OrderRow>>('/admin/orders', { query: { status: ACTIVE, limit: 6 } }),
    refetchInterval: 20_000,
  });

  return (
    <>
      <PageHeader title="Tableau de bord" description="Activité réelle de la plateforme, en heure de Lomé." actions={<PeriodPicker value={period} onChange={setPeriod} />} />

      <section aria-label="Situation actuelle" className="mb-6">
        <h2 className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">En ce moment</h2>
        {overview.error ? (
          <Card>
            <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {overview.data ? (
              <>
                <Stat label="Commandes en cours" value={count(overview.data.orders.inProgress)} hint="Passées aujourd’hui, non terminées" href="/commandes?etat=actives" tone={overview.data.orders.inProgress ? 'warning' : undefined} />
                <Stat label="Livreurs en ligne" value={count(overview.data.drivers.online)} hint={plural(overview.data.drivers.APPROVED ?? 0, 'validé', 'validés')} href="/livreurs" />
                <Stat label="Restaurants validés" value={count(overview.data.restaurants.APPROVED ?? 0)} hint={plural((overview.data.restaurants.PENDING ?? 0) + (overview.data.restaurants.IN_REVIEW ?? 0), 'dossier à traiter', 'dossiers à traiter')} href="/restaurants" />
                <Stat label="Clients inscrits" value={count(overview.data.clients)} href="/clients" />
              </>
            ) : (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
            )}
          </div>
        )}
      </section>

      {finance.error ? (
        <Card>
          <ErrorState error={finance.error} onRetry={() => void finance.refetch()} />
        </Card>
      ) : !finance.data ? (
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : (
        <PeriodView data={finance.data} />
      )}

      <Card title="Commandes à suivre" className="mt-6" padded={false} action={<Link href="/commandes?etat=actives" className="text-sm font-semibold text-brand">Tout voir</Link>}>
        {live.error ? (
          <ErrorState error={live.error} onRetry={() => void live.refetch()} />
        ) : !live.data ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : live.data.items.length === 0 ? (
          <EmptyState title="Aucune commande en cours" message="Les commandes non terminées apparaîtront ici, actualisées toutes les 20 secondes." />
        ) : (
          <ul className="divide-y divide-line">
            {live.data.items.map((o) => (
              <li key={o.id}>
                <Link href={`/commandes/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2">
                  <span className="num font-bold">#{o.orderNumber}</span>
                  <StatusBadge map={ORDER_STATUS} value={o.status} />
                  <span className="order-last min-w-0 basis-full truncate text-sm text-ink-2 sm:order-none sm:basis-auto sm:flex-1">{o.restaurant.name}</span>
                  <span className="num text-sm font-semibold">{fcfa(o.total)}</span>
                  <span className="text-xs text-muted">{relative(o.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function PeriodView({ data }: { data: Finance }) {
  const series = data.series.map((d) => ({ key: d.date, label: formatDay(d.date), date: d.date, orders: d.orders, value: d.value }));
  const empty = data.orders.total === 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Commandes" value={count(data.orders.total)} hint={`${count(data.orders.inProgress)} encore en cours`} />
        <Stat label="Terminées" value={count(data.orders.delivered)} tone={data.orders.delivered ? 'success' : undefined} />
        <Stat label="Annulées ou refusées" value={count(data.orders.cancelled + data.orders.rejected)} tone={data.orders.cancelled + data.orders.rejected ? 'danger' : undefined} hint={plural(data.orders.rejected, 'refusée par un restaurant', 'refusées par un restaurant')} />
        <Stat label="Panier moyen" value={fcfa(data.delivered.averageOrder)} hint="Commandes terminées" />
        <Stat label="Valeur des commandes terminées" value={fcfa(data.delivered.orderValue)} hint="Payée par les clients, frais compris" />
        <Stat label="Repas (après remises)" value={fcfa(data.delivered.mealsAfterDiscount)} hint="Part des restaurants, hors commission" />
        <Stat label="Frais de livraison" value={fcfa(data.delivered.deliveryFees)} hint="Facturés aux clients" />
        <Stat label="Paiements encaissés" value={fcfa(data.payments.paid)} hint={`${fcfa(data.payments.pending)} en attente`} href="/finances" />
      </div>

      <p className="mt-3 flex items-start gap-2 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Aucune commission Riiberaka n’est configurée dans le système : ces montants ne sont pas des revenus de la plateforme.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Commandes par jour">
          {empty ? <EmptyState title="Aucune commande sur la période" /> : <BarChart data={series.map((d) => ({ key: d.key, label: d.label, value: d.orders }))} format={(v) => `${count(v)} commande${v > 1 ? 's' : ''}`} title="Nombre de commandes passées par jour" />}
        </Card>
        <Card title="Valeur des commandes terminées par jour">
          {data.delivered.count === 0 ? <EmptyState title="Aucune commande terminée sur la période" /> : <BarChart data={series.map((d) => ({ key: d.key, label: d.label, value: d.value }))} format={fcfa} title="Valeur des commandes terminées par jour, en francs CFA" />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Issue des commandes">
          {empty ? (
            <EmptyState title="Aucune commande sur la période" />
          ) : (
            <ShareBar
              parts={[
                { key: 'done', label: 'Terminées', value: data.orders.delivered, color: 'var(--success)' },
                { key: 'live', label: 'En cours', value: data.orders.inProgress, color: 'var(--brand)' },
                { key: 'cancel', label: 'Annulées', value: data.orders.cancelled, color: 'var(--warning)' },
                { key: 'reject', label: 'Refusées', value: data.orders.rejected, color: 'var(--danger)' },
              ]}
            />
          )}
        </Card>
        <Card title="Restaurants les plus actifs" padded={false}>
          {data.topRestaurants.length === 0 ? (
            <EmptyState title="Aucune vente terminée sur la période" />
          ) : (
            <ol className="divide-y divide-line">
              {data.topRestaurants.map((r, i) => (
                <li key={r.id}>
                  <Link href={`/restaurants/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span className="num w-5 text-sm text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                    <span className="num text-sm text-muted">{count(r.orders)} cmd</span>
                    <span className="num w-24 text-right text-sm font-bold">{fcfa(r.meals)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
