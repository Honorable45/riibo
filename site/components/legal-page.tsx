import type { ReactNode } from 'react';
import { orderHref } from '@/lib/config';
import { Footer } from './footer';
import { Header } from './header';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <Header order={orderHref()} />
      <main id="contenu" className="gutter mx-auto max-w-3xl py-12 md:py-20">
        <h1 className="text-[clamp(2.2rem,6vw,3.6rem)] font-extrabold">{title}</h1>
        <p className="mt-3 text-sm text-muted">Dernière mise à jour : {updated}</p>
        <div className="mt-10 space-y-8 text-[1.05rem] leading-relaxed text-ink-2 [&_h2]:font-sans [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:tracking-normal [&_h2]:text-ink [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}

/** Valeur configurée, ou mention explicite qu'elle reste à renseigner (jamais inventée). */
export function Field({ value }: { value: string | null }) {
  return value ? <>{value}</> : <span className="rounded bg-chili-soft px-1.5 py-0.5 text-sm font-semibold text-danger">À compléter avant la mise en ligne</span>;
}
