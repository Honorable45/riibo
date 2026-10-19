import type { ElementType, ReactNode } from 'react';

/**
 * Enveloppe d'apparition au défilement. L'effet est entièrement en CSS
 * (voir [data-reveal] dans globals.css) : aucun script, aucun contenu masqué
 * si l'animation n'est pas prise en charge.
 */
export function Reveal({
  as: Tag = 'div',
  className,
  children,
}: {
  as?: ElementType;
  /** Conservé pour compatibilité ; l'ordre d'apparition suit le défilement. */
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag data-reveal="" className={className}>
      {children}
    </Tag>
  );
}
