import { useEffect, useRef } from 'react';
import { AlertTriangle, Check, ListTodo, MapPin, Plus, Repeat } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { addDays, formatDateKey, monthGrid, todayKey, type DateKey } from '@/domain/dates';
import { fromMinutes, layoutColumns } from '@/domain/events';
import { cn } from '@/ui/cn';
import { toneLook, type CalendarItem } from './useCalendarData';

export interface ViewHandlers {
  onOpen: (item: CalendarItem) => void;
  onNew: (date: DateKey, startMin?: number) => void;
  onPickDay: (date: DateKey) => void;
}

const HOUR_PX = 52;

/* ---------- Pedaço de item (mês, agenda, linha de dia inteiro) ---------- */

export function ItemChip({ item, onOpen, showTime = true }: { item: CalendarItem; onOpen: (i: CalendarItem) => void; showTime?: boolean }) {
  const { t } = useSettings();
  const look = toneLook(item.tone, item.color);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      style={item.kind === 'task' ? undefined : look.chip.style}
      title={item.conflictWith.length ? t('calendar.conflictWith', { titles: item.conflictWith.join(', ') }) : item.title}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-xs font-medium transition hover:brightness-110',
        item.kind === 'task' ? 'bg-transparent text-muted ring-1 ring-inset ring-violet/40' : look.chip.className,
        item.done && 'line-through opacity-60',
      )}
    >
      {item.kind === 'task' ? (
        <span className={cn('flex h-3 w-3 shrink-0 items-center justify-center rounded-full ring-1 ring-violet', item.done && 'bg-violet')} aria-hidden>
          {item.done && <Check className="h-2 w-2 text-white" />}
        </span>
      ) : (
        <span className={cn('h-2 w-2 shrink-0 rounded-full', look.dot.className)} style={look.dot.style} aria-hidden />
      )}
      {showTime && item.start !== null && <span className="shrink-0 tabular text-muted">{fromMinutes(item.start)}</span>}
      <span className="truncate">{item.title}</span>
      {item.conflictWith.length > 0 && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" aria-label={t('calendar.conflict')} />}
    </button>
  );
}

/* ---------- Mês ---------- */

