import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

const control =
  'w-full rounded-xl bg-surface-2 px-3.5 text-[0.9375rem] text-fg ring-1 ring-inset ring-line placeholder:text-subtle ' +
  'transition focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/60 disabled:opacity-50';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  optionalLabel?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** Rótulo, ajuda e erro ligados ao controle por id (acessível). */
export function Field({ label, hint, error, optionalLabel, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {optionalLabel && <span className="ml-1.5 font-normal text-subtle">({optionalLabel})</span>}
      </label>
      {children(id, describedBy)}
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, 'h-11', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'resize-y py-2.5 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, 'h-11 appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
    </div>
  );
});
