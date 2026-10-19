'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

export interface PartnerFormValues {
  restaurantName: string;
  contactName: string;
  phone: string;
  area: string;
  cuisine: string;
  message: string;
}

type Errors = Partial<Record<keyof PartnerFormValues, string>>;

/** Mêmes règles que le serveur (CreatePartnerRequestDto), vérifiées avant l'envoi. */
export function validatePartner(v: PartnerFormValues): Errors {
  const errors: Errors = {};
  if (v.restaurantName.trim().length < 2) errors.restaurantName = 'Indiquez le nom du restaurant.';
  if (v.contactName.trim().length < 2) errors.contactName = 'Indiquez le nom du responsable.';
  const digits = v.phone.replace(/[\s.\-()]/g, '');
  if (!/^(\+|00)?\d{8,15}$/.test(digits)) errors.phone = 'Numéro invalide (ex. 90 12 34 56 ou +228 90 12 34 56).';
  if (v.area.trim().length < 2) errors.area = 'Indiquez la ville ou le quartier.';
  if (v.restaurantName.length > 120) errors.restaurantName = '120 caractères maximum.';
  if (v.message.length > 1000) errors.message = '1000 caractères maximum.';
  return errors;
}

const EMPTY: PartnerFormValues = { restaurantName: '', contactName: '', phone: '', area: '', cuisine: '', message: '' };

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

function messageFor(status: number, body: unknown): string {
  if (status === 409) return 'Une demande avec ce numéro est déjà en attente. Notre équipe vous rappellera.';
  if (status === 429) return 'Trop de demandes envoyées depuis cette connexion. Réessayez dans une heure.';
  if (status === 400) {
    const raw = (body as { message?: { message?: unknown } | unknown })?.message;
    const inner = (raw as { message?: unknown })?.message ?? raw;
    if (Array.isArray(inner) || typeof inner === 'string') return 'Certaines informations sont invalides. Vérifiez le formulaire.';
  }
  return 'L’envoi n’a pas abouti. Réessayez dans un instant.';
}

