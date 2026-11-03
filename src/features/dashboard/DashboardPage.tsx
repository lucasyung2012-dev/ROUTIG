import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Inbox, ListTodo, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { addDays, capitalizeFirst, formatDateKey, toDateKey, todayKey } from '@/domain/dates';
import { fromMinutes } from '@/domain/events';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { TONE_ITEM, useCalendarData } from '@/features/calendar/useCalendarData';
import { compareTasks, isClosedKind, statusKind } from '@/domain/tasks';
import { TaskRow } from '@/features/tasks/TaskRow';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { useTasksData } from '@/features/tasks/useTasksData';
import { LoadingState } from '@/ui/States';
import { MODULES, TONE_CLASSES } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { isModuleReady } from '@/app/version';
import { visibleModules } from '@/domain/settings';
import { RoutigMark } from '@/brand/Logo';
import { Badge } from '@/ui/Badge';
import { cn } from '@/ui/cn';

export function greetingKey(hour: number): 'dashboard.morning' | 'dashboard.afternoon' | 'dashboard.evening' {
  if (hour >= 5 && hour < 12) return 'dashboard.morning';
  if (hour >= 12 && hour < 18) return 'dashboard.afternoon';
  return 'dashboard.evening';
}

export { capitalizeFirst } from '@/domain/dates';

/** Resumo da Inbox: quantos itens esperam organização. */
function InboxSummary() {
  const { t } = useSettings();
  const today = todayKey();
  const count = useLiveQuery(
    () => getDb().inbox.filter((i) => !i.deletedAt && i.status === 'open' && (!i.snoozedUntil || i.snoozedUntil <= today)).count(),
    [today],
  );
  if (count === undefined) return null;
  return (
    <Link
      to="/inbox"
      className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-3 text-muted">
        <Inbox className="h-5 w-5" aria-hidden />
      </span>
      <span className="flex-1">
        <span className="block font-semibold text-fg">{t('modules.inbox')}</span>
        <span className="block text-sm text-muted">{count === 0 ? t('inbox.empty.open') : t('dashboard.inboxCount', { count })}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-subtle" aria-hidden />
    </Link>
  );
}

/** Próximos compromissos (7 dias), vindos do Calendar. */
function EventsCard() {
  const { t, settings } = useSettings();
  const cal = useCalendarData();
  const events = useEventEditor();
  const today = todayKey();
  const upcoming = cal.itemsInRange(today, addDays(today, 7), { showTasks: false, categoryId: null }).filter((i) => i.kind === 'event').slice(0, 6);

  return (
    <section aria-labelledby="dash-events" className="rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue/10 text-blue">
          <CalendarDays className="h-5 w-5" aria-hidden />
        </span>
        <h2 id="dash-events" className="flex-1 text-lg font-semibold tracking-tight text-fg">
          {t('dashboard.eventsTitle')}
        </h2>
        <Link to="/calendar" className="text-sm font-medium text-accent hover:underline">
          {t('dashboard.openCalendar')}
        </Link>
      </div>
      {cal.loading ? (
        <LoadingState label={t('common.loading')} lines={3} className="mt-4" />
      ) : upcoming.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t('dashboard.eventsEmpty')}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {upcoming.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => i.occurrence && events.openEvent(i.occurrence.event.id, i.occurrence.seriesDate)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-2/70"
              >
                <span className={cn('h-9 w-1 shrink-0 rounded-full', TONE_ITEM[i.tone].bar)} aria-hidden />
                <span className="w-16 shrink-0 text-xs font-medium capitalize text-muted">
                  {i.date === today ? t('tasks.due.today') : formatDateKey(i.date, settings.locale, { weekday: 'short', day: 'numeric' })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium text-fg">{i.title}</span>
                  <span className="block text-xs tabular text-muted">{i.allDay ? t('calendar.allDay') : fromMinutes(i.start!)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Resumo real das tarefas: só conta o que está registrado (Parte 5.3). */
function TasksCard() {
  const { t } = useSettings();
  const data = useTasksData();
  const editor = useTaskEditor();
  const actions = useTaskActions(data);
  const today = todayKey();
  const open = data.active.filter((x) => !isClosedKind(statusKind(data.config, x.statusId)));
  const overdue = open.filter((x) => x.dueDate && x.dueDate < today).length;
  const dueToday = open.filter((x) => x.dueDate === today).length;
  const doneToday = data.active.filter((x) => x.completedAt && toDateKey(new Date(x.completedAt)) === today).length;
  const next = [...open].sort(compareTasks(data.config)).slice(0, 5);

  return (
    <section aria-labelledby="dash-tasks" className="rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/10 text-violet">
          <ListTodo className="h-5 w-5" aria-hidden />
        </span>
        <h2 id="dash-tasks" className="flex-1 text-lg font-semibold tracking-tight text-fg">
          {t('dashboard.tasksTitle')}
        </h2>
        <Link to="/tasks" className="text-sm font-medium text-accent hover:underline">
          {t('dashboard.seeAll')}
        </Link>
      </div>

      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} className="mt-4" />
      ) : open.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t('dashboard.tasksEmpty')}</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {overdue > 0 && <Badge tone="danger">{t('dashboard.tasksOverdue', { count: overdue })}</Badge>}
            <Badge tone="accent">{t('dashboard.tasksToday', { count: dueToday })}</Badge>
            <Badge>{t('dashboard.tasksOpen', { count: open.length })}</Badge>
            {doneToday > 0 && <Badge tone="success">{t('dashboard.doneToday', { count: doneToday })}</Badge>}
          </div>
          <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('dashboard.nextUp')}</h3>
          <ul className="flex flex-col">
            {next.map((task) => (
              <li key={task.id}>
                <TaskRow task={task} data={data} onOpen={editor.openTask} onToggle={actions.toggle} compact />
              </li>
            ))}
          </ul>
        </>
      )}
      {actions.dialogs}
    </section>
  );
}

