import { useMemo, type ReactNode } from 'react';
import { CalendarPlus, Check, TriangleAlert } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createEvent, EventRuleError } from '@/data/eventsRepo';
import { addDays, addMonths, addYears, capitalizeFirst, formatDateKey, monthGrid, startOfMonth, startOfWeek, todayKey, type DateKey } from '@/domain/dates';
import { coversDay, daysOf, emptyEventInput, fromMinutes, toMinutes } from '@/domain/events';
import { isClosedKind, statusKind, type Task } from '@/domain/tasks';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { toneLook, useCalendarData, useCategoryName, type CalendarData, type CalendarItem } from '@/features/calendar/useCalendarData';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { Button } from '@/ui/Button';
import { Input, Select } from '@/ui/Field';
import { LoadingState } from '@/ui/States';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import type { CalendarSector } from '../../interiors/east';
import { Chips, Empty, PeriodNav, SectionTitle, Stat, Station, rowClass, useStationMemory } from './station';

/**
 * Estações do Observatório Temporal. Leem os mesmos itens do Calendar (useCalendarData: eventos,
 * tarefas com prazo, marcos, provas, hábitos, objetivos…) e criam eventos com o mesmo eventsRepo.
 * Conflitos de horário só são apontados, nunca resolvidos sozinhos. Tocar um evento abre o mesmo
 * editor de evento do app (editar, recorrência, excluir) por cima do Campus.
 */
export function CalendarStations({ id }: { id: CalendarSector }) {
  const { t } = useSettings();
  const plate = t(`park.native.east.calendar.plates.${id}`);
  const body =
    id === 'atrium' ? <Atrium /> : id === 'daily' ? <Daily /> : id === 'agenda' ? <Agenda /> : id === 'weekly' ? <Weekly /> : id === 'monthly' ? <Monthly /> : id === 'calendars' ? <Year /> : <Planning />;
  return (
    <Station building="calendar" plate={plate} to="/calendar">
      {body}
    </Station>
  );
}

const ALL = { showTasks: true, categoryId: null } as const;

/** Módulo de onde vem cada item que não é evento (a legenda do item). */
const KIND_MODULE = { event: 'calendar', task: 'tasks', milestone: 'projects', assessment: 'academy', study: 'academy', habit: 'habits', goal: 'goals', sport: 'sports', language: 'languages', focus: 'focus' } as const;

function ItemLine({ item, toggle, showDate }: { item: CalendarItem; toggle: (task: Task) => void; showDate?: boolean }) {
  const { t, settings } = useSettings();
  const events = useEventEditor();
  const tasks = useTaskEditor();
  const dot = toneLook(item.tone, item.color).dot;
  const occ = item.occurrence;
  const task = item.task;
  const open = item.kind === 'event' && occ ? () => events.openEvent(occ.event.id, occ.seriesDate) : task ? () => tasks.openTask(task.id) : null;
  const time = item.allDay || item.start === null ? t('calendar.allDay') : `${fromMinutes(item.start)}${item.end !== null ? `–${fromMinutes(item.end)}` : ''}`;
  const when = showDate || item.endDate !== item.date ? `${formatDateKey(item.date, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}${item.endDate !== item.date ? ` – ${formatDateKey(item.endDate, settings.locale)}` : ''} · ` : '';
  const kind = item.kind === 'event' ? null : item.kind === 'task' ? t('calendar.kindTask') : t(`modules.${KIND_MODULE[item.kind]}`);
  return (
    <li className={cn(rowClass, 'flex items-start gap-2.5')}>
      {task ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={item.done}
          aria-label={t(item.done ? 'tasks.reopen' : 'tasks.markDone', { title: task.title })}
          onClick={() => toggle(task)}
          className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2 ring-inset', item.done ? 'bg-success text-white ring-success' : 'ring-line hover:ring-accent')}
        >
          {item.done && <Check className="h-3 w-3" aria-hidden />}
        </button>
      ) : (
        <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', dot.className)} style={dot.style} aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        {open ? (
          <button type="button" onClick={open} className={cn('block w-full truncate text-left text-sm hover:text-accent', item.done ? 'text-muted line-through' : 'text-fg')}>
            {item.title}
          </button>
        ) : (
          <span className={cn('block truncate text-sm', item.done ? 'text-muted line-through' : 'text-fg')}>{item.title}</span>
        )}
        <span className="block truncate text-xs text-muted">
          {when}
          {time}
          {item.location ? ` · ${item.location}` : ''}
          {kind ? ` · ${kind}` : ''}
        </span>
        {item.conflictWith.length > 0 && (
          <span className="mt-1 flex items-start gap-1 text-xs text-warning">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('calendar.conflictWith', { titles: item.conflictWith.join(', ') })}
          </span>
        )}
      </div>
    </li>
  );
}

