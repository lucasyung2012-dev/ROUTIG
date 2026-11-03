import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-white shadow-glow hover:brightness-110 active:brightness-95 disabled:shadow-none',
  secondary: 'bg-surface-2 text-fg ring-1 ring-inset ring-line hover:bg-surface-3',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger/10 text-danger ring-1 ring-inset ring-danger/25 hover:bg-danger/15',
};

// Alturas mínimas de 40–48px: confortáveis para toque no iPad e no iPhone.
const sizes: Record<Size, string> = {
  sm: 'h-9 gap-1.5 px-3 text-sm rounded-lg',
  md: 'h-11 gap-2 px-4 text-[0.9375rem] rounded-xl',
  lg: 'h-12 gap-2.5 px-6 text-base rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
