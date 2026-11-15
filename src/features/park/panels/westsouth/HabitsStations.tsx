import { useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Pause, PenLine, Play, Plus } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { moveHabit, pauseHabit, resumeHabit, setHabitArchived } from '@/data/habitsRepo';
import { addDays, formatDateKey, todayKey, weekday, type DateKey } from '@/domain/dates';
import { consistency, currentFrequency, dayState, habitPeriods, openPause, todayStatus, type Habit } from '@/domain/habits';
import { habitsInsights } from '@/domain/insights';
import { dayLook, HabitDialog, Heatmap, Legend, LogDialog, QuickLog, useFrequencyLabel, useValueLabel, useWeekdayNames } from '@/features/habits/habitsUi';
import { useHabits, type HabitsData } from '@/features/habits/useHabits';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { Meter, PeriodSwitch, Readout, Row, Screen, SectionTitle, Station, usePeriodRange, type Period } from './station';

/*
 * Estufa de Hábitos: os mesmos hábitos e registros do Control Room (useHabits + habitsRepo). Os
 * controles de registro (QuickLog, LogDialog) e o formulário (HabitDialog) são os do próprio módulo.
 */

type LogTarget = { habit: Habit; date: DateKey } | null;

function categoriesOf(data: HabitsData): string[] {
  return [...new Set([...data.habits, ...data.archived].map((h) => h.category).filter(Boolean))].sort();
}

function LogFor({ data, target, onClose }: { data: HabitsData; target: LogTarget; onClose: () => void }) {
  if (!target) return null;
  const logs = data.logsOf(target.habit.id);
  return <LogDialog habit={target.habit} date={target.date} log={logs.get(target.date)} logs={logs} onClose={onClose} />;
}

/* ---------- Átrio de Crescimento: a estação de hábitos de hoje ---------- */

export function HabitsTodayStation() {
  const { t, settings } = useSettings();
  const data = useHabits();
  const freq = useFrequencyLabel();
  const [logFor, setLogFor] = useState<LogTarget>(null);
  const [creating, setCreating] = useState(false);
  const today = todayKey();
  const rows = data.habits.map((h) => ({ h, st: todayStatus(h, data.logsOf(h.id), today, settings.weekStartsOn) }));
  const due = rows.filter((r) => r.st.due);
  const rest = rows.filter((r) => !r.st.due);

  const row = ({ h, st }: (typeof rows)[number]) => {
    const paused = !!openPause(h) || h.startDate > today;
    const f = currentFrequency(h);
    return (
      <Row key={h.id} color={h.color} className="flex-wrap">
        <div className="min-w-0 flex-1 basis-36">
          <div className="truncate text-sm font-medium text-fg">{h.name}</div>
          <div className="text-xs text-muted">
            {freq(f, h)}
            {(f.period === 'week' || f.period === 'month' || f.period === 'year') && st.expected > 0 && ` · ${t(`habits.periodProgress.${f.period}`, { done: Math.min(st.achieved, st.expected), total: st.expected })}`}
            {paused && ` · ${h.startDate > today ? t('habits.startsOn', { date: formatDateKey(h.startDate, settings.locale) }) : t('habits.paused')}`}
          </div>
        </div>
        {!paused && <QuickLog habit={h} log={data.logsOf(h.id).get(today)} date={today} onOpen={() => setLogFor({ habit: h, date: today })} />}
      </Row>
    );
  };

  return (
    <Station building="habits" name={t('park.native.westsouth.habits.station')} hint={t('habits.philosophy')}>
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <>
          <Screen building="habits" className="grid grid-cols-2 gap-2">
            <Readout value={due.length} label={t('park.native.westsouth.habits.dueToday')} />
            <Readout value={rows.filter((r) => r.st.loggedToday).length} label={t('park.native.westsouth.habits.loggedToday')} />
          </Screen>
          {data.habits.length === 0 ? (
            <p className="text-sm text-muted">{data.archived.length > 0 ? t('habits.allArchived') : t('habits.empty')}</p>
          ) : (
            <>
              <SectionTitle>{t('habits.todayTitle', { count: due.length })}</SectionTitle>
              {due.length === 0 ? <p className="text-sm text-muted">{t('habits.nothingToday')}</p> : <ul className="flex flex-col gap-2">{due.map(row)}</ul>}
              {rest.length > 0 && (
                <>
                  <SectionTitle>{t('habits.otherTitle')}</SectionTitle>
                  <ul className="flex flex-col gap-2">{rest.map(row)}</ul>
                </>
              )}
            </>
          )}
          <Button variant="secondary" size="sm" className="self-start" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            {t('habits.new')}
          </Button>
        </>
      )}
      <LogFor data={data} target={logFor} onClose={() => setLogFor(null)} />
      {creating && <HabitDialog categories={categoriesOf(data)} onClose={() => setCreating(false)} />}
    </Station>
  );
}

