import type { Metadata } from 'next';
import { Field, LegalPage } from '@/components/legal-page';
import { site } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Confidentialité',
  description: 'Les données collectées par le site Riiberaka et leur usage.',
  alternates: site.url ? { canonical: '/confidentialite' } : undefined,
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Confidentialité" updated="18 octobre 2026">
      <section>
        <h2>Ce que ce site collecte</h2>
        <p>
          Le site vitrine ne demande aucun compte et ne dépose aucun cookie de suivi ni de publicité. Il ne collecte des
          données personnelles qu’à travers le formulaire « Proposer mon restaurant ».
        </p>
      </section>
      <section>
        <h2>Formulaire des restaurants</h2>
        <ul>
          <li>Données : nom du restaurant, nom du responsable, numéro de téléphone, ville ou quartier, type de cuisine et message facultatifs.</li>
          <li>Finalité : vous rappeler pour étudier l’arrivée de votre restaurant sur Riiberaka. Rien d’autre.</li>
          <li>Accès : uniquement l’équipe Riiberaka, depuis son outil d’administration. Les données ne sont ni vendues ni cédées.</li>
          <li>Conservation : le temps de traiter la demande et le suivi de la relation commerciale qui en découle.</li>
        </ul>
      </section>
      <section>
        <h2>Commandes</h2>
        <p>
          Les commandes se font dans l’application Riiberaka, qui dispose de ses propres conditions et de sa propre
          politique de confidentialité.
        </p>
      </section>
      <section>
        <h2>Vos droits</h2>
        <p>
          Vous pouvez demander l’accès, la rectification ou la suppression des informations envoyées par le formulaire en
          contactant : <Field value={site.contact.email ?? site.contact.phone} />
        </p>
      </section>
    </LegalPage>
  );
}
