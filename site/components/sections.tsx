import Image from 'next/image';
import { fcfa, mediaSrc, type PublicDish, type PublicRestaurant } from '@/lib/catalog';
import { site } from '@/lib/config';
import { photos } from '@/lib/photos';
import { PartnerForm } from './partner-form';
import { Reveal } from './reveal';

type Order = { href: string; external: boolean };
const extProps = (o: Order) => (o.external ? { target: '_blank', rel: 'noopener noreferrer' } : {});

function Eyebrow({ children, tone = 'brand' }: { children: React.ReactNode; tone?: 'brand' | 'chili' | 'light' }) {
  const color = tone === 'chili' ? 'text-chili' : tone === 'light' ? 'text-white/80' : 'text-brand';
  return <p className={`text-sm font-extrabold tracking-[0.14em] uppercase ${color}`}>{children}</p>;
}

/* ---------------------------------------------------------------- Plats */

export function Dishes({ dishes }: { dishes: PublicDish[] | null }) {
  const live = dishes && dishes.length >= 3;
  return (
    <section id="plats" aria-labelledby="plats-title" className="gutter mx-auto max-w-7xl py-16 md:py-24">
      <Reveal className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <Eyebrow>{live ? 'À la carte en ce moment' : 'Des envies pour chaque moment'}</Eyebrow>
          <h2 id="plats-title" className="mt-3 text-[clamp(2rem,5vw,3.4rem)] font-extrabold">
            {live ? 'Ce que cuisinent les restaurants Riiberaka.' : 'Grillades, plats mijotés, pizzas : tout y passe.'}
          </h2>
        </div>
        {!live && <p className="text-sm font-semibold text-muted">Photos d’illustration</p>}
      </Reveal>

      {live ? (
        <ul className="mt-10 grid grid-cols-1 gap-x-5 gap-y-8 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {dishes.map((d, i) => (
            <Reveal as="li" key={d.id} delay={(i % 4) * 70}>
              <article>
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-cream-deep">
                  <Image
                    src={mediaSrc(d.imageUrl)!}
                    alt={d.name}
                    fill
                    sizes="(min-width: 1024px) 18rem, (min-width: 420px) 45vw, 90vw"
                    className="object-cover transition-transform duration-500 hover:scale-[1.03]"
                  />
                </div>
                <h3 className="mt-3 font-sans text-lg leading-snug font-extrabold tracking-normal">{d.name}</h3>
                <p className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[0.95rem]">
                  <span className="text-ink-2">{d.restaurant.name}</span>
                  <span className="font-extrabold text-ink tabular-nums">{fcfa(d.price)}</span>
                </p>
              </article>
            </Reveal>
          ))}
        </ul>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4 md:grid-rows-2 md:gap-5">
          {[
            { p: photos.brochettes, cls: 'col-span-2 row-span-2 aspect-[4/3] md:aspect-auto' },
            { p: photos.pouletRiz, cls: 'aspect-[3/4] md:aspect-auto' },
            { p: photos.burger, cls: 'aspect-[3/4] md:aspect-[4/3]' },
            { p: photos.pizza, cls: 'col-span-2 aspect-[16/9] md:aspect-auto' },
          ].map(({ p, cls }, i) => (
            <Reveal as="figure" key={p.src} delay={i * 80} className={`relative overflow-hidden rounded-[1.75rem] bg-cream-deep ${cls}`}>
              <Image src={p.src} alt={p.alt} fill sizes="(min-width: 768px) 40vw, 90vw" className="object-cover" />
              <figcaption className="absolute bottom-3 left-3 rounded-full bg-paper/95 px-3 py-1 text-sm font-bold">{p.caption}</figcaption>
            </Reveal>
          ))}
        </div>
      )}
      {live && (
        <p className="mt-8 text-sm text-muted">
          Prix et disponibilités fixés par chaque restaurant, mis à jour régulièrement. Le détail complet est dans l’application.
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------- Comment ça marche */

const STEPS = [
  { t: 'Découvrez', d: 'Parcourez les restaurants ouverts près de chez vous et leurs plats, prix affichés.' },
  { t: 'Composez', d: 'Choisissez l’accompagnement, les suppléments, et laissez une note pour la cuisine.' },
  { t: 'Commandez', d: 'En livraison à votre adresse ou à emporter. Vous payez en espèces à la réception.' },
  { t: 'Recevez', d: 'Suivez chaque étape en direct. À l’arrivée, donnez votre code de remise au livreur.' },
];

export function HowItWorks() {
  return (
    <section id="fonctionnement" aria-labelledby="fonctionnement-title" className="bg-ink text-white">
      <div className="gutter mx-auto max-w-7xl py-16 md:py-24">
        <Reveal className="max-w-2xl">
          <Eyebrow tone="light">Comment ça marche</Eyebrow>
          <h2 id="fonctionnement-title" className="mt-3 text-[clamp(2rem,5vw,3.4rem)] font-extrabold">
            De l’envie à l’assiette, en quatre gestes.
          </h2>
        </Reveal>
        <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.t} delay={i * 90} className="relative">
              <div className="flex items-center gap-4">
                <span className="font-display text-6xl leading-none font-extrabold text-brand-soft/90 tabular-nums">{i + 1}</span>
                {i < STEPS.length - 1 && (
                  <span className="speed-lines hidden flex-1 text-[6px] opacity-60 lg:grid" aria-hidden>
                    <span className="bg-white/50!" />
                    <span className="w-2/3 bg-white/30!" />
                  </span>
                )}
              </div>
              <h3 className="mt-5 font-sans text-2xl font-extrabold tracking-normal">{s.t}</h3>
              <p className="mt-2 text-white/75">{s.d}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------- Pourquoi Riiberaka */

const REASONS = [
  { t: 'Plusieurs restaurants, une seule application', d: 'Grillades, plats du jour, pizzas : vous comparez et vous choisissez.' },
  { t: 'Le suivi en direct', d: 'Acceptée, en préparation, en route : chaque étape s’affiche au moment où elle arrive.' },
  { t: 'Une discussion à portée de main', d: 'Une question sur votre commande ? Écrivez au restaurant ou au livreur depuis l’application.' },
  { t: 'Une remise sécurisée', d: 'En livraison, le repas n’est remis qu’avec votre code personnel, vérifié par Riiberaka.' },
  { t: 'Vous payez à la réception', d: 'Paiement en espèces quand le repas arrive, en livraison comme à emporter.' },
];

export function Why() {
  return (
    <section aria-labelledby="pourquoi-title" className="gutter mx-auto max-w-7xl py-16 md:py-24">
      <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal className="relative lg:sticky lg:top-28">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2.5rem] bg-cream-deep sm:aspect-[4/3] lg:aspect-[4/5]">
            <Image src={photos.pouletRiz.src} alt={photos.pouletRiz.alt} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
          </div>
          <div className="speed-lines absolute -right-3 bottom-10 w-1/3 text-[14px]" aria-hidden>
            <span className="bg-chili!" />
            <span className="ml-[30%] bg-chili!" />
          </div>
        </Reveal>
        <div>
          <Reveal>
            <Eyebrow tone="chili">Pourquoi Riiberaka</Eyebrow>
            <h2 id="pourquoi-title" className="mt-3 text-[clamp(2rem,5vw,3.4rem)] font-extrabold">
              Pensé pour manger bien, sans se compliquer la vie.
            </h2>
          </Reveal>
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {REASONS.map((r, i) => (
              <Reveal as="li" key={r.t} delay={i * 60} className="py-6">
                <h3 className="font-sans text-xl font-extrabold tracking-normal">{r.t}</h3>
                <p className="mt-1.5 text-ink-2">{r.d}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------- Restaurants */

export function Restaurants({ restaurants }: { restaurants: PublicRestaurant[] | null }) {
  if (!restaurants || restaurants.length === 0) return null;
  return (
    <section aria-labelledby="restaurants-title" className="border-t border-line">
      <div className="gutter mx-auto max-w-7xl py-16 md:py-20">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Ils cuisinent sur Riiberaka</Eyebrow>
            <h2 id="restaurants-title" className="mt-3 text-[clamp(1.8rem,4vw,2.8rem)] font-extrabold">
              Des restaurants validés par notre équipe.
            </h2>
          </div>
        </Reveal>
        <ul className="mt-10 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {restaurants.map((r) => (
            <li key={r.id} className="border-b border-line py-5">
              <p className="font-display text-2xl font-bold tracking-tight">{r.name}</p>
              <p className="mt-1 text-[0.95rem] text-ink-2">
                {[r.quarter, r.city].filter(Boolean).join(', ')}
                {r.categories.length > 0 && <span className="text-muted"> · {r.categories.map((c) => c.name).join(', ')}</span>}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------- Conversion / application */

function StoreLinks() {
  const links = [
    site.clientAppUrl && { href: site.clientAppUrl, label: 'Commander en ligne' },
    site.androidAppUrl && { href: site.androidAppUrl, label: 'Application Android' },
    site.iosAppUrl && { href: site.iosAppUrl, label: 'Application iPhone' },
  ].filter(Boolean) as Array<{ href: string; label: string }>;
  if (!links.length) {
    return (
      <p className="mt-6 max-w-md rounded-2xl bg-white/10 px-5 py-4 text-white/90">
        L’application Riiberaka n’est pas encore publiée sur les stores. Les liens de téléchargement apparaîtront ici dès sa
        mise en ligne.
      </p>
    );
  }
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      {links.map((l, i) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex h-14 items-center justify-center rounded-full px-8 text-lg font-bold transition-colors ${
            i === 0 ? 'bg-white text-ink hover:bg-cream' : 'border-2 border-white/40 text-white hover:border-white'
          }`}
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}

export function Conversion() {
  return (
    <section id="application" aria-labelledby="application-title" className="gutter mx-auto max-w-7xl pb-16 md:pb-24">
      <Reveal className="relative overflow-hidden rounded-[2.5rem] bg-ink">
        <Image src={photos.pouletService.src} alt="" fill sizes="(min-width: 1280px) 80rem, 100vw" className="object-cover object-[70%_50%]" />
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/85 to-ink/20 lg:bg-linear-to-r lg:from-ink lg:via-ink/75 lg:to-transparent" aria-hidden />
        <div className="relative px-6 py-14 sm:px-12 md:py-20 lg:w-2/3">
          <div className="speed-lines w-24 text-[9px]" aria-hidden>
            <span />
            <span className="ml-[25%]" />
            <span className="ml-[50%]" />
          </div>
          <h2 id="application-title" className="mt-6 text-[clamp(2.1rem,6vw,4rem)] font-extrabold text-white">
            Votre prochain repas est à quelques gestes.
          </h2>
          <p className="mt-4 max-w-lg text-lg text-white/80">Choisissez, commandez, suivez. On s’occupe du reste jusqu’à votre porte.</p>
          <StoreLinks />
        </div>
      </Reveal>
    </section>
  );
}

/* ----------------------------------------------------- Partenaires */

export function Partners() {
  const contact = site.contact.whatsapp ?? site.contact.phone;
  const fallback = contact ? (
    <>
      Vous pouvez aussi nous joindre au <span className="font-bold whitespace-nowrap select-all">{contact}</span>
      {site.contact.whatsapp && (
        <>
          {' '}
          (
          <a className="underline" href={`https://wa.me/${site.contact.whatsapp.replace('+', '')}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          )
        </>
      )}
      .
    </>
  ) : site.contact.email ? (
    <>
      Vous pouvez aussi écrire à <span className="font-bold select-all">{site.contact.email}</span>.
    </>
  ) : null;

  return (
    <section id="partenaires" aria-labelledby="partenaires-title" className="bg-cream-deep">
      <div className="gutter mx-auto grid max-w-7xl gap-12 py-16 md:py-24 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <Reveal>
            <Eyebrow tone="chili">Restaurants</Eyebrow>
            <h2 id="partenaires-title" className="mt-3 text-[clamp(2rem,5vw,3.4rem)] font-extrabold">
              Votre cuisine mérite plus de tables.
            </h2>
            <p className="mt-4 max-w-lg text-lg text-ink-2">
              Rejoignez Riiberaka : vos plats apparaissent dans l’application des clients, et chaque commande arrive chez vous en temps réel.
            </p>
          </Reveal>
          <ol className="mt-10 space-y-7">
            {[
              { t: 'Envoyez votre demande', d: 'Le formulaire prend deux minutes. Aucun engagement.' },
              { t: 'L’équipe vous rappelle', d: 'Nous vérifions avec vous l’adresse et les pièces : identité du responsable, registre de commerce, photo de la devanture.' },
              { t: 'Publiez votre menu', d: 'Une fois validé, vous gérez plats, prix, horaires et commandes depuis l’application Restaurant.' },
            ].map((s, i) => (
              <Reveal as="li" key={s.t} delay={i * 80} className="flex gap-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink font-display text-lg font-extrabold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-sans text-xl font-extrabold tracking-normal">{s.t}</h3>
                  <p className="mt-1 text-ink-2">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </ol>
          {site.restaurantAppUrl && (
            <p className="mt-10 text-ink-2">
              Déjà partenaire ?{' '}
              <a href={site.restaurantAppUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-brand underline-offset-4 hover:underline">
                Accéder à l’espace restaurant
              </a>
            </p>
          )}
        </div>
        <Reveal delay={100}>
          <PartnerForm fallbackContact={fallback} />
        </Reveal>
      </div>
    </section>
  );
}
