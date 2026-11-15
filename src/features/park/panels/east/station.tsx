import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';

/** A cor de cada prédio do leste (a mesma das placas e da luz dos interiores, em interiors/east.ts). */
export const EAST_COLORS = { calendar: '#93C5FD', tasks: '#22D3EE', projects: '#F97316', finance: '#D4B572' } as const;
export type EastBuilding = keyof typeof EAST_COLORS;

/**
 * Memória da visita: o que ficou numa estação (o rascunho, o dia ou o projeto escolhido) volta igual
 * ao sair e voltar, enquanto o app estiver aberto. Não é um banco: os dados de verdade estão nos repos.
 */
const memory = new Map<string, unknown>();

export function clearStationMemory(): void {
  memory.clear();
}

export function useStationMemory<T>(key: string, initial: () => T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial()));
  const set = (next: T | ((prev: T) => T)) =>
    setValue((prev) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      memory.set(key, v);
      return v;
    });
  return [value, set];
}

/**
 * Moldura de uma estação do prédio: a placa escura com a luz na cor do prédio (como o painel do
 * elevador), a atividade da estação e, no fim, o atalho discreto para o Control Room.
 */
export function Station({ building, plate, to, children }: { building: EastBuilding; plate: string; to: string; children: ReactNode }) {
  const { t } = useSettings();
  const color = EAST_COLORS[building];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 rounded-xl bg-[#1C2230] px-3 py-2 text-white ring-1 ring-white/15">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-white/85">{plate}</span>
        <span className="h-px w-10 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      </div>
      {children}
      <Link to={to} className="mt-1 inline-flex items-center gap-1.5 self-start rounded-lg px-1 py-1 text-xs font-medium text-muted hover:text-fg">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        {t('park.openModule')}
      </Link>
    </div>
  );
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <h3 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-subtle">{children}</h3>
      {extra}
    </div>
  );
}

/** Estado vazio honesto: uma frase, nunca algo que pareça dado. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export const rowClass = 'rounded-xl bg-surface-2 p-2.5 ring-1 ring-inset ring-line/60';

/** Número real com a legenda embaixo (contagens tiradas dos registros, nunca estimativas). */
export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: 'danger' | 'accent' }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-inset ring-line/60">
      <span className={cn('text-lg font-semibold tabular-nums text-fg', tone === 'danger' && 'text-danger', tone === 'accent' && 'text-accent')}>{value}</span>
      <span className="truncate text-xs text-muted">{label}</span>
    </div>
  );
}

/** Anterior · título · próximo (e "hoje"), para dia, semana, mês e ano. */
export function PeriodNav({ title, onPrev, onNext, onToday, todayLabel }: { title: string; onPrev: () => void; onNext: () => void; onToday?: () => void; todayLabel?: string }) {
  const { t } = useSettings();
  return (
    <div className="flex items-center gap-1">
      <IconButton size="sm" label={t('calendar.prev')} icon={<ChevronLeft className="h-4 w-4" />} onClick={onPrev} />
      <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-fg">{title}</span>
      <IconButton size="sm" label={t('calendar.next')} icon={<ChevronRight className="h-4 w-4" />} onClick={onNext} />
      {onToday && (
        <button type="button" onClick={onToday} className="ml-1 h-9 rounded-lg px-2.5 text-xs font-medium text-muted ring-1 ring-inset ring-line hover:text-fg">
          {todayLabel ?? t('calendar.today')}
        </button>
      )}
    </div>
  );
}

/** Abas pequenas da estação (filtros reais da mesma lista). */
export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string; color?: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1" role="group" aria-label={label}>
      <div className="inline-flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn('inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium ring-1 ring-inset transition', value === o.value ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line hover:text-fg')}
          >
            {o.color && <span className="h-2 w-2 rounded-full" style={{ background: o.color }} aria-hidden />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
