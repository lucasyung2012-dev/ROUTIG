import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Obrigatório: é o nome que leitores de tela anunciam. */
  label: string;
  icon: ReactNode;
  size?: 'sm' | 'md';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', active = false, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl transition duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        size === 'md' ? 'h-11 w-11' : 'h-9 w-9',
        active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
