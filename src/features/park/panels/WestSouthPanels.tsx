import { Link } from 'react-router-dom';
import { useSettings } from '@/app/SettingsProvider';
import type { MessageKey } from '@/i18n';
import { FocusPage } from '@/features/focus/FocusPage';
import { GoalsPage } from '@/features/goals/GoalsPage';
import { useGoals } from '@/features/goals/useGoals';
import { HabitsPage } from '@/features/habits/HabitsPage';
import { InsightsPage } from '@/features/insights/InsightsPage';
import { MusicPage } from '@/features/music/MusicPage';
import { useMusic } from '@/features/music/useMusic';
import { SportsPage } from '@/features/sports/SportsPage';
import { useSports } from '@/features/sports/useSports';
import type { FocusSector, GoalsSector, HabitsSector, MusicSector, SportsSector } from '../interiors/westsouth';

function LinkList({ items, empty }: { items: Array<{ id: string; name: string; to: string }>; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((i) => (
        <li key={i.id}>
          <Link to={i.to} className="flex h-12 items-center rounded-xl bg-surface-2 px-4 text-sm font-medium text-fg ring-1 ring-inset ring-line/60 hover:bg-surface-3">
            <span className="truncate">{i.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Jardim da Concentração (Focus) ---------- */

export function FocusPanel({ id }: { id: FocusSector }) {
  const { t } = useSettings();
  if (id === 'history') return <InsightsPage key={id} initialModule="focus" />;
  if (id === 'distraction')
    // O ROUTIG é um site (PWA): não bloqueia outros apps. Aqui só orienta a configurar o iPad.
    return (
      <div className="flex flex-col gap-3 text-sm text-fg">
        <p className="text-muted">{t('park.focus.distraction.intro')}</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>{t(`park.focus.distraction.step${n}` as MessageKey)}</li>
          ))}
        </ol>
        <p className="text-xs text-subtle">{t('park.focus.distraction.limit')}</p>
      </div>
    );
  return <FocusPage />;
}

/* ---------- Estufa de Hábitos ---------- */

export function HabitsPanel({ id }: { id: HabitsSector }) {
  if (id === 'analysis') return <InsightsPage key={id} initialModule="habits" />;
  return <HabitsPage key={id} initialView={id === 'greenhouse' ? 'week' : id === 'evolution' ? 'year' : 'today'} />;
}

/* ---------- Jardim das Conquistas (Goals) ---------- */

export function GoalsPanel({ id }: { id: GoalsSector }) {
  const { t } = useSettings();
  const data = useGoals();
  if (id === 'analysis') return <InsightsPage key={id} initialModule="goals" />;
  if (id === 'achieved')
    return (
      <LinkList
        items={data.goals.filter((g) => g.status === 'done').map((g) => ({ id: g.id, name: g.name, to: `/goals/${g.id}` }))}
        empty={t('park.goals.noneDone')}
      />
    );
  return <GoalsPage />;
}

/* ---------- Música ---------- */

export function MusicPanel({ id }: { id: MusicSector }) {
  const { t } = useSettings();
  const data = useMusic();
  if (id === 'analysis') return <InsightsPage key={id} initialModule="music" />;
  if (id === 'instruments')
    return <LinkList items={data.instruments.filter((i) => !i.deletedAt).map((i) => ({ id: i.id, name: i.name, to: `/music/${i.id}` }))} empty={t('park.music.none')} />;
  return <MusicPage />;
}

/* ---------- Complexo Esportivo ---------- */

export function SportsPanel({ id }: { id: SportsSector }) {
  const { t } = useSettings();
  const data = useSports();
  if (id === 'analysis') return <InsightsPage key={id} initialModule="sports" />;
  if (id === 'modalities') return <LinkList items={data.sports.map((s) => ({ id: s.id, name: s.name, to: `/sports/${s.id}` }))} empty={t('park.sports.none')} />;
  return <SportsPage />;
}
