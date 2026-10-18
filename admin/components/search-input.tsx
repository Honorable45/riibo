'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDebounced } from '@/lib/hooks';

/** Champ de recherche : met à jour le filtre après une courte pause de frappe. */
export function SearchInput({ value, onChange, placeholder, label }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  const [text, setText] = useState(value);
  const debounced = useDebounced(text);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule la saisie déclenche
  }, [debounced]);
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-8 pl-9 text-sm placeholder:text-muted focus:border-brand focus:outline-none"
      />
      {text && (
        <button type="button" aria-label="Effacer la recherche" onClick={() => setText('')} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted hover:text-ink">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
