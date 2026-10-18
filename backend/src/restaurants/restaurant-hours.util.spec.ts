import { computeOpenStatus, hasOverlap, HoursRange, localClock } from './restaurant-hours.util';

// 2026-09-21 est un lundi (fuseau Africa/Lome = UTC+0).
const monday = (time: string) => new Date(`2026-09-21T${time}:00Z`);
const tuesday = (time: string) => new Date(`2026-09-22T${time}:00Z`);
const base = { isPaused: false, closures: [] };
const everyDay = (opensAt: string, closesAt: string): HoursRange[] =>
  [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, opensAt, closesAt }));

describe('localClock', () => {
  it('donne le jour ISO et les minutes dans le fuseau du restaurant', () => {
    expect(localClock(monday('13:30'))).toEqual({ day: 1, minutes: 13 * 60 + 30 });
    expect(localClock(new Date('2026-09-27T23:59:00Z'))).toEqual({ day: 7, minutes: 23 * 60 + 59 });
  });
});

describe('computeOpenStatus', () => {
  it('ouvert pendant la plage, avec son heure de fermeture', () => {
    const status = computeOpenStatus({ ...base, hours: everyDay('08:00', '22:00') }, monday('12:00'));
    expect(status).toEqual({ isOpen: true, reason: null, closesAt: '22:00' });
  });

  it("fermé avant l'ouverture et à l'heure pile de fermeture", () => {
    const hours = everyDay('08:00', '22:00');
    expect(computeOpenStatus({ ...base, hours }, monday('07:59')).reason).toBe('OUTSIDE_HOURS');
    expect(computeOpenStatus({ ...base, hours }, monday('22:00')).isOpen).toBe(false);
    expect(computeOpenStatus({ ...base, hours }, monday('08:00')).isOpen).toBe(true);
  });

  it('fermé un jour sans plage (dimanche fermé)', () => {
    const hours = everyDay('08:00', '22:00').filter((range) => range.dayOfWeek !== 7);
    const sunday = new Date('2026-09-27T12:00:00Z');
    expect(computeOpenStatus({ ...base, hours }, sunday).isOpen).toBe(false);
  });

  it('service coupé midi / soir', () => {
    const hours: HoursRange[] = [
      { dayOfWeek: 1, opensAt: '11:00', closesAt: '14:00' },
      { dayOfWeek: 1, opensAt: '18:00', closesAt: '23:00' },
    ];
    expect(computeOpenStatus({ ...base, hours }, monday('12:00')).isOpen).toBe(true);
    expect(computeOpenStatus({ ...base, hours }, monday('16:00')).isOpen).toBe(false);
    expect(computeOpenStatus({ ...base, hours }, monday('19:00')).isOpen).toBe(true);
  });

  it('plage passant minuit : ouvert le soir ET le lendemain matin', () => {
    const hours: HoursRange[] = [{ dayOfWeek: 1, opensAt: '18:00', closesAt: '02:00' }];
    expect(computeOpenStatus({ ...base, hours }, monday('23:00')).isOpen).toBe(true);
    expect(computeOpenStatus({ ...base, hours }, tuesday('01:00'))).toEqual({
      isOpen: true,
      reason: null,
      closesAt: '02:00',
    });
    expect(computeOpenStatus({ ...base, hours }, tuesday('02:00')).isOpen).toBe(false);
    expect(computeOpenStatus({ ...base, hours }, monday('12:00')).isOpen).toBe(false);
  });

  it('00:00 → 00:00 = toute la journée', () => {
    const hours: HoursRange[] = [{ dayOfWeek: 1, opensAt: '00:00', closesAt: '00:00' }];
    expect(computeOpenStatus({ ...base, hours }, monday('03:00')).isOpen).toBe(true);
  });

  it('la pause manuelle prime sur les horaires', () => {
    const status = computeOpenStatus(
      { isPaused: true, closures: [], hours: everyDay('00:00', '00:00') },
      monday('12:00'),
    );
    expect(status).toEqual({ isOpen: false, reason: 'PAUSED', closesAt: null });
  });

  it('une fermeture exceptionnelle prime sur les horaires, puis se termine', () => {
    const closures = [{ startsAt: monday('10:00'), endsAt: monday('15:00') }];
    const hours = everyDay('08:00', '22:00');
    expect(computeOpenStatus({ isPaused: false, closures, hours }, monday('12:00')).reason).toBe('CLOSURE');
    expect(computeOpenStatus({ isPaused: false, closures, hours }, monday('15:00')).isOpen).toBe(true);
  });

  it('sans horaires définis : fermé (NO_HOURS), jamais ouvert par défaut', () => {
    expect(computeOpenStatus({ ...base, hours: [] }, monday('12:00')).reason).toBe('NO_HOURS');
  });
});

describe('hasOverlap', () => {
  it('détecte deux plages qui se chevauchent', () => {
    expect(hasOverlap([{ opensAt: '08:00', closesAt: '12:00' }, { opensAt: '11:00', closesAt: '15:00' }])).toBe(true);
  });
  it('accepte des plages jointives ou séparées', () => {
    expect(hasOverlap([{ opensAt: '08:00', closesAt: '12:00' }, { opensAt: '12:00', closesAt: '15:00' }])).toBe(false);
    expect(hasOverlap([{ opensAt: '18:00', closesAt: '23:00' }, { opensAt: '08:00', closesAt: '12:00' }])).toBe(false);
  });
});
