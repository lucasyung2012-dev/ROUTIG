import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Columns3, Grid3x3, List, Plus, Rows3, Tags, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { addDays, addMonths, addYears, capitalizeFirst, formatDateKey, monthGrid, startOfMonth, startOfWeek, todayKey, type DateKey } from '@/domain/dates';
import { fromMinutes } from '@/domain/events';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { LoadingState } from '@/ui/States';
import { Switch } from '@/ui/Switch';
import { cn } from '@/ui/cn';
import { CalendarConfigDialog, CalendarTrashDialog } from './CalendarDialogs';
import { AgendaView, MonthView, TimeGridView, YearView, type ViewHandlers } from './CalendarViews';
import { useEventEditor } from './EventEditor';
import { toneLook, useCalendarData, useCategoryName, type CalendarItem } from './useCalendarData';

const VIEWS = [
  { id: 'day', icon: Rows3 },
  { id: 'week', icon: Columns3 },
  { id: 'month', icon: Grid3x3 },
  { id: 'year', icon: CalendarRange },
  { id: 'agenda', icon: List },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];
const VIEW_KEY = 'routig.calendar.view';

function readView(): ViewId {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.id === v) ? (v as ViewId) : 'month';
  } catch {
    return 'month';
  }
}

export function rangeFor(view: ViewId, anchor: DateKey, weekStartsOn: 0 | 1): { from: DateKey; to: DateKey } {
  switch (view) {
    case 'day':
      return { from: anchor, to: anchor };
    case 'week': {
      const from = startOfWeek(anchor, weekStartsOn);
      return { from, to: addDays(from, 6) };
    }
    case 'month': {
      const grid = monthGrid(anchor, weekStartsOn);
      return { from: grid[0]!, to: grid[grid.length - 1]! };
    }
    case 'year':
      return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
    case 'agenda':
      return { from: anchor, to: addDays(anchor, 60) };
  }
}

function step(view: ViewId, anchor: DateKey, dir: 1 | -1): DateKey {
  switch (view) {
    case 'day':
      return addDays(anchor, dir);
    case 'week':
      return addDays(anchor, 7 * dir);
    case 'month':
      return addMonths(startOfMonth(anchor), dir, 1);
    case 'year':
      return addYears(anchor, dir);
    case 'agenda':
      return addDays(anchor, 30 * dir);
  }
}

