'use client';

import { useEffect, useId, useRef, useState } from 'react';

/** Largeur réelle du conteneur : le graphique est dessiné en pixels (textes lisibles sur téléphone). */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface BarDatum {
  key: string;
  /** Libellé d'axe (court). */
  label: string;
  value: number;
}

/**
 * Barres verticales, une seule série (le titre de la carte la nomme : pas de
 * légende). Barres fines à extrémité arrondie, grille discrète, info-bulle au
 * survol ou au focus clavier, tableau de données pour les lecteurs d'écran.
 */
export function BarChart({
  data,
  format,
  title,
  height = 180,
}: {
  data: BarDatum[];
  format: (v: number) => string;
  title: string;
  height?: number;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const [box, width] = useWidth<HTMLElement>(640);
  const pad = { l: 40, r: 6, t: 10, b: 26 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const step = plotW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(28, step - 2));
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  // Un libellé d'axe sur n, pour éviter les chevauchements.
  const every = Math.ceil(data.length / Math.max(2, Math.floor(plotW / 56)));
  const active = hover === null ? null : data[hover];

  return (
    <figure ref={box} className="relative min-w-0">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full" role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--muted)" className="num">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * step + (step - barW) / 2;
          const h = Math.max(0, pad.t + plotH - y(d.value));
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.key}>
              {h > 0 && (
                <path
                  d={roundedTop(x, pad.t + plotH - h, barW, h, r)}
                  fill="var(--brand)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % every === 0 && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize={12} fill="var(--muted)">
                  {d.label}
                </text>
              )}
              {/* Zone de survol plus large que la barre. */}
              <rect
                x={pad.l + i * step}
                y={pad.t}
                width={step}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.label} : ${format(d.value)}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
        <line x1={pad.l} x2={width - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} stroke="var(--line-strong)" />
      </svg>
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${((pad.l + hover * step + step / 2) / width) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <p className="text-muted">{active.label}</p>
          <p className="num font-bold text-ink">{format(active.value)}</p>
        </div>
      )}
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none">Voir les données</summary>
        <div className="mt-2 max-h-48 overflow-auto">
          <table className="w-full">
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-b border-line last:border-0">
                  <td className="py-1">{d.label}</td>
                  <td className="num py-1 text-right text-ink">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function niceTicks(max: number): number[] {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const stepInt = Math.max(1, step);
  const n = Math.ceil(max / stepInt);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * stepInt));
}

function compact(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k`;
  return String(v);
}

/** Barre horizontale de proportion (répartition par statut). */
export function ShareBar({ parts }: { parts: Array<{ key: string; label: string; value: number; color: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
            <span className="text-ink-2">{p.label}</span>
            <span className="num ml-auto font-bold">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
