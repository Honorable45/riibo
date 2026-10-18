'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, cx } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Masquée sur les cartes mobiles (information secondaire). */
  hideOnMobile?: boolean;
  className?: string;
}

/**
 * Tableau sur tablette et ordinateur ; cartes empilées sur téléphone (aucun
 * défilement horizontal de la page). Une ligne cliquable mène à sa fiche.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  href,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  href?: (row: T) => string;
  caption: string;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(
                    'px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase',
                    c.align === 'right' && 'text-right',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="group border-b border-line last:border-0 hover:bg-surface-2">
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cx('px-4 py-3 align-middle', c.align === 'right' && 'num text-right', c.className)}
                  >
                    {href && i === 0 ? (
                      <Link href={href(row)} className="font-semibold text-ink hover:text-brand">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const [first, ...rest] = columns;
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 font-semibold text-ink">{first.cell(row)}</div>
              </div>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {rest
                  .filter((c) => !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-muted">{c.header}</dt>
                      <dd className="min-w-0 text-right break-words">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </>
          );
          return (
            <li key={row.id}>
              {href ? (
                <Link href={href(row)} className="block px-4 py-3 hover:bg-surface-2">
                  {body}
                </Link>
              ) : (
                <div className="px-4 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center border-t border-line p-3">
      <Button onClick={onClick} busy={loading}>
        Afficher plus
      </Button>
    </div>
  );
}