/**
 * Dashboard: saudação, resumo real das tarefas e o mapa dos módulos.
 * Os outros módulos entram no painel conforme forem construídos.
 */
export function DashboardPage() {
  const { settings, t } = useSettings();
  const locale = settings.locale;
  const now = new Date();
  const greeting = t(greetingKey(now.getHours()));
  const name = settings.profile.displayName.trim();
  const date = capitalizeFirst(new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now));
  const modules = visibleModules(settings).filter((id) => id !== 'dashboard');

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-3xl bg-surface p-6 shadow-soft ring-1 ring-line/70 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-72 w-72 opacity-[0.16] sm:opacity-25" aria-hidden>
          <RoutigMark className="h-full w-full" />
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-medium text-muted">{date}</p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            {name ? t('dashboard.greetingNamed', { greeting, name }) : greeting}
          </h1>
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-surface-2/70 p-4 ring-1 ring-line/60">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
            <div>
              <div className="text-[0.9375rem] font-semibold text-fg">{t('dashboard.foundationTitle')}</div>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t('dashboard.foundationBody')}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {!settings.nav.hidden.includes('calendar') && <EventsCard />}
        {!settings.nav.hidden.includes('tasks') && <TasksCard />}
      </div>

      {!settings.nav.hidden.includes('inbox') && <InboxSummary />}

      <section aria-labelledby="dash-modules">
        <h2 id="dash-modules" className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-subtle">
          {t('dashboard.yourModules')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((id) => {
            const def = MODULES[id];
            const Icon = def.icon;
            const tone = TONE_CLASSES[def.tone];
            const ready = isModuleReady(id);
            return (
              <li key={id}>
                <Link
                  to={def.path}
                  className="group flex h-full items-start gap-4 rounded-2xl bg-surface/80 p-4 ring-1 ring-line/70 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-lift"
                >
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tone.soft, tone.text)}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-fg">{t(`modules.${id}`)}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted">{t(`moduleSummary.${id}`)}</span>
                    <span className="mt-2.5 block">
                      <Badge tone={ready ? 'success' : 'neutral'}>
                        {ready ? t('dashboard.readyLabel') : `${t('dashboard.buildingLabel')} · ${t('dashboard.stageLabel', { stage: def.stage })}`}
                      </Badge>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
