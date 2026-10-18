'use client';

/* eslint-disable @next/next/no-img-element -- images servies par le backend
   (disque local ou Cloudinary) : pas d'optimiseur Next intermédiaire. */
import { ImageOff, UtensilsCrossed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from './ui';

/**
 * Vignette de plat au ratio fixe (pas de saut de mise en page), avec un
 * repli explicite si l'image manque ou ne se charge pas.
 */
export function DishImage({ src, alt, className, onBroken }: {
  src: string | null;
  alt: string;
  className?: string;
  onBroken?: () => void;
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'broken'>('loading');
  const img = useRef<HTMLImageElement>(null);
  // Image déjà en cache : elle peut finir de charger avant que React n'attache
  // onLoad/onError ; on relit donc son état au montage.
  useEffect(() => {
    const el = img.current;
    if (!el?.complete) return;
    if (el.naturalWidth > 0) setState('ok');
    else {
      setState('broken');
      onBroken?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule lecture au montage
  }, []);
  const box = cx('relative shrink-0 overflow-hidden rounded-lg bg-surface-2', className);
  if (!src || state === 'broken') {
    return (
      <div className={cx(box, 'flex items-center justify-center text-muted')} title={src ? 'Image introuvable' : 'Sans image'}>
        {src ? <ImageOff className="size-1/3" aria-label="Image introuvable" /> : <UtensilsCrossed className="size-1/3" aria-label="Sans image" />}
      </div>
    );
  }
  return (
    <div className={box}>
      {state === 'loading' && <div className="skeleton absolute inset-0" aria-hidden />}
      <img
        ref={img}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setState('ok')}
        onError={() => {
          setState('broken');
          onBroken?.();
        }}
        className="size-full object-cover"
      />
    </div>
  );
}
