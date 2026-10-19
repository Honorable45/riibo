'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/#accueil', label: 'Accueil' },
  { href: '/#fonctionnement', label: 'Comment ça marche' },
  { href: '/#plats', label: 'Les plats' },
  { href: '/#partenaires', label: 'Devenir partenaire' },
];

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Riiberaka, accueil">
      <Image src="/images/brand/riiberaka-logo.png" alt="" width={40} height={32} className="h-8 w-auto" priority={false} />
      <span className="hidden font-display text-xl font-extrabold tracking-tight text-ink min-[360px]:inline">Riiberaka</span>
    </Link>
  );
}

export function Header({ order }: { order: { href: string; external: boolean } }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const orderLink = order.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};

  return (
    <header
      className={`sticky top-0 z-40 pt-[env(safe-area-inset-top,0px)] transition-colors duration-300 ${
        scrolled || open ? 'bg-cream/95 shadow-[0_1px_0_var(--line)] backdrop-blur-sm' : 'bg-transparent'
      }`}
    >
      <div className="gutter mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 md:h-20">
        <Logo />
        <nav aria-label="Navigation principale" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="rounded-full px-4 py-2 text-[0.95rem] font-semibold text-ink-2 transition-colors hover:bg-cream-deep hover:text-ink">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={order.href}
            {...orderLink}
            className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-[0.95rem] font-bold text-white transition-colors hover:bg-brand-deep sm:px-5"
          >
            Commander
          </a>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-cream-deep lg:hidden"
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h10M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="menu-mobile" aria-label="Menu" className="gutter h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-cream pb-6 lg:hidden">
          <ul className="flex flex-col py-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-14 items-center border-b border-line font-display text-2xl font-bold text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
