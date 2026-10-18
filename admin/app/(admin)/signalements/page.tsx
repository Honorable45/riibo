'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useConfirm, useToast } from '@/components/confirm';
import { LoadMore } from '@/components/table';
import { Badge, Button, Card, cx, EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, personName } from '@/lib/format';
import { useCursorList, useUrlFilters } from '@/lib/hooks';
import type { Report } from '@/lib/types';

const TARGET: Record<string, string> = {
  MESSAGE: 'Message',
  USER: 'Compte',
  ORDER: 'Commande',
  REVIEW: 'Avis',
  RESTAURANT: 'Restaurant',
};

const STATUS = [
  { key: 'PENDING', label: 'À traiter' },
  { key: 'RESOLVED', label: 'Contenu retiré' },
  { key: 'DISMISSED', label: 'Classés' },
];

function targetHref(r: Report) {
  if (r.targetType === 'ORDER') return `/commandes/${r.targetId}`;
  if (r.targetType === 'RESTAURANT') return `/restaurants/${r.targetId}`;
  if (r.targetType === 'USER') return `/clients/${r.targetId}`;
  return null;
}

export default function ReportsPage() {
  const [f, set] = useUrlFilters(['etat'] as const);
  const status = f.etat || 'PENDING';
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const list = useCursorList<Report>('reports', '/admin/reports', { status, limit: 30 });

  const resolve = (r: Report, action: 'DISMISS' | 'REMOVE_CONTENT') =>
    confirm({
      title: action === 'DISMISS' ? 'Classer ce signalement ?' : r.targetType === 'REVIEW' ? 'Masquer cet avis ?' : 'Retirer ce message ?',
      message:
        action === 'DISMISS'
          ? 'Aucune action n’est prise sur le contenu signalé.'
          : 'Le contenu est retiré pour tous les utilisateurs. Pour un compte ou un restaurant, utilisez plutôt la suspension depuis sa fiche.',
      confirmLabel: action === 'DISMISS' ? 'Classer' : 'Retirer le contenu',
      danger: action === 'REMOVE_CONTENT',
      onConfirm: async () => {
        await api(`/admin/reports/${r.id}`, { method: 'PATCH', body: { action } });
        await queryClient.invalidateQueries({ queryKey: ['reports'] });
        void queryClient.invalidateQueries({ queryKey: ['metrics'] });
        toast('Signalement traité');
      },
    });

  return (
    <>
      <PageHeader title="Signalements" description="Signalements envoyés par les utilisateurs. Seul l’élément signalé est montré, jamais la conversation entière." />
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="État">
        {STATUS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={status === s.key}
            onClick={() => set({ etat: s.key === 'PENDING' ? '' : s.key })}
            className={cx(
              'rounded-full border px-3 py-1.5 text-sm font-semibold',
              status === s.key ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <Card padded={false}>
        {list.isPending ? (
          <LoadingRows />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <EmptyState title={status === 'PENDING' ? 'Aucun signalement à traiter' : 'Aucun signalement'} />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {list.items.map((r) => {
                const href = targetHref(r);
                return (
                  <li key={r.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="warning">{TARGET[r.targetType] ?? r.targetType}</Badge>
                      <span className="text-sm text-muted">
                        signalé par {personName(r.reporter)} · {formatDateTime(r.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm"><span className="text-muted">Motif : </span>{r.reason}</p>
                    <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      {r.targetPreview ?? <span className="text-muted">Élément supprimé depuis le signalement.</span>}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {href && <Link href={href} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-brand hover:bg-brand-soft">Ouvrir la fiche</Link>}
                      {r.status === 'PENDING' && (
                        <>
                          {(r.targetType === 'MESSAGE' || r.targetType === 'REVIEW') && (
                            <Button variant="danger" onClick={() => resolve(r, 'REMOVE_CONTENT')}>
                              {r.targetType === 'REVIEW' ? 'Masquer l’avis' : 'Retirer le message'}
                            </Button>
                          )}
                          <Button onClick={() => resolve(r, 'DISMISS')}>Classer</Button>
                        </>
                      )}
                      {r.resolvedAt && <span className="self-center text-xs text-muted">Traité le {formatDateTime(r.resolvedAt)}</span>}
                    </div>
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