export function MonthView({ anchor, items, handlers }: { anchor: DateKey; items: CalendarItem[]; handlers: ViewHandlers }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const days = monthGrid(anchor, settings.weekStartsOn);
  const labels = days.slice(0, 7).map((d) => formatDateKey(d, settings.locale, { weekday: 'short' }));
  const forDay = (d: DateKey) => items.filter((i) => d >= i.date && d <= i.endDate);

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[480px] grid-cols-7 overflow-hidden rounded-2xl ring-1 ring-line/70">
        {labels.map((w, i) => (
          <div key={i} className="bg-surface-2 px-2 py-2 text-center text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const list = forDay(d);
          const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
          return (
            <div key={d} className={cn('group min-h-[7.25rem] border-t border-line/50 p-1.5 [&:not(:nth-child(7n+1))]:border-l', inMonth ? 'bg-surface' : 'bg-surface-2/40')}>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handlers.onPickDay(d)}
                  aria-label={formatDateKey(d, settings.locale, { dateStyle: 'full' })}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular transition hover:bg-surface-3',
                    d === today ? 'bg-brand text-white hover:bg-brand' : inMonth ? 'text-fg' : 'text-subtle',
                  )}
                >
                  {Number(d.slice(8))}
                </button>
                <button
                  type="button"
                  aria-label={t('calendar.newEventOn', { date: formatDateKey(d, settings.locale, { dateStyle: 'long' }) })}
                  onClick={() => handlers.onNew(d)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-subtle opacity-0 transition hover:bg-surface-2 hover:text-fg focus:opacity-100 group-hover:opacity-100"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <ul className="mt-1 flex flex-col gap-0.5">
                {list.slice(0, 3).map((i) => (
                  <li key={i.key}>
                    <ItemChip item={i} onOpen={handlers.onOpen} />
                  </li>
                ))}
                {list.length > 3 && (
                  <li>
                    <button type="button" onClick={() => handlers.onPickDay(d)} className="px-1.5 text-[0.7rem] font-medium text-accent hover:underline">
                      {t('calendar.more', { count: list.length - 3 })}
                    </button>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Dia e semana (grade de horas) ---------- */

export function TimeGridView({ days, items, handlers }: { days: DateKey[]; items: CalendarItem[]; handlers: ViewHandlers }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const scroller = useRef<HTMLDivElement>(null);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Abre a grade perto das 7h (ou da hora atual, se for hoje).
  useEffect(() => {
    const target = days.includes(today) ? Math.max(0, nowMin - 90) : 7 * 60;
    scroller.current?.scrollTo({ top: (target / 60) * HOUR_PX });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  const cols = days.length;
  const gridCols = { gridTemplateColumns: `3.5rem repeat(${cols}, minmax(${cols > 1 ? '5.5rem' : '0'}, 1fr))` };

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-line/70">
      <div className="overflow-x-auto">
        <div style={{ minWidth: cols > 1 ? `${3.5 + cols * 5.5}rem` : undefined }}>
          {/* Cabeçalho */}
          <div className="grid border-b border-line/60 bg-surface-2" style={gridCols}>
            <div />
            {days.map((d) => (
              <button key={d} type="button" onClick={() => handlers.onPickDay(d)} className="flex flex-col items-center gap-0.5 border-l border-line/50 py-2">
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">{formatDateKey(d, settings.locale, { weekday: 'short' })}</span>
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular', d === today ? 'bg-brand text-white' : 'text-fg')}>
                  {Number(d.slice(8))}
                </span>
              </button>
            ))}
          </div>
          {/* Dia inteiro */}
          <div className="grid border-b border-line/60 bg-surface" style={gridCols}>
            <div className="px-1 py-1.5 text-right text-[0.65rem] leading-tight text-subtle">{t('calendar.allDay')}</div>
            {days.map((d) => (
              <div key={d} className="flex min-h-[2rem] flex-col gap-0.5 border-l border-line/50 p-1">
                {items
                  .filter((i) => i.allDay && d >= i.date && d <= i.endDate)
                  .map((i) => (
                    <ItemChip key={i.key} item={i} onOpen={handlers.onOpen} showTime={false} />
                  ))}
              </div>
            ))}
          </div>
          {/* Horas */}
          <div ref={scroller} className="max-h-[62vh] overflow-y-auto bg-surface">
            <div className="relative grid" style={{ ...gridCols, height: 24 * HOUR_PX }}>
              <div className="relative">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute right-2 -translate-y-1/2 text-[0.65rem] tabular text-subtle" style={{ top: h * HOUR_PX }}>
                    {h === 0 ? '' : fromMinutes(h * 60)}
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const timed = items.filter((i) => !i.allDay && i.date === d && i.start !== null);
                const layout = layoutColumns(timed.map((i) => ({ key: i.key, start: i.start!, end: Math.max(i.end!, i.start! + 20) })));
                return (
                  <div key={d} className="relative border-l border-line/50">
                    {Array.from({ length: 24 }, (_, h) => (
                      <button
                        key={h}
                        type="button"
                        aria-label={t('calendar.newEventOn', { date: `${formatDateKey(d, settings.locale, { day: 'numeric', month: 'short' })} ${fromMinutes(h * 60)}` })}
                        onClick={() => handlers.onNew(d, h * 60)}
                        className="absolute inset-x-0 border-t border-line/40 transition hover:bg-accent/5"
                        style={{ top: h * HOUR_PX, height: HOUR_PX }}
                      />
                    ))}
                    {d === today && (
                      <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: (nowMin / 60) * HOUR_PX }} aria-hidden>
                        <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-rose" />
                        <span className="h-[2px] flex-1 bg-rose" />
                      </div>
                    )}
                    {timed.map((i) => {
                      const pos = layout.get(i.key) ?? { col: 0, cols: 1 };
                      const look = toneLook(i.tone, i.color);
                      const height = Math.max(((i.end! - i.start!) / 60) * HOUR_PX, 22);
                      return (
                        <button
                          key={i.key}
                          type="button"
                          onClick={() => handlers.onOpen(i)}
                          className={cn(
                            'absolute z-[5] flex flex-col overflow-hidden rounded-lg px-2 py-1 text-left text-xs shadow-soft ring-1 ring-inset transition hover:z-20 hover:brightness-110',
                            i.kind === 'task' ? 'bg-surface ring-violet/50' : cn(look.chip.className, 'ring-line/40'),
                            i.done && 'opacity-60',
                          )}
                          style={{
                            ...(i.kind === 'task' ? {} : look.chip.style),
                            top: (i.start! / 60) * HOUR_PX + 1,
                            height: height - 2,
                            left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`,
                            width: `calc(${100 / pos.cols}% - 4px)`,
                          }}
                        >
                          <span className={cn('absolute inset-y-0 left-0 w-1', i.kind === 'task' ? 'bg-violet' : look.bar.className)} style={i.kind === 'task' ? undefined : look.bar.style} aria-hidden />
                          <span className={cn('flex items-center gap-1 truncate font-semibold text-fg', i.done && 'line-through')}>
                            {i.kind === 'task' && <ListTodo className="h-3 w-3 shrink-0 text-violet" aria-hidden />}
                            {i.occurrence?.event.recurrence && <Repeat className="h-3 w-3 shrink-0 text-muted" aria-hidden />}
                            {i.conflictWith.length > 0 && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" aria-label={t('calendar.conflict')} />}
                            <span className="truncate">{i.title}</span>
                          </span>
                          {height > 34 && (
                            <span className="truncate tabular text-muted">
                              {fromMinutes(i.start!)}
                              {i.kind === 'event' && ` – ${fromMinutes(i.end!)}`}
                              {i.location && ` · ${i.location}`}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Ano ---------- */

export function YearView({ year, items, handlers }: { year: number; items: CalendarItem[]; handlers: ViewHandlers }) {
  const { settings } = useSettings();
  const today = todayKey();
  const busy = new Map<string, number>();
  for (const i of items) for (let d = i.date; d <= i.endDate; d = addDays(d, 1)) busy.set(d, (busy.get(d) ?? 0) + 1);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, m) => {
        const anchor = `${year}-${String(m + 1).padStart(2, '0')}-01`;
        const days = monthGrid(anchor, settings.weekStartsOn);
        return (
          <section key={m} className="rounded-2xl bg-surface p-3 ring-1 ring-line/70">
            <h3 className="mb-2 px-1 text-sm font-semibold capitalize text-fg">{formatDateKey(anchor, settings.locale, { month: 'long' })}</h3>
            <div className="grid grid-cols-7 gap-0.5">
              {days.slice(0, 7).map((d) => (
                <span key={d} className="text-center text-[0.6rem] font-semibold uppercase text-subtle">
                  {formatDateKey(d, settings.locale, { weekday: 'narrow' })}
                </span>
              ))}
              {days.map((d) => {
                const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
                const n = inMonth ? busy.get(d) ?? 0 : 0;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!inMonth}
                    onClick={() => handlers.onPickDay(d)}
                    aria-label={inMonth ? formatDateKey(d, settings.locale, { dateStyle: 'full' }) : undefined}
                    className={cn(
                      'relative flex h-7 items-center justify-center rounded-md text-[0.7rem] tabular transition',
                      !inMonth && 'invisible',
                      d === today ? 'bg-brand font-semibold text-white' : n > 0 ? 'bg-accent/15 font-semibold text-fg hover:bg-accent/25' : 'text-muted hover:bg-surface-2',
                    )}
                  >
                    {Number(d.slice(8))}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Agenda ---------- */

export function AgendaView({ from, items, handlers }: { from: DateKey; items: CalendarItem[]; handlers: ViewHandlers }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const dates = [...new Set(items.flatMap((i) => (i.date < from ? [from] : [i.date])))].sort();

  if (dates.length === 0) return <p className="px-2 py-10 text-center text-sm text-muted">{t('calendar.agendaEmpty')}</p>;

  return (
    <ol className="flex flex-col gap-5">
      {dates.map((d) => {
        const list = items.filter((i) => (i.date < from ? from : i.date) === d);
        return (
          <li key={d} className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <button type="button" onClick={() => handlers.onPickDay(d)} className="flex items-baseline gap-2 text-left sm:flex-col sm:gap-0">
              <span className={cn('text-2xl font-semibold tabular tracking-tight', d === today ? 'text-accent' : 'text-fg')}>{Number(d.slice(8))}</span>
              <span className="text-xs font-medium capitalize text-muted">{formatDateKey(d, settings.locale, { weekday: 'long', month: 'short' })}</span>
            </button>
            <ul className="flex flex-col gap-1.5">
              {list.map((i) => {
                const look = toneLook(i.tone, i.color);
                return (
                  <li key={i.key}>
                    <button
                      type="button"
                      onClick={() => handlers.onOpen(i)}
                      className="flex w-full items-start gap-3 rounded-xl bg-surface px-3 py-2.5 text-left ring-1 ring-line/70 transition hover:bg-surface-2"
                    >
                      <span className={cn('mt-1 h-8 w-1 shrink-0 rounded-full', i.kind === 'task' ? 'bg-violet' : look.bar.className)} style={i.kind === 'task' ? undefined : look.bar.style} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={cn('flex items-center gap-1.5 font-medium text-fg', i.done && 'text-subtle line-through')}>
                          {i.kind === 'task' && <ListTodo className="h-4 w-4 shrink-0 text-violet" aria-label={t('calendar.kindTask')} />}
                          <span className="truncate">{i.title}</span>
                          {i.conflictWith.length > 0 && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-label={t('calendar.conflict')} />}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                          <span className="tabular">{i.allDay ? t('calendar.allDay') : `${fromMinutes(i.start!)}${i.kind === 'event' ? ` – ${fromMinutes(i.end!)}` : ''}`}</span>
                          {i.endDate > i.date && <span>→ {formatDateKey(i.endDate, settings.locale)}</span>}
                          {i.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden />
                              {i.location}
                            </span>
                          )}
                          {i.conflictWith.length > 0 && <span className="text-warning">{t('calendar.conflictWith', { titles: i.conflictWith.join(', ') })}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
