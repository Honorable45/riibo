'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Me } from '@/lib/types';
import { ErrorState, Skeleton } from './ui';

const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe() hors de <AdminGate>');
  return me;
}

export const meQueryKey = ['me'] as const;

/** Déconnexion : révoque la session côté serveur puis efface le cache local. */
export async function signOut(clear: () => void) {
  await api('/auth/logout', { method: 'POST', noRefresh: true }).catch(() => undefined);
  clear();
}

/**
 * N'affiche le backoffice qu'à un compte ADMIN actif. C'est un confort
 * d'interface : chaque route /admin/* est de toute façon refusée par le
 * backend (AdminGuard relit le rôle en base à chaque requête).
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: meQueryKey, queryFn: () => api<Me>('/users/me'), staleTime: 60_000 });

  const notAdmin = me.data && me.data.role !== 'ADMIN';
  useEffect(() => {
    if (notAdmin) {
      void signOut(() => queryClient.clear()).then(() => router.replace('/connexion?refuse=1'));
    }
  }, [notAdmin, queryClient, router]);

  if (me.error instanceof ApiError && me.error.kind === 'unauthorized') return <FullScreenLoading />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  if (!me.data || notAdmin) return <FullScreenLoading />;
  return <MeContext.Provider value={me.data}>{children}</MeContext.Provider>;
}

function FullScreenLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6" role="status" aria-label="Vérification de la session">
      <div className="w-64 space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