export function PartnerForm({ fallbackContact }: { fallbackContact: React.ReactNode }) {
  const [values, setValues] = useState<PartnerFormValues>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<State>({ kind: 'idle' });
  const trap = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  // Après l'envoi, le formulaire est remplacé par un message plus court : on
  // l'amène à l'écran et on lui donne le focus (lecteurs d'écran compris).
  useEffect(() => {
    if (state.kind !== 'sent' || !confirmation.current) return;
    confirmation.current.focus({ preventScroll: true });
    confirmation.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [state.kind]);
  const set = (key: keyof PartnerFormValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === 'sending') return; // pas de double envoi
    const found = validatePartner(values);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      document.getElementById(`partner-${first}`)?.focus();
      return;
    }
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/v1/partner-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName: values.restaurantName,
          contactName: values.contactName,
          phone: values.phone,
          area: values.area,
          cuisine: values.cuisine || undefined,
          message: values.message || undefined,
          website: trap.current?.value || undefined,
        }),
      });
      if (res.status === 201) {
        // Succès affiché seulement après enregistrement confirmé par le serveur.
        setState({ kind: 'sent' });
        setValues(EMPTY);
        return;
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      setState({ kind: 'error', message: messageFor(res.status, body) });
    } catch {
      setState({ kind: 'error', message: 'Connexion impossible. Vérifiez votre réseau puis réessayez.' });
    }
  }

  if (state.kind === 'sent') {
    return (
      <div ref={confirmation} tabIndex={-1} role="status" className="rounded-3xl bg-paper p-6 shadow-[0_1px_0_var(--line)] outline-none sm:p-8">
        <div className="speed-lines w-16 text-[10px]" aria-hidden>
          <span />
          <span className="w-3/4" />
          <span className="w-1/2" />
        </div>
        <h3 className="mt-5 text-3xl font-extrabold">Demande bien reçue.</h3>
        <p className="mt-3 text-ink-2">
          Elle est enregistrée. L’équipe Riiberaka vous rappelle au numéro indiqué pour parler de votre restaurant et des pièces à
          préparer.
        </p>
        <button type="button" onClick={() => setState({ kind: 'idle' })} className="mt-6 font-bold text-brand underline-offset-4 hover:underline">
          Envoyer une autre demande
        </button>
      </div>
    );
  }

  const field = 'mt-1.5 block w-full rounded-2xl border bg-paper px-4 py-3 text-base text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none';
  const label = 'block text-sm font-bold text-ink';
  const err = (k: keyof PartnerFormValues) =>
    errors[k] ? (
      <span id={`partner-${k}-error`} className="mt-1 block text-sm font-semibold text-danger">
        {errors[k]}
      </span>
    ) : null;
  const aria = (k: keyof PartnerFormValues) => ({
    id: `partner-${k}`,
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `partner-${k}-error` : undefined,
    className: `${field} ${errors[k] ? 'border-danger' : 'border-line'}`,
  });

  return (
    <form onSubmit={submit} noValidate className="relative rounded-3xl bg-paper p-6 shadow-[0_1px_0_var(--line)] sm:p-8" aria-labelledby="partner-form-title">
      <h3 id="partner-form-title" className="text-2xl font-extrabold">
        Proposer mon restaurant
      </h3>
      <p className="mt-1 text-sm text-muted">Deux minutes, sans engagement. Les champs marqués * sont obligatoires.</p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>
          Nom du restaurant *
          <input {...aria('restaurantName')} autoComplete="organization" maxLength={120} value={values.restaurantName} onChange={set('restaurantName')} />
          {err('restaurantName')}
        </label>
        <label className={label}>
          Nom du responsable *
          <input {...aria('contactName')} autoComplete="name" maxLength={80} value={values.contactName} onChange={set('contactName')} />
          {err('contactName')}
        </label>
        <label className={label}>
          Téléphone *
          <input
            {...aria('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="90 12 34 56"
            maxLength={20}
            value={values.phone}
            onChange={set('phone')}
          />
          {err('phone')}
        </label>
        <label className={label}>
          Ville ou quartier *
          <input {...aria('area')} placeholder="Lomé, Bè" maxLength={120} value={values.area} onChange={set('area')} />
          {err('area')}
        </label>
        <label className={label}>
          Type de cuisine
          <input {...aria('cuisine')} placeholder="Grillades, cuisine togolaise…" maxLength={80} value={values.cuisine} onChange={set('cuisine')} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Message <span className="font-normal text-muted">(facultatif)</span>
          <textarea {...aria('message')} rows={3} maxLength={1000} value={values.message} onChange={set('message')} />
          {err('message')}
        </label>
      </div>

      {/* Champ piège : invisible pour les visiteurs, rempli par les robots. */}
      <div className="trap" aria-hidden>
        <label>
          Site web
          <input ref={trap} type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.kind === 'error' && (
        <div role="alert" className="mt-5 rounded-2xl bg-chili-soft px-4 py-3 text-sm font-semibold text-danger">
          {state.message}
          <div className="mt-1 font-normal text-ink-2">{fallbackContact}</div>
        </div>
      )}

      <button
        type="submit"
        disabled={state.kind === 'sending'}
        className="mt-6 inline-flex h-13 w-full items-center justify-center rounded-full bg-brand px-6 text-base font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-wait disabled:opacity-70 sm:w-auto"
      >
        {state.kind === 'sending' ? 'Envoi en cours…' : 'Envoyer ma demande'}
      </button>
      <p className="mt-4 text-xs text-muted">
        Vos informations servent uniquement à vous recontacter au sujet de votre restaurant.{' '}
        <a href="/confidentialite" className="underline underline-offset-2">
          Confidentialité
        </a>
      </p>
    </form>
  );
}
