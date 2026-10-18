'use client';

import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { Button, cx } from './ui';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Motif exigé (3 à 300 caractères), transmis au serveur et journalisé. */
  reason?: { label: string; presets?: string[] };
  /** Action réelle : la fenêtre reste ouverte et affiche l'erreur en cas d'échec. */
  onConfirm: (reason: string) => Promise<unknown>;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => void>(() => {});

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  return (
    <ConfirmContext.Provider value={setOptions}>
      {children}
      {options && <ConfirmDialog key={options.title} options={options} onClose={() => setOptions(null)} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const valid = !options.reason || reason.trim().length >= 3;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await options.onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action impossible. Réessayez.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      className="m-auto w-[min(92vw,460px)] rounded-xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
      aria-labelledby="confirm-title"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="confirm-title" className="text-base font-extrabold">
            {options.title}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer" className="text-muted hover:text-ink">
            <X className="size-5" />
          </button>
        </div>
        {options.message && <div className="mt-2 text-sm text-ink-2">{options.message}</div>}
        {options.reason && (
          <div className="mt-4">
            {options.reason.presets && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {options.reason.presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setReason(p)}
                    className={cx(
                      'rounded-full border px-2.5 py-1 text-xs font-semibold',
                      reason === p ? 'border-brand bg-brand-soft text-brand' : 'border-line-strong text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-2">{options.reason.label}</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                rows={3}
                autoFocus
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
              <span className="mt-1 block text-xs text-muted">Obligatoire, 3 caractères minimum. Conservé dans le journal.</span>
            </label>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" variant={options.danger ? 'danger' : 'primary'} busy={busy} disabled={!valid}>
            {options.confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/* ---- Notifications brèves ------------------------------------------------ */

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg',
              t.tone === 'success' ? 'bg-ink text-surface' : 'bg-danger text-white',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
