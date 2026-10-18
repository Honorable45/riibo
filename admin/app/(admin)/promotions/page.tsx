'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useConfirm, useToast } from '@/components/confirm';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, PageHeader, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { count, fcfa, formatDate } from '@/lib/format';
import { useRestaurantOptions } from '@/lib/hooks';
import { validatePromo, type PromoForm } from '@/lib/promo';
import type { Promo } from '@/lib/types';

function describe(p: Promo) {
  const value = p.discountType === 'PERCENT' ? `${p.discountValue} %` : fcfa(p.discountValue);
  const cap = p.discountType === 'PERCENT' && p.maxDiscount ? ` (plafond ${fcfa(p.maxDiscount)})` : '';
  return `${value}${cap}`;
}

function promoState(p: Promo, now = Date.now()) {
  if (!p.isActive) return { label: 'Désactivé', tone: 'neutral' as const };
  if (p.expiresAt && Date.parse(p.expiresAt) <= now) return { label: 'Expiré', tone: 'neutral' as const };
  if (p.startsAt && Date.parse(p.startsAt) > now) return { label: 'Programmé', tone: 'info' as const };
  if (p.maxUses !== null && p.usedCount >= p.maxUses) return { label: 'Épuisé', tone: 'warning' as const };
  return { label: 'Actif', tone: 'success' as const };
}

export default function PromotionsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const promos = useQuery({ queryKey: ['promos'], queryFn: () => api<Promo[]>('/admin/promos') });

  const toggle = (p: Promo) =>
    confirm({
      title: p.isActive ? `Désactiver le code ${p.code} ?` : `Réactiver le code ${p.code} ?`,
      message: p.isActive ? 'Le code sera refusé aux prochaines commandes. Les commandes déjà passées ne changent pas.' : 'Le code redevient utilisable selon ses conditions.',
      confirmLabel: p.isActive ? 'Désactiver' : 'Réactiver',
      danger: p.isActive,
      onConfirm: async () => {
        await api(`/admin/promos/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } });
        await queryClient.invalidateQueries({ queryKey: ['promos'] });
        toast(p.isActive ? 'Code désactivé' : 'Code réactivé');
      },
    });

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Codes promo. La remise est toujours calculée et décomptée par le serveur (plafonds, dates, limites d’utilisation)."
        actions={!creating && <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>Nouveau code</Button>}
      />
      {creating && <CreatePromo onDone={() => setCreating(false)} />}
      <Card padded={false}>
        {promos.isPending ? (
          <LoadingRows />
        ) : promos.error ? (
          <ErrorState error={promos.error} onRetry={() => void promos.refetch()} />
        ) : promos.data.length === 0 ? (
          <EmptyState title="Aucun code promo" />
        ) : (
          <ul className="divide-y divide-line">
            {promos.data.map((p) => {
              const state = promoState(p);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                  <div className="min-w-[12rem] flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold">{p.code}</span>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </p>
                    <p className="text-sm text-muted">{p.description ?? 'Sans description'} · {p.restaurant ? p.restaurant.name : 'Tous les restaurants'}</p>
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold">{describe(p)}</p>
                    <p className="text-muted">{p.minOrderAmount ? `dès ${fcfa(p.minOrderAmount)}` : 'sans minimum'}</p>
                  </div>
                  <div className="num text-sm">
                    <p className="font-semibold">{count(p.usedCount)} / {p.maxUses === null ? '∞' : count(p.maxUses)} utilisations</p>
                    <p className="text-muted">{p.maxUsesPerUser ? `${p.maxUsesPerUser} par client` : 'sans limite par client'}</p>
                  </div>
                  <div className="text-sm text-muted">
                    {p.startsAt ? `du ${formatDate(p.startsAt)} ` : ''}
                    {p.expiresAt ? `jusqu’au ${formatDate(p.expiresAt)}` : 'sans date de fin'}
                  </div>
                  <Button onClick={() => toggle(p)}>{p.isActive ? 'Désactiver' : 'Réactiver'}</Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

const EMPTY: PromoForm = {
  code: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  maxDiscount: '',
  minOrderAmount: '',
  maxUses: '',
  maxUsesPerUser: '1',
  startsAt: '',
  expiresAt: '',
  restaurantId: '',
};

function CreatePromo({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const restaurants = useRestaurantOptions();
  const [form, setForm] = useState<PromoForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof PromoForm, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PromoForm>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { errors: found, body } = validatePromo(form);
    setErrors(found);
    if (!body) return;
    setBusy(true);
    setServerError(null);
    try {
      await api('/admin/promos', { method: 'POST', body });
      await queryClient.invalidateQueries({ queryKey: ['promos'] });
      toast(`Code ${body.code} créé`);
      onDone();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Création impossible.');
      setBusy(false);
    }
  }

  return (
    <Card title="Nouveau code promo" className="mb-4">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Code" hint={errors.code ?? '3 à 20 caractères : lettres, chiffres, - ou _'}>
          <Input value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} aria-invalid={!!errors.code} maxLength={20} />
        </Field>
        <Field label="Type de remise">
          <Select value={form.discountType} onChange={(e) => set({ discountType: e.target.value as PromoForm['discountType'] })}>
            <option value="PERCENT">Pourcentage</option>
            <option value="FIXED">Montant fixe (FCFA)</option>
          </Select>
        </Field>
        <Field label={form.discountType === 'PERCENT' ? 'Pourcentage' : 'Montant (FCFA)'} hint={errors.discountValue}>
          <Input inputMode="numeric" value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} aria-invalid={!!errors.discountValue} />
        </Field>
        {form.discountType === 'PERCENT' && (
          <Field label="Plafond de remise (FCFA)" hint={errors.maxDiscount ?? 'Obligatoire pour un pourcentage'}>
            <Input inputMode="numeric" value={form.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} aria-invalid={!!errors.maxDiscount} />
          </Field>
        )}
        <Field label="Commande minimum (FCFA)" hint={errors.minOrderAmount ?? 'Facultatif'}>
          <Input inputMode="numeric" value={form.minOrderAmount} onChange={(e) => set({ minOrderAmount: e.target.value })} />
        </Field>
        <Field label="Utilisations au total" hint={errors.maxUses ?? 'Obligatoire : aucune remise illimitée'}>
          <Input inputMode="numeric" value={form.maxUses} onChange={(e) => set({ maxUses: e.target.value })} aria-invalid={!!errors.maxUses} />
        </Field>
        <Field label="Utilisations par client" hint={errors.maxUsesPerUser}>
          <Input inputMode="numeric" value={form.maxUsesPerUser} onChange={(e) => set({ maxUsesPerUser: e.target.value })} aria-invalid={!!errors.maxUsesPerUser} />
        </Field>
        <Field label="Début" hint="Facultatif">
          <Input type="date" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
        </Field>
        <Field label="Fin" hint={errors.expiresAt ?? 'Obligatoire'}>
          <Input type="date" value={form.expiresAt} min={form.startsAt || undefined} onChange={(e) => set({ expiresAt: e.target.value })} aria-invalid={!!errors.expiresAt} />
        </Field>
        <Field label="Restaurant">
          <Select value={form.restaurantId} onChange={(e) => set({ restaurantId: e.target.value })}>
            <option value="">Tous les restaurants</option>
            {restaurants.data?.filter((r) => r.status === 'APPROVED').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Description" hint="Visible par les clients">
          <Input value={form.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        {serverError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2 lg:col-span-3">{serverError}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" variant="primary" busy={busy}>Créer le code</Button>
          <Button onClick={onDone} disabled={busy}>Annuler</Button>
        </div>
      </form>
    </Card>
  );
}
