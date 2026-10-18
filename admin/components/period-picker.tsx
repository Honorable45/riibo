'use client';

import { useState } from 'react';
import { isValidPeriod, presetPeriod, PRESET_LABEL, type Period, type PeriodPreset } from '@/lib/period';
import { Button, cx, Input } from './ui';

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [draft, setDraft] = useState({ from: value.from, to: value.to });
  const presets: PeriodPreset[] = ['today', '7d', '30d', 'custom'];
  const custom = { preset: 'custom' as const, ...draft };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Période" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line-strong bg-surface p-0.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value.preset === p}
            onClick={() => (p === 'custom' ? onChange({ ...value, preset: 'custom' }) : onChange(presetPeriod(p)))}
            className={cx(
              'rounded-md px-3 py-1.5 text-sm font-semibold whitespace-nowrap',
              value.preset === p ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface-2',
            )}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (isValidPeriod(custom)) onChange(custom);
          }}
        >
          <Input type="date" aria-label="Du" value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="w-auto" />
          <span className="text-sm text-muted">au</span>
          <Input type="date" aria-label="Au" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="w-auto" />
          <Button type="submit" disabled={!isValidPeriod(custom)}>
            Appliquer
          </Button>
          {!isValidPeriod(custom) && <span className="text-xs text-danger">Période invalide (365 jours maximum).</span>}
        </form>
      )}
    </div>
  );
}