function Items({ items, toggle, empty, showDate }: { items: CalendarItem[]; toggle: (task: Task) => void; empty: string; showDate?: boolean }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((i) => (
        <ItemLine key={i.key} item={i} toggle={toggle} showDate={showDate} />
      ))}
    </ul>
  );
}

const conflictCount = (items: CalendarItem[]) => items.filter((i) => i.conflictWith.length > 0).length;

/** Os itens que tocam um dia (eventos de vários dias também). */
const onDay = (items: CalendarItem[], day: DateKey) => items.filter((i) => coversDay(i, day));

/** Carrega o período e entrega os itens (já com conflitos marcados) e o "concluir" das tarefas. */
function usePeriod(from: DateKey, to: DateKey) {
  const cal = useCalendarData({ from, to });
  const actions = useTaskActions(cal.tasks);
  const items = useMemo(() => cal.itemsInRange(from, to, ALL), [cal, from, to]);
  return { cal, items, toggle: actions.toggle, dialogs: actions.dialogs };
}

/* ---------- Agenda rápida: criar um evento sem sair da estação ---------- */

interface QuickDraft {
  title: string;
  time: string;
  duration: number;
  allDay: boolean;
  categoryId: string;
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180] as const;

function QuickEvent({ cal, date, onDate }: { cal: CalendarData; date: DateKey; onDate: (d: DateKey) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const events = useEventEditor();
  const categoryName = useCategoryName();
  const [draft, setDraft] = useStationMemory<QuickDraft>('calendar.quick', () => ({ title: '', time: '09:00', duration: 60, allDay: false, categoryId: 'appointment' }));
  const set = (p: Partial<QuickDraft>) => setDraft((d) => ({ ...d, ...p }));
  const categories = cal.config.categories;
  const categoryId = categories.some((c) => c.id === draft.categoryId) ? draft.categoryId : (categories[0]?.id ?? 'other');
  const create = async () => {
    const title = draft.title.trim();
    if (!title || !date) return;
    // Conflito só é avisado (o compromisso é criado como você pediu).
    const start = toMinutes(draft.time);
    const clash = draft.allDay
      ? []
      : cal
          .itemsInRange(date, date, { showTasks: false, categoryId: null })
          .filter((i) => i.kind === 'event' && i.start !== null && i.end !== null && i.start < start + draft.duration && i.end > start)
          .map((i) => i.title);
    try {
      await createEvent(emptyEventInput({ title, start: date, endDate: date, allDay: draft.allDay, startTime: draft.allDay ? null : draft.time, durationMin: draft.duration, categoryId }));
      set({ title: '' });
      toast.show(t('calendar.editor.created'), 'success');
      if (clash.length) toast.show(`${t('calendar.conflictWith', { titles: clash.join(', ') })} ${t('calendar.conflictHint')}`, 'info');
    } catch (e) {
      toast.show(e instanceof EventRuleError ? t('calendar.editor.invalid') : t('errors.saveFailed'), 'error');
    }
  };
  return (
    <form
      className="flex flex-col gap-2 rounded-xl bg-surface-2/60 p-3 ring-1 ring-inset ring-line/60"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <Input aria-label={t('calendar.editor.titleLabel')} placeholder={t('calendar.editor.titlePlaceholder')} value={draft.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('calendar.editor.date')}
          <Input type="date" required value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('calendar.editor.category')}
          <Select value={categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c)}
              </option>
            ))}
          </Select>
        </label>
        {!draft.allDay && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('calendar.editor.startTime')}
              <Input type="time" required value={draft.time} onChange={(e) => e.target.value && set({ time: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('park.native.east.calendar.duration')}
              <Select value={draft.duration} onChange={(e) => set({ duration: Number(e.target.value) })}>
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : `${m / 60} h`}
                  </option>
                ))}
              </Select>
            </label>
          </>
        )}
      </div>
      <Switch checked={draft.allDay} onChange={(v) => set({ allDay: v })} label={t('calendar.editor.allDay')} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" className="flex-1" icon={<CalendarPlus className="h-4 w-4" />} disabled={!draft.title.trim()}>
          {t('calendar.editor.create')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => events.newEvent({ start: date, endDate: date, title: draft.title.trim() })}>
          {t('park.native.east.calendar.fullEditor')}
        </Button>
      </div>
    </form>
  );
}

/* ---------- Átrio: hoje e os próximos dias ---------- */

