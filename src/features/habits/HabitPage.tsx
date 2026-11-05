import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ChevronLeft, PenLine, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { addPause, habitHistory, pauseHabit, removePause, restoreHabit, resumeHabit, setHabitArchived, softDeleteHabit } from '@/data/habitsRepo';
import { addDays, capitalizeFirst, formatDateKey, monthGrid, startOfMonth, todayKey, type DateKey } from '@/domain/dates';
import { consistency, currentFrequency, dayState, habitBuckets, habitPeriods, openPause, todayStatus, type Habit, type HabitBucket } from '@/domain/habits';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { dayLook, HabitDialog, Heatmap, Legend, LogDialog, QuickLog, useFrequencyLabel, useValueLabel, useWeekdayNames } from './habitsUi';
import { useHabits, type HabitsData } from './useHabits';

const TABS = ['overview', 'calendar', 'charts', 'history'] as const;
type Tab = (typeof TABS)[number];

export function HabitPage() {
  const { id } = useParams();
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const data = useHabits();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [logDate, setLogDate] = useState<DateKey | null>(null);
  const [pausing, setPausing] = useState(false);
  const freq = useFrequencyLabel();
  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  const habit = id ? data.byId.get(id) : undefined;
  if (!habit || habit.deletedAt)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Surface tone="flat">
          <EmptyState title={t('habits.notFound')} />
        </Surface>
      </div>
    );
  const today = todayKey();
  const logs = data.logsOf(habit.id);
  const paused = openPause(habit);
  const categories = [...new Set([...data.habits, ...data.archived].map((h) => h.category).filter(Boolean))].sort();

  const trash = async () => {
    await softDeleteHabit(habit.id);
    toast.show(t('habits.moved'), 'success', { label: t('notes.undo'), run: () => void restoreHabit(habit.id) });
    navigate('/habits');
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <div className="h-2" style={{ background: habit.color }} aria-hidden />
        <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
          <div className="min-w-0 flex-1 basis-56">
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{habit.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <span>{t(`habits.methods.${habit.method}`)}</span>
              <span>· {freq(currentFrequency(habit), habit)}</span>
              {habit.category && <span>· {habit.category}</span>}
              {paused && <Badge icon={<Pause className="h-3 w-3" />}>{t('habits.paused')}</Badge>}
              {habit.archived && <Badge>{t('habits.archived')}</Badge>}
            </div>
            {habit.description && <p className="mt-2 max-w-2xl text-sm text-fg">{habit.description}</p>}
          </div>
          {!habit.archived && !paused && today >= habit.startDate && <QuickLog habit={habit} log={logs.get(today)} date={today} onOpen={() => setLogDate(today)} />}
          <div className="flex items-center gap-1">
            <IconButton label={t('habits.logDay')} icon={<Plus className="h-4 w-4" />} onClick={() => setLogDate(today >= habit.startDate ? today : habit.startDate)} disabled={today < habit.startDate} />
            <IconButton label={t('habits.edit')} icon={<PenLine className="h-4 w-4" />} onClick={() => setEditing(true)} />
            {paused ? (
              <IconButton label={t('habits.resume')} icon={<Play className="h-4 w-4" />} onClick={() => void resumeHabit(habit.id).then(() => toast.show(t('habits.resumed')))} />
            ) : (
              <IconButton label={t('habits.pause')} icon={<Pause className="h-4 w-4" />} onClick={() => setPausing(true)} />
            )}
            <IconButton label={habit.archived ? t('habits.unarchive') : t('habits.archive')} icon={<Archive className="h-4 w-4" />} onClick={() => void setHabitArchived(habit.id, !habit.archived)} />
            <IconButton label={t('habits.moveToTrash')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void trash()} />
          </div>
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label={habit.name} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
          {TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              role="tab"
              aria-selected={tab === tb}
              onClick={() => setTab(tb)}
              className={cn('h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition', tab === tb ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg')}
            >
              {t(`habits.tabs.${tb}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <Overview habit={habit} data={data} onPick={setLogDate} />}
      {tab === 'calendar' && <CalendarTab habit={habit} data={data} onPick={setLogDate} />}
      {tab === 'charts' && <ChartsTab habit={habit} data={data} />}
      {tab === 'history' && <HistoryTab habit={habit} data={data} onPick={setLogDate} />}

      {editing && <HabitDialog habit={habit} hasLogs={logs.size > 0} categories={categories} onClose={() => setEditing(false)} />}
      {logDate && <LogDialog habit={habit} date={logDate} logs={logs} onClose={() => setLogDate(null)} />}
      {pausing && <PauseDialog habit={habit} onClose={() => setPausing(false)} />}
    </div>
  );
}

function BackLink() {
  const { t } = useSettings();
  return (
    <Link to="/habits" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-fg">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('habits.back')}
    </Link>
  );
}

/* ---------- Visão geral ---------- */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Surface className="flex flex-col gap-1">
      <span className="text-2xl font-semibold tabular text-fg">{value}</span>
      <span className="text-xs text-muted">{label}</span>
      {hint && <span className="text-[0.6875rem] text-subtle">{hint}</span>}
    </Surface>
  );
}

function Overview({ habit, data, onPick }: { habit: Habit; data: HabitsData; onPick: (d: DateKey) => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const logs = data.logsOf(habit.id);
  const c30 = consistency(habitPeriods(habit, logs, addDays(today, -29), today, today, settings.weekStartsOn));
  const c90 = consistency(habitPeriods(habit, logs, addDays(today, -89), today, today, settings.weekStartsOn));
  const st = todayStatus(habit, logs, today, settings.weekStartsOn);
  const f = currentFrequency(habit);
  const [confirmPause, setConfirmPause] = useState<number | null>(null);
  const ratio = (c: { met: number; total: number }) => (c.total ? t('habits.ratio', { met: c.met, total: c.total }) : '—');

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('habits.stats.last30')} value={ratio(c30)} hint={t(`habits.stats.unit.${f.period === 'day' || f.period === 'interval' ? 'days' : f.period}`)} />
        <Stat label={t('habits.stats.last90')} value={ratio(c90)} />
        <Stat label={t('habits.stats.logs')} value={String(logs.size)} />
        <Stat label={t('habits.stats.thisPeriod')} value={st.expected ? t('habits.ratio', { met: Math.min(st.achieved, st.expected), total: st.expected }) : '—'} />
      </div>
      <p className="text-sm text-muted">{t('habits.consistencyHint')}</p>

      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('habits.consistencyTitle')}</h2>
        <Heatmap habit={habit} logs={logs} from={addDays(today, -7 * 26 + 1)} to={today} onPick={onPick} />
        <Legend />
      </Surface>

      {(habit.pauses.length > 0 || habit.notes) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {habit.pauses.length > 0 && (
            <Surface className="flex flex-col gap-2">
              <h2 className="font-semibold text-fg">{t('habits.pausesTitle')}</h2>
              <ul className="flex flex-col gap-1.5">
                {habit.pauses.map((p, i) => (
                  <li key={`${p.from}-${i}`} className="flex items-center gap-2 text-sm">
                    <Pause className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 text-fg">
                      {formatDateKey(p.from, settings.locale)} – {p.to ? formatDateKey(p.to, settings.locale) : t('habits.untilResume')}
                      {p.label && <span className="text-muted"> · {p.label}</span>}
                    </span>
                    <IconButton label={t('habits.removePause')} icon={<X className="h-4 w-4" />} onClick={() => setConfirmPause(i)} />
                  </li>
                ))}
              </ul>
            </Surface>
          )}
          {habit.notes && (
            <Surface className="flex flex-col gap-2">
              <h2 className="font-semibold text-fg">{t('habits.fields.notes')}</h2>
              <p className="whitespace-pre-wrap text-sm text-fg">{habit.notes}</p>
            </Surface>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmPause !== null}
        title={t('habits.removePauseTitle')}
        body={t('habits.removePauseBody')}
        confirmLabel={t('habits.removePause')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setConfirmPause(null)}
        onConfirm={() => {
          if (confirmPause !== null) void removePause(habit.id, confirmPause).then(() => toast.show(t('habits.pauseRemoved')));
          setConfirmPause(null);
        }}
      />
    </div>
  );
}

/* ---------- Calendário (um mês, com valores) ---------- */

function CalendarTab({ habit, data, onPick }: { habit: Habit; data: HabitsData; onPick: (d: DateKey) => void }) {
  const { t, settings } = useSettings();
  const names = useWeekdayNames();
  const label = useValueLabel();
  const today = todayKey();
  const [month, setMonth] = useState(() => startOfMonth(today));
  const logs = data.logsOf(habit.id);
  const grid = monthGrid(month, settings.weekStartsOn);
  const shift = (n: number) => {
    const d = new Date(`${month}T12:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  };
  return (
    <Surface className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => shift(-1)} aria-label={t('habits.prev')}>
          ‹
        </Button>
        <span className="min-w-40 text-center font-semibold text-fg">{capitalizeFirst(new Intl.DateTimeFormat(settings.locale, { month: 'long', year: 'numeric' }).format(new Date(`${month}T12:00`)))}</span>
        <Button size="sm" variant="secondary" onClick={() => shift(1)} disabled={month >= startOfMonth(today)} aria-label={t('habits.next')}>
          ›
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="text-center text-xs capitalize text-subtle">
            {names[(i + settings.weekStartsOn) % 7]}
          </span>
        ))}
        {grid.map((d) => {
          if (d.slice(0, 7) !== month.slice(0, 7)) return <span key={d} />;
          const log = logs.get(d);
          const state = dayState(habit, log, d, today);
          const look = dayLook(state, habit.color);
          const can = d <= today && d >= habit.startDate;
          const strong = state === 'met' || state === 'partial';
          const inner = (
            <>
              <span className={cn('text-xs font-semibold tabular', strong ? 'text-white' : d === today ? 'text-accent' : 'text-fg')}>{Number(d.slice(8))}</span>
              {log && habit.method !== 'check' && <span className={cn('truncate text-[0.625rem]', strong ? 'text-white/90' : 'text-muted')}>{label(habit, log.value)}</span>}
              {log?.note && <span className={cn('h-1 w-1 rounded-full', strong ? 'bg-white' : 'bg-muted')} aria-hidden />}
            </>
          );
          const cls = cn('flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl p-1', look.className, d === today && 'ring-2 ring-accent/60');
          return can ? (
            <button key={d} type="button" className={cn(cls, 'transition hover:brightness-110')} style={look.style} aria-label={formatDateKey(d, settings.locale, { day: 'numeric', month: 'long' })} onClick={() => onPick(d)}>
              {inner}
            </button>
          ) : (
            <span key={d} className={cls} style={look.style}>
              {inner}
            </span>
          );
        })}
      </div>
      <Legend />
    </Surface>
  );
}

/* ---------- Gráficos ---------- */

function Bars({ buckets, habit, max, format, labelOf }: { buckets: HabitBucket[]; habit: Habit; max: number; format: (v: number) => string; labelOf: (b: HabitBucket) => string }) {
  const top = Math.max(max, ...buckets.map((b) => b.value ?? 0), 1);
  return (
    <div className="flex h-44 items-end gap-1.5" role="img" aria-label={buckets.map((b) => `${labelOf(b)}: ${b.value === null ? '—' : format(b.value)}`).join('; ')}>
      {buckets.map((b) => (
        <div key={b.start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[0.625rem] tabular text-muted">{b.value ? format(b.value) : ''}</span>
          <span className="w-full rounded-t-md" style={{ height: `${((b.value ?? 0) / top) * 100}%`, minHeight: b.value ? 3 : 0, background: habit.color }} />
          <span className="w-full truncate text-center text-[0.625rem] text-subtle">{labelOf(b)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartsTab({ habit, data }: { habit: Habit; data: HabitsData }) {
  const { t, settings } = useSettings();
  const [unit, setUnit] = useState<'week' | 'month'>('week');
  const today = todayKey();
  const list = data.listOf(habit.id);
  const buckets = habitBuckets(habit.method, list, unit, 12, today, settings.weekStartsOn);
  const f = currentFrequency(habit);
  const fmt = (v: number) => (habit.method === 'duration' ? t('habits.minutes', { min: v }) : String(v));
  const labelOf = (b: HabitBucket) => (unit === 'week' ? formatDateKey(b.start, settings.locale) : new Intl.DateTimeFormat(settings.locale, { month: 'short' }).format(new Date(`${b.start}T12:00`)));
  const max = habit.method === 'scale' ? habit.scaleMax : habit.method === 'check' ? (unit === 'week' ? 7 : 31) : 0;
  const dist = habit.method === 'scale' ? Array.from({ length: habit.scaleMax }, (_, i) => list.filter((l) => l.value === i + 1).length) : [];
  const total = list.reduce((a, l) => a + l.value, 0);

  if (list.length === 0)
    return (
      <Surface tone="flat">
        <EmptyState title={t('habits.chartsEmptyTitle')} body={t('habits.chartsEmpty')} />
      </Surface>
    );
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-fg">{t(`habits.charts.title.${habit.method}`, { unit: habit.unit })}</h2>
          <Segmented<'week' | 'month'> label={t('habits.charts.group')} value={unit} onChange={setUnit} options={[{ value: 'week', label: t('habits.charts.weeks') }, { value: 'month', label: t('habits.charts.months') }]} />
        </div>
        <Bars buckets={buckets} habit={habit} max={max} format={fmt} labelOf={labelOf} />
        {f.period === 'week' && unit === 'week' && habit.method === 'check' && <p className="text-xs text-muted">{t('habits.charts.weekTarget', { times: f.times })}</p>}
      </Surface>
      <div className="grid gap-4 sm:grid-cols-2">
        {habit.method === 'scale' ? (
          <Surface className="flex flex-col gap-2">
            <h2 className="font-semibold text-fg">{t('habits.charts.distribution')}</h2>
            <ul className="flex flex-col gap-1.5">
              {dist.map((n, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-right font-medium tabular text-fg">{i + 1}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span className="block h-full rounded-full" style={{ width: `${(n / Math.max(1, ...dist)) * 100}%`, background: habit.color }} />
                  </span>
                  <span className="w-8 text-xs tabular text-muted">{n}</span>
                </li>
              ))}
            </ul>
          </Surface>
        ) : habit.method !== 'check' ? (
          <Stat label={t('habits.charts.total')} value={habit.method === 'duration' ? t('habits.hours', { h: Math.round((total / 60) * 10) / 10 }) : `${total} ${habit.unit}`.trim()} />
        ) : null}
        <Stat label={t('habits.charts.firstLog')} value={formatDateKey(list[list.length - 1]!.date, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })} />
      </div>
    </div>
  );
}

/* ---------- Histórico ---------- */

function HistoryTab({ habit, data, onPick }: { habit: Habit; data: HabitsData; onPick: (d: DateKey) => void }) {
  const { t, settings } = useSettings();
  const label = useValueLabel();
  const list = data.listOf(habit.id);
  const changes = useLiveQuery(() => habitHistory(habit.id), [habit.id, habit.rev]) ?? [];
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? list : list.slice(0, 60);
  const changeText = (note: string | undefined, action: string) => {
    if (action === 'create') return t('habits.history.created');
    if (action === 'delete') return t('habits.history.deleted');
    if (action === 'restore') return t('habits.history.restored');
    if (note?.startsWith('frequency:')) return t('habits.history.frequency');
    if (note === 'pause' || note === 'resume' || note === 'archive' || note === 'unarchive' || note === 'pause_removed') return t(`habits.history.${note}`);
    return t('habits.history.edited');
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Surface className="flex flex-col gap-2">
        <h2 className="font-semibold text-fg">{t('habits.logsTitle')}</h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted">{t('habits.noLogs')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/60">
            {shown.map((l) => (
              <li key={l.id}>
                <button type="button" className="flex w-full items-start gap-3 py-2 text-left hover:bg-surface-2/50" onClick={() => onPick(l.date)}>
                  <span className="w-28 shrink-0 text-sm text-muted">{formatDateKey(l.date, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-fg">{label(habit, l.value)}</span>
                    {l.note && <span className="block whitespace-pre-wrap text-sm text-muted">{l.note}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.length > shown.length && (
          <Button size="sm" variant="ghost" className="w-fit" onClick={() => setShowAll(true)}>
            {t('habits.showAll', { count: list.length })}
          </Button>
        )}
      </Surface>
      <Surface className="flex flex-col gap-2">
        <h2 className="font-semibold text-fg">{t('habits.changesTitle')}</h2>
        <ul className="flex flex-col gap-1.5">
          {changes.map((c) => (
            <li key={c.seq ?? c.at} className="text-sm">
              <span className="text-fg">{changeText(c.note, c.action)}</span>
              <span className="block text-xs text-muted">{new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(c.at))}</span>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}

/* ---------- Pausar ---------- */

function PauseDialog({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [mode, setMode] = useState<'open' | 'range'>('open');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const [label, setLabel] = useState('');
  const save = async () => {
    try {
      if (mode === 'open') await pauseHabit(habit.id, label);
      else await addPause(habit.id, from, to, label);
      toast.show(t('habits.pausedToast'));
      onClose();
    } catch {
      toast.show(t('habits.errors.pauseRange'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('habits.pauseTitle')}
      description={t('habits.pauseHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('habits.pause')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented<'open' | 'range'> label={t('habits.pauseTitle')} value={mode} onChange={setMode} options={[{ value: 'open', label: t('habits.pauseOpen') }, { value: 'range', label: t('habits.pauseRange') }]} />
        {mode === 'range' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('habits.fields.from')}>{(id) => <Input id={id} type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />}</Field>
            <Field label={t('habits.fields.to')}>{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />}</Field>
          </div>
        )}
        <Field label={t('habits.fields.pauseLabel')} optionalLabel={t('common.optional')}>
          {(id) => <Input id={id} value={label} maxLength={80} placeholder={t('habits.pauseLabelPlaceholder')} onChange={(e) => setLabel(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
