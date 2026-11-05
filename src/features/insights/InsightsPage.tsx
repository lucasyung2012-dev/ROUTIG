import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChartLine, ChevronLeft, ChevronRight, Printer, Settings2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
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
  type PeriodKind,
  type Range,
} from '@/domain/insights';
import { HideButton, useHideToggle } from '@/features/finance/FinancePage';
import { Money } from '@/features/finance/financeUi';
import { HideContext } from '@/features/finance/useFinance';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Segmented';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { cn } from '@/ui/cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadPrivacy } from '@/data/privacyRepo';
import { useInsightsData, type InsightsRaw } from './useInsightsData';

const MODULES = ['focus', 'habits', 'tasks', 'academy', 'languages', 'music', 'sports', 'projects', 'goals', 'finance'] as const;
type Mod = (typeof MODULES)[number];
type Level = 'overview' | 'module' | 'report';
const PREFS_KEY = 'routig.insights';

/** Tudo de um período, calculado só com o que foi registrado. */
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

function usePrefs() {
  const [prefs, setPrefs] = useState<{ hidden: Mod[]; compare: boolean }>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { hidden?: Mod[]; compare?: boolean };
      return { hidden: (v.hidden ?? []).filter((m) => (MODULES as readonly string[]).includes(m)), compare: v.compare ?? true };
    } catch {
      return { hidden: [], compare: true };
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* preferência só desta sessão */
    }
  }, [prefs]);
  return [prefs, setPrefs] as const;
}