export function CalendarPage() {
  const { t, settings } = useSettings();
  const cal = useCalendarData();
  const events = useEventEditor();
  const tasks = useTaskEditor();
  const categoryName = useCategoryName();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewId>(readView);
  const [anchor, setAnchor] = useState<DateKey>(todayKey());
  const [showTasks, setShowTasks] = useState(true);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* preferência só desta sessão */
    }
  }, [view]);

  const range = rangeFor(view, anchor, settings.weekStartsOn);
  const items = useMemo(() => cal.itemsInRange(range.from, range.to, { showTasks, categoryId }), [cal, range.from, range.to, showTasks, categoryId]);

  const handlers: ViewHandlers = {
    onOpen: (i: CalendarItem) => {
      if (i.kind === 'task' && i.task) tasks.openTask(i.task.id);
      else if (i.kind === 'milestone' && i.projectId) navigate(`/projects/${i.projectId}`);
      else if (i.kind === 'assessment' && i.subjectId) navigate(`/academy/subjects/${i.subjectId}`);
      else if (i.kind === 'study') navigate('/academy/plan');
      else if (i.occurrence) events.openEvent(i.occurrence.event.id, i.occurrence.seriesDate);
    },
    onNew: (date, startMin) => events.newEvent({ start: date, endDate: date, startTime: fromMinutes(startMin ?? 9 * 60) }),
    onPickDay: (date) => {
      setAnchor(date);
      setView('day');
    },
  };

  const title = (() => {
    const loc = settings.locale;
    switch (view) {
      case 'day':
        return formatDateKey(anchor, loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      case 'week':
        return `${formatDateKey(range.from, loc, { day: 'numeric', month: 'short' })} – ${formatDateKey(range.to, loc, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      case 'month':
        return formatDateKey(anchor, loc, { month: 'long', year: 'numeric' });
      case 'year':
        return anchor.slice(0, 4);
      case 'agenda':
        return `${formatDateKey(range.from, loc, { day: 'numeric', month: 'short' })} – ${formatDateKey(range.to, loc, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
  })();

  const nothingAtAll = !cal.loading && cal.events.length === 0 && !cal.tasks.active.some((x) => x.dueDate);
  const dayItems = view === 'day' ? items : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue/10 text-blue">
            <CalendarDays className="h-7 w-7" aria-hidden />
          </div>
        }
        title={t('modules.calendar')}
        description={t('moduleSummary.calendar')}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setTrashOpen(true)}>
              {t('calendar.trashButton')}
              {cal.trash.length > 0 && <span className="rounded-full bg-surface-3 px-1.5 text-xs tabular">{cal.trash.length}</span>}
            </Button>
            <Button variant="ghost" size="sm" icon={<Tags className="h-4 w-4" aria-hidden />} onClick={() => setConfigOpen(true)}>
              {t('calendar.configButton')}
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => handlers.onNew(view === 'day' || view === 'agenda' ? anchor : todayKey())}>
              {t('calendar.newEvent')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAnchor(todayKey())}>
            {t('calendar.today')}
          </Button>
          <IconButton size="sm" label={t('calendar.prev')} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setAnchor(step(view, anchor, -1))} />
          <IconButton size="sm" label={t('calendar.next')} icon={<ChevronRight className="h-4 w-4" />} onClick={() => setAnchor(step(view, anchor, 1))} />
          <h2 className="ml-1 text-lg font-semibold tracking-tight text-fg sm:text-xl" aria-live="polite">
            {capitalizeFirst(title)}
          </h2>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label={t('calendar.viewLabel')} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
            {VIEWS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn('inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition', view === id ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg')}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {t(`calendar.views.${id}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Select aria-label={t('calendar.filterCategory')} value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)} className="w-56">
          <option value="">{t('calendar.allCategories')}</option>
          {cal.config.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryName(c)}
            </option>
          ))}
        </Select>
        <Switch label={t('calendar.showTasks')} checked={showTasks} onChange={setShowTasks} />
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label={t('calendar.filterCategory')}>
          {cal.config.categories.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', toneLook(c.tone, c.color).dot.className)} style={toneLook(c.tone, c.color).dot.style} aria-hidden />
              {categoryName(c)}
            </li>
          ))}
          {showTasks && (
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-violet" aria-hidden />
              {t('calendar.taskLegend')}
            </li>
          )}
        </ul>
      </div>

      {nothingAtAll && (
        <div className="rounded-2xl bg-surface-2/60 px-4 py-3 text-sm ring-1 ring-line/60">
          <span className="font-medium text-fg">{t('calendar.emptyTitle')}.</span> <span className="text-muted">{t('calendar.emptyBody')}</span>
        </div>
      )}

      {cal.loading ? (
        <LoadingState label={t('common.loading')} lines={5} />
      ) : view === 'month' ? (
        <MonthView anchor={anchor} items={items} handlers={handlers} />
      ) : view === 'week' ? (
        <TimeGridView days={Array.from({ length: 7 }, (_, i) => addDays(range.from, i))} items={items} handlers={handlers} />
      ) : view === 'day' ? (
        <>
          <TimeGridView days={[anchor]} items={items} handlers={handlers} />
          {dayItems.length === 0 && <p className="text-center text-sm text-muted">{t('calendar.noEvents')}</p>}
        </>
      ) : view === 'year' ? (
        <YearView year={Number(anchor.slice(0, 4))} items={items} handlers={handlers} />
      ) : (
        <AgendaView from={range.from} items={items} handlers={handlers} />
      )}

      <CalendarTrashDialog open={trashOpen} onClose={() => setTrashOpen(false)} cal={cal} />
      <CalendarConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} cal={cal} />
    </div>
  );
}
