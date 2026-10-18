'use client';

import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react';
import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ApiError } from '@/lib/api';
import type { Tone } from '@/lib/format';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:opacity-90',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
};

export function Button({
  variant = 'secondary',
  busy,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2 border-line',
  info: 'bg-info-soft text-info border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  brand: 'bg-brand-soft text-brand border-transparent',
};

/** Étiquette d'état : toujours un libellé, jamais la couleur seule. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const entry = map[value] ?? { label: value, tone: 'neutral' as Tone };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export function Card({ title, action, children, className, padded = true }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx('min-w-0 rounded-xl border border-line bg-surface shadow-card', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-bold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className={padded ? 'p-4' : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone, href }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'warning' | 'danger' | 'success';
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cx(
          'num mt-1 text-2xl font-extrabold tracking-tight',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
          tone === 'success' && 'text-success',
          !tone && 'text-ink',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  const cls = 'block min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card';
  return href ? (
    <Link href={href} className={cx(cls, 'transition-colors hover:border-line-strong')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <Inbox className="size-8 text-muted" aria-hidden />
      <p className="mt-3 font-bold text-ink">{title}</p>
      {message && <p className="mt-1 max-w-[50ch] text-sm text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError ? error.message : 'Une erreur inattendue est survenue. Réessayez dans un instant.';
  return (
    <div role="alert" className="flex flex-col items-center px-4 py-10 text-center">
      <AlertTriangle className="size-8 text-danger" aria-hidden />
      <p className="mt-3 font-bold text-ink">Chargement impossible</p>
      <p className="mt-1 max-w-[55ch] text-sm text-muted">{message}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry} icon={<RotateCw className="size-4" aria-hidden />}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-label="Chargement" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="block min-w-0" htmlFor={htmlFor}>
      <span className="mb-1 block text-xs font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const CONTROL =
  'h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none';

/** Pleine largeur par défaut, sauf si l'appelant fixe une largeur. */
const widthOf = (className?: string) => (/(^|\s)(w-|max-w-|min-w-)/.test(className ?? '') ? undefined : 'w-full');

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, widthOf(props.className), props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CONTROL, 'pr-8', widthOf(props.className), props.className)} />;
}

/** Ligne « libellé : valeur » des fiches. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold break-words text-ink">{children ?? '—'}</dd>
    </div>
  );
}
