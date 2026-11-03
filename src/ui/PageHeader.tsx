import type { ReactNode } from 'react';
import { cn } from './cn';

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, icon, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        {icon}
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{eyebrow}</div>}
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-fg sm:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
