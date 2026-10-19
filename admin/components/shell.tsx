'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  ClipboardList,
  Flag,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Store,
  Tag,
  UtensilsCrossed,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { signOut, useMe } from './session';
import { cx } from './ui';

const NAV: Array<{ title: string; items: Array<{ href: string; label: string; icon: typeof Store; badge?: 'reports' }> }> = [
  {
    title: 'Pilotage',
    items: [
      { href: '/', label: 'Tableau de bord', icon: LayoutDashboard },
      { href: '/commandes', label: 'Commandes', icon: ClipboardList },
      { href: '/finances', label: 'Finances', icon: Wallet },
    ],
  },
  {
    title: 'Réseau',
    items: [
      { href: '/restaurants', label: 'Restaurants', icon: Store },
      { href: '/plats', label: 'Plats', icon: UtensilsCrossed },
      { href: '/livreurs', label: 'Livreurs', icon: Bike },
      { href: '/clients', label: 'Comptes', icon: Users },
    ],
  },
  {
    title: 'Opérations',
    items: [
      { href: '/candidatures', label: 'Candidatures', icon: Handshake },
      { href: '/promotions', label: 'Promotions', icon: Tag },
      { href: '/signalements', label: 'Signalements', icon: Flag, badge: 'reports' },
      { href: '/journal', label: 'Journal d’audit', icon: ScrollText },
      { href: '/parametres', label: 'Configuration', icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api<{ reports: { pending: number } }>('/admin/metrics'),
    refetchInterval: 60_000,
  });
  const pending = metrics.data?.reports.pending ?? 0;
  return (
    <nav aria-label="Navigation principale" className="space-y-5">
      {NAV.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">{group.title}</p>
          <ul className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon, badge }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                      active ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{label}</span>
                    {badge === 'reports' && pending > 0 && (
                      <span className="num rounded-full bg-warning px-1.5 text-[11px] font-bold text-white" aria-label={`${pending} en attente`}>
                        {pending}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Account() {
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-t border-line pt-3">
      <p className="truncate px-3 text-sm font-bold">{`${me.firstName} ${me.lastName}`.trim()}</p>
      <p className="truncate px-3 text-xs text-muted">{me.phone ?? me.email}</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOut(() => queryClient.clear());
          router.replace('/connexion');
        }}
        className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden />
        {busy ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-extrabold text-brand-ink">R</span>
      <span className="leading-tight">
        <span className="block text-sm font-extrabold">Riiberaka</span>
        <span className="block text-xs text-muted">Administration</span>
      </span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-3 py-4 lg:flex">
        <Brand />
        <div className="flex-1">
          <Nav />
        </div>
        <Account />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          className="rounded-lg p-2 text-ink-2 hover:bg-surface-2"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fermer le menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto bg-surface px-3 py-4">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer le menu" className="rounded-lg p-2 text-ink-2 hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1">
              <Nav onNavigate={() => setOpen(false)} />
            </div>
            <Account />
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}
