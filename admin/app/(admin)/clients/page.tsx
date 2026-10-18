'use client';

import { SearchInput } from '@/components/search-input';
import { DataTable, LoadMore, type Column } from '@/components/table';
import { Badge, Card, cx, EmptyState, ErrorState, LoadingRows, PageHeader, Select } from '@/components/ui';
import { formatDate, personName, relative, ROLE } from '@/lib/format';
import { useCursorList, useUrlFilters } from '@/lib/hooks';
import type { UserRow } from '@/lib/types';

const columns: Column<UserRow>[] = [
  { key: 'name', header: 'Nom', cell: (u) => personName(u) },
  { key: 'phone', header: 'Téléphone', cell: (u) => <span className="num">{u.phone ?? '—'}</span> },
  { key: 'role', header: 'Rôle', cell: (u) => ROLE[u.role] ?? u.role },
  { key: 'state', header: 'Compte', cell: (u) => (u.isActive ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Suspendu</Badge>) },
  { key: 'seen', header: 'Dernière activité', cell: (u) => relative(u.lastSeenAt), hideOnMobile: true },
  { key: 'created', header: 'Inscrit le', cell: (u) => formatDate(u.createdAt), hideOnMobile: true },
];

const ROLES = ['CLIENT', 'RESTAURANT', 'LIVREUR', 'ADMIN'];

export default function AccountsPage() {
  const [f, set] = useUrlFilters(['q', 'role', 'etat'] as const);
  const role = f.role || 'CLIENT';
  const list = useCursorList<UserRow>('users', '/admin/users', {
    q: f.q || undefined,
    role: role === 'TOUS' ? undefined : role,
    isActive: f.etat || undefined,
    limit: 30,
  });
  return (
    <>
      <PageHeader title="Comptes" description="Clients et comptes professionnels. Aucune donnée secrète (mot de passe, session) n’est affichée." />
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Rôle">
        {[...ROLES, 'TOUS'].map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={role === r}
            onClick={() => set({ role: r === 'CLIENT' ? '' : r })}
            className={cx(
              'rounded-full border px-3 py-1.5 text-sm font-semibold',
              role === r ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {r === 'TOUS' ? 'Tous' : `${ROLE[r]}s`}
          </button>
        ))}
      </div>
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput label="Rechercher un compte" placeholder="Nom, téléphone ou e-mail" value={f.q} onChange={(q) => set({ q })} />
          <Select aria-label="État du compte" value={f.etat} onChange={(e) => set({ etat: e.target.value })} className="w-auto">
            <option value="">Actifs et suspendus</option>
            <option value="true">Actifs</option>
            <option value="false">Suspendus</option>
          </Select>
        </div>
        {list.isPending ? (
          <LoadingRows />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="Aucun compte ne correspond" />
        ) : (
          <>
            <DataTable caption="Liste des comptes" rows={list.items} columns={columns} href={(u) => `/clients/${u.id}`} />
            <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
          </>
        )}
      </Card>
    </>
  );
}
