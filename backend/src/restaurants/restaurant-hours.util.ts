/**
 * « Ouvert / fermé » est TOUJOURS calculé côté serveur (jamais confié au
 * client, dont l'horloge peut être fausse). Fuseau du restaurant : Africa/Lome
 * (UTC+0, sans changement d'heure).
 */
export const RESTAURANT_TIMEZONE = 'Africa/Lome';

export interface HoursRange {
  /** ISO 8601 : 1 = lundi … 7 = dimanche. */
  dayOfWeek: number;
  opensAt: string; // "HH:mm"
  closesAt: string; // "HH:mm"
}

export interface ClosureRange {
  startsAt: Date;
  endsAt: Date;
}

export type ClosedReason = 'PAUSED' | 'CLOSURE' | 'NO_HOURS' | 'OUTSIDE_HOURS';

export interface OpenStatus {
  isOpen: boolean;
  /** Renseigné quand isOpen est faux. */
  reason: ClosedReason | null;
  /** Heure de fermeture de la plage en cours ("22:00"), quand ouvert. */
  closesAt: string | null;
}

export const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Jour ISO et minutes écoulées depuis minuit, dans le fuseau du restaurant. */
export function localClock(now: Date, timeZone = RESTAURANT_TIMEZONE): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    day: WEEKDAY_TO_ISO[value('weekday')] ?? 1,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

/**
 * Une plage dont la fermeture est ≤ à l'ouverture passe minuit (18:00 → 02:00) ;
 * 00:00 → 00:00 signifie « toute la journée ».
 */
export function computeOpenStatus(
  input: { isPaused: boolean; hours: HoursRange[]; closures: ClosureRange[] },
  now: Date = new Date(),
): OpenStatus {
  if (input.isPaused) return { isOpen: false, reason: 'PAUSED', closesAt: null };

  if (input.closures.some((closure) => closure.startsAt <= now && now < closure.endsAt)) {
    return { isOpen: false, reason: 'CLOSURE', closesAt: null };
  }

  if (input.hours.length === 0) return { isOpen: false, reason: 'NO_HOURS', closesAt: null };

  const { day, minutes } = localClock(now);
  const yesterday = day === 1 ? 7 : day - 1;

  for (const range of input.hours) {
    const open = toMinutes(range.opensAt);
    const close = toMinutes(range.closesAt);

    if (open === close) {
      if (range.dayOfWeek === day) return { isOpen: true, reason: null, closesAt: null };
      continue;
    }
    if (close > open) {
      if (range.dayOfWeek === day && minutes >= open && minutes < close) {
        return { isOpen: true, reason: null, closesAt: range.closesAt };
      }
      continue;
    }
    // Passe minuit : la fin de plage tombe le lendemain.
    if (range.dayOfWeek === day && minutes >= open) {
      return { isOpen: true, reason: null, closesAt: range.closesAt };
    }
    if (range.dayOfWeek === yesterday && minutes < close) {
      return { isOpen: true, reason: null, closesAt: range.closesAt };
    }
  }

  return { isOpen: false, reason: 'OUTSIDE_HOURS', closesAt: null };
}

/** Deux plages d'une même journée se chevauchent-elles ? (plages passant minuit ignorées ici) */
export function hasOverlap(ranges: Array<{ opensAt: string; closesAt: string }>): boolean {
  const spans = ranges
    .map((range) => ({ open: toMinutes(range.opensAt), close: toMinutes(range.closesAt) }))
    .sort((a, b) => a.open - b.open);
  for (let i = 1; i < spans.length; i += 1) {
    const previous = spans[i - 1];
    const current = spans[i];
    const previousEnd = previous.close <= previous.open ? 24 * 60 : previous.close;
    if (current.open < previousEnd) return true;
  }
  return false;
}
