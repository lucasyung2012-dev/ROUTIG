import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Monitor } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { todayKey } from '@/domain/dates';
import { rangeFor, type Range } from '@/domain/insights';
import { Segmented } from '@/ui/Segmented';
import { cn } from '@/ui/cn';

/**
 * Peças comuns das estações do setor oeste/sul (Focus, Habits, Goals, Música, Esportes): a placa da
 * estação na cor do edifício, a "tela" de vidro escuro dos mostradores e o link discreto para o
 * Control Room. Os dados vêm sempre dos mesmos repositórios e hooks do Control Room.
 */

/** Cores dos letreiros de cada edifício (buildings/westsouth.ts). */
export const WS_COLORS = { focus: '#5EEAD4', habits: '#E6B450', goals: '#EAB308', music: '#EC4899', sports: '#22C55E' } as const;
export type WsBuilding = keyof typeof WS_COLORS;

const ROUTES: Record<WsBuilding, string> = { focus: '/focus', habits: '/habits', goals: '/goals', music: '/music', sports: '/sports' };

/** A estação: placa com o nome (como a plaquinha de um balcão), o conteúdo e o atalho para o Control Room. */
export function Station({ building, name, hint, to, children }: { building: WsBuilding; name: string; hint?: string; to?: string; children: ReactNode }) {
  const { t } = useSettings();
  const color = WS_COLORS[building];
  return (
    <div className="flex flex-col gap-3" data-station={building}>
      <div className="flex items-center gap-2 rounded-xl bg-[#141A24] px-3 py-2 text-white ring-1 ring-white/10" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-white/85">{name}</span>
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {children}
      <Link to={to ?? ROUTES[building]} className="mt-1 inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg">
        <Monitor className="h-3.5 w-3.5" aria-hidden />
        {t('park.openModule')}
      </Link>
    </div>
  );
}

/** Mostrador de vidro escuro com um brilho na cor do edifício (relógio, números do período). */
export function Screen({ building, className, children }: { building: WsBuilding; className?: string; children: ReactNode }) {
  const color = WS_COLORS[building];
  return (
    <div className={cn('rounded-2xl bg-[#10151E] p-4 text-white ring-1 ring-white/10', className)} style={{ backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${color}2E, transparent 62%)` }}>
      {children}
    </div>
  );
}

/** Um número do mostrador com a legenda embaixo. */
export function Readout({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0 text-center">
      <div className="truncate text-xl font-semibold tabular-nums text-white">{value}</div>
      <div className="text-[0.6875rem] leading-tight text-white/60">{label}</div>
    </div>
  );
}

/** Barra de progresso na cor do edifício. `percent` vem sempre de um cálculo real do módulo. */
export function Meter({ percent, building, className, dark = false }: { percent: number; building: WsBuilding; className?: string; dark?: boolean }) {
  const style: CSSProperties = { width: `${Math.max(0, Math.min(100, percent))}%`, background: WS_COLORS[building] };
  return (
    <span className={cn('block h-2 overflow-hidden rounded-full', dark ? 'bg-white/15' : 'bg-surface-3', className)} aria-hidden>
      <span className="block h-full rounded-full transition-[width]" style={style} />
    </span>
  );
}

/** Título de seção dentro da estação. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide text-subtle">{children}</h3>;
}

/** Linha de lista no estilo das estações (mesmo visual do InboxPanel). */
export function Row({ children, className, color }: { children: ReactNode; className?: string; color?: string }) {
  return (
    <li className={cn('flex items-center gap-3 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60', className)}>
      {color && <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </li>
  );
}

export type Period = 'week' | 'month';

/** Semana ou mês corrente (as mesmas contas de período do Insights). */
export function usePeriodRange(period: Period): Range {
  const { settings } = useSettings();
  return rangeFor(period, todayKey(), settings.weekStartsOn);
}

export function PeriodSwitch({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useSettings();
  return (
    <Segmented<Period>
      label={t('park.native.westsouth.period.label')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'week', label: t('park.native.westsouth.period.week') },
        { value: 'month', label: t('park.native.westsouth.period.month') },
      ]}
    />
  );
}
