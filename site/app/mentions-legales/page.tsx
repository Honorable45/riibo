import type { Metadata } from 'next';
import { Field, LegalPage } from '@/components/legal-page';
import { site } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Éditeur, hébergement et propriété du site Riiberaka.',
  alternates: site.url ? { canonical: '/mentions-legales' } : undefined,
};

export default function LegalNoticePage() {
  const { legal, contact } = site;
  return (
    <LegalPage title="Mentions légales" updated="18 octobre 2026">
      <section>
        <h2>Éditeur du site</h2>
        <ul>
          <li>Dénomination : <Field value={legal.publisher} /></li>
          <li>Adresse : <Field value={legal.address} /></li>
          <li>Immatriculation : <Field value={legal.registration} /></li>
          <li>Directeur de la publication : <Field value={legal.director} /></li>
          <li>Contact : <Field value={contact.email ?? contact.phone} /></li>
        </ul>
      </section>
      <section>
        <h2>Hébergement</h2>
        <p><Field value={legal.host} /></p>
      </section>
      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          La marque Riiberaka, son logo et les textes de ce site appartiennent à leur éditeur. Les photographies de plats de
          la page d’accueil sont des photos d’illustration placées sous licence CC0 (domaine public) ; leurs auteurs et
          sources sont listés dans le dépôt du projet.
        </p>
        <p>
          Les photos et informations des plats affichés « à la carte » sont publiées par les restaurants partenaires, qui en
          restent responsables.
        </p>
      </section>
    </LegalPage>
  );
}
