'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useConfirm, useToast } from '@/components/confirm';
import { useMe } from '@/components/session';
import { Badge, Button, Card, Detail, EmptyState, ErrorState, LoadingRows, Stat, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { APPROVAL_STATUS, count, fcfa, formatDate, formatDateTime, ORDER_STATUS, personName, relative, ROLE } from '@/lib/format';
import type { UserDetail } from '@/lib/types';

export default function AccountPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const user = useQuery({ queryKey: ['user', id], queryFn: () => api<UserDetail>(`/admin/users/${id}`) });

  if (user.isPending) return <LoadingRows rows={8} />;
  if (user.error) return <ErrorState error={user.error} onRetry={() => void user.refetch()} />;
  const u = user.data;
  const orders = Object.values(u.orders.byStatus).reduce((s, n) => s + n, 0);
  // Mêmes règles que le serveur : ni soi-même, ni un autre administrateur.
  const canSuspend = u.isActive && u.id !== me.id && u.role !== 'ADMIN';

  const setActive = (isActive: boolean) =>
    confirm({
      title: isActive ? `Réactiver le compte de ${personName(u)} ?` : `Suspendre le compte de ${personName(u)} ?`,
      message: isActive
        ? 'La personne pourra de nouveau se connecter.'
        : 'Ses sessions sont refusées dès la prochaine requête. Son historique de commandes est conservé.',
      confirmLabel: isActive ? 'Réactiver' : 'Suspendre',
      danger: !isActive,
      reason: isActive ? undefined : { label: 'Motif (conservé dans le journal d’audit)', presets: ['Fraude', 'Comportement abusif', 'Demande de la personne'] },
      onConfirm: async (reason) => {
        await api(`/admin/users/${id}`, { method: 'PATCH', body: { isActive, reason: reason || undefined } });
        await queryClient.invalidateQueries({ queryKey: ['user', id] });
        void queryClient.invalidateQueries({ queryKey: ['users'] });
        toast(isActive ? 'Compte réactivé' : 'Compte suspendu');
      },
    });

  return (
    <>
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Comptes
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold">{personName(u)}</h1>
            <Badge>{ROLE[u.role] ?? u.role}</Badge>
            {u.isActive ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Suspendu</Badge>}
          </div>
          <p className="text-sm text-muted">Inscrit le {formatDate(u.createdAt)} · dernière activité {relative(u.lastSeenAt)}</p>
        </div>
        {canSuspend && (
          <Button variant="danger" onClick={() => setActive(false)}>
            Suspendre le compte
          </Button>
        )}
        {!u.isActive && (
          <Button variant="primary" onClick={() => setActive(true)}>
            Réactiver le compte
          </Button>
        )}
      </div>

      {u.role === 'CLIENT' && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Commandes" value={count(orders)} href={`/commandes?q=${encodeURIComponent(u.phone ?? '')}`} />
          <Stat label="Terminées" value={count(u.orders.byStatus.DELIVERED ?? 0)} />
          <Stat label="Annulées" value={count(u.orders.byStatus.CANCELLED ?? 0)} />
          <Stat label="Total des commandes terminées" value={fcfa(u.orders.deliveredValue)} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Commandes récentes" padded={false}>
          {u.orders.recent.length === 0 ? (
            <EmptyState title="Aucune commande passée" />
          ) : (
            <ul className="divide-y divide-line">
              {u.orders.recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/commandes/${o.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span className="num font-bold">#{o.orderNumber}</span>
                    <StatusBadge map={ORDER_STATUS} value={o.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{o.restaurant.name}</span>
                    <span className="text-xs text-muted">{formatDateTime(o.createdAt)}</span>
                    <span className="num font-semibold">{fcfa(o.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="Coordonnées">
            <dl>
              <Detail label="Téléphone">{u.phone}</Detail>
              <Detail label="E-mail">{u.email}</Detail>
              <Detail label="Identifiant">{u.username}</Detail>
              <Detail label="Adresses enregistrées">{u.addresses}</Detail>
              <Detail label="Restaurants favoris">{u.favorites}</Detail>
              <Detail label="Signalements reçus">{u.reportsAgainst}</Detail>
            </dl>
          </Card>
          {u.driverProfile && (
            <Card title="Profil livreur">
              <Link href={`/livreurs/${u.driverProfile.id}`} className="flex items-center justify-between font-semibold text-brand hover:underline">
                Ouvrir la fiche <StatusBadge map={APPROVAL_STATUS} value={u.driverProfile.status} />
              </Link>
            </Card>
          )}
          {u.restaurantMemberships.length > 0 && (
            <Card title="Restaurants">
              <ul className="space-y-2">
                {u.restaurantMemberships.map((m) => (
                  <li key={m.restaurant.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/restaurants/${m.restaurant.id}`} className="font-semibold text-brand hover:underline">{m.restaurant.name}</Link>
                    <span className="text-muted">{m.role === 'OWNER' ? 'Propriétaire' : 'Équipe'}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {u.role === 'ADMIN' && <p className="text-xs text-muted">Un compte administrateur ne peut pas être suspendu depuis le backoffice.</p>}
        </div>
      </div>
    </>
  );
}
