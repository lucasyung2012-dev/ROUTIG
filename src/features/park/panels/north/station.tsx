import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Monitor } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { cn } from '@/ui/cn';

/**
 * Peças comuns das estações do Campus Norte (Library, Notes, Academy, Idiomas, Insights): a estação
 * tem a cor do prédio e o vidro escuro do elevador, mas lê e grava só pelos repositórios do módulo.
 */

/** Cores dos prédios (as mesmas dos interiores em `interiors/north.ts`). */
export const NORTH_COLORS = {
  library: '#34D399',
  notes: '#8B7CF6',
  academy: '#A5B4FC',
  languages: '#14B8A6',
  insights: '#FDA4AF',
} as const;
export type NorthBuilding = keyof typeof NORTH_COLORS;

/**
 * Estado que sobrevive ao sair e voltar à estação (enquanto o app está aberto), sem gravar nada no banco:
 * a nota aberta na mesa, o idioma escolhido, o período do Observatório…
 */
const memory = new Map<string, unknown>();
export function useStationState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial));
  useEffect(() => {
    memory.set(key, value);
  }, [key, value]);
  return [value, setValue];
}

/** Moldura da estação: faixa na cor do prédio e conteúdo em vidro. */
export function Station({ building, label, children, className }: { building: NorthBuilding; label: string; children: ReactNode; className?: string }) {
  const color = NORTH_COLORS[building];
  return (
    <div className={cn('flex flex-col gap-3', className)} data-station={building}>
      <div className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-fg ring-1 ring-inset ring-line/60" style={{ background: `linear-gradient(90deg, ${color}33, transparent 75%)` }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      {children}
    </div>
  );
}

/** Bloco de vidro dentro da estação. */
export function Pane({ title, children, className, action }: { title?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-2 rounded-2xl bg-surface-2/70 p-3 ring-1 ring-inset ring-line/60 backdrop-blur', className)}>
      {(title || action) && (
        <div className="flex items-center gap-2">
          {title && <h3 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Indicador grande (só com números calculados dos registros). */
export function Stat({ value, label, sub }: { value: ReactNode; label: string; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-surface/60 px-3 py-2 ring-1 ring-inset ring-line/50">
      <span className="text-xl font-semibold tabular-nums text-fg">{value}</span>
      <span className="text-xs text-muted">{label}</span>
      {sub}
    </div>
  );
}

/** Texto honesto para quando não há nada. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** O link discreto para a edição completa no Control Room. */
export function ControlRoomLink({ to }: { to: string }) {
  const { t } = useSettings();
  return (
    <Link to={to} className="inline-flex w-fit items-center gap-1.5 self-end rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg">
      <Monitor className="h-3.5 w-3.5" aria-hidden />
      {t('park.openModule')}
    </Link>
  );
}

