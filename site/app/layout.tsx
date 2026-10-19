import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Nunito_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { site } from '@/lib/config';
import './globals.css';

const body = Nunito_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display-face',
  display: 'swap',
});

const description =
  'Riiberaka : commandez les plats des restaurants de Lomé depuis votre téléphone, suivez la préparation et la livraison jusqu’à votre porte.';

export const metadata: Metadata = {
  // Domaine réel uniquement s'il est configuré (NEXT_PUBLIC_SITE_URL).
  metadataBase: new URL(site.url ?? 'http://localhost:3004'),
  title: { default: 'Riiberaka — Vos repas livrés à Lomé', template: '%s · Riiberaka' },
  description,
  applicationName: 'Riiberaka',
  alternates: site.url ? { canonical: '/' } : undefined,
  openGraph: {
    type: 'website',
    locale: 'fr_TG',
    siteName: 'Riiberaka',
    title: 'Riiberaka — Vos repas livrés à Lomé',
    description,
    images: [{ url: '/images/og/riiberaka-og.jpg', width: 1200, height: 630, alt: 'Plats de restaurants, commandés avec Riiberaka' }],
  },
  twitter: { card: 'summary_large_image', title: 'Riiberaka — Vos repas livrés à Lomé', description },
  // Tant que le domaine définitif n'est pas configuré, le site ne demande pas à être indexé.
  robots: site.url ? { index: true, follow: true } : { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#faf5ec',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${body.variable} ${display.variable}`}>
      <body>
        <a
          href="#contenu"
          className="fixed top-3 left-3 z-[60] -translate-y-24 rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper focus:translate-y-0"
        >
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
