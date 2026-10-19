import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { Hero } from '@/components/hero';
import { Conversion, Dishes, HowItWorks, Partners, Restaurants, Why } from '@/components/sections';
import { featuredDishes, partnerRestaurants } from '@/lib/catalog';
import { orderHref, site } from '@/lib/config';

// Catalogue relu toutes les 5 minutes au plus (ISR).
export const revalidate = 300;

export default async function HomePage() {
  const [dishes, restaurants] = await Promise.all([featuredDishes(8), partnerRestaurants(12)]);
  const order = orderHref();

  // Données structurées : seulement des faits connus (nom, site, logo), et
  // seulement si le domaine définitif est configuré.
  const jsonLd = site.url
    ? {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Riiberaka',
        url: site.url,
        logo: `${site.url}/images/brand/riiberaka-logo.png`,
        areaServed: { '@type': 'City', name: 'Lomé' },
        ...(site.contact.email ? { email: site.contact.email } : {}),
        sameAs: Object.values(site.social).filter(Boolean),
      }
    : null;

  return (
    <>
      <Header order={order} />
      <main id="contenu">
        <Hero order={order} />
        <Dishes dishes={dishes} />
        <HowItWorks />
        <Why />
        <Restaurants restaurants={restaurants} />
        <Conversion />
        <Partners />
      </main>
      <Footer />
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
    </>
  );
}
