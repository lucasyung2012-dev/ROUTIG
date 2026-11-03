import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/** Grupo de opções exclusivas (radiogroup), navegável pelas setas do teclado. */
export function Segmented<T extends string>({ value, options, onChange, label, className }: SegmentedProps<T>) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line', className)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const next = options[(index + delta + options.length) % options.length];
        if (next) onChange(next.value);
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition duration-150',
              selected ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
