import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ChevronLeft, ChevronRight, Pause, Plus, Repeat, RotateCcw, Sparkles } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { restoreHabit, setHabitArchived } from '@/data/habitsRepo';
import { addDays, formatDateKey, monthGrid, startOfMonth, startOfWeek, todayKey, weekday, type DateKey } from '@/domain/dates';
import { currentFrequency, dayState, openPause, todayStatus, type Habit, type HabitInput } from '@/domain/habits';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Segmented';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { cn } from '@/ui/cn';
import { dayLook, HABIT_EXAMPLES, HabitDialog, Heatmap, Legend, LogDialog, QuickLog, useFrequencyLabel, useWeekdayNames } from './habitsUi';
import { useHabits, type HabitsData } from './useHabits';

type View = 'today' | 'week' | 'month' | 'year';
const VIEW_KEY = 'routig.habits.view';

/** Habits (Parte 14): acompanhar sem pressão. Nada de sequência para "não quebrar". */
export function HabitsPage() {
  const { t } = useSettings();
  const data = useHabits();
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === 'week' || v === 'month' || v === 'year' ? v : 'today';
    } catch {
      return 'today';
    }
  });
  const [creating, setCreating] = useState<Partial<HabitInput> | null>(null);
  const [logging, setLogging] = useState<{ habit: Habit; date: DateKey } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* preferência só desta sessão */
    }
  }, [view]);

  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  const categories = [...new Set([...data.habits, ...data.archived].map((h) => h.category).filter(Boolean))].sort();
  const open = (habit: Habit, date: DateKey) => setLogging({ habit, date });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('modules.habits')}
        title={t('modules.habits')}
        description={t('moduleSummary.habits')}
        icon={<Repeat className="h-7 w-7" aria-hidden />}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating({})}>
            {t('habits.new')}
          </Button>
        }
      />

      {data.habits.length === 0 && data.archived.length === 0 ? (
        <Surface tone="flat">
          <EmptyState
            icon={<Repeat className="h-6 w-6" />}
            title={t('habits.emptyTitle')}
            body={t('habits.empty')}
            action={
              <div className="flex flex-col items-center gap-3">
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating({})}>
                  {t('habits.new')}
                </Button>
                <span className="text-xs text-muted">{t('habits.examplesHint')}</span>
                <div className="flex flex-wrap justify-center gap-2">
                  {HABIT_EXAMPLES.map((ex) => (
                    <Button key={ex.key} size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4" />} onClick={() => setCreating({ ...ex.input, name: t(`habits.examples.${ex.key}`) })}>
                      {t(`habits.examples.${ex.key}`)}
                    </Button>
                  ))}
                </div>
              </div>
            }
          />
        </Surface>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<View>
              label={t('habits.view')}
              value={view}
              onChange={setView}
              options={(['today', 'week', 'month', 'year'] as const).map((v) => ({ value: v, label: t(`habits.views.${v}`) }))}
            />
            <p className="text-sm text-muted">{t('habits.philosophy')}</p>
          </div>
          {data.habits.length === 0 ? (
            <Surface tone="flat">
              <EmptyState title={t('habits.allArchived')} />
            </Surface>
          ) : view === 'today' ? (
            <TodayView data={data} onLog={open} />
          ) : view === 'week' ? (
            <WeekView data={data} onLog={open} />
          ) : view === 'month' ? (
            <MonthView data={data} onLog={open} />
          ) : (
            <YearView data={data} onLog={open} />
          )}
        </>
      )}

      {data.archived.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <button type="button" className="flex items-center gap-2 text-left text-sm font-semibold text-fg" aria-expanded={showArchived} onClick={() => setShowArchived((s) => !s)}>
            <Archive className="h-4 w-4 text-muted" aria-hidden />
            {t('habits.archivedTitle', { count: data.archived.length })}
          </button>
          {showArchived &&
            data.archived.map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: h.color }} aria-hidden />
                <Link to={`/habits/${h.id}`} className="min-w-0 flex-1 truncate text-fg hover:text-accent">
                  {h.name}
                </Link>
                <Button size="sm" variant="secondary" onClick={() => void setHabitArchived(h.id, false)}>
                  {t('habits.unarchive')}
                </Button>
              </div>
            ))}
        </Surface>
      )}

      {data.trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg">{t('habits.trash')}</h2>
          {data.trash.map((h) => (
            <div key={h.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{h.name}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreHabit(h.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}

      {creating && <HabitDialog preset={creating} categories={categories} onClose={() => setCreating(null)} />}
      {logging && <LogDialog habit={logging.habit} date={logging.date} logs={data.logsOf(logging.habit.id)} onClose={() => setLogging(null)} />}
    </div>
  );
}

/* ---------- Hoje (painel) ---------- */

function TodayView({ data, onLog }: { data: HabitsData; onLog: (h: Habit, d: DateKey) => void }) {
  const { t, settings } = useSettings();
  const freq = useFrequencyLabel();
  const today = todayKey();
  const rows = data.habits.map((h) => ({ h, st: todayStatus(h, data.logsOf(h.id), today, settings.weekStartsOn) }));
  const due = rows.filter((r) => r.st.due);
  const rest = rows.filter((r) => !r.st.due);

  const row = ({ h, st }: (typeof rows)[number]) => {
    const paused = !!openPause(h) || h.startDate > today;
    const f = currentFrequency(h);
    return (
      <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70">
        <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: h.color }} aria-hidden />
        <div className="min-w-0 flex-1 basis-48">
          <Link to={`/habits/${h.id}`} className="block truncate font-medium text-fg hover:text-accent">
            {h.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{freq(f, h)}</span>
            {(f.period === 'week' || f.period === 'month' || f.period === 'year') && st.expected > 0 && <Badge tone={st.achieved >= st.expected ? 'success' : 'neutral'}>{t(`habits.periodProgress.${f.period}`, { done: Math.min(st.achieved, st.expected), total: st.expected })}</Badge>}
            {paused && <Badge icon={<Pause className="h-3 w-3" />}>{h.startDate > today ? t('habits.startsOn', { date: formatDateKey(h.startDate, settings.locale) }) : t('habits.paused')}</Badge>}
            {h.category && <span>· {h.category}</span>}
          </div>
        </div>
        {!paused && <QuickLog habit={h} log={data.logsOf(h.id).get(today)} date={today} onOpen={() => onLog(h, today)} />}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">{t('habits.todayTitle', { count: due.length })}</h2>
        {due.length === 0 ? (
          <p className="text-sm text-muted">{t('habits.nothingToday')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {due.map(row)}
          </ul>
        )}
      </section>
      {rest.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">{t('habits.otherTitle')}</h2>
          <ul className="flex flex-col gap-2">
            {rest.map(row)}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ---------- Semana ---------- */

function Nav({ label, onPrev, onNext, onToday, nextDisabled }: { label: string; onPrev: () => void; onNext: () => void; onToday: () => void; nextDisabled?: boolean }) {
  const { t } = useSettings();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconButton label={t('habits.prev')} icon={<ChevronLeft className="h-4 w-4" />} onClick={onPrev} />
      <span className="min-w-40 text-center text-sm font-semibold capitalize text-fg">{label}</span>
      <IconButton label={t('habits.next')} icon={<ChevronRight className="h-4 w-4" />} onClick={onNext} disabled={nextDisabled} />
      <Button size="sm" variant="ghost" onClick={onToday}>
        {t('habits.thisPeriod')}
      </Button>
    </div>
  );
}

function Cell({ habit, date, data, onLog, size = 'md' }: { habit: Habit; date: DateKey; data: HabitsData; onLog: (h: Habit, d: DateKey) => void; size?: 'md' | 'sm' }) {
  const { settings } = useSettings();
  const today = todayKey();
  const log = data.logsOf(habit.id).get(date);
  const state = dayState(habit, log, date, today);
  const look = dayLook(state, habit.color);
  const clickable = date <= today && date >= habit.startDate;
  const label = `${habit.name} · ${formatDateKey(date, settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })}`;
  const cls = cn('flex items-center justify-center rounded-lg text-[0.6875rem] font-semibold text-white transition', size === 'md' ? 'h-10 w-full' : 'aspect-square w-full', look.className, clickable && 'hover:ring-2 hover:ring-accent/50');
  const content = log && habit.method !== 'check' ? <span className="drop-shadow">{habit.method === 'duration' ? `${log.value}′` : log.value}</span> : null;
  return clickable ? (
    <button type="button" className={cls} style={look.style} aria-label={label} onClick={() => onLog(habit, date)}>
      {content}
    </button>
  ) : (
    <span className={cls} style={look.style} title={label} />
  );
}

function WeekView({ data, onLog }: { data: HabitsData; onLog: (h: Habit, d: DateKey) => void }) {
  const { t, settings } = useSettings();
  const names = useWeekdayNames();
  const today = todayKey();
  const [anchor, setAnchor] = useState(() => startOfWeek(today, settings.weekStartsOn));
  const days = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
  const label = `${formatDateKey(days[0]!, settings.locale)} – ${formatDateKey(days[6]!, settings.locale)}`;
  return (
    <Surface className="flex flex-col gap-4">
      <Nav label={label} onPrev={() => setAnchor(addDays(anchor, -7))} onNext={() => setAnchor(addDays(anchor, 7))} onToday={() => setAnchor(startOfWeek(today, settings.weekStartsOn))} nextDisabled={addDays(anchor, 7) > today} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-40 text-left text-xs font-medium text-subtle">{t('habits.habit')}</th>
              {days.map((d) => (
                <th key={d} className={cn('text-center text-xs font-medium capitalize', d === today ? 'text-accent' : 'text-subtle')}>
                  {names[weekday(d)]}
                  <span className="block tabular">{d.slice(8)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.habits.map((h) => (
              <tr key={h.id}>
                <td className="max-w-40 truncate pr-2 text-sm">
                  <Link to={`/habits/${h.id}`} className="font-medium text-fg hover:text-accent">
                    {h.name}
                  </Link>
                </td>
                {days.map((d) => (
                  <td key={d}>
                    <Cell habit={h} date={d} data={data} onLog={onLog} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend />
    </Surface>
  );
}

/* ---------- Mês ---------- */

function MonthView({ data, onLog }: { data: HabitsData; onLog: (h: Habit, d: DateKey) => void }) {
  const { settings } = useSettings();
  const names = useWeekdayNames();
  const today = todayKey();
  const [month, setMonth] = useState(() => startOfMonth(today));
  const grid = monthGrid(month, settings.weekStartsOn);
  const label = new Intl.DateTimeFormat(settings.locale, { month: 'long', year: 'numeric' }).format(new Date(`${month}T12:00`));
  const shift = (n: number) => {
    const d = new Date(`${month}T12:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  };
  return (
    <div className="flex flex-col gap-4">
      <Nav label={label} onPrev={() => shift(-1)} onNext={() => shift(1)} onToday={() => setMonth(startOfMonth(today))} nextDisabled={month >= startOfMonth(today)} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.habits.map((h) => (
          <li key={h.id}>
            <Surface className="flex flex-col gap-3">
              <Link to={`/habits/${h.id}`} className="flex items-center gap-2 font-medium text-fg hover:text-accent">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.color }} aria-hidden />
                <span className="truncate">{h.name}</span>
              </Link>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i} className="text-center text-[0.625rem] capitalize text-subtle">
                    {names[(i + settings.weekStartsOn) % 7]}
                  </span>
                ))}
                {grid.map((d) =>
                  d.slice(0, 7) === month.slice(0, 7) ? (
                    <Cell key={d} habit={h} date={d} data={data} onLog={onLog} size="sm" />
                  ) : (
                    <span key={d} />
                  ),
                )}
              </div>
            </Surface>
          </li>
        ))}
      </ul>
      <Legend />
    </div>
  );
}

/* ---------- Ano (calendário de consistência) ---------- */

function YearView({ data, onLog }: { data: HabitsData; onLog: (h: Habit, d: DateKey) => void }) {
  const { t } = useSettings();
  const today = todayKey();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  return (
    <div className="flex flex-col gap-4">
      <Nav label={String(year)} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} onToday={() => setYear(Number(today.slice(0, 4)))} nextDisabled={year >= Number(today.slice(0, 4))} />
      <p className="text-sm text-muted">{t('habits.yearHint')}</p>
      <ul className="flex flex-col gap-3">
        {data.habits.map((h) => (
          <li key={h.id}>
            <Surface className="flex flex-col gap-2">
              <Link to={`/habits/${h.id}`} className="flex items-center gap-2 font-medium text-fg hover:text-accent">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.color }} aria-hidden />
                <span className="truncate">{h.name}</span>
              </Link>
              <Heatmap habit={h} logs={data.logsOf(h.id)} from={from} to={to} onPick={(d) => onLog(h, d)} />
            </Surface>
          </li>
        ))}
      </ul>
      <Legend />
    </div>
  );
}
