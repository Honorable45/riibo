'use client';

import { FileText } from 'lucide-react';
import { useConfirm } from './confirm';
import { Button } from './ui';

type Action = 'START_REVIEW' | 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REACTIVATE';

/** Miroir de backend/src/admin/approval-transitions.ts (le serveur reste l'autorité). */
const TRANSITIONS: Record<Action, { from: string[]; label: string; reason: boolean; danger?: boolean; primary?: boolean }> = {
  START_REVIEW: { from: ['PENDING'], label: 'Démarrer la vérification', reason: false },
  APPROVE: { from: ['PENDING', 'IN_REVIEW'], label: 'Valider', reason: false, primary: true },
  REJECT: { from: ['PENDING', 'IN_REVIEW'], label: 'Refuser', reason: true, danger: true },
  SUSPEND: { from: ['APPROVED'], label: 'Suspendre', reason: true, danger: true },
  REACTIVATE: { from: ['SUSPENDED'], label: 'Réactiver', reason: false, primary: true },
};

export function availableActions(status: string): Action[] {
  return (Object.keys(TRANSITIONS) as Action[]).filter((a) => TRANSITIONS[a].from.includes(status));
}

const CONSEQUENCE: Record<Action, string> = {
  START_REVIEW: 'Le dossier passe « en vérification ».',
  APPROVE: 'Le compte devient opérationnel immédiatement.',
  REJECT: 'Le dossier est refusé ; le motif est transmis au demandeur.',
  SUSPEND: 'Toute activité est bloquée immédiatement ; le motif est transmis.',
  REACTIVATE: 'Le compte redevient opérationnel.',
};

export function ApprovalActions({ status, subject, onAction }: {
  status: string;
  subject: string;
  onAction: (action: Action, reason?: string) => Promise<unknown>;
}) {
  const confirm = useConfirm();
  const actions = availableActions(status);
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => {
        const t = TRANSITIONS[a];
        return (
          <Button
            key={a}
            variant={t.danger ? 'danger' : t.primary ? 'primary' : 'secondary'}
            onClick={() =>
              confirm({
                title: `${t.label} — ${subject}`,
                message: `${CONSEQUENCE[a]} L’action est enregistrée dans le journal d’audit.`,
                confirmLabel: t.label,
                danger: t.danger,
                reason: t.reason ? { label: 'Motif (transmis à l’intéressé)' } : undefined,
                onConfirm: (reason) => onAction(a, t.reason ? reason : undefined),
              })
            }
          >
            {t.label}
          </Button>
        );
      })}
    </div>
  );
}

/** Pièces privées : chaque ouverture est journalisée par le serveur. */
export function Documents({ base, docs, labels }: { base: string; docs: Record<string, boolean>; labels: Record<string, string> }) {
  return (
    <ul className="space-y-2">
      {Object.entries(labels).map(([type, label]) => (
        <li key={type} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 text-ink-2">
            <FileText className="size-4 text-muted" aria-hidden />
            {label}
          </span>
          {docs[type] ? (
            <a href={`/api/v1${base}/documents/${type}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
              Ouvrir
            </a>
          ) : (
            <span className="text-muted">Non fournie</span>
          )}
        </li>
      ))}
    </ul>
  );
}