/** Insights (Parte 19): visão geral, análise por módulo e relatório, por período. */
export function InsightsPage() {
  const { t, settings } = useSettings();
  const raw = useInsightsData();
  const today = todayKey();
  const [level, setLevel] = useState<Level>('overview');
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState<Range>({ from: addDays(today, -29), to: today });
  const [mod, setMod] = useState<Mod>('focus');
  const [customizing, setCustomizing] = useState(false);
  const [prefs, setPrefs] = usePrefs();
  const { hide, toggle } = useHideToggle();
  const privacy = useLiveQuery(() => loadPrivacy(), []);
  const range = kind === 'custom' ? custom : rangeFor(kind, anchor, settings.weekStartsOn);
  const prev = previousRange(range);
  const now = useMemo(() => raw && compute(raw, range, today, settings.weekStartsOn), [raw, range.from, range.to, today, settings.weekStartsOn]);
  const before = useMemo(() => raw && compute(raw, prev, today, settings.weekStartsOn), [raw, prev.from, prev.to, today, settings.weekStartsOn]);
  if (!raw || !now || !before || !privacy) return <LoadingState label={t('common.loading')} lines={6} />;

  const shift = (n: number) => {
    if (kind === 'week') setAnchor(addDays(anchor, 7 * n));
    else if (kind === 'month') setAnchor(rangeFor('month', n > 0 ? addDays(range.to, 1) : addDays(range.from, -1), 0).from);
    else if (kind === 'year') setAnchor(`${Number(anchor.slice(0, 4)) + n}-06-15`);
  };
  const label =
    kind === 'week'
      ? `${formatDateKey(range.from, settings.locale)} – ${formatDateKey(range.to, settings.locale)}`
      : kind === 'month'
        ? capitalizeFirst(new Intl.DateTimeFormat(settings.locale, { month: 'long', year: 'numeric' }).format(new Date(`${range.from}T12:00`)))
        : kind === 'year'
          ? range.from.slice(0, 4)
          : `${formatDateKey(range.from, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })} – ${formatDateKey(range.to, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  // Módulos tirados do Insights pela privacidade não aparecem em lugar nenhum daqui, nem no relatório (Parte 26.1).
  const locked = MODULES.filter((m) => privacy.insightsHidden.includes(m));
  const allowed = MODULES.filter((m) => !locked.includes(m));
  const visible = allowed.filter((m) => !prefs.hidden.includes(m));
  const shownMod = allowed.includes(mod) ? mod : allowed[0];

  return (
    <HideContext.Provider value={hide}>
      <div className="flex flex-col gap-6 print:gap-3">
        <PageHeader
          eyebrow={t('modules.insights')}
          title={t('modules.insights')}
          description={t('moduleSummary.insights')}
          icon={<ChartLine className="h-7 w-7" aria-hidden />}
          className="print:hidden"
          actions={
            <>
              <HideButton hide={hide} toggle={toggle} />
              <IconButton label={t('insights.customize')} icon={<Settings2 className="h-4 w-4" />} onClick={() => setCustomizing(true)} />
            </>
          }
        />
        <Surface className="flex flex-col gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<PeriodKind> label={t('insights.period')} value={kind} onChange={setKind} options={(['week', 'month', 'year', 'custom'] as const).map((k) => ({ value: k, label: t(`insights.periods.${k}`) }))} />
            {kind !== 'custom' ? (
              <div className="flex items-center gap-1">
                <IconButton label={t('habits.prev')} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => shift(-1)} />
                <span className="min-w-40 text-center text-sm font-semibold text-fg">{label}</span>
                <IconButton label={t('habits.next')} icon={<ChevronRight className="h-4 w-4" />} onClick={() => shift(1)} disabled={range.to >= today} />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Input aria-label={t('insights.from')} type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} className="h-9 w-40" />
                <span className="text-muted">–</span>
                <Input aria-label={t('insights.to')} type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} className="h-9 w-40" />
              </div>
            )}
            <label className="ml-auto inline-flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" checked={prefs.compare} onChange={(e) => setPrefs({ ...prefs, compare: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
              {t('insights.compare')}
            </label>
          </div>
          <Segmented<Level> label={t('insights.level')} value={level} onChange={setLevel} options={(['overview', 'module', 'report'] as const).map((l) => ({ value: l, label: t(`insights.levels.${l}`) }))} />
        </Surface>
        <p className="text-xs text-muted print:hidden">{t('insights.integrity')}</p>

        <div className="flex flex-col gap-6 print:gap-3" data-private="insights">
        {level === 'overview' && <Overview now={now} before={prefs.compare ? before : null} modules={visible} onOpen={(m) => (setMod(m), setLevel('module'))} />}
        {level === 'module' && (shownMod ? <ModuleView mod={shownMod} modules={allowed} setMod={setMod} now={now} before={prefs.compare ? before : null} range={range} /> : <Surface tone="flat"><EmptyState title={t('insights.allPrivate')} /></Surface>)}
        {level === 'report' && <Report now={now} before={prefs.compare ? before : null} label={label} modules={visible} />}
        </div>

        {customizing && <CustomizeDialog hidden={prefs.hidden} locked={locked} onChange={(hidden) => setPrefs({ ...prefs, hidden })} onClose={() => setCustomizing(false)} />}
      </div>
    </HideContext.Provider>
  );
}

/* ---------- Visão geral ---------- */

function Delta({ now, before, unit = '' }: { now: number; before: number | null; unit?: string }) {
  const { t } = useSettings();
  if (before === null) return null;
  const d = Math.round((now - before) * 100) / 100;
  return <span className={cn('text-xs', d > 0 ? 'text-success' : d < 0 ? 'text-warning' : 'text-muted')}>{d === 0 ? t('insights.same') : t('insights.delta', { sign: d > 0 ? '+' : '−', n: Math.abs(d), unit })}</span>;
}

function Card({ title, to, has, onOpen, children }: { title: string; to: string; has: boolean; onOpen: () => void; children: ReactNode }) {
  const { t } = useSettings();
  return (
    <Surface className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 font-semibold text-fg">{title}</h3>
        {has && (
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={onOpen}>
            {t('insights.details')}
          </button>
        )}
      </div>
      {has ? (
        children
      ) : (
        <p className="text-sm text-muted">
          {t('insights.noData')}{' '}
          <Link to={to} className="text-accent hover:underline">
            {t('insights.openModule')}
          </Link>
        </p>
      )}
    </Surface>
  );
}

function Big({ value, label, delta }: { value: ReactNode; label: string; delta?: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-semibold tabular text-fg">{value}</span>
      <span className="text-xs text-muted">{label}</span>
      {delta}
    </div>
  );
}

function Overview({ now, before, modules, onOpen }: { now: Computed; before: Computed | null; modules: Mod[]; onOpen: (m: Mod) => void }) {
  const { t } = useSettings();
  const min = t('insights.unitMin');
  const cards: Record<Mod, ReactNode> = {
    focus: (
      <Card title={t('modules.focus')} to="/focus" has={now.focus.has} onOpen={() => onOpen('focus')}>
        <div className="grid grid-cols-2 gap-3">
          <Big value={now.focus.minutes} label={t('insights.minutesFocus')} delta={<Delta now={now.focus.minutes} before={before?.focus.minutes ?? null} unit={min} />} />
          <Big value={now.focus.sessions} label={t('insights.sessions')} delta={<Delta now={now.focus.sessions} before={before?.focus.sessions ?? null} />} />
        </div>
      </Card>
    ),
    habits: (
      <Card title={t('modules.habits')} to="/habits" has={now.habits.has} onOpen={() => onOpen('habits')}>
        <Big value={now.habits.logs} label={t('insights.habitLogs')} delta={<Delta now={now.habits.logs} before={before?.habits.logs ?? null} />} />
      </Card>
    ),
    tasks: (
      <Card title={t('modules.tasks')} to="/tasks" has={now.tasks.has} onOpen={() => onOpen('tasks')}>
        <div className="grid grid-cols-2 gap-3">
          <Big value={now.tasks.completed} label={t('insights.tasksDone')} delta={<Delta now={now.tasks.completed} before={before?.tasks.completed ?? null} />} />
          <Big value={now.tasks.created} label={t('insights.tasksCreated')} />
        </div>
      </Card>
    ),
    academy: (
      <Card title={t('modules.academy')} to="/academy" has={now.academy.has} onOpen={() => onOpen('academy')}>
        <div className="grid grid-cols-2 gap-3">
          <Big value={now.academy.assessments} label={t('insights.gradedAssessments')} />
          <Big value={now.academy.studyMinutes} label={t('insights.studyMinutes')} delta={<Delta now={now.academy.studyMinutes} before={before?.academy.studyMinutes ?? null} unit={min} />} />
        </div>
      </Card>
    ),
    languages: (
      <Card title={t('modules.languages')} to="/languages" has={now.languages.has} onOpen={() => onOpen('languages')}>
        <div className="grid grid-cols-3 gap-3">
          <Big value={now.languages.minutes} label={t('insights.minutesStudy')} delta={<Delta now={now.languages.minutes} before={before?.languages.minutes ?? null} unit={min} />} />
          <Big value={now.languages.newWords} label={t('insights.newWords')} />
          <Big value={now.languages.reviews} label={t('insights.reviews')} />
        </div>
      </Card>
    ),
    music: (
      <Card title={t('modules.music')} to="/music" has={now.music.has} onOpen={() => onOpen('music')}>
        <div className="grid grid-cols-2 gap-3">
          <Big value={now.music.minutes} label={t('insights.practiceMinutes')} delta={<Delta now={now.music.minutes} before={before?.music.minutes ?? null} unit={min} />} />
          <Big value={now.music.masteredInPeriod} label={t('insights.songsMastered')} />
        </div>
      </Card>
    ),
    sports: (
      <Card title={t('modules.sports')} to="/sports" has={now.sports.has} onOpen={() => onOpen('sports')}>
        <div className="grid grid-cols-2 gap-3">
          <Big value={now.sports.activities} label={t('insights.activities')} delta={<Delta now={now.sports.activities} before={before?.sports.activities ?? null} />} />
          <Big value={now.sports.activeDays} label={t('insights.activeDays')} />
        </div>
      </Card>
    ),
    projects: (
      <Card title={t('modules.projects')} to="/projects" has={now.projects.has} onOpen={() => onOpen('projects')}>
        <Big value={now.projects.milestones.length} label={t('insights.milestonesDone')} delta={<Delta now={now.projects.milestones.length} before={before?.projects.milestones.length ?? null} />} />
      </Card>
    ),
    goals: (
      <Card title={t('modules.goals')} to="/goals" has={now.goals.has} onOpen={() => onOpen('goals')}>
        <div className="grid grid-cols-2 gap-3">
          <Big value={now.goals.done.length} label={t('insights.goalsDone')} />
          <Big value={now.goals.checkins} label={t('insights.checkins')} />
        </div>
      </Card>
    ),
    finance: (
      <Card title={t('modules.finance')} to="/finance" has={now.finance.has} onOpen={() => onOpen('finance')}>
        <div className="flex flex-col gap-1">
          {now.finance.byCurrency.map((c) => (
            <span key={c.currency} className="text-sm text-fg">
              {t('insights.incomeIn')} <Money value={c.income} currency={c.currency} className="font-semibold" />
            </span>
          ))}
          <span className="text-xs text-muted">{t('insights.txCount', { count: now.finance.transactions })}</span>
        </div>
      </Card>
    ),
  };
  if (!modules.length)
    return (
      <Surface tone="flat">
        <EmptyState title={t('insights.allHidden')} />
      </Surface>
    );
  return <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{modules.map((m) => <div key={m}>{cards[m]}</div>)}</div>;
}

/* ---------- Análise por módulo ---------- */

function Bars({ points, range }: { points: Array<{ date: DateKey; value: number }>; range: Range }) {
  const { settings, t } = useSettings();
  const s = series(points, range, settings.weekStartsOn);
  const top = Math.max(1, ...s.map((x) => x.value));
  if (s.every((x) => x.value === 0)) return <p className="text-sm text-muted">{t('insights.noneInPeriod')}</p>;
  return (
    <div className="flex h-40 items-end gap-1" role="img" aria-label={s.map((x) => `${formatDateKey(x.start, settings.locale)}: ${x.value}`).join('; ')}>
      {s.map((x) => (
        <div key={x.start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[0.625rem] tabular text-muted">{x.value || ''}</span>
          <span className="w-full rounded-t bg-brand" style={{ height: `${(x.value / top) * 100}%`, minHeight: x.value ? 3 : 0 }} />
          {s.length <= 14 && <span className="w-full truncate text-center text-[0.625rem] text-subtle">{formatDateKey(x.start, settings.locale)}</span>}
        </div>
      ))}
    </div>
  );
}

function Row({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <li className="flex items-baseline gap-3 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate text-fg">{label}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      <span className="tabular font-medium text-fg">{value}</span>
    </li>
  );
}

function ModuleView({ mod, modules, setMod, now, before, range }: { mod: Mod; modules: readonly Mod[]; setMod: (m: Mod) => void; now: Computed; before: Computed | null; range: Range }) {
  const { t, settings } = useSettings();
  const has = now[mod].has;
  const chartPoints: Partial<Record<Mod, Array<{ date: DateKey; value: number }>>> = {
    focus: now.focus.points,
    habits: now.habits.points,
    tasks: now.tasks.points,
    academy: now.academy.points,
    languages: now.languages.points,
    music: now.music.points,
    sports: now.sports.points,
    projects: now.projects.points,
  };
  return (
    <div className="flex flex-col gap-4">
      <Select aria-label={t('insights.module')} value={mod} onChange={(e) => setMod(e.target.value as Mod)} className="h-10 w-auto max-w-60">
        {modules.map((m) => (
          <option key={m} value={m}>
            {t(`modules.${m}`)}
          </option>
        ))}
      </Select>
      {!has ? (
        <Surface tone="flat">
          <EmptyState title={t('insights.noData')} />
        </Surface>
      ) : (
        <>
          {chartPoints[mod] && (
            <Surface className="flex flex-col gap-2">
              <h3 className="font-semibold text-fg">{t(`insights.chartTitle.${mod as 'focus'}`)}</h3>
              <Bars points={chartPoints[mod]!} range={range} />
            </Surface>
          )}
          <Surface className="flex flex-col gap-1">
            <h3 className="font-semibold text-fg">{t('insights.details')}</h3>
            <ul className="flex flex-col divide-y divide-line/60">
              {mod === 'focus' &&
                FOCUS_KINDS.filter((k) => now.focus.byKind[k] > 0).map((k) => <Row key={k} label={t(`focus.kinds.${k}`)} value={t('focus.min', { min: now.focus.byKind[k] })} sub={before ? t('insights.before', { v: t('focus.min', { min: before.focus.byKind[k] }) }) : undefined} />)}
              {mod === 'habits' && now.habits.rows.map((r) => <Row key={r.habit.id} label={r.habit.name} value={r.consistency.total ? t('habits.ratio', { met: r.consistency.met, total: r.consistency.total }) : '—'} sub={t('insights.logsAndTotal', { logs: r.logs, total: r.habit.method === 'check' || r.habit.method === 'scale' ? '—' : r.total })} />)}
              {mod === 'tasks' && (
                <>
                  <Row label={t('insights.tasksDone')} value={now.tasks.completed} sub={before ? t('insights.before', { v: before.tasks.completed }) : undefined} />
                  <Row label={t('insights.tasksCreated')} value={now.tasks.created} sub={before ? t('insights.before', { v: before.tasks.created }) : undefined} />
                </>
              )}
              {mod === 'academy' && (
                <>
                  {now.academy.bySubject.map((s) => (
                    <Row key={s.subject.id} label={s.subject.name} value={s.average === null ? '—' : t('insights.avgOf', { avg: s.average.toLocaleString(settings.locale), scale: s.scale })} sub={t('insights.subjectSub', { n: s.grades.length, mastery: s.withMastery ? `${s.withMastery}/${s.contents}` : '—' })} />
                  ))}
                  <Row label={t('insights.studyMinutes')} value={now.academy.studyMinutes} sub={t('insights.sessionsN', { count: now.academy.studySessions })} />
                  <li className="pt-2 text-xs text-muted">{t('insights.academyNote')}</li>
                </>
              )}
              {mod === 'languages' && now.languages.rows.map((r) => <Row key={r.language.id} label={r.language.name} value={t('focus.min', { min: r.minutes })} sub={t('insights.langSub', { sessions: r.sessions, words: r.words, newWords: r.newWords })} />)}
              {mod === 'music' && (
                <>
                  <Row label={t('insights.practiceMinutes')} value={now.music.minutes} sub={t('insights.sessionsN', { count: now.music.sessions })} />
                  <Row label={t('insights.repertoire')} value={now.music.repertoire.total} sub={t('insights.repertoireSub', { mastered: now.music.repertoire.mastered, learning: now.music.repertoire.learning })} />
                  <Row label={t('insights.songsMastered')} value={now.music.masteredInPeriod} />
                </>
              )}
              {mod === 'sports' && (
                <>
                  <Row label={t('insights.trainings')} value={now.sports.trainings} />
                  <Row label={t('insights.games')} value={now.sports.games} sub={t('insights.record', { ...now.sports.record })} />
                  <Row label={t('insights.activeDays')} value={now.sports.activeDays} />
                  <Row label={t('insights.minutesLogged')} value={now.sports.minutes} />
                </>
              )}
              {mod === 'projects' && (now.projects.milestones.length ? now.projects.milestones.map((m, i) => <Row key={i} label={m.title} value={formatDateKey(m.date, settings.locale)} sub={m.project.name} />) : <li className="py-2 text-sm text-muted">{t('insights.noneInPeriod')}</li>)}
              {mod === 'goals' && (
                <>
                  {now.goals.done.map((g) => <Row key={g.id} label={g.name} value={t('goals.statuses.done')} />)}
                  <Row label={t('insights.checkins')} value={now.goals.checkins} />
                  <Row label={t('insights.goalMilestones')} value={now.goals.milestones} />
                </>
              )}
              {mod === 'finance' &&
                now.finance.byCurrency.map((c) => (
                  <li key={c.currency} className="flex flex-col gap-1 py-2 text-sm">
                    <span className="font-semibold text-fg">{c.currency}</span>
                    <span className="text-fg">
                      {t('finance.invested')}: <Money value={c.invested} currency={c.currency} />
                    </span>
                    <span className="text-fg">
                      {t('finance.currentValue')}: <Money value={c.quoted ? c.value : null} currency={c.currency} /> <span className="text-xs text-muted">{t('finance.partialValue', { n: c.quoted, total: c.held })}</span>
                    </span>
                    <span className="text-fg">
                      {t('insights.incomeIn')} <Money value={c.income} currency={c.currency} />
                    </span>
                  </li>
                ))}
            </ul>
          </Surface>
        </>
      )}
    </div>
  );
}

/* ---------- Relatório por período ---------- */

function Report({ now, before, label, modules }: { now: Computed; before: Computed | null; label: string; modules: Mod[] }) {
  const { t, settings } = useSettings();
  const cmp = (b: number | undefined) => (before && b !== undefined ? ` (${t('insights.before', { v: b })})` : '');
  const lines: Record<Mod, string[]> = {
    focus: now.focus.has ? [t('insights.r.focus', { min: now.focus.minutes, n: now.focus.sessions }) + cmp(before?.focus.minutes)] : [],
    habits: now.habits.has ? [t('insights.r.habits', { n: now.habits.logs }) + cmp(before?.habits.logs), ...now.habits.rows.filter((r) => r.consistency.total).map((r) => `· ${r.habit.name}: ${t('habits.ratio', { met: r.consistency.met, total: r.consistency.total })}`)] : [],
    tasks: now.tasks.has ? [t('insights.r.tasks', { done: now.tasks.completed, created: now.tasks.created }) + cmp(before?.tasks.completed)] : [],
    academy: now.academy.has ? [t('insights.r.academy', { n: now.academy.assessments, min: now.academy.studyMinutes }), ...now.academy.bySubject.filter((s) => s.average !== null).map((s) => `· ${s.subject.name}: ${t('insights.avgOf', { avg: s.average!.toLocaleString(settings.locale), scale: s.scale })}`)] : [],
    languages: now.languages.has ? [t('insights.r.languages', { min: now.languages.minutes, words: now.languages.newWords, reviews: now.languages.reviews }) + cmp(before?.languages.minutes)] : [],
    music: now.music.has ? [t('insights.r.music', { min: now.music.minutes, n: now.music.sessions, mastered: now.music.masteredInPeriod }) + cmp(before?.music.minutes)] : [],
    sports: now.sports.has ? [t('insights.r.sports', { n: now.sports.activities, days: now.sports.activeDays, ...now.sports.record }) + cmp(before?.sports.activities)] : [],
    projects: now.projects.has ? [t('insights.r.projects', { n: now.projects.milestones.length }), ...now.projects.milestones.map((m) => `· ${m.title} (${m.project.name})`)] : [],
    goals: now.goals.has ? [t('insights.r.goals', { done: now.goals.done.length, checkins: now.goals.checkins }), ...now.goals.done.map((g) => `· ${g.name}`)] : [],
    finance: now.finance.has ? [t('insights.r.finance', { n: now.finance.transactions })] : [],
  };
  return (
    <Surface className="flex flex-col gap-4 print:shadow-none print:ring-0">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold text-fg">{t('insights.reportTitle', { period: label })}</h2>
        <Button size="sm" variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()} className="print:hidden">
          {t('insights.print')}
        </Button>
      </div>
      {modules.map((m) => (
        <section key={m} className="flex flex-col gap-1 break-inside-avoid">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">{t(`modules.${m}`)}</h3>
          {lines[m].length ? (
            lines[m].map((l, i) => (
              <p key={i} className="text-sm text-fg">
                {l}
              </p>
            ))
          ) : (
            <p className="text-sm text-muted">{t('insights.noData')}</p>
          )}
        </section>
      ))}
      <p className="text-xs text-muted">{t('insights.reportFoot', { date: formatDateKey(todayKey(), settings.locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>
    </Surface>
  );
}

/* ---------- Cartões personalizáveis (Parte 19.4) ---------- */

function CustomizeDialog({ hidden, locked, onChange, onClose }: { hidden: Mod[]; locked: Mod[]; onChange: (h: Mod[]) => void; onClose: () => void }) {
  const { t } = useSettings();
  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} title={t('insights.customize')} description={t('insights.customizeHint')} footer={<Button onClick={onClose}>{t('common.done')}</Button>}>
      <ul className="flex flex-col gap-2">
        {MODULES.map((m) => (
          <li key={m}>
            <label className="flex items-center gap-3 text-sm text-fg">
              <input type="checkbox" checked={!hidden.includes(m) && !locked.includes(m)} disabled={locked.includes(m)} onChange={(e) => onChange(e.target.checked ? hidden.filter((x) => x !== m) : [...hidden, m])} className="h-4 w-4 accent-[rgb(var(--accent))]" />
              {t(`modules.${m}`)}
              {locked.includes(m) && <span className="text-xs text-muted">{t('insights.privateNote')}</span>}
            </label>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
