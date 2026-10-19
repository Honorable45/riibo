import Link from 'next/link';
import { site } from '@/lib/config';
import { Logo } from './header';

/** Pied de page : seules les coordonnées et réseaux réellement configurés apparaissent. */
export function Footer() {
  const social = [
    site.social.facebook && { href: site.social.facebook, label: 'Facebook' },
    site.social.instagram && { href: site.social.instagram, label: 'Instagram' },
    site.social.tiktok && { href: site.social.tiktok, label: 'TikTok' },
  ].filter(Boolean) as Array<{ href: string; label: string }>;
  const apps = [
    site.clientAppUrl && { href: site.clientAppUrl, label: 'Commander en ligne' },
    site.androidAppUrl && { href: site.androidAppUrl, label: 'Android' },
    site.iosAppUrl && { href: site.iosAppUrl, label: 'iPhone' },
    site.restaurantAppUrl && { href: site.restaurantAppUrl, label: 'Espace restaurant' },
  ].filter(Boolean) as Array<{ href: string; label: string }>;
  const { email, phone, whatsapp } = site.contact;
  const heading = 'text-sm font-extrabold tracking-[0.12em] text-ink uppercase';
  const link = 'text-ink-2 transition-colors hover:text-ink';

  return (
    <footer className="border-t border-line bg-cream pb-[env(safe-area-inset-bottom,0px)]">
      <div className="gutter mx-auto grid max-w-7xl gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-ink-2">
            Commande et livraison de repas à Lomé : les restaurants du quartier, dans votre téléphone.
          </p>
        </div>
        <nav aria-label="Pied de page">
          <p className={heading}>Découvrir</p>
          <ul className="mt-4 space-y-2.5">
            <li><Link className={link} href="/#fonctionnement">Comment ça marche</Link></li>
            <li><Link className={link} href="/#plats">Les plats</Link></li>
            <li><Link className={link} href="/#partenaires">Devenir partenaire</Link></li>
            <li><Link className={link} href="/#application">L’application</Link></li>
          </ul>
        </nav>
        <div>
          <p className={heading}>Contact</p>
          <ul className="mt-4 space-y-2.5 text-ink-2">
            {email && <li className="select-all">{email}</li>}
            {phone && <li className="select-all">{phone}</li>}
            {whatsapp && (
              <li>
                <a className={link} href={`https://wa.me/${whatsapp.replace('+', '')}`} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </li>
            )}
            {!email && !phone && !whatsapp && (
              <li>
                <Link className={link} href="/#partenaires">
                  Formulaire restaurants
                </Link>
              </li>
            )}
            {social.map((s) => (
              <li key={s.href}>
                <a className={link} href={s.href} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className={heading}>{apps.length ? 'Applications' : 'Informations'}</p>
          <ul className="mt-4 space-y-2.5">
            {apps.map((a) => (
              <li key={a.href}>
                <a className={link} href={a.href} target="_blank" rel="noopener noreferrer">
                  {a.label}
                </a>
              </li>
            ))}
            <li><Link className={link} href="/mentions-legales">Mentions légales</Link></li>
            <li><Link className={link} href="/confidentialite">Confidentialité</Link></li>
          </ul>
        </div>
      </div>
      <div className="gutter mx-auto max-w-7xl border-t border-line py-6 text-sm text-muted">
        © {new Date().getFullYear()} Riiberaka · Lomé, Togo
      </div>
    </footer>
  );
}
