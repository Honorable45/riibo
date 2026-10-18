'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { ConfirmProvider, ToastProvider } from './confirm';

/** Session expirée et non renouvelable : retour à la connexion. */
function onAuthError(error: unknown) {
  if (error instanceof ApiError && error.kind === 'unauthorized' && typeof window !== 'undefined') {
    const here = window.location.pathname + window.location.search;
    if (!here.startsWith('/connexion')) {
      // Rechargement complet volontaire : efface tout l'état de la session expirée.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/connexion?expire=1&suite=${encodeURIComponent(here)}`);
    }
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: onAuthError }),
        mutationCache: new MutationCache({ onError: onAuthError }),
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            // On ne réessaie que les erreurs réseau / serveur, jamais un refus.
            retry: (count, error) =>
              count < 2 && error instanceof ApiError && (error.kind === 'network' || error.kind === 'server'),
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
