'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { meQueryKey } from '@/components/session';
import { Button, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Me } from '@/lib/types';

/** Ne suit qu'un chemin interne : jamais une URL externe passée en paramètre. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/connexion') ? raw : '/';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get('refuse')
      ? 'Ce compte n’a pas accès au backoffice.'
      : params.get('expire')
        ? 'Votre session a expiré. Reconnectez-vous.'
        : null,
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: Me }>('/auth/login', {
        method: 'POST',
        body: { identifier: identifier.trim(), password },
        noRefresh: true,
      });
      if (res.user.role !== 'ADMIN') {
        // Session ouverte par erreur sur un compte non admin : on la révoque aussitôt.
        await api('/auth/logout', { method: 'POST', noRefresh: true }).catch(() => undefined);
        setError('Ce compte n’a pas accès au backoffice.');
        setBusy(false);
        return;
      }
      queryClient.setQueryData(meQueryKey, res.user);
      router.replace(safeNext(params.get('suite')));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.kind === 'unauthorized' || err.kind === 'validation'
            ? 'Identifiant ou mot de passe incorrect.'
            : err.message
          : 'Connexion impossible. Réessayez.',
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Téléphone ou e-mail" htmlFor="identifier">
        <Input
          id="identifier"
          autoComplete="username"
          inputMode="email"
          placeholder="+228 90 00 00 00"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" busy={busy} disabled={!identifier.trim() || !password} className="h-10 w-full">
        Se connecter
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-ink">
            <Lock className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-lg font-extrabold leading-tight">Riiberaka</p>
            <p className="text-sm text-muted">Backoffice d’administration</p>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <h1 className="mb-4 text-base font-extrabold">Connexion</h1>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Accès réservé à l’équipe Riiberaka. Les comptes administrateurs sont créés par l’équipe technique.
        </p>
      </div>
    </main>
  );
}
