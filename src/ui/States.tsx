import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from './cn';

/** Estado vazio: diz o que vai aparecer aqui e como começar. */
export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      {icon && <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">{icon}</div>}
      <h3 className="text-balance text-base font-semibold text-fg">{title}</h3>
      {body && <p className="max-w-sm text-sm leading-relaxed text-muted">{body}</p>}
      {action}
    </div>
  );
}

/** Estado de erro: o que aconteceu e como resolver. */
export function ErrorState({ title, body, action, className }: { title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <TriangleAlert className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-balance text-base font-semibold text-fg">{title}</h3>
      {body && <p className="max-w-sm text-sm leading-relaxed text-muted">{body}</p>}
      {action}
    </div>
  );
}

/** Estado de carregamento com esqueleto do conteúdo, para a tela não "pular". */
export function LoadingState({ label, lines = 3, className }: { label: string; lines?: number; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn('flex flex-col gap-3 p-2', className)}>
      <div className="skeleton h-5 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${88 - i * 14}%` }} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
