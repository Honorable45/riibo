import Image from 'next/image';
import { photos } from '@/lib/photos';

const STEPS = [
  { label: 'Acceptée par le restaurant', done: true },
  { label: 'En préparation', done: true },
  { label: 'Livreur en route', current: true },
  { label: 'Livrée' },
];

function TrackingPreview() {
  return (
    <figure className="w-[15.5rem] rounded-3xl bg-paper p-4 shadow-[0_18px_40px_-18px_rgba(10,22,51,0.35)] sm:w-64">
      <figcaption className="text-[0.7rem] font-bold tracking-[0.12em] text-muted uppercase">Aperçu du suivi</figcaption>
      <ol className="mt-3 space-y-2.5" aria-label="Étapes d’une commande dans l’application">
        {STEPS.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                s.done ? 'bg-brand text-white' : s.current ? 'border-2 border-brand bg-brand-soft' : 'border-2 border-line'
              }`}
              aria-hidden
            >
              {s.done && (
                <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              )}
              {s.current && <span className="size-1.5 rounded-full bg-brand" />}
            </span>
            <span className={s.current ? 'font-bold text-ink' : s.done ? 'text-ink-2' : 'text-muted'}>{s.label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function Hero({ order }: { order: { href: string; external: boolean } }) {
  const ext = order.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <section id="accueil" aria-labelledby="hero-title" className="gutter relative mx-auto max-w-7xl pt-3 pb-16 md:pt-10 lg:pb-24">
      <div className="grid items-center gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="order-2 lg:order-1 lg:col-span-6">
          <p className="anim-rise inline-flex items-center gap-2 rounded-full bg-paper px-3.5 py-1.5 text-sm font-bold text-ink-2 shadow-[0_1px_0_var(--line)]">
            <span className="size-2 rounded-full bg-chili" aria-hidden />
            Lomé · Livraison ou à emporter
          </p>
          <h1
            id="hero-title"
            className="anim-rise mt-5 text-[clamp(2.6rem,9.5vw,5.6rem)] font-extrabold text-ink"
            style={{ '--delay': '80ms' } as React.CSSProperties}
          >
            Ça mijote en ville.{' '}
            <span className="text-brand">Ça arrive chez vous.</span>
          </h1>
          <p className="anim-rise mt-5 max-w-[34rem] text-lg text-ink-2 md:text-xl" style={{ '--delay': '160ms' } as React.CSSProperties}>
            Les restaurants de votre quartier, commandés depuis votre téléphone et suivis jusqu’à votre porte.
          </p>
          <div className="anim-rise mt-8 flex flex-col gap-3 sm:flex-row" style={{ '--delay': '240ms' } as React.CSSProperties}>
            <a
              href={order.href}
              {...ext}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-brand px-8 text-lg font-bold text-white transition-[background-color,transform] hover:bg-brand-deep active:scale-[0.98]"
            >
              Commander un repas
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M4 10h11M11 5l5 5-5 5" />
              </svg>
            </a>
            <a
              href="#plats"
              className="inline-flex h-14 items-center justify-center rounded-full border-2 border-ink/15 px-8 text-lg font-bold text-ink transition-colors hover:border-ink/40"
            >
              Voir les plats
            </a>
          </div>
          <ul className="anim-rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.95rem] font-semibold text-ink-2" style={{ '--delay': '320ms' } as React.CSSProperties}>
            {['Paiement à la livraison', 'Suivi en direct', 'Plusieurs restaurants'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <svg viewBox="0 0 16 16" className="size-4 text-brand" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 8.5l3 3 7-7.5" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative order-1 mb-10 sm:mb-6 lg:order-2 lg:col-span-6 lg:mb-0">
          <div className="anim-rise relative ml-auto aspect-[5/4] w-full max-w-[38rem]" style={{ '--delay': '120ms' } as React.CSSProperties}>
            <div className="absolute inset-0 overflow-hidden rounded-[2.25rem] bg-cream-deep md:rounded-[3rem]">
              <Image
                src={photos.tilapia.src}
                alt={photos.tilapia.alt}
                fill
                fetchPriority="high"
                loading="eager"
                sizes="(min-width: 1024px) 34rem, 100vw"
                className="object-cover"
              />
            </div>
            {/* Traits de vitesse du logo, posés sur le bord de la photo. */}
            <div className="speed-lines anim-lines absolute top-[14%] -left-3 w-[38%] text-[16px] sm:-left-6 sm:text-[20px]" aria-hidden>
              <span />
              <span className="ml-[22%]" />
              <span className="ml-[44%]" />
            </div>
            <div className="absolute -right-1 -bottom-8 sm:-right-3 sm:bottom-10">
              <div className="relative size-28 overflow-hidden rounded-full border-[6px] border-cream sm:size-40 lg:size-44">
                <Image src={photos.brochettes.src} alt={photos.brochettes.alt} fill sizes="11rem" className="object-cover" />
              </div>
            </div>
            <div className="absolute -bottom-10 left-2 origin-bottom-left scale-[0.72] min-[390px]:scale-[0.82] sm:bottom-8 sm:-left-10 sm:scale-100">
              <TrackingPreview />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
