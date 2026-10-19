'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '@/components/confirm';
import { LoadMore } from '@/components/table';
import { Badge, Button, Card, cx, EmptyState, ErrorState, LoadingRows, PageHeader, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { count, formatDateTime, type Tone } from '@/lib/format';
import { useCursorList, useUrlFilters } from '@/lib/hooks';

interface PartnerRequest {
  id: string;
  restaurantName: string;
  contactName: string;
  phone: string;
  area: string;
  cuisine: string | null;
  message: string | null;
  status: string;
  internalNote: string | null;
  handledAt: string | null;
  createdAt: string;
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: 'Nouvelle', tone: 'warning' },
  CONTACTED: { label: 'Contactée', tone: 'info' },
  ONBOARDED: { label: 'Inscrite', tone: 'success' },
  DECLINED: { label: 'Sans suite', tone: 'neutral' },
};

export default function PartnerRequestsPage() {
  const [f, set] = useUrlFilters(['etat'] as const);
  const status = f.etat || 'NEW';
  const list = useCursorList<PartnerRequest>('partner-requests', '/admin/partner-requests', { status, limit: 30 });
  const counts = (list.data?.pages[0] as unknown as { counts?: Record<string, number> } | undefined)?.counts ?? {};
  return (
    <>
      <PageHeader
        title="Candidatures restaurants"
        description="Demandes envoyées depuis le site vitrine. Rappelez le restaurant, puis accompagnez son inscription ; chaque changement est journalisé."
      />
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="État">
        {Object.entries(STATUS).map(([k, v]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={status === k}
            onClick={() => set({ etat: k === 'NEW' ? '' : k })}
            className={cx(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
              status === k ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {v.label}
            <span className="num opacity-70">{count(counts[k] ?? 0)}</span>
          </button>
        ))}
      </div>
      <Card padded={false}>
        {list.isPending ? (
          <LoadingRows />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="Aucune candidature" message="Les demandes du formulaire « Devenir partenaire » apparaîtront ici." />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {list.items.map((r) => (
                <RequestRow key={r.id} request={r} />
              ))}
            </ul>
            <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
          </>
        )}
      </Card>
    </>
  );
}

function RequestRow({ request: r }: { request: PartnerRequest }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState(r.status);
  const [note, setNote] = useState(r.internalNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = status !== r.status || note !== (r.internalNote ?? '');

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/partner-requests/${r.id}`, { method: 'PATCH', body: { status, internalNote: note } });
      await queryClient.invalidateQueries({ queryKey: ['partner-requests'] });
      toast('Candidature mise à jour');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold">{r.restaurantName}</span>
          <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge>
        </p>
        <p className="mt-0.5 text-sm text-ink-2">
          {r.contactName} · <span className="num select-all">{r.phone}</span> · {r.area}
        </p>
        {r.cuisine && <p className="text-sm text-muted">Cuisine : {r.cuisine}</p>}
        {r.message && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">{r.message}</p>}
        <p className="mt-1 text-xs text-muted">
          Reçue le {formatDateTime(r.createdAt)}
          {r.handledAt && ` · traitée le ${formatDateTime(r.handledAt)}`}
        </p>
      </div>
      <div className="space-y-2">
        <Select aria-label="État de la candidature" value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <textarea
          aria-label="Note interne"
          placeholder="Note interne (jamais transmise au restaurant)"
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button variant="primary" onClick={save} busy={busy} disabled={!dirty} className="w-full">
          Enregistrer
        </Button>
      </div>
    </li>
  );
}
