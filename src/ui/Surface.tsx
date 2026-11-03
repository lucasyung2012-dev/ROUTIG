import type { HTMLAttributes } from 'react';
import { cn } from './cn';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** "raised" destaca um objeto; "flat" agrupa conteúdo sem competir com ele. */
  tone?: 'raised' | 'flat' | 'inset';
  padded?: boolean;
}

export function Surface({ tone = 'raised', padded = true, className, ...rest }: SurfaceProps) {
  return (
    <div
      className={cn(
        'rounded-2xl',
        tone === 'raised' && 'bg-surface shadow-soft ring-1 ring-line/70',
        tone === 'flat' && 'bg-surface-2/60 ring-1 ring-line/60',
        tone === 'inset' && 'bg-surface-2',
        padded && 'p-5 sm:p-6',
        className,
      )}
      {...rest}
    />
  );
}
