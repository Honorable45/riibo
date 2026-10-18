'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useConfirm, useToast } from '@/components/confirm';
import { DishImage } from '@/components/dish-image';
import { Badge, Button, Card, Detail, ErrorState, LoadingRows } from '@/components/ui';
import { api, ApiError, upload } from '@/lib/api';
import { fcfa, formatDateTime, ITEM_ISSUE } from '@/lib/format';
import { ACCEPTED_IMAGE_TYPES, validateImageFile } from '@/lib/image';
import type { MenuItemDetail } from '@/lib/types';

export default function DishPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const item = useQuery({ queryKey: ['menu-item', id], queryFn: () => api<MenuItemDetail>(`/admin/menu-items/${id}`) });

  if (item.isPending) return <LoadingRows rows={8} />;
  if (item.error) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  const it = item.data;

  const saved = (next: MenuItemDetail, message: string) => {
    queryClient.setQueryData(['menu-item', id], next);
    void queryClient.invalidateQueries({ queryKey: ['menu-items'] });
    void queryClient.invalidateQueries({ queryKey: ['restaurant-menu', it.restaurant.id] });
    toast(message);
  };

  async function sendImage(file: File) {
    const problem = validateImageFile(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploadError(null);
    setProgress(0);
    const form = new FormData();
    form.append('image', file);
    try {
      const next = await upload<MenuItemDetail>(`/admin/menu-items/${id}/image`, form, setProgress);
      saved(next, it.imageUrl ? 'Image remplacée' : 'Image ajoutée');
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez.');
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  const removeImage = () =>
    confirm({
      title: 'Supprimer l’image de ce plat ?',
      message: 'Le plat s’affichera sans photo dans l’application client. Le fichier n’est effacé que s’il n’est utilisé par aucun autre plat ou restaurant.',
      confirmLabel: 'Supprimer l’image',
      danger: true,
      onConfirm: async () => saved(await api<MenuItemDetail>(`/admin/menu-items/${id}/image`, { method: 'DELETE' }), 'Image supprimée'),
    });

  const toggle = () =>
    confirm({
      title: it.isAvailable ? `Retirer « ${it.name} » de la vente ?` : `Remettre « ${it.name} » en vente ?`,
      message: it.isAvailable
        ? 'Les clients ne pourront plus le commander. Le restaurant pourra le remettre en vente.'
        : 'Les clients pourront de nouveau le commander.',
      confirmLabel: it.isAvailable ? 'Retirer de la vente' : 'Remettre en vente',
      danger: it.isAvailable,
      reason: { label: 'Motif (conservé dans le journal d’audit)', presets: it.isAvailable ? ['Photo trompeuse', 'Description incorrecte', 'Signalement client'] : undefined },
      onConfirm: async (reason) =>
        saved(
          await api<MenuItemDetail>(`/admin/menu-items/${id}`, { method: 'PATCH', body: { isAvailable: !it.isAvailable, reason } }),
          it.isAvailable ? 'Plat retiré de la vente' : 'Plat remis en vente',
        ),
    });

  return (
    <>
      <Link href="/plats" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Plats
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold">{it.name}</h1>
            {it.isAvailable ? <Badge tone="success">En vente</Badge> : <Badge tone="warning">Indisponible</Badge>}
          </div>
          <p className="text-sm text-muted">
            <Link href={`/restaurants/${it.restaurant.id}`} className="text-brand hover:underline">{it.restaurant.name}</Link>
            {it.category && ` · ${it.category.name}`}
          </p>
        </div>
        <Button variant={it.isAvailable ? 'danger' : 'primary'} onClick={toggle}>
          {it.isAvailable ? 'Retirer de la vente' : 'Remettre en vente'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,460px)_1fr]">
        <Card title="Image">
          <DishImage key={it.imageUrl ?? 'none'} src={it.imageUrl} alt={it.name} className="aspect-[4/3] w-full" />
          {progress !== null && (
            <div className="mt-3" role="status" aria-live="polite">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="num mt-1 text-xs text-muted">Envoi… {Math.round(progress * 100)} %</p>
            </div>
          )}
          {uploadError && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{uploadError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="sr-only"
              id="dish-image"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void sendImage(file);
              }}
            />
            <Button variant="primary" busy={progress !== null} onClick={() => input.current?.click()} icon={<ImagePlus className="size-4" aria-hidden />}>
              {it.imageUrl ? 'Remplacer l’image' : 'Ajouter une image'}
            </Button>
            {it.imageUrl && (
              <Button onClick={removeImage} disabled={progress !== null} icon={<Trash2 className="size-4" aria-hidden />}>
                Supprimer
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            JPEG, PNG ou WebP, 8 Mo maximum. Utilisez une vraie photo de ce plat : une image générique d’un autre plat tromperait les clients.
          </p>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card title="Fiche">
            <dl>
              <Detail label="Prix">{fcfa(it.price)}</Detail>
              <Detail label="Description">{it.description || <span className="text-muted">Aucune</span>}</Detail>
              <Detail label="Stock">{it.stock === null ? 'Illimité' : it.stock}</Detail>
              <Detail label="Quantité max. par commande">{it.maxQuantity ?? 'Aucune limite'}</Detail>
              <Detail label="Note">{it.reviewCount ? `${it.rating.toFixed(1)} / 5 (${it.reviewCount})` : 'Aucune'}</Detail>
              <Detail label="Créé le">{formatDateTime(it.createdAt)}</Detail>
              <Detail label="Modifié le">{formatDateTime(it.updatedAt)}</Detail>
            </dl>
            {it.issues.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
                {it.issues.map((i) => (
                  <Badge key={i} tone={i === 'UNAVAILABLE' || i === 'SOLD_OUT' ? 'warning' : 'neutral'}>{ITEM_ISSUE[i] ?? i}</Badge>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted">Prix, description et options sont gérés par le restaurant ; ils ne sont pas modifiables ici.</p>
          </Card>
          <Card title="Options et suppléments">
            {it.optionGroups.length === 0 ? (
              <p className="text-sm text-muted">Aucune option.</p>
            ) : (
              <div className="space-y-4">
                {it.optionGroups.map((g) => (
                  <div key={g.id}>
                    <p className="font-semibold">
                      {g.name}{' '}
                      <span className="text-sm font-normal text-muted">
                        {g.minSelect > 0 ? `obligatoire, ${g.minSelect} à ${g.maxSelect}` : `facultatif, jusqu’à ${g.maxSelect}`}
                      </span>
                    </p>
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {g.options.map((o) => (
                        <li key={o.id} className="flex justify-between gap-2">
                          <span className={o.isAvailable ? '' : 'text-muted line-through'}>{o.name}</span>
                          <span className="num text-ink-2">{o.priceDelta ? `+ ${fcfa(o.priceDelta)}` : 'inclus'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
