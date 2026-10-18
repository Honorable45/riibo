'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Badge, Card, Detail, ErrorState, LoadingRows, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { PAYMENT_METHOD } from '@/lib/format';
import type { PlatformConfig } from '@/lib/types';

const on = (ok: boolean, yes = 'Configuré', no = 'Non configuré'): ReactNode => (ok ? <Badge tone="success">{yes}</Badge> : <Badge tone="warning">{no}</Badge>);

export default function SettingsPage() {
  const config = useQuery({ queryKey: ['config'], queryFn: () => api<PlatformConfig>('/admin/config') });
  return (
    <>
      <PageHeader
        title="Configuration"
        description="État des services de la plateforme, en lecture seule. Les secrets (clés, mots de passe) ne sont jamais exposés : ils se règlent sur le serveur, dans son fichier d’environnement."
      />
      {config.isPending ? (
        <LoadingRows />
      ) : config.error ? (
        <ErrorState error={config.error} onRetry={() => void config.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Paiements">
            <dl>
              <Detail label="Prestataire actif">{config.data.payments.provider}</Detail>
              {Object.entries(config.data.payments.methods).map(([m, ok]) => (
                <Detail key={m} label={PAYMENT_METHOD[m] ?? m}>{on(ok, 'Opérationnel', 'Non intégré')}</Detail>
              ))}
              <Detail label="Commission Riiberaka">{on(config.data.commission.configured)}</Detail>
            </dl>
          </Card>
          <Card title="Comptes et messages">
            <dl>
              <Detail label="SMS (codes de connexion)">{on(config.data.sms.configured, config.data.sms.provider)}</Detail>
              <Detail label="Vérification du numéro à l’inscription">{on(config.data.registrationOtp, 'Activée', 'Désactivée')}</Detail>
              <Detail label="E-mails">{on(config.data.mail.provider !== 'none', config.data.mail.provider)}</Detail>
            </dl>
          </Card>
          <Card title="Infrastructure">
            <dl>
              <Detail label="Environnement">{config.data.environment}</Detail>
              <Detail label="Stockage des images">{config.data.media.storage === 'cloudinary' ? 'Cloudinary' : 'Disque local (développement)'}</Detail>
              <Detail label="Temps réel multi-instances (Redis)">{on(config.data.realtime.redis)}</Detail>
              <Detail label="Relais d’appels (TURN)">{on(config.data.calls.turn)}</Detail>
            </dl>
          </Card>
          <Card title="Notifications">
            <dl>
              <Detail label="Web (navigateurs)">{on(config.data.push.webPush)}</Detail>
              <Detail label="Applications mobiles (Firebase)">{on(config.data.push.fcm)}</Detail>
            </dl>
          </Card>
          <Card title="Paramètres modifiables" className="lg:col-span-2">
            <p className="text-sm text-ink-2">
              Le backend ne possède pas encore de modèle de paramètres de plateforme (zones desservies, règles de livraison, commission, coordonnées du support).
              Les frais de livraison et minimums sont aujourd’hui définis par chaque restaurant. Cette page n’affiche donc aucun réglage factice ; l’ajout de paramètres éditables nécessite une évolution du schéma, avec journalisation de chaque modification.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
