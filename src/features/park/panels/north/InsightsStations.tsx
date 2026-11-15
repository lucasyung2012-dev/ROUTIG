import { type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { hasFinancePin } from '@/data/financePlanRepo';
import { loadPrivacy } from '@/data/privacyRepo';
import { addDays, capitalizeFirst, formatDateKey, todayKey, type DateKey } from '@/domain/dates';
import { FOCUS_KINDS } from '@/domain/focus';
import {
  academyInsights,
  financeInsights,
  focusInsights,
  goalsInsights,
  habitsInsights,
  languagesInsights,
  musicInsights,
  previousRange,
  projectsInsights,
  rangeFor,
  series,
  sportsInsights,
  tasksInsights,
  type Range,
} from '@/domain/insights';
import { FinanceLock, isFinanceUnlocked } from '@/features/finance/FinanceLock';
import { HideButton, useHideToggle } from '@/features/finance/FinancePage';
import { Money } from '@/features/finance/financeUi';
import { HideContext } from '@/features/finance/useFinance';
import { useInsightsData, type InsightsRaw } from '@/features/insights/useInsightsData';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { LoadingState } from '@/ui/States';
import { cn } from '@/ui/cn';
import { ControlRoomLink, Empty, Pane, Station, Stat, useStationState } from './station';

/**
 * Estações do Observatório de Insights: os mesmos cálculos do Insights (domain/insights), só com o que foi
 * registrado. Respeita a privacidade (módulos fora do Insights) e o PIN de Finanças.
 */
export type InsightsStationId = 'overview' | 'productivity' | 'learning' | 'habits' | 'goals' | 'activities' | 'finance';

const MODS = ['focus', 'habits', 'tasks', 'academy', 'languages', 'music', 'sports', 'projects', 'goals', 'finance'] as const;
type Mod = (typeof MODS)[number];

/** Que módulos cada estação lê. */
const STATION_MODS: Record<InsightsStationId, readonly Mod[]> = {
  overview: MODS,
  productivity: ['tasks', 'focus', 'projects'],
  learning: ['academy', 'languages'],
  habits: ['habits'],
  goals: ['goals'],
  activities: ['music', 'sports'],
  finance: ['finance'],
};

const MOD_PATH: Record<Mod, string> = { focus: '/focus', habits: '/habits', tasks: '/tasks', academy: '/academy', languages: '/languages', music: '/music', sports: '/sports', projects: '/projects', goals: '/goals', finance: '/finance' };

type Kind = 'week' | 'month' | 'year';

/** O mesmo conjunto de cálculos da tela do Insights, para um período. */
function compute(raw: InsightsRaw, r: Range, today: DateKey, weekStartsOn: 0 | 1) {
  return {
    focus: focusInsights(raw.focus, r),
    habits: habitsInsights(raw.habits, raw.habitLogs, r, today, weekStartsOn),
    tasks: tasksInsights(raw.tasks, r),
    academy: academyInsights(raw.subjects, raw.years, raw.assessments, raw.contents, raw.studySessions, r),
    languages: languagesInsights(raw.languages, raw.languageSessions, raw.vocab, raw.grammar, raw.cardReviews, r),
    music: musicInsights(raw.instruments, raw.practice, raw.songs, raw.songChanges, r),
    sports: sportsInsights(raw.sports, raw.sportActivities, r),
    projects: projectsInsights(raw.projects, r),
    goals: goalsInsights(raw.goals, raw.goalCheckins, r),
    finance: financeInsights(raw.finAssets, raw.finTransactions, raw.finQuotes, r),
  };
}
type Computed = ReturnType<typeof compute>;

export function InsightsStation({ id }: { id: InsightsStationId }) {
  const { t, settings } = useSettings();
  const raw = useInsightsData();
  const privacy = useLiveQuery(() => loadPrivacy(), []);
  const financePin = useLiveQuery(() => hasFinancePin(), []);
  const today = todayKey();
  const [kind, setKind] = useStationState<Kind>('insights.kind', 'week');
  const [anchor, setAnchor] = useStationState<DateKey>('insights.anchor', today);
  const label = t(`park.insights.sectors.${id}`);
  if (!raw || !privacy || financePin === undefined) return <LoadingState label={t('common.loading')} lines={4} />;

  const range = rangeFor(kind, anchor, settings.weekStartsOn);
  const now = compute(raw, range, today, settings.weekStartsOn);
  const before = compute(raw, previousRange(range), today, settings.weekStartsOn);
  const shift = (n: number) => {
    if (kind === 'week') setAnchor(addDays(anchor, 7 * n));
    else if (kind === 'month') setAnchor(rangeFor('month', n > 0 ? addDays(range.to, 1) : addDays(range.from, -1), 0).from);
    else setAnchor(`${Number(anchor.slice(0, 4)) + n}-06-15`);
  };
  const periodLabel =
    kind === 'week'
      ? `${formatDateKey(range.from, settings.locale)} – ${formatDateKey(range.to, settings.locale)}`
      : kind === 'month'
        ? capitalizeFirst(new Intl.DateTimeFormat(settings.locale, { month: 'long', year: 'numeric' }).format(new Date(`${range.from}T12:00`)))
        : range.from.slice(0, 4);

  // Módulos fora do Insights pela privacidade não aparecem; Finanças trancado pelo PIN fica de fora da visão geral.
  const financeLocked = financePin && !isFinanceUnlocked();
  const wanted = STATION_MODS[id].filter((m) => !privacy.insightsHidden.includes(m));
  const shown = id === 'overview' ? wanted.filter((m) => !(m === 'finance' && financeLocked)) : wanted;

  return (
    <Station building="insights" label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Kind> label={t('insights.period')} value={kind} onChange={(k) => (setKind(k), setAnchor(today))} options={(['week', 'month', 'year'] as const).map((k) => ({ value: k, label: t(`insights.periods.${k}`) }))} />
        <div className="flex items-center gap-1">
          <IconButton size="sm" label={t('habits.prev')} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => shift(-1)} />
          <span className="min-w-32 text-center text-sm font-semibold text-fg">{periodLabel}</span>
          <IconButton size="sm" label={t('habits.next')} icon={<ChevronRight className="h-4 w-4" />} onClick={() => shift(1)} disabled={range.to >= today} />
        </div>
      </div>
      <p className="text-xs text-muted">{t('insights.integrity')}</p>
      {id === 'overview' && financeLocked && !privacy.insightsHidden.includes('finance') && <p className="text-xs text-muted">{t('insights.financeLocked')}</p>}
      <div className="flex flex-col gap-3" data-private="insights">
        {shown.length === 0 ? (
          <Empty>{t('insights.allPrivate')}</Empty>
        ) : id === 'overview' ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shown.map((m) => (
              <ModuleCard key={m} mod={m} now={now} before={before} range={range} compact />
            ))}
          </div>
        ) : (
          shown.map((m) =>
            m === 'finance' ? (
              // O PIN de Finanças guarda os números de dinheiro também aqui.
              <FinanceLock key={m}>
                <FinanceCard now={now} />
              </FinanceLock>
            ) : (
              <ModuleCard key={m} mod={m} now={now} before={before} range={range} />
            ),
          )
        )}
      </div>
      <ControlRoomLink to="/insights" />
    </Station>
  );
}