/* ---------- Estufa: laboratório de rotinas (semana, organizar, pausar, arquivar) ---------- */

export function HabitsLabStation() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const data = useHabits();
  const freq = useFrequencyLabel();
  const names = useWeekdayNames();
  const [logFor, setLogFor] = useState<LogTarget>(null);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const fail = () => toast.show(t('errors.saveFailed'), 'error');

  return (
    <Station building="habits" name={t('park.native.westsouth.habits.labStation')} hint={t('park.native.westsouth.habits.labHint')}>
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : data.habits.length === 0 ? (
        <p className="text-sm text-muted">{data.archived.length > 0 ? t('habits.allArchived') : t('habits.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.habits.map((h, i) => {
            const pause = openPause(h);
            return (
              <li key={h.id} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
                <div className="flex items-center gap-2">
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: h.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">{h.name}</div>
                    <div className="truncate text-xs text-muted">
                      {freq(currentFrequency(h), h)}
                      {pause && ` · ${t('habits.paused')}`}
                    </div>
                  </div>
                  <IconButton size="sm" label={t('common.moveUp')} icon={<ChevronUp className="h-4 w-4" />} disabled={i === 0} onClick={() => void moveHabit(h.id, -1).catch(fail)} />
                  <IconButton size="sm" label={t('common.moveDown')} icon={<ChevronDown className="h-4 w-4" />} disabled={i === data.habits.length - 1} onClick={() => void moveHabit(h.id, 1).catch(fail)} />
                </div>
                <div className="grid grid-cols-7 gap-1" role="group" aria-label={h.name}>
                  {days.map((d) => {
                    const log = data.logsOf(h.id).get(d);
                    const look = dayLook(dayState(h, log, d, today), h.color);
                    const label = `${h.name} · ${formatDateKey(d, settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })}`;
                    const clickable = d >= h.startDate;
                    return (
                      <div key={d} className="flex flex-col items-center gap-0.5">
                        <span className={cn('text-[0.625rem] capitalize', d === today ? 'font-semibold text-fg' : 'text-subtle')}>{names[weekday(d)]}</span>
                        {clickable ? (
                          <button type="button" aria-label={label} title={label} className={cn('h-8 w-full rounded-lg transition hover:ring-2 hover:ring-accent/50', look.className)} style={look.style} onClick={() => setLogFor({ habit: h, date: d })} />
                        ) : (
                          <span title={label} className={cn('h-8 w-full rounded-lg', look.className)} style={look.style} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pause ? (
                    <Button size="sm" variant="secondary" icon={<Play className="h-4 w-4" />} onClick={() => void resumeHabit(h.id).then(() => toast.show(t('habits.resumed')), fail)}>
                      {t('habits.resume')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" icon={<Pause className="h-4 w-4" />} onClick={() => void pauseHabit(h.id, '').then(() => toast.show(t('habits.pausedToast')), fail)}>
                      {t('habits.pause')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<PenLine className="h-4 w-4" />} onClick={() => setEditing(h)}>
                    {t('habits.edit')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => void setHabitArchived(h.id, true).catch(fail)}>
                    {t('habits.archive')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!data.loading && data.habits.length > 0 && <Legend />}
      {data.archived.length > 0 && (
        <>
          <Button size="sm" variant="ghost" className="self-start" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
            {t('habits.archivedTitle', { count: data.archived.length })}
          </Button>
          {showArchived && (
            <ul className="flex flex-col gap-2">
              {data.archived.map((h) => (
                <Row key={h.id} color={h.color}>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{h.name}</span>
                  <Button size="sm" variant="secondary" icon={<ArchiveRestore className="h-4 w-4" />} onClick={() => void setHabitArchived(h.id, false).catch(fail)}>
                    {t('habits.unarchive')}
                  </Button>
                </Row>
              ))}
            </ul>
          )}
        </>
      )}
      <LogFor data={data} target={logFor} onClose={() => setLogFor(null)} />
      {editing && <HabitDialog habit={editing} hasLogs={data.listOf(editing.id).length > 0} categories={categoriesOf(data)} onClose={() => setEditing(null)} />}
    </Station>
  );
}

/* ---------- Galeria de Evolução: calendário de consistência de um hábito ---------- */

export function HabitsEvolutionStation() {
  const { t, settings } = useSettings();
  const data = useHabits();
  const label = useValueLabel();
  const [picked, setPicked] = useState<string>('');
  const [logFor, setLogFor] = useState<LogTarget>(null);
  const today = todayKey();
  const all = [...data.habits, ...data.archived];
  const habit = all.find((h) => h.id === picked) ?? all[0];

  if (data.loading) return <Station building="habits" name={t('park.native.westsouth.habits.evolutionStation')}><p className="text-sm text-muted">{t('common.loading')}</p></Station>;
  if (!habit)
    return (
      <Station building="habits" name={t('park.native.westsouth.habits.evolutionStation')}>
        <p className="text-sm text-muted">{t('habits.empty')}</p>
      </Station>
    );

  const logs = data.logsOf(habit.id);
  const ratio = (days: number) => consistency(habitPeriods(habit, logs, addDays(today, -(days - 1)), today, today, settings.weekStartsOn));
  const c30 = ratio(30);
  const c90 = ratio(90);
  const recent = data.listOf(habit.id).slice(0, 6);

  return (
    <Station building="habits" name={t('park.native.westsouth.habits.evolutionStation')} to={`/habits/${habit.id}`}>
      <Select aria-label={t('habits.habit')} value={habit.id} onChange={(e) => setPicked(e.target.value)}>
        {all.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </Select>
      <Screen building="habits" className="grid grid-cols-2 gap-2">
        <Readout value={c30.total ? t('habits.ratio', { met: c30.met, total: c30.total }) : '—'} label={t('habits.stats.last30')} />
        <Readout value={c90.total ? t('habits.ratio', { met: c90.met, total: c90.total }) : '—'} label={t('habits.stats.last90')} />
      </Screen>
      <SectionTitle>{t('park.native.westsouth.habits.calendar')}</SectionTitle>
      <Heatmap habit={habit} logs={logs} from={addDays(today, -7 * 17)} to={today} onPick={(d) => setLogFor({ habit, date: d })} />
      <Legend />
      <p className="text-xs text-muted">{t('habits.consistencyHint')}</p>
      <SectionTitle>{t('park.native.westsouth.habits.recentLogs')}</SectionTitle>
      {recent.length === 0 ? (
        <p className="text-sm text-muted">{t('park.native.westsouth.habits.noLogs')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {recent.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setLogFor({ habit, date: l.date })} className="flex w-full items-start gap-3 rounded-lg bg-surface-2 px-3 py-2 text-left text-sm hover:bg-surface-3">
                <span className="w-16 shrink-0 text-xs text-muted">{formatDateKey(l.date, settings.locale)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-fg">{label(habit, l.value)}</span>
                  {l.note && <span className="block line-clamp-2 text-xs text-muted">{l.note}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <LogFor data={data} target={logFor} onClose={() => setLogFor(null)} />
    </Station>
  );
}

/* ---------- Análise: consistência de todos os hábitos no período ---------- */

export function HabitsAnalysisStation() {
  const { t, settings } = useSettings();
  const data = useHabits();
  const [period, setPeriod] = useState<Period>('week');
  const range = usePeriodRange(period);
  const today = todayKey();
  const all = [...data.habits, ...data.archived];
  const logs = all.flatMap((h) => data.listOf(h.id));
  const ins = habitsInsights(all, logs, range, today, settings.weekStartsOn);
  const counted = ins.rows.filter((r) => r.consistency.total > 0);
  const met = counted.reduce((a, r) => a + r.consistency.met, 0);
  const total = counted.reduce((a, r) => a + r.consistency.total, 0);

  return (
    <Station building="habits" name={t('park.native.westsouth.habits.analysisStation')} hint={t('habits.consistencyHint')}>
      <PeriodSwitch value={period} onChange={setPeriod} />
      <p className="text-xs text-muted">
        {formatDateKey(range.from, settings.locale)} – {formatDateKey(range.to, settings.locale)}
      </p>
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : !ins.has ? (
        <p className="text-sm text-muted">{t('habits.empty')}</p>
      ) : (
        <>
          <Screen building="habits" className="grid grid-cols-2 gap-2">
            <Readout value={ins.logs} label={t('park.native.westsouth.habits.logsInPeriod')} />
            <Readout value={total ? t('habits.ratio', { met, total }) : '—'} label={t('park.native.westsouth.habits.periodsMet')} />
          </Screen>
          <ul className="flex flex-col gap-2">
            {ins.rows.map((r) => (
              <Row key={r.habit.id} color={r.habit.color}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-fg">{r.habit.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{r.consistency.total ? t('habits.ratio', { met: r.consistency.met, total: r.consistency.total }) : t('park.native.westsouth.habits.nothingClosed')}</span>
                  </div>
                  {r.consistency.total > 0 && <Meter percent={(r.consistency.met / r.consistency.total) * 100} building="habits" className="mt-1.5" />}
                  <div className="mt-1 text-xs text-muted">{t('park.native.westsouth.habits.logsCount', { count: r.logs })}</div>
                </div>
              </Row>
            ))}
          </ul>
        </>
      )}
    </Station>
  );
}
