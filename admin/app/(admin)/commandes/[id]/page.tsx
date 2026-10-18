'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useConfirm, useToast } from '@/components/confirm';
import { Badge, Button, Card, Detail, ErrorState, LoadingRows, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import {
  DELIVERY_STATUS,
  DELIVERY_TYPE,
  fcfa,
  FINAL_ORDER_STATUSES,
  formatDateTime,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  personName,
  VEHICLE,
} from '@/lib/format';
import type { OrderDetail } from '@/lib/types';

const CANCEL_REASONS = ['Client injoignable', 'Restaurant injoignable', 'Aucun livreur disponible', 'Commande en double', 'Demande du client'];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api<OrderDetail>(`/admin/orders/${id}`),
    refetchInterval: (q) => (q.state.data && FINAL_ORDER_STATUSES.includes(q.state.data.status) ? false : 20_000),
  });

  if (order.isPending) return <LoadingRows rows={8} />;
  if (order.error) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  const o = order.data;
  const final = FINAL_ORDER_STATUSES.includes(o.status);

  const cancel = () =>
    confirm({
      title: `Annuler la commande #${o.orderNumber} ?`,
      message: 'Le client, le restaurant et le livreur éventuel sont prévenus. Le stock des plats est restitué. Cette action est définitive et journalisée.',
      confirmLabel: 'Annuler la commande',
      danger: true,
      reason: { label: 'Motif (visible par le client et le restaurant)', presets: CANCEL_REASONS },
      onConfirm: async (reason) => {
        const updated = await api<OrderDetail>(`/admin/orders/${o.id}/cancel`, { method: 'POST', body: { reason } });
        queryClient.setQueryData(['order', id], updated);
        void queryClient.invalidateQueries({ queryKey: ['orders'] });
        toast(`Commande #${o.orderNumber} annulée`);
      },
    });

  return (
    <>
      <Link href="/commandes" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Commandes
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="num text-2xl font-extrabold">Commande #{o.orderNumber}</h1>
            <StatusBadge map={ORDER_STATUS} value={o.status} />
            <Badge>{DELIVERY_TYPE[o.deliveryType]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">Passée le {formatDateTime(o.createdAt)}</p>
        </div>
        {!final && (
          <Button variant="danger" onClick={cancel} icon={<Ban className="size-4" aria-hidden />}>
            Annuler la commande
          </Button>
        )}
      </div>

      {(o.rejectionReason || o.cancelReason) && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          <strong>{o.status === 'REJECTED' ? 'Motif du refus : ' : 'Motif d’annulation : '}</strong>
          {o.rejectionReason ?? o.cancelReason}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Card title="Articles" padded={false}>
            <ul className="divide-y divide-line">
              {o.items.map((it) => (
                <li key={it.id} className="flex gap-3 px-4 py-3">
                  <span className="num w-8 shrink-0 font-bold">{it.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{it.name}</p>
                    {it.options.length > 0 && <p className="text-sm text-muted">{it.options.map((x) => x.name).join(', ')}</p>}
                    {it.note && <p className="text-sm text-warning">Note : {it.note}</p>}
                    <p className="num text-xs text-muted">{fcfa(it.unitPrice)} l’unité</p>
                  </div>
                  <span className="num font-semibold">{fcfa(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="border-t border-line px-4 py-3">
              <Detail label="Repas">{fcfa(o.subtotal)}</Detail>
              {o.discountAmount > 0 && (
                <Detail label={`Remise${o.promoCode ? ` (${o.promoCode.code})` : ''}`}>− {fcfa(o.discountAmount)}</Detail>
              )}
              <Detail label="Frais de livraison">{fcfa(o.deliveryFee)}</Detail>
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-extrabold">
                <span>Total payé par le client</span>
                <span className="num">{fcfa(o.total)}</span>
              </div>
              <p className="mt-2 text-xs text-muted">Aucune commission n’est configurée : aucune part Riiberaka n’est calculée sur cette commande.</p>
            </dl>
            {o.notes && <p className="border-t border-line px-4 py-3 text-sm"><span className="text-muted">Note du client : </span>{o.notes}</p>}
          </Card>

          <Card title="Historique">
            <ol className="relative space-y-4 border-l border-line pl-5">
              {o.timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-brand" aria-hidden />
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(t.at)}
                    {t.actor && ` · par ${t.actor}`}
                  </p>
                  {t.detail && <p className="mt-0.5 text-sm text-ink-2">« {t.detail} »</p>}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted">Reconstitué à partir des horodatages de la commande et du journal d’audit.</p>
          </Card>

          {o.review && (
            <Card title="Avis du client">
              <p className="font-semibold">{'★'.repeat(o.review.rating)}{'☆'.repeat(5 - o.review.rating)} <span className="sr-only">{o.review.rating} sur 5</span></p>
              {o.review.comment && <p className="mt-1 text-sm">{o.review.comment}</p>}
              {o.review.isHidden && <Badge tone="warning">Masqué par la modération</Badge>}
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Client">
            <dl>
              <Detail label="Nom">
                <Link href={`/clients/${o.client.id}`} className="text-brand hover:underline">{personName(o.client)}</Link>
              </Detail>
              <Detail label="Téléphone">{o.client.phone}</Detail>
              {!o.client.isActive && <Detail label="Compte"><Badge tone="danger">Suspendu</Badge></Detail>}
            </dl>
          </Card>
          <Card title="Restaurant">
            <dl>
              <Detail label="Nom">
                <Link href={`/restaurants/${o.restaurant.id}`} className="text-brand hover:underline">{o.restaurant.name}</Link>
              </Detail>
              <Detail label="Téléphone">{o.restaurant.phone}</Detail>
              <Detail label="Adresse">{o.restaurant.address}</Detail>
            </dl>
          </Card>
          {o.deliveryType === 'DELIVERY' && (
            <Card title="Livraison">
              <dl>
                <Detail label="Adresse">{o.deliveryAddress}</Detail>
                {o.deliveryLandmark && <Detail label="Repère">{o.deliveryLandmark}</Detail>}
                <Detail label="Contact">{o.contactPhone}</Detail>
                <Detail label="Suivi">{o.delivery ? DELIVERY_STATUS[o.delivery.status] ?? o.delivery.status : 'Pas encore lancée'}</Detail>
                {o.delivery?.driver && (
                  <>
                    <Detail label="Livreur">
                      <Link href={`/livreurs/${o.delivery.driver.id}`} className="text-brand hover:underline">{o.delivery.driver.name}</Link>
                    </Detail>
                    <Detail label="Téléphone">{o.delivery.driver.phone}</Detail>
                    <Detail label="Véhicule">
                      {VEHICLE[o.delivery.driver.vehicleType] ?? o.delivery.driver.vehicleType}
                      {o.delivery.driver.plateNumber && ` · ${o.delivery.driver.plateNumber}`}
                    </Detail>
                  </>
                )}
                {o.delivery?.distanceKm != null && <Detail label="Distance">{o.delivery.distanceKm.toFixed(1)} km</Detail>}
              </dl>
            </Card>
          )}
          <Card title="Paiement">
            <dl>
              <Detail label="Moyen">{PAYMENT_METHOD[o.paymentMethod] ?? o.paymentMethod}</Detail>
              <Detail label="État"><StatusBadge map={PAYMENT_STATUS} value={o.paymentStatus} /></Detail>
            </dl>
            {o.payments.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink-2">
                      {p.provider} · {formatDateTime(p.paidAt ?? p.createdAt)}
                      {p.providerRef && <span className="block text-xs text-muted">Réf. {p.providerRef}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="num font-semibold">{fcfa(p.amount)}</span>
                      <StatusBadge map={PAYMENT_STATUS} value={p.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">L’état du paiement n’est modifiable que par le serveur (remise confirmée ou notification du prestataire).</p>
          </Card>
        </div>
      </div>
    </>
  );
}