function Atrium() {
  const { t } = useSettings();
  const today = todayKey();
  const { cal, items, toggle, dialogs } = usePeriod(today, addDays(today, 7));
  const [date, setDate] = useStationMemory<DateKey>('calendar.atrium.date', () => today);
  if (cal.loading) return <LoadingState label={t('common.loading')} lines={3} />;
  const todays = onDay(items, today);
  const next = items.filter((i) => i.date > today && i.kind === 'event');
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat value={todays.length} label={t('park.native.east.calendar.today')} />
        <Stat value={conflictCount(todays)} label={t('park.native.east.calendar.conflicts')} tone={conflictCount(todays) ? 'danger' : undefined} />
      </div>
      <SectionTitle>{t('calendar.today')}</SectionTitle>
      <Items items={todays} toggle={toggle} empty={t('calendar.noEvents')} />
      <SectionTitle>{t('park.native.east.calendar.nextDays')}</SectionTitle>
      <Items items={next.slice(0, 12)} toggle={toggle} empty={t('park.native.east.calendar.noneNext')} showDate />
      <SectionTitle>{t('park.native.east.calendar.quickAdd')}</SectionTitle>
      <QuickEvent cal={cal} date={date} onDate={setDate} />
      {dialogs}
    </>
  );
}

/* ---------- Sala Diária: um dia, hora a hora ---------- */

function Daily() {
  const { t, settings } = useSettings();
  const today = todayKey();
  const [day, setDay] = useStationMemory<DateKey>('calendar.day', () => today);
  const { cal, items, toggle, dialogs } = usePeriod(day, day);
  const list = onDay(items, day);
  const allDay = list.filter((i) => i.allDay || i.start === null);
  const timed = list.filter((i) => !(i.allDay || i.start === null));
  const busy = timed.reduce((n, i) => n + Math.max(0, (i.end ?? 0) - (i.start ?? 0)), 0);
  return (
    <>
      <PeriodNav title={capitalizeFirst(formatDateKey(day, settings.locale, { weekday: 'long', day: 'numeric', month: 'long' }))} onPrev={() => setDay(addDays(day, -1))} onNext={() => setDay(addDays(day, 1))} onToday={() => setDay(today)} />
      {cal.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : (
        <>
          {timed.length > 0 && <p className="text-xs text-muted">{t('park.native.east.calendar.dayLoad', { count: timed.length, hours: (busy / 60).toLocaleString(settings.locale, { maximumFractionDigits: 1 }) })}</p>}
          {allDay.length > 0 && (
            <>
              <SectionTitle>{t('calendar.allDay')}</SectionTitle>
              <Items items={allDay} toggle={toggle} empty="" />
            </>
          )}
          <SectionTitle>{t('park.native.east.calendar.hours')}</SectionTitle>
          <Items items={timed} toggle={toggle} empty={allDay.length ? t('park.native.east.calendar.noTimed') : t('calendar.noEvents')} />
          <SectionTitle>{t('park.native.east.calendar.quickAdd')}</SectionTitle>
          <QuickEvent cal={cal} date={day} onDate={setDay} />
        </>
      )}
      {dialogs}
    </>
  );
}

/* ---------- Galeria de Agenda: próximos e passados ---------- */

function Agenda() {
  const { t, settings } = useSettings();
  const today = todayKey();
  const [side, setSide] = useStationMemory<'next' | 'past'>('calendar.agenda', () => 'next');
  const from = side === 'next' ? today : addDays(today, -14);
  const to = side === 'next' ? addDays(today, 13) : addDays(today, -1);
  const { cal, items, toggle, dialogs } = usePeriod(from, to);
  // Hábitos repetem todo dia: na agenda ficam só os compromissos e prazos.
  const shown = items.filter((i) => i.kind !== 'habit');
  const days = daysOf(from, to).filter((d) => onDay(shown, d).length > 0);
  if (side === 'past') days.reverse();
  return (
    <>
      <Chips
        label={t('calendar.views.agenda')}
        value={side}
        onChange={setSide}
        options={[
          { value: 'next', label: t('park.native.east.calendar.next14') },
          { value: 'past', label: t('park.native.east.calendar.past14') },
        ]}
      />
      {cal.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : days.length === 0 ? (
        <Empty>{side === 'next' ? t('park.native.east.calendar.noneNext14') : t('park.native.east.calendar.nonePast14')}</Empty>
      ) : (
        days.map((d) => (
          <section key={d} className="flex flex-col gap-1.5">
            <SectionTitle>{d === today ? t('calendar.today') : capitalizeFirst(formatDateKey(d, settings.locale, { weekday: 'long', day: 'numeric', month: 'short' }))}</SectionTitle>
            <Items items={onDay(shown, d)} toggle={toggle} empty="" />
          </section>
        ))
      )}
      {dialogs}
    </>
  );
}