/* ---------- Peças ---------- */

function Delta({ now, before, unit = '' }: { now: number; before: number; unit?: string }) {
  const { t } = useSettings();
  const d = Math.round((now - before) * 100) / 100;
  return <span className={cn('text-[0.6875rem]', d > 0 ? 'text-success' : d < 0 ? 'text-warning' : 'text-muted')}>{d === 0 ? t('insights.same') : t('insights.delta', { sign: d > 0 ? '+' : '−', n: Math.abs(d), unit })}</span>;
}

function Bars({ points, range }: { points: Array<{ date: DateKey; value: number }>; range: Range }) {
  const { settings, t } = useSettings();
  const s = series(points, range, settings.weekStartsOn);
  const top = Math.max(1, ...s.map((x) => x.value));
  if (s.every((x) => x.value === 0)) return <Empty>{t('insights.noneInPeriod')}</Empty>;
  return (
    <div className="flex h-24 items-end gap-1" role="img" aria-label={s.map((x) => `${formatDateKey(x.start, settings.locale)}: ${x.value}`).join('; ')}>
      {s.map((x) => (
        <div key={x.start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
          <span className="text-[0.5625rem] tabular-nums text-muted">{x.value || ''}</span>
          <span className="w-full rounded-t" style={{ height: `${(x.value / top) * 100}%`, minHeight: x.value ? 3 : 0, background: '#FDA4AF' }} />
        </div>
      ))}
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col divide-y divide-line/60">{children}</ul>;
}
function Row({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <li className="flex items-baseline gap-3 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate text-fg">{label}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      <span className="tabular-nums font-medium text-fg">{value}</span>
    </li>
  );
}

/* ---------- Um módulo: números grandes, gráfico e detalhes ---------- */

function ModuleCard({ mod, now, before, range, compact = false }: { mod: Mod; now: Computed; before: Computed; range: Range; compact?: boolean }) {
  const { t, settings } = useSettings();
  const min = t('insights.unitMin');
  if (mod === 'finance') return <FinanceCard now={now} compact />;
  const has = now[mod].has;
  const stats: Record<Exclude<Mod, 'finance'>, ReactNode> = {
    focus: (
      <>
        <Stat value={now.focus.minutes} label={t('insights.minutesFocus')} sub={<Delta now={now.focus.minutes} before={before.focus.minutes} unit={min} />} />
        <Stat value={now.focus.sessions} label={t('insights.sessions')} sub={<Delta now={now.focus.sessions} before={before.focus.sessions} />} />
      </>
    ),
    habits: <Stat value={now.habits.logs} label={t('insights.habitLogs')} sub={<Delta now={now.habits.logs} before={before.habits.logs} />} />,
    tasks: (
      <>
        <Stat value={now.tasks.completed} label={t('insights.tasksDone')} sub={<Delta now={now.tasks.completed} before={before.tasks.completed} />} />
        <Stat value={now.tasks.created} label={t('insights.tasksCreated')} />
      </>
    ),
    academy: (
      <>
        <Stat value={now.academy.assessments} label={t('insights.gradedAssessments')} />
        <Stat value={now.academy.studyMinutes} label={t('insights.studyMinutes')} sub={<Delta now={now.academy.studyMinutes} before={before.academy.studyMinutes} unit={min} />} />
      </>
    ),
    languages: (
      <>
        <Stat value={now.languages.minutes} label={t('insights.minutesStudy')} sub={<Delta now={now.languages.minutes} before={before.languages.minutes} unit={min} />} />
        <Stat value={now.languages.newWords} label={t('insights.newWords')} />
        <Stat value={now.languages.reviews} label={t('insights.reviews')} />
      </>
    ),
    music: (
      <>
        <Stat value={now.music.minutes} label={t('insights.practiceMinutes')} sub={<Delta now={now.music.minutes} before={before.music.minutes} unit={min} />} />
        <Stat value={now.music.masteredInPeriod} label={t('insights.songsMastered')} />
      </>
    ),
    sports: (
      <>
        <Stat value={now.sports.activities} label={t('insights.activities')} sub={<Delta now={now.sports.activities} before={before.sports.activities} />} />
        <Stat value={now.sports.activeDays} label={t('insights.activeDays')} />
      </>
    ),
    projects: <Stat value={now.projects.milestones.length} label={t('insights.milestonesDone')} sub={<Delta now={now.projects.milestones.length} before={before.projects.milestones.length} />} />,
    goals: (
      <>
        <Stat value={now.goals.done.length} label={t('insights.goalsDone')} />
        <Stat value={now.goals.checkins} label={t('insights.checkins')} />
      </>
    ),
  };
  const points: Partial<Record<Mod, Array<{ date: DateKey; value: number }>>> = {
    focus: now.focus.points,
    habits: now.habits.points,
    tasks: now.tasks.points,
    academy: now.academy.points,
    languages: now.languages.points,
    music: now.music.points,
    sports: now.sports.points,
    projects: now.projects.points,
  };
  const chart = points[mod];
  return (
    <Pane title={t(`modules.${mod}`)}>
      {!has ? (
        <Empty>{t('insights.noData')}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{stats[mod]}</div>
          {!compact && chart && (
            <>
              <h4 className="text-xs font-medium text-muted">{t(`insights.chartTitle.${mod}`)}</h4>
              <Bars points={chart} range={range} />
            </>
          )}
          {!compact && (
            <Rows>
              {mod === 'focus' && FOCUS_KINDS.filter((k) => now.focus.byKind[k] > 0).map((k) => <Row key={k} label={t(`focus.kinds.${k}`)} value={t('focus.min', { min: now.focus.byKind[k] })} />)}
              {mod === 'habits' && now.habits.rows.map((r) => <Row key={r.habit.id} label={r.habit.name} value={r.consistency.total ? t('habits.ratio', { met: r.consistency.met, total: r.consistency.total }) : '—'} sub={t('insights.logsAndTotal', { logs: r.logs, total: r.habit.method === 'check' || r.habit.method === 'scale' ? '—' : r.total })} />)}
              {mod === 'academy' && (
                <>
                  {now.academy.bySubject.map((s) => (
                    <Row key={s.subject.id} label={s.subject.name} value={s.average === null ? '—' : t('insights.avgOf', { avg: s.average.toLocaleString(settings.locale), scale: s.scale })} sub={t('insights.subjectSub', { n: s.grades.length, mastery: s.withMastery ? `${s.withMastery}/${s.contents}` : '—' })} />
                  ))}
                  <li className="pt-2 text-xs text-muted">{t('insights.academyNote')}</li>
                </>
              )}
              {mod === 'languages' && now.languages.rows.map((r) => <Row key={r.language.id} label={r.language.name} value={t('focus.min', { min: r.minutes })} sub={t('insights.langSub', { sessions: r.sessions, words: r.words, newWords: r.newWords })} />)}
              {mod === 'music' && <Row label={t('insights.repertoire')} value={now.music.repertoire.total} sub={t('insights.repertoireSub', { mastered: now.music.repertoire.mastered, learning: now.music.repertoire.learning })} />}
              {mod === 'sports' && (
                <>
                  <Row label={t('insights.trainings')} value={now.sports.trainings} />
                  <Row label={t('insights.games')} value={now.sports.games} sub={t('insights.record', { ...now.sports.record })} />
                  <Row label={t('insights.minutesLogged')} value={now.sports.minutes} />
                </>
              )}
              {mod === 'projects' && now.projects.milestones.map((m, i) => <Row key={i} label={m.title} value={formatDateKey(m.date, settings.locale)} sub={m.project.name} />)}
              {mod === 'goals' && (
                <>
                  {now.goals.done.map((g) => <Row key={g.id} label={g.name} value={t('goals.statuses.done')} />)}
                  <Row label={t('insights.goalMilestones')} value={now.goals.milestones} />
                </>
              )}
            </Rows>
          )}
        </>
      )}
      {!has && <ControlRoomLink to={MOD_PATH[mod]} />}
    </Pane>
  );
}

/* ---------- Finanças (sempre atrás do PIN, com os valores escondidos até pedir) ---------- */

function FinanceCard({ now, compact = false }: { now: Computed; compact?: boolean }) {
  const { t } = useSettings();
  const { hide, toggle } = useHideToggle();
  const f = now.finance;
  return (
    <HideContext.Provider value={hide}>
      <Pane title={t('modules.finance')} action={<HideButton hide={hide} toggle={toggle} />}>
        {!f.has ? (
          <Empty>{t('insights.noData')}</Empty>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {f.byCurrency.map((c) => (
                <li key={c.currency} className="flex flex-col gap-0.5 rounded-xl bg-surface/60 px-3 py-2 text-sm ring-1 ring-inset ring-line/50">
                  <span className="font-semibold text-fg">{c.currency}</span>
                  {!compact && (
                    <>
                      <span className="text-fg">
                        {t('finance.invested')}: <Money value={c.invested} currency={c.currency} />
                      </span>
                      <span className="text-fg">
                        {t('finance.currentValue')}: <Money value={c.quoted ? c.value : null} currency={c.currency} /> <span className="text-xs text-muted">{t('finance.partialValue', { n: c.quoted, total: c.held })}</span>
                      </span>
                    </>
                  )}
                  <span className="text-fg">
                    {t('insights.incomeIn')} <Money value={c.income} currency={c.currency} />
                  </span>
                </li>
              ))}
            </ul>
            <span className="text-xs text-muted">{t('insights.txCount', { count: f.transactions })}</span>
          </>
        )}
      </Pane>
    </HideContext.Provider>
  );
}
