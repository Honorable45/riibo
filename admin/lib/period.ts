/** Périodes en jours civils de Lomé (UTC+0 toute l'année). Fin exclue. */

export type PeriodPreset = 'today' | '7d' | '30d' | 'custom';

export interface Period {
  preset: PeriodPreset;
  from: string; // AAAA-MM-JJ
  to: string; // AAAA-MM-JJ, inclus pour l'affichage
}

const DAY = 86_400_000;

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function presetPeriod(preset: Exclude<PeriodPreset, 'custom'>, now = new Date()): Period {
  const today = dayKey(now);
  const days = preset === 'today' ? 1 : preset === '7d' ? 7 : 30;
  const from = dayKey(new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * DAY));
  return { preset, from, to: today };
}

/** Bornes ISO envoyées au backend : [from 00:00, lendemain de to 00:00[. */
export function toRange(p: Period): { from: string; to: string } {
  const start = `${p.from}T00:00:00.000Z`;
  const end = new Date(Date.parse(`${p.to}T00:00:00Z`) + DAY).toISOString();
  return { from: start, to: end };
}

export function isValidPeriod(p: Period): boolean {
  const a = Date.parse(`${p.from}T00:00:00Z`);
  const b = Date.parse(`${p.to}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && a <= b && b - a <= 365 * DAY;
}

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  today: 'Aujourd’hui',
  '7d': '7 jours',
  '30d': '30 jours',
  custom: 'Personnalisée',
};
