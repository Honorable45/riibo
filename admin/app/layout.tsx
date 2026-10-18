import type { Metadata, Viewport } from 'next';
import { Nunito_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

const nunito = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Riiberaka Admin', template: '%s · Riiberaka Admin' },
  description: 'Backoffice d’administration Riiberaka',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={nunito.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
