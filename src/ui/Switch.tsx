import { useId, type ReactNode } from 'react';
import { cn } from './cn';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: ReactNode;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, hint, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[0.9375rem] font-medium text-fg">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-sm leading-relaxed text-muted">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition duration-200',
          checked ? 'bg-brand shadow-glow' : 'bg-surface-3 ring-1 ring-inset ring-line',
          'disabled:opacity-50',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}
