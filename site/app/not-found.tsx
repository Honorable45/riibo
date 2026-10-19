import Link from 'next/link';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { orderHref } from '@/lib/config';

export default function NotFound() {
  return (
    <>
      <Header order={orderHref()} />
      <main id="contenu" className="gutter mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-start justify-center py-20">
        <div className="speed-lines w-20 text-[9px]" aria-hidden>
          <span />
          <span className="ml-[25%]" />
          <span className="ml-[50%]" />
        </div>
        <h1 className="mt-6 text-5xl font-extrabold">Cette page n’existe pas.</h1>
        <p className="mt-4 text-lg text-ink-2">Le plat n’est plus à la carte, ou l’adresse est incorrecte.</p>
        <Link href="/" className="mt-8 inline-flex h-13 items-center rounded-full bg-brand px-7 font-bold text-white hover:bg-brand-deep">
          Retour à l’accueil
        </Link>
      </main>
      <Footer />
    </>
  );
}
