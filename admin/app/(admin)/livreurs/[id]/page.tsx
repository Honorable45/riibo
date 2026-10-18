'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApprovalActions, Documents } from '@/components/approval';
import { useToast } from '@/components/confirm';
import { Badge, Card, Detail, EmptyState, ErrorState, LoadingRows, Skeleton, Stat, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { APPROVAL_STATUS, count, DELIVERY_STATUS, fcfa, formatDate, formatDateTime, percent, personName, relative, VEHICLE } from '@/lib/format';
import type { DriverDetail, DriverInsights } from '@/lib/types';

const DOCS = {
  'selfie-with-id': 'Selfie avec pièce d’identité',
  'id-card': 'Pièce d’identité',
  'driving-license': 'Permis de conduire',
  'vehicle-registration': 'Carte grise',
  'vehicle-photo': 'Photo du véhicule',
};

export default function DriverPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const driver = useQuery({ queryKey: ['driver', id], queryFn: () => api<DriverDetail>(`/admin/drivers/${id}`) });
  const insights = useQuery({
    queryKey: ['driver-insights', id],
    queryFn: () => api<DriverInsights>(`/admin/drivers/${id}/insights`),
    refetchInterval: 30_000,
  });

  if (driver.isPending) return <LoadingRows rows={8} />;
  if (driver.error) return <ErrorState error={driver.error} onRetry={() => void driver.refetch()} />;
  const d = driver.data;

  const act = async (action: string, reason?: string) => {
    await api(`/admin/drivers/${id}/status`, { method: 'PATCH', body: { action, reason } });
    await queryClient.invalidateQueries({ queryKey: ['driver', id] });
    void queryClient.invalidateQueries({ queryKey: ['drivers'] });
    toast('Statut du livreur mis à jour');
  };
  const i = insights.data;

  return (
    <>
      <Link href="/livreurs" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Livreurs
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold">{personName(d.user)}</h1>
            <StatusBadge map={APPROVAL_STATUS} value={d.status} />
            {d.isOnline ? <Badge tone="success">En ligne</Badge> : <Badge>Hors ligne</Badge>}
            {!d.user.isActive && <Badge tone="danger">Compte suspendu</Badge>}
          </div>
          <p className="text-sm text-muted">Inscrit le {formatDate(d.createdAt)}</p>
        </div>
        <ApprovalActions status={d.status} subject={personName(d.user)} onAction={act} />
      </div>
      {d.statusReason && (
        <p className="mb-4 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          <strong>Dernier motif : </strong>
          {d.statusReason}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Livraisons terminées" value={count(d.totalDeliveries)} href={`/commandes?livreur=${id}`} />
        <Stat label="Annulées" value={i ? count(i.deliveries.CANCELLED ?? 0) : '…'} />
        <Stat label="Taux d’acceptation" value={i ? percent(i.acceptanceRate) : '…'} hint={`${count(d.acceptedOffers)} sur ${count(d.totalOffers)} propositions`} />
        <Stat label="Note" value={d.ratingCount ? `${d.rating.toFixed(1)} / 5` : '—'} hint={d.ratingCount ? `${d.ratingCount} avis` : 'Aucun avis'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Card title="Course en cours">
            {!i ? (
              <Skeleton className="h-10" />
            ) : i.current ? (
              <Link href={`/commandes/${i.current.order.id}`} className="flex flex-wrap items-center gap-3 hover:text-brand">
                <span className="num font-bold">#{i.current.order.orderNumber}</span>
                <Badge tone="info">{DELIVERY_STATUS[i.current.status] ?? i.current.status}</Badge>
                <span className="text-sm text-ink-2">{i.current.order.restaurant.name}</span>
                <span className="text-xs text-muted">affectée {relative(i.current.assignedAt)}</span>
              </Link>
            ) : (
              <p className="text-sm text-muted">Aucune course en cours.</p>
            )}
            <div className="mt-3 border-t border-line pt-3 text-sm">
              {!i ? null : i.position ? (
                <p className="flex flex-wrap items-center gap-2">
                  <MapPin className="size-4 text-brand" aria-hidden />
                  <a
                    className="font-semibold text-brand hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://www.openstreetmap.org/?mlat=${i.position.latitude}&mlon=${i.position.longitude}#map=16/${i.position.latitude}/${i.position.longitude}`}
                  >
                    Position actuelle
                  </a>
                  <span className="text-muted">mesurée {relative(i.position.at)}</span>
                </p>
              ) : (
                <p className="text-muted">
                  Position non affichée : {d.isOnline ? `aucune mesure de moins de ${i.positionTtlSeconds} secondes.` : 'le livreur est hors ligne.'}
                </p>
              )}
            </div>
          </Card>
          <Card title="Dernières livraisons" padded={false}>
            {!i ? (
              <LoadingRows rows={3} />
            ) : i.recent.length === 0 ? (
              <EmptyState title="Aucune livraison" />
            ) : (
              <ul className="divide-y divide-line">
                {i.recent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/commandes/${r.order.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <span className="num font-bold">#{r.order.orderNumber}</span>
                      <Badge tone={r.status === 'DELIVERED' ? 'success' : r.status === 'CANCELLED' ? 'danger' : 'info'}>{DELIVERY_STATUS[r.status] ?? r.status}</Badge>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{r.order.restaurant.name}</span>
                      <span className="text-xs text-muted">{formatDateTime(r.deliveredAt ?? r.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              Aucune rémunération des livreurs n’est calculée par le backend : les frais de livraison ({i ? fcfa(i.recent.reduce((s, r) => s + (r.status === 'DELIVERED' ? r.deliveryFee : 0), 0)) : '…'} sur ces courses) sont payés par les clients, ce ne sont pas des gains.
            </p>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card title="Coordonnées et véhicule">
            <dl>
              <Detail label="Téléphone">{d.user.phone}</Detail>
              <Detail label="E-mail">{d.user.email}</Detail>
              <Detail label="Véhicule">{VEHICLE[d.vehicleType] ?? d.vehicleType}</Detail>
              <Detail label="Immatriculation">{d.plateNumber}</Detail>
              <Detail label="Marque / couleur">{[d.vehicleBrand, d.vehicleColor].filter(Boolean).join(' · ') || '—'}</Detail>
              <Detail label="Mobile Money">{d.mobileMoneyNumber ?? 'Non renseigné'}</Detail>
            </dl>
            <Link href={`/clients/${d.user.id}`} className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">Compte utilisateur</Link>
          </Card>
          <Card title="Pièces justificatives">
            <Documents base={`/admin/drivers/${id}`} docs={d.documents} labels={DOCS} />
            <p className="mt-3 text-xs text-muted">Documents privés : chaque consultation est enregistrée dans le journal d’audit.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