/* ---------- Galeria Semanal ---------- */

function Weekly() {
  const { t, settings } = useSettings();
  const today = todayKey();
  const [anchor, setAnchor] = useStationMemory<DateKey>('calendar.week', () => today);
  const from = startOfWeek(anchor, settings.weekStartsOn);
  const to = addDays(from, 6);
  const { cal, items, toggle, dialogs } = usePeriod(from, to);
  const title = `${formatDateKey(from, settings.locale)} – ${formatDateKey(to, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const conflicts = conflictCount(items);
  return (
    <>
      <PeriodNav title={title} onPrev={() => setAnchor(addDays(from, -7))} onNext={() => setAnchor(addDays(from, 7))} onToday={() => setAnchor(today)} />
      {cal.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : (
        <>
          <p className="text-xs text-muted">
            {t('park.native.east.calendar.weekCount', { count: items.filter((i) => i.kind === 'event').length })}
            {conflicts > 0 ? ` · ${t('park.native.east.calendar.weekConflicts', { count: conflicts })}` : ''}
          </p>
          {daysOf(from, to).map((d) => (
            <DayBlock key={d} day={d} today={today} items={onDay(items, d)} toggle={toggle} />
          ))}
        </>
      )}
      {dialogs}
    </>
  );
}

function DayBlock({ day, today, items, toggle }: { day: DateKey; today: DateKey; items: CalendarItem[]; toggle: (task: Task) => void }) {
  const { t, settings } = useSettings();
  return (
    <section className="flex flex-col gap-1.5">
      <SectionTitle>
        <span className={cn(day === today && 'text-accent')}>{capitalizeFirst(formatDateKey(day, settings.locale, { weekday: 'long', day: 'numeric' }))}</span>
      </SectionTitle>
      <Items items={items} toggle={toggle} empty={t('calendar.noEvents')} />
    </section>
  );
}

/* ---------- Sala Mensal: a grade do mês com as contagens reais ---------- */

function Monthly() {
  const { t, settings } = useSettings();
  const today = todayKey();
  const [anchor, setAnchor] = useStationMemory<DateKey>('calendar.month', () => startOfMonth(today));
  const [picked, setPicked] = useStationMemory<DateKey>('calendar.month.day', () => today);
  const grid = monthGrid(anchor, settings.weekStartsOn);
  const from = grid[0] ?? anchor;
  const to = grid[grid.length - 1] ?? anchor;
  const { cal, items, toggle, dialogs } = usePeriod(from, to);
  const month = anchor.slice(0, 7);
  const shown = items.filter((i) => i.kind !== 'habit');
  const go = (n: number) => {
    const next = startOfMonth(addMonths(anchor, n));
    setAnchor(next);
    setPicked(next);
  };
  return (
    <>
      <PeriodNav
        title={capitalizeFirst(formatDateKey(anchor, settings.locale, { month: 'long', year: 'numeric' }))}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onToday={() => {
          setAnchor(startOfMonth(today));
          setPicked(today);
        }}
      />
      {cal.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label={t('calendar.views.month')}>
            {grid.slice(0, 7).map((d) => (
              <span key={`h${d}`} className="text-[0.6875rem] font-semibold uppercase text-subtle" aria-hidden>
                {formatDateKey(d, settings.locale, { weekday: 'narrow' })}
              </span>
            ))}
            {grid.map((d) => {
              const n = onDay(shown, d).length;
              const inMonth = d.startsWith(month);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={picked === d}
                  aria-label={`${formatDateKey(d, settings.locale, { day: 'numeric', month: 'long' })}: ${t('park.native.east.calendar.itemsCount', { count: n })}`}
                  onClick={() => setPicked(d)}
                  className={cn(
                    'flex h-10 flex-col items-center justify-center rounded-lg text-xs ring-1 ring-inset transition',
                    picked === d ? 'bg-accent/15 text-accent ring-accent/40' : 'ring-transparent hover:bg-surface-2',
                    !inMonth && picked !== d && 'text-subtle opacity-60',
                    d === today && picked !== d && 'font-bold text-accent',
                  )}
                >
                  {Number(d.slice(8))}
                  <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', n > 0 ? 'bg-accent' : 'bg-transparent')} aria-hidden />
                </button>
              );
            })}
          </div>
          <SectionTitle>{capitalizeFirst(formatDateKey(picked, settings.locale, { weekday: 'long', day: 'numeric', month: 'long' }))}</SectionTitle>
          <Items items={onDay(shown, picked)} toggle={toggle} empty={t('calendar.noEvents')} />
        </>
      )}
      {dialogs}
    </>
  );
}

/* ---------- Sala Anual: o ano mês a mês ---------- */

const YEAR_KINDS: ReadonlyArray<CalendarItem['kind']> = ['event', 'milestone', 'assessment', 'goal'];

function Year() {
  const { t, settings } = useSettings();
  const today = todayKey();
  const [year, setYear] = useStationMemory<DateKey>('calendar.year', () => `${today.slice(0, 4)}-01-01`);
  const [month, setMonth] = useStationMemory<string>('calendar.year.month', () => today.slice(0, 7));
  const from = year;
  const to = `${year.slice(0, 4)}-12-31`;
  const { cal, items, toggle, dialogs } = usePeriod(from, to);
  // No ano: compromissos, marcos, avaliações e prazos de objetivos (sem os hábitos de todo dia).
  const big = items.filter((i) => YEAR_KINDS.includes(i.kind));
  const months = Array.from({ length: 12 }, (_, m) => `${year.slice(0, 4)}-${String(m + 1).padStart(2, '0')}`);
  const inMonth = (m: string) => big.filter((i) => i.date.startsWith(m) || (i.date < `${m}-01` && i.endDate >= `${m}-01`));
  const go = (n: number) => {
    const next = addYears(year, n);
    setYear(next);
    setMonth(next.slice(0, 7));
  };
  return (
    <>
      <PeriodNav title={year.slice(0, 4)} onPrev={() => go(-1)} onNext={() => go(1)} />
      {cal.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {months.map((m) => {
              const n = inMonth(m).length;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={month === m}
                  onClick={() => setMonth(m)}
                  className={cn('flex flex-col items-start rounded-xl px-2.5 py-2 text-left ring-1 ring-inset transition', month === m ? 'bg-accent/15 ring-accent/40' : 'bg-surface-2 ring-line/60 hover:bg-surface-3', m === today.slice(0, 7) && 'ring-2 ring-accent/60')}
                >
                  <span className="text-xs font-semibold text-fg">{capitalizeFirst(formatDateKey(`${m}-01`, settings.locale, { month: 'short' }))}</span>
                  <span className="text-xs tabular-nums text-muted">{t('park.native.east.calendar.itemsCount', { count: n })}</span>
                </button>
              );
            })}
          </div>
          <SectionTitle>{capitalizeFirst(formatDateKey(`${month}-01`, settings.locale, { month: 'long', year: 'numeric' }))}</SectionTitle>
          <Items items={inMonth(month)} toggle={toggle} empty={t('park.native.east.calendar.noneMonth')} showDate />
        </>
      )}
      {dialogs}
    </>
  );
}

/* ---------- Centro de Planejamento: a semana com Tasks e Projects ---------- */

function Planning() {
  const { t, settings } = useSettings();
  const today = todayKey();
  const from = startOfWeek(today, settings.weekStartsOn);
  const to = addDays(from, 6);
  const { cal, items, toggle, dialogs } = usePeriod(from, to);
  if (cal.loading) return <LoadingState label={t('common.loading')} lines={3} />;
  const tasks = items.filter((i) => i.kind === 'task');
  const links = items.filter((i) => i.kind === 'milestone' || i.kind === 'goal' || i.kind === 'assessment');
  const clashes = items.filter((i) => i.conflictWith.length > 0);
  const lateOpen = cal.tasks.active.filter((x) => x.dueDate && x.dueDate < from && !isClosedKind(statusKind(cal.tasks.config, x.statusId)) && !x.parentId).length;
  const section = (title: string, list: CalendarItem[], empty: string): ReactNode => (
    <>
      <SectionTitle>{`${title} · ${list.length}`}</SectionTitle>
      <Items items={list} toggle={toggle} empty={empty} showDate />
    </>
  );
  return (
    <>
      <p className="text-xs text-muted">{`${formatDateKey(from, settings.locale)} – ${formatDateKey(to, settings.locale)}`}</p>
      {section(t('park.native.east.calendar.clashes'), clashes, t('park.native.east.calendar.noClashes'))}
      {clashes.length > 0 && <p className="text-xs text-muted">{t('calendar.conflictHint')}</p>}
      {section(t('park.native.east.calendar.weekTasks'), tasks, t('park.native.east.calendar.noWeekTasks'))}
      {lateOpen > 0 && <p className="text-xs text-danger">{t('park.native.east.calendar.lateBefore', { count: lateOpen })}</p>}
      {section(t('park.native.east.calendar.weekLinks'), links, t('park.native.east.calendar.noWeekLinks'))}
      {dialogs}
    </>
  );
}
