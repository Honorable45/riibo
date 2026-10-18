'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PeriodPicker } from '@/components/period-picker';
import { DataTable, LoadMore, type Column } from '@/components/table';
import { Badge, Card, Detail, EmptyState, ErrorState, LoadingRows, PageHeader, Select, Skeleton, Stat, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { count, fcfa, formatDateTime, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, personName } from '@/lib/format';
import { useCursorList } from '@/lib/hooks';
import { presetPeriod, toRange, type Period } from '@/lib/period';
import type { Finance, PaymentRow, PlatformConfig } from '@/lib/types';

const columns: Column<PaymentRow>[] = [
  { key: 'order', header: 'Commande', cell: (p) => <span className="num">#{p.order.orderNumber}</span> },
  { key: 'status', header: 'Paiement', cell: (p) => <StatusBadge map={PAYMENT_STATUS} value={p.status} /> },
  { key: 'ostatus', header: 'Commande', cell: (p) => <StatusBadge map={ORDER_STATUS} value={p.order.status} />, hideOnMobile: true },
  { key: 'method', header: 'Moyen', cell: (p) => `${PAYMENT_METHOD[p.method] ?? p.method} (${p.provider})` },
  { key: 'ref', header: 'Référence', cell: (p) => <span className="font-mono text-xs">{p.providerRef ?? '—'}</span>, hideOnMobile: true },
  { key: 'who', header: 'Client · restaurant', cell: (p) => `${personName(p.order.client)} · ${p.order.restaurant.name}`, hideOnMobile: true },
  { key: 'date', header: 'Date', cell: (p) => formatDateTime(p.paidAt ?? p.createdAt), hideOnMobile: true },
  { key: 'amount', header: 'Montant', cell: (p) => <span className="font-semibold">{fcfa(p.amount)}</span>, align: 'right' },
];

export default function FinancePage() {
  const [period, setPeriod] = useState<Period>(() => presetPeriod('30d'));
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const range = toRange(period);
  const finance = useQuery({ queryKey: ['finance', range], queryFn: () => api<Finance>('/admin/finance', { query: range }) });
  const config = useQuery({ queryKey: ['config'], queryFn: () => api<PlatformConfig>('/admin/config'), staleTime: 5 * 60_000 });
  const payments = useCursorList<PaymentRow>('payments', '/admin/payments', { ...range, status: status || undefined, method: method || undefined, limit: 30 });
  const f = finance.data;

  return (
    <>
      <PageHeader
        title="Finances"
        description="Montants calculés par le serveur à partir des commandes et des paiements enregistrés. Rien n’est estimé ni simulé."
        actions={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      {finance.error ? (
        <Card><ErrorState error={finance.error} onRetry={() => void finance.refetch()} /></Card>
      ) : !f ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}</div>
      ) : (
        <>
          <h2 className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Commandes terminées sur la période</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Valeur totale" value={fcfa(f.delivered.orderValue)} hint={`${count(f.delivered.count)} commandes, frais compris`} />
            <Stat label="Repas" value={fcfa(f.delivered.meals)} hint="Avant remises" />
            <Stat label="Remises" value={fcfa(f.delivered.discounts)} hint={`${count(f.promoRedemptions)} codes promo utilisés`} />
            <Stat label="Frais de livraison" value={fcfa(f.delivered.deliveryFees)} hint="Payés par les clients" />
          </div>

          <h2 className="mt-6 mb-2 text-xs font-bold tracking-wider text-muted uppercase">Paiements créés sur la période</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Encaissés" value={fcfa(f.payments.paid)} tone={f.payments.paid ? 'success' : undefined} hint="Confirmés par le serveur" />
            <Stat label="En attente" value={fcfa(f.payments.pending)} hint="Commandes en cours ou à encaisser" />
            <Stat label="Échoués" value={fcfa(f.payments.failed)} tone={f.payments.failed ? 'danger' : undefined} />
            <Stat label="Remboursés" value={fcfa(f.payments.refunded)} />
          </div>
          {f.payments.pendingOnCancelled.count > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {count(f.payments.pendingOnCancelled.count)} paiement{f.payments.pendingOnCancelled.count > 1 ? 's' : ''} ({fcfa(f.payments.pendingOnCancelled.amount)}) reste{f.payments.pendingOnCancelled.count > 1 ? 'nt' : ''} « en attente » sur des commandes annulées ou refusées.
                Ces sommes ne seront jamais encaissées ; elles sont exclues du montant en attente. Le backend ne clôt pas encore ces paiements (voir l’état d’implémentation).
              </span>
            </p>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card title="Répartition des paiements" padded={false}>
              {f.payments.breakdown.length === 0 ? (
                <EmptyState title="Aucun paiement sur la période" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-muted uppercase">
                        <th className="px-4 py-2 font-semibold">Moyen</th>
                        <th className="px-4 py-2 font-semibold">État</th>
                        <th className="px-4 py-2 text-right font-semibold">Nombre</th>
                        <th className="px-4 py-2 text-right font-semibold">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.payments.breakdown.map((b) => (
                        <tr key={`${b.provider}-${b.method}-${b.status}`} className="border-b border-line last:border-0">
                          <td className="px-4 py-2">{PAYMENT_METHOD[b.method] ?? b.method} <span className="text-muted">({b.provider})</span></td>
                          <td className="px-4 py-2"><StatusBadge map={PAYMENT_STATUS} value={b.status} /></td>
                          <td className="num px-4 py-2 text-right">{count(b.count)}</td>
                          <td className="num px-4 py-2 text-right font-semibold">{fcfa(b.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Commissions et reversements">
              <dl>
                <Detail label="Commission Riiberaka"><Badge tone="warning">Non configurée</Badge></Detail>
                <Detail label="Montant dû aux restaurants">Non calculé</Detail>
                <Detail label="Rémunération des livreurs">Non calculée</Detail>
                <Detail label="Frais des prestataires">Non enregistrés</Detail>
              </dl>
              <p className="mt-3 text-sm text-muted">
                Le schéma de données ne contient ni taux de commission ni règlement : afficher un « revenu Riiberaka » serait une invention.
                Ces calculs nécessitent une évolution validée du backend.
              </p>
            </Card>
          </div>
        </>
      )}

      <Card title="Moyens de paiement" className="mt-4">
        {config.data ? (
          <dl className="grid gap-x-8 sm:grid-cols-3">
            {Object.entries(config.data.payments.methods).map(([m, on]) => (
              <Detail key={m} label={PAYMENT_METHOD[m] ?? m}>
                {on ? <Badge tone="success">Opérationnel</Badge> : <Badge>Non intégré</Badge>}
              </Detail>
            ))}
          </dl>
        ) : (
          <Skeleton className="h-6" />
        )}
        <p className="mt-2 text-xs text-muted">Un paiement n’est confirmé que par le serveur (remise des espèces validée ou notification authentifiée du prestataire), jamais sur capture d’écran.</p>
      </Card>

      <Card title="Paiements" className="mt-4" padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <Select aria-label="État du paiement" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
            <option value="">Tous les états</option>
            {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select aria-label="Moyen de paiement" value={method} onChange={(e) => setMethod(e.target.value)} className="w-auto">
            <option value="">Tous les moyens</option>
            {Object.entries(PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        {payments.isPending ? (
          <LoadingRows />
        ) : payments.error ? (
          <ErrorState error={payments.error} onRetry={() => void payments.refetch()} />
        ) : payments.items.length === 0 ? (
          <EmptyState title="Aucun paiement" message="Aucun paiement ne correspond à cette période et à ces filtres." />
        ) : (
          <>
            <DataTable caption="Paiements" rows={payments.items} columns={columns} href={(p) => `/commandes/${p.order.id}`} />
            <LoadMore hasMore={!!payments.hasNextPage} loading={payments.isFetchingNextPage} onClick={() => void payments.fetchNextPage()} />
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Besoin du détail d’une commande ? <Link href="/commandes" className="text-brand hover:underline">Ouvrir les commandes</Link>.
      </p>
    </>
  );
}
