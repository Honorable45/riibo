'use client';

import Link from 'next/link';
import { LoadMore } from '@/components/table';
import { Badge, Card, EmptyState, ErrorState, Input, LoadingRows, PageHeader, Select } from '@/components/ui';
import { auditLabel, formatDateTime, personName } from '@/lib/format';
import { useCursorList, useUrlFilters } from '@/lib/hooks';
import type { AuditRow } from '@/lib/types';

const FAMILIES = [
  { key: '', label: 'Toutes les actions' },
  { key: 'ORDER_', label: 'Commandes' },
  { key: 'RESTAURANT_', label: 'Restaurants' },
  { key: 'DRIVER_', label: 'Livreurs' },
  { key: 'USER_', label: 'Comptes' },
  { key: 'MENU_ITEM_', label: 'Plats' },
  { key: 'PROMO_', label: 'Promotions' },
  { key: 'PARTNER_', label: 'Candidatures' },
  { key: 'REPORT_', label: 'Signalements' },
];

function targetHref(row: AuditRow) {
  switch (row.targetType) {
    case 'ORDER':
      return `/commandes/${row.targetId}`;
    case 'RESTAURANT':
      return `/restaurants/${row.targetId}`;
    case 'DRIVER':
      return `/livreurs/${row.targetId}`;
    case 'USER':
      return `/clients/${row.targetId}`;
    case 'MENU_ITEM':
      return `/plats/${row.targetId}`;
    default:
      return null;
  }
}

/** Détails lisibles, sans jamais afficher de valeur brute volumineuse. */
function details(meta: Record<string, unknown> | null) {
  if (!meta) return null;
  const parts: string[] = [];
  if (typeof meta.reason === 'string' && meta.reason) parts.push(`Motif : « ${meta.reason} »`);
  if (typeof meta.from === 'string' && typeof meta.to === 'string') parts.push(`${meta.from} → ${meta.to}`);
  if (typeof meta.code === 'string') parts.push(`Code ${meta.code}`);
  if (typeof meta.type === 'string') parts.push(`Pièce : ${meta.type}`);
  if (typeof meta.before === 'boolean' && typeof meta.after === 'boolean') parts.push(meta.after ? 'Remis en vente' : 'Retiré de la vente');
  return parts.join(' · ') || null;
}

export default function AuditPage() {
  const [f, set] = useUrlFilters(['famille', 'du', 'au'] as const);
  const list = useCursorList<AuditRow>('audit', '/admin/audit-logs', {
    action: f.famille || undefined,
    from: f.du ? `${f.du}T00:00:00.000Z` : undefined,
    to: f.au ? new Date(Date.parse(`${f.au}T00:00:00Z`) + 86_400_000).toISOString() : undefined,
    limit: 40,
  });
  return (
    <>
      <PageHeader
        title="Journal d’audit"
        description="Actions sensibles enregistrées par le serveur : validations, suspensions, annulations, consultations de pièces, modifications de promotions et de plats. Lecture seule."
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Select aria-label="Type d’action" value={f.famille} onChange={(e) => set({ famille: e.target.value })} className="w-auto">
            {FAMILIES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </Select>
          <Input type="date" aria-label="Du" value={f.du} onChange={(e) => set({ du: e.target.value })} className="w-auto" />
          <span className="text-sm text-muted">au</span>
          <Input type="date" aria-label="Au" value={f.au} onChange={(e) => set({ au: e.target.value })} className="w-auto" />
        </div>
        {list.isPending ? (
          <LoadingRows />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="Aucune entrée" />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {list.items.map((row) => {
                const href = targetHref(row);
                const extra = details(row.metadata);
                return (
                  <li key={row.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                    <span className="num w-36 shrink-0 text-sm text-muted">{formatDateTime(row.createdAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {auditLabel(row.action)}{' '}
                        {href ? (
                          <Link href={href} className="text-sm font-normal text-brand hover:underline">voir l’élément</Link>
                        ) : (
                          <Badge>{row.targetType}</Badge>
                        )}
                      </p>
                      {extra && <p className="text-sm text-ink-2">{extra}</p>}
                    </div>
                    <span className="text-sm text-ink-2">{row.actor ? personName(row.actor) : 'Système'}</span>
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
