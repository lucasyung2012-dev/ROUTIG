import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, ArrowRight, CalendarDays, Diamond, FolderKanban, GraduationCap, Guitar, Inbox, Languages, ListTodo, NotebookPen, Play, Repeat, Sun, Target, Timer, Trophy, Wallet } from 'lucide-react';
import { MODULES, TONE_CLASSES, type ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { isModuleReady } from '@/app/version';
import { getDb } from '@/data/db';
import { addDays, formatDateKey, toDateKey, todayKey } from '@/domain/dates';
import { fromMinutes } from '@/domain/events';
import type { KpiMetric, LiveCard } from '@/domain/dashboard';
import { notePreview } from '@/domain/notes';
import { isClosedProject } from '@/domain/projects';
import { compareTasks, isClosedKind, statusKind } from '@/domain/tasks';
import { visibleModules } from '@/domain/settings';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { toneLook, useCalendarData } from '@/features/calendar/useCalendarData';
import { useAcademyData } from '@/features/academy/useAcademyData';
import { useLanguages } from '@/features/languages/useLanguages';
import { QuickLog } from '@/features/habits/habitsUi';
import { useHabits } from '@/features/habits/useHabits';
import { todayStatus } from '@/domain/habits';
import { isDue } from '@/domain/srs';
import { isGoalOverdue, isOpenGoal } from '@/domain/goals';
import { GoalProgressView } from '@/features/goals/goalsUi';
import { useGoals } from '@/features/goals/useGoals';
import { useFocus } from '@/features/focus/FocusProvider';
import { useMusic } from '@/features/music/useMusic';
import { useSports } from '@/features/sports/useSports';
import { formatClock, phaseElapsed, phaseRemaining } from '@/domain/focus';
import { useProjectsData } from '@/features/projects/useProjectsData';
import { TaskRow } from '@/features/tasks/TaskRow';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { useTasksData } from '@/features/tasks/useTasksData';
import { Badge } from '@/ui/Badge';
import { LoadingState } from '@/ui/States';
import { cn } from '@/ui/cn';

/* ---------- Moldura comum ---------- */

export function CardShell({ title, icon, tone = 'violet', link, children }: { title: string; icon: ReactNode; tone?: keyof typeof TONE_CLASSES; link?: { to: string; label: string }; children: ReactNode }) {
  const tc = TONE_CLASSES[tone];
  return (
    <section className="flex h-full flex-col rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tc.soft, tc.text)}>{icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-fg">{title}</h2>
        {link && (
          <Link to={link.to} className="shrink-0 text-sm font-medium text-accent hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      <div className="mt-4 min-w-0 flex-1">{children}</div>
    </section>
  );
}

const isDoneStatus = (data: ReturnType<typeof useTasksData>) => (statusId: string) => isClosedKind(statusKind(data.config, statusId));

/* ---------- Resumo do dia ---------- */

export function TodayCard() {
  const { t } = useSettings();
  const cal = useCalendarData();
  const inbox = useLiveQuery(() => getDb().inbox.filter((i) => !i.deletedAt && i.status === 'open').count(), []);
  const today = todayKey();
  if (cal.loading || inbox === undefined) return <CardShell title={t('dashboard.cards.today')} icon={<Sun className="h-5 w-5" />}><LoadingState label={t('common.loading')} lines={2} /></CardShell>;
  const items = cal.itemsInRange(today, today, { showTasks: false, categoryId: null });
  const events = items.filter((i) => i.kind === 'event').length;
  const milestones = items.filter((i) => i.kind === 'milestone').length;
  const open = cal.tasks.active.filter((x) => !isDoneStatus(cal.tasks)(x.statusId));
  const dueToday = open.filter((x) => x.dueDate === today).length;
  const overdue = open.filter((x) => x.dueDate && x.dueDate < today).length;
  const free = events === 0 && dueToday === 0 && overdue === 0 && milestones === 0;
  return (
    <CardShell title={t('dashboard.cards.today')} icon={<Sun className="h-5 w-5" />} tone="amber">
      {free ? (
        <p className="text-sm text-muted">{t('dashboard.todayFree')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {events > 0 && <Badge tone="info">{t('dashboard.todayEvents', { count: events })}</Badge>}
          {dueToday > 0 && <Badge tone="accent">{t('dashboard.todayTasks', { count: dueToday })}</Badge>}
          {overdue > 0 && <Badge tone="danger">{t('dashboard.todayOverdue', { count: overdue })}</Badge>}
          {milestones > 0 && <Badge tone="warning">{t('dashboard.todayMilestones', { count: milestones })}</Badge>}
          {inbox > 0 && <Badge>{t('dashboard.todayInbox', { count: inbox })}</Badge>}
        </div>
      )}
    </CardShell>
  );
}

/* ---------- Próximos compromissos ---------- */

export function EventsCard() {
  const { t, settings } = useSettings();
  const cal = useCalendarData();
  const events = useEventEditor();
  const today = todayKey();
  const upcoming = cal.itemsInRange(today, addDays(today, 7), { showTasks: false, categoryId: null }).filter((i) => i.kind === 'event').slice(0, 6);
  return (
    <CardShell title={t('dashboard.cards.events')} icon={<CalendarDays className="h-5 w-5" />} tone="blue" link={{ to: '/calendar', label: t('dashboard.openCalendar') }}>
      {cal.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.eventsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {upcoming.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => i.occurrence && events.openEvent(i.occurrence.event.id, i.occurrence.seriesDate)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-2/70"
              >
                <span className={cn('h-9 w-1 shrink-0 rounded-full', toneLook(i.tone, i.color).bar.className)} style={toneLook(i.tone, i.color).bar.style} aria-hidden />
                <span className="w-16 shrink-0 text-xs font-medium capitalize text-muted">{i.date === today ? t('tasks.due.today') : formatDateKey(i.date, settings.locale, { weekday: 'short', day: 'numeric' })}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium text-fg">{i.title}</span>
                  <span className="block text-xs tabular text-muted">{i.allDay ? t('calendar.allDay') : fromMinutes(i.start!)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

/* ---------- Tarefas ---------- */

export function TasksCard() {
  const { t } = useSettings();
  const data = useTasksData();
  const editor = useTaskEditor();
  const actions = useTaskActions(data);
  const today = todayKey();
  const open = data.active.filter((x) => !isDoneStatus(data)(x.statusId));
  const overdue = open.filter((x) => x.dueDate && x.dueDate < today).length;
  const dueToday = open.filter((x) => x.dueDate === today).length;
  const doneToday = data.active.filter((x) => x.completedAt && toDateKey(new Date(x.completedAt)) === today).length;
  const next = [...open].sort(compareTasks(data.config)).slice(0, 5);
  return (
    <CardShell title={t('dashboard.cards.tasks')} icon={<ListTodo className="h-5 w-5" />} link={{ to: '/tasks', label: t('dashboard.seeAll') }}>
      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : open.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.tasksEmpty')}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {overdue > 0 && <Badge tone="danger">{t('dashboard.tasksOverdue', { count: overdue })}</Badge>}
            <Badge tone="accent">{t('dashboard.tasksToday', { count: dueToday })}</Badge>
            <Badge>{t('dashboard.tasksOpen', { count: open.length })}</Badge>
            {doneToday > 0 && <Badge tone="success">{t('dashboard.doneToday', { count: doneToday })}</Badge>}
          </div>
          <ul className="mt-3 flex flex-col">
            {next.map((task) => (
              <li key={task.id}>
                <TaskRow task={task} data={data} onOpen={editor.openTask} onToggle={actions.toggle} compact />
              </li>
            ))}
          </ul>
        </>
      )}
      {actions.dialogs}
    </CardShell>
  );
}

/* ---------- Projetos e marcos ---------- */

export function ProjectsCard() {
  const { t } = useSettings();
  const data = useProjectsData();
  const active = data.projects.filter((p) => !isClosedProject(p.status) && p.status !== 'idea').slice(0, 5);
  return (
    <CardShell title={t('dashboard.cards.projects')} icon={<FolderKanban className="h-5 w-5" />} tone="amber" link={{ to: '/projects', label: t('dashboard.seeAllProjects') }}>
      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : active.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.projectsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((p) => {
            const pr = data.progressOf(p);
            return (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="block rounded-xl px-2 py-1.5 transition hover:bg-surface-2/70">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">{p.name}</span>
                    <span className="text-xs tabular text-muted">{pr.percent === null ? '—' : `${pr.percent}%`}</span>
                  </div>
                  {pr.percent !== null && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <div className="h-full rounded-full" style={{ width: `${pr.percent}%`, background: p.color }} />
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

export function MilestonesCard() {
  const { t, settings } = useSettings();
  const data = useProjectsData();
  const today = todayKey();
  const limit = addDays(today, 30);
  const list = data.projects
    .flatMap((p) => p.milestones.filter((m) => m.date && !m.done && m.date <= limit).map((m) => ({ p, m })))
    .sort((a, b) => a.m.date!.localeCompare(b.m.date!))
    .slice(0, 6);
  return (
    <CardShell title={t('dashboard.cards.milestones')} icon={<Diamond className="h-5 w-5" />} tone="amber">
      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.milestonesEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map(({ p, m }) => (
            <li key={m.id}>
              <Link to={`/projects/${p.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2/70">
                <span className="h-3 w-3 shrink-0 rotate-45" style={{ background: p.color }} aria-hidden />
                <span className={cn('w-16 shrink-0 text-xs font-medium', m.date! < today ? 'text-danger' : 'text-muted')}>{formatDateKey(m.date!, settings.locale, { day: 'numeric', month: 'short' })}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{m.title}</span>
                  <span className="block truncate text-xs text-muted">{p.name}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

/* ---------- Notas, Inbox e atividade ---------- */

export function NotesCard() {
  const { t } = useSettings();
  const notes = useLiveQuery(() => getDb().notes.orderBy('updatedAt').reverse().filter((n) => !n.deletedAt).limit(5).toArray(), []);
  return (
    <CardShell title={t('dashboard.cards.notes')} icon={<NotebookPen className="h-5 w-5" />} tone="amber" link={{ to: '/notes', label: t('dashboard.openNotes') }}>
      {!notes ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.notesEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {notes.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="block rounded-xl px-2 py-1.5 transition hover:bg-surface-2/70">
                <span className="block truncate text-sm font-medium text-fg">{n.title || t('notes.untitled')}</span>
                <span className="block truncate text-xs text-muted">{notePreview(n, 80) || '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

export function InboxCard() {
  const { t } = useSettings();
  const today = todayKey();
  const count = useLiveQuery(() => getDb().inbox.filter((i) => !i.deletedAt && i.status === 'open' && (!i.snoozedUntil || i.snoozedUntil <= today)).count(), [today]);
  return (
    <CardShell title={t('dashboard.cards.inbox')} icon={<Inbox className="h-5 w-5" />} tone="neutral" link={{ to: '/inbox', label: t('common.open') }}>
      {count === undefined ? <LoadingState label={t('common.loading')} lines={1} /> : <p className="text-sm text-muted">{count === 0 ? t('inbox.empty.open') : t('dashboard.inboxCount', { count })}</p>}
    </CardShell>
  );
}

const ACTIVITY_TYPES = ['task', 'event', 'note', 'project', 'inbox'] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** O que foi criado, alterado ou concluído por último (do histórico de alterações). */
export function ActivityCard() {
  const { t, settings } = useSettings();
  const rows = useLiveQuery(async () => {
    const db = getDb();
    const entries = (await db.changelog.orderBy('seq').reverse().limit(80).toArray()).filter((e) => (ACTIVITY_TYPES as readonly string[]).includes(e.entityType));
    // Uma linha por registro: só a mudança mais recente de cada um.
    const seen = new Set<string>();
    const unique = entries.filter((e) => (seen.has(`${e.entityType}:${e.entityId}`) ? false : (seen.add(`${e.entityType}:${e.entityId}`), true))).slice(0, 8);
    return Promise.all(
      unique.map(async (e) => {
        const type = e.entityType as ActivityType;
        const name =
          type === 'task'
            ? (await db.tasks.get(e.entityId))?.title
            : type === 'event'
              ? (await db.events.get(e.entityId))?.title
              : type === 'note'
                ? (await db.notes.get(e.entityId))?.title || t('notes.untitled')
                : type === 'project'
                  ? (await db.projects.get(e.entityId))?.name
                  : (await db.inbox.get(e.entityId))?.text.slice(0, 60);
        const href = type === 'task' ? '/tasks' : type === 'event' ? '/calendar' : type === 'note' ? `/notes/${e.entityId}` : type === 'project' ? `/projects/${e.entityId}` : '/inbox';
        return { key: e.seq ?? `${e.entityId}${e.at}`, at: e.at, action: e.action, type, name, href };
      }),
    );
  }, [t]);
  const fmt = new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <CardShell title={t('dashboard.cards.activity')} icon={<Activity className="h-5 w-5" />} tone="rose">
      {!rows ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.activityEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.key}>
              <Link to={r.href} className="flex items-baseline gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface-2/70">
                <span className="w-24 shrink-0 text-xs tabular text-subtle">{fmt.format(new Date(r.at))}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">
                  {t(`dashboard.actions.${r.action}`)} {t(`dashboard.entity.${r.type}`)}: <span className="font-medium text-fg">{r.name ?? t('dashboard.removed')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

/* ---------- Mapa dos módulos ---------- */

export function ModulesCard() {
  const { t, settings } = useSettings();
  const modules = visibleModules(settings).filter((id) => id !== 'dashboard');
  return (
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
              <Link to={def.path} className="group flex h-full items-start gap-4 rounded-2xl bg-surface/80 p-4 ring-1 ring-line/70 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-lift">
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
                    <Badge tone={ready ? 'success' : 'neutral'}>{ready ? t('dashboard.readyLabel') : `${t('dashboard.buildingLabel')} · ${t('dashboard.stageLabel', { stage: def.stage })}`}</Badge>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- Indicadores ---------- */

const KPI_LINK: Record<KpiMetric, string> = {
  tasksOverdue: '/tasks',
  tasksToday: '/tasks',
  tasksDoneWeek: '/tasks',
  projectsActive: '/projects',
  eventsWeek: '/calendar',
  inboxOpen: '/inbox',
  notesTotal: '/notes',
};

/** Um número real, contado agora a partir do banco (Parte 5.3: nada inventado). */
export function KpiCard({ metric }: { metric: KpiMetric }) {
  const { t } = useSettings();
  const value = useLiveQuery(async () => {
    const db = getDb();
    const today = todayKey();
    const weekAgo = addDays(today, -6);
    const cfg = await db.kv.get('tasks.config');
    const closed = new Set(
      ((cfg?.value as { statuses?: Array<{ id: string; kind: string }> } | undefined)?.statuses ?? [])
        .filter((s) => ['done', 'cancelled', 'archived'].includes(s.kind))
        .map((s) => s.id)
        .concat(['done', 'cancelled', 'archived']),
    );
    switch (metric) {
      case 'tasksOverdue':
        return db.tasks.filter((x) => !x.deletedAt && !closed.has(x.statusId) && !!x.dueDate && x.dueDate < today).count();
      case 'tasksToday':
        return db.tasks.filter((x) => !x.deletedAt && !closed.has(x.statusId) && x.dueDate === today).count();
      case 'tasksDoneWeek':
        return db.tasks.filter((x) => !x.deletedAt && !!x.completedAt && toDateKey(new Date(x.completedAt)) >= weekAgo).count();
      case 'projectsActive':
        return db.projects.filter((p) => !p.deletedAt && p.status === 'active').count();
      case 'inboxOpen':
        return db.inbox.filter((i) => !i.deletedAt && i.status === 'open').count();
      case 'notesTotal':
        return db.notes.filter((n) => !n.deletedAt).count();
      case 'eventsWeek':
        return -1; // calculado abaixo com as ocorrências (inclui eventos que se repetem)
    }
  }, [metric]);
  const cal = useCalendarData();
  const today = todayKey();
  const shown = metric === 'eventsWeek' ? (cal.loading ? undefined : cal.itemsInRange(today, addDays(today, 6), { showTasks: false, categoryId: null }).filter((i) => i.kind === 'event').length) : value;
  const danger = metric === 'tasksOverdue' && (shown ?? 0) > 0;
  return (
    <Link to={KPI_LINK[metric]} className="flex h-full flex-col justify-between gap-2 rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
      <span className="text-sm font-medium text-muted">{t(`dashboard.kpi.${metric}`)}</span>
      <span className={cn('text-4xl font-semibold tabular tracking-tight', danger ? 'text-danger' : 'text-fg')}>{shown === undefined ? '…' : shown}</span>
    </Link>
  );
}

/** Desenha um cartão "vivo" pelo id. */
export function renderLiveCard(id: LiveCard): ReactNode {
  switch (id) {
    case 'today':
      return <TodayCard />;
    case 'events':
      return <EventsCard />;
    case 'tasks':
      return <TasksCard />;
    case 'academy':
      return <AcademyCard />;
    case 'languages':
      return <LanguagesCard />;
    case 'habits':
      return <HabitsCard />;
    case 'goals':
      return <GoalsCard />;
    case 'focus':
      return <FocusCard />;
    case 'music':
      return <MusicCard />;
    case 'sports':
      return <SportsCard />;
    case 'finance':
      return <FinanceCard />;
    case 'projects':
      return <ProjectsCard />;
    case 'milestones':
      return <MilestonesCard />;
    case 'notes':
      return <NotesCard />;
    case 'inbox':
      return <InboxCard />;
    case 'activity':
      return <ActivityCard />;
    case 'modules':
      return <ModulesCard />;
  }
}

export const MODULE_OF_LIVE: Partial<Record<LiveCard, ModuleId>> = {
  events: 'calendar',
  tasks: 'tasks',
  academy: 'academy',
  languages: 'languages',
  projects: 'projects',
  milestones: 'projects',
  notes: 'notes',
  inbox: 'inbox',
};

/* ---------- Academy ---------- */

/** Próximas avaliações e notas a lançar, lidas da Academy (ano letivo atual). */
export function AcademyCard() {
  const { t, settings } = useSettings();
  const data = useAcademyData();
  const today = todayKey();
  const upcoming = data.assessments.filter((a) => a.date && a.date >= today && a.date <= addDays(today, 14)).slice(0, 5);
  const toGrade = data.assessments.filter((a) => a.date && a.date < today && a.score === null).length;
  return (
    <CardShell title={t('dashboard.cards.academy')} icon={<GraduationCap className="h-5 w-5" />} tone="blue" link={{ to: '/academy', label: t('common.open') }}>
      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : !data.year ? (
        <p className="text-sm text-muted">{t('dashboard.academyNoYear')}</p>
      ) : (
        <>
          {toGrade > 0 && (
            <div className="mb-2">
              <Badge tone="warning">{t('academy.dash.toGrade', { count: toGrade })}</Badge>
            </div>
          )}
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">{t('dashboard.academyEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {upcoming.map((a) => {
                const s = data.subjectById.get(a.subjectId);
                return (
                  <li key={a.id}>
                    <Link to={`/academy/subjects/${a.subjectId}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2/70">
                      <span className="h-9 w-1 shrink-0 rounded-full ring-1 ring-line/60" style={{ background: s?.color }} aria-hidden />
                      <span className="w-16 shrink-0 text-xs font-medium capitalize text-muted">{a.date === today ? t('tasks.due.today') : formatDateKey(a.date!, settings.locale, { weekday: 'short', day: 'numeric' })}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{a.name}</span>
                        <span className="block truncate text-xs text-muted">{s?.name}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </CardShell>
  );
}

/* ---------- Idiomas ---------- */

/** Tempo de estudo da semana em cada idioma e o nível de cada um. */
export function LanguagesCard() {
  const { t } = useSettings();
  const data = useLanguages();
  const weekAgo = addDays(todayKey(), -6);
  return (
    <CardShell title={t('dashboard.cards.languages')} icon={<Languages className="h-5 w-5" />} tone="teal" link={{ to: '/languages', label: t('common.open') }}>
      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : data.languages.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.languagesEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.languages.map((l) => {
            const min = data.sessionsOf(l.id).filter((s) => s.date >= weekAgo).reduce((a, s) => a + s.durationMin, 0);
            return (
              <li key={l.id}>
                <Link to={`/languages/${l.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface-2/70">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{l.name}</span>
                  <span className="text-xs text-muted">{l.native ? t('languages.native') : (l.level ?? t('languages.noLevel'))}</span>
                  <span className="w-16 text-right text-xs tabular text-fg">{t('languages.minutes', { min })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

/** Hábitos de hoje (Parte 14): os esperados hoje, com o registro rápido. */
export function HabitsCard() {
  const { t, settings } = useSettings();
  const data = useHabits();
  const today = todayKey();
  const due = data.habits.filter((h) => todayStatus(h, data.logsOf(h.id), today, settings.weekStartsOn).due);
  return (
    <CardShell title={t('dashboard.cards.habits')} icon={<Repeat className="h-5 w-5" />} tone="teal" link={{ to: '/habits', label: t('common.open') }}>
      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : data.habits.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.habitsEmpty')}</p>
      ) : due.length === 0 ? (
        <p className="text-sm text-muted">{t('habits.nothingToday')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {due.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: h.color }} aria-hidden />
              <Link to={`/habits/${h.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:text-accent">
                {h.name}
              </Link>
              {h.method === 'check' || h.method === 'scale' ? (
                <QuickLog habit={h} log={data.logsOf(h.id).get(today)} date={today} onOpen={() => undefined} />
              ) : (
                <Link to={`/habits/${h.id}`} className="text-xs font-medium text-accent hover:underline">
                  {t('habits.log')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

/** Objetivos em andamento (Parte 15), com o progresso real de cada tipo. */
export function GoalsCard() {
  const { t, settings } = useSettings();
  const data = useGoals();
  const today = todayKey();
  const list = data.goals.filter((g) => isOpenGoal(g) && g.status !== 'idea' && g.status !== 'paused').slice(0, 5);
  return (
    <CardShell title={t('dashboard.cards.goals')} icon={<Target className="h-5 w-5" />} tone="amber" link={{ to: '/goals', label: t('common.open') }}>
      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.goalsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((g) => (
            <li key={g.id}>
              <Link to={`/goals/${g.id}`} className="flex flex-col gap-1 rounded-xl px-2 py-1.5 transition hover:bg-surface-2/70">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{g.name}</span>
                  {g.deadline && <span className={cn('text-xs', isGoalOverdue(g, today) ? 'font-medium text-danger' : 'text-muted')}>{formatDateKey(g.deadline, settings.locale)}</span>}
                </span>
                <GoalProgressView goal={g} checkins={data.checkinsOf(g.id)} compact />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

/** Focus (Parte 13): minutos de hoje e a sessão em andamento, se houver. */
export function FocusCard() {
  const { t } = useSettings();
  const { timer, now } = useFocus();
  const today = todayKey();
  const minutes = useLiveQuery(async () => (await getDb().focusSessions.where('date').equals(today).toArray()).filter((s) => !s.deletedAt).reduce((a, s) => a + s.actualMin, 0), [today]);
  return (
    <CardShell title={t('dashboard.cards.focus')} icon={<Timer className="h-5 w-5" />} tone="violet" link={{ to: '/focus', label: t('common.open') }}>
      <div className="flex flex-col gap-3">
        <div>
          <span className="text-3xl font-semibold tabular tracking-tight text-fg">{t('focus.min', { min: minutes ?? 0 })}</span>
          <span className="ml-2 text-sm text-muted">{t('focus.stats.today')}</span>
        </div>
        {timer ? (
          <Link to="/focus" className="inline-flex w-fit items-center gap-2 rounded-xl bg-accent/15 px-3 py-2 text-sm font-semibold tabular text-accent">
            <Timer className="h-4 w-4" aria-hidden />
            {t(`focus.phases.${timer.phase}`)} · {formatClock(timer.waiting ? (timer.phaseMs ?? 0) : (phaseRemaining(timer, now) ?? phaseElapsed(timer, now)))}
          </Link>
        ) : (
          <Link to="/focus" className="inline-flex w-fit items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white">
            <Play className="h-4 w-4" aria-hidden />
            {t('focus.start')}
          </Link>
        )}
      </div>
    </CardShell>
  );
}

/** Música (Parte 11): prática da semana e músicas em andamento de cada instrumento. */
export function MusicCard() {
  const { t } = useSettings();
  const data = useMusic();
  const weekAgo = addDays(todayKey(), -6);
  return (
    <CardShell title={t('dashboard.cards.music')} icon={<Guitar className="h-5 w-5" />} tone="rose" link={{ to: '/music', label: t('common.open') }}>
      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : data.instruments.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.musicEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.instruments.map((ins) => {
            const min = data.practiceOf(ins.id).filter((p) => p.date >= weekAgo).reduce((a, p) => a + p.durationMin, 0);
            const learning = data.songsOf(ins.id).filter((s) => s.status === 'learning' || s.status === 'reviewing').length;
            return (
              <li key={ins.id}>
                <Link to={`/music/${ins.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface-2/70">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ins.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{ins.name}</span>
                  <span className="text-xs text-muted">{t('music.learningCount', { count: learning })}</span>
                  <span className="w-16 text-right text-xs tabular text-fg">{t('focus.min', { min })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

/** Esportes (Parte 12): treinos e partidas dos últimos 30 dias de cada esporte. */
export function SportsCard() {
  const { t } = useSettings();
  const data = useSports();
  const monthAgo = addDays(todayKey(), -29);
  return (
    <CardShell title={t('dashboard.cards.sports')} icon={<Trophy className="h-5 w-5" />} tone="teal" link={{ to: '/sports', label: t('common.open') }}>
      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : data.sports.length === 0 ? (
        <p className="text-sm text-muted">{t('dashboard.sportsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.sports.map((s) => {
            const acts = data.activitiesOf(s.id).filter((a) => a.date >= monthAgo);
            const trainings = acts.filter((a) => a.type === 'training').length;
            return (
              <li key={s.id}>
                <Link to={`/sports/${s.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface-2/70">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{s.name}</span>
                  <span className="text-xs text-muted">{t('sports.cardLine', { trainings, matches: acts.length - trainings })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

/** Finanças (Parte 16): sem nenhum valor em dinheiro no Dashboard (privacidade, Parte 16.8). */
export function FinanceCard() {
  const { t } = useSettings();
  const today = todayKey();
  const counts = useLiveQuery(async () => {
    const db = getDb();
    const assets = await db.finAssets.filter((a) => !a.deletedAt && !a.archived).count();
    const toReview = await db.finJournal.filter((j) => !j.deletedAt && !j.reviewedAt && !!j.reviewOn && j.reviewOn <= today).count();
    const terms = await db.finTerms.filter((x) => !x.deletedAt && isDue(x.srs, today)).count();
    return { assets, toReview, terms };
  }, [today]);
  return (
    <CardShell title={t('dashboard.cards.finance')} icon={<Wallet className="h-5 w-5" />} tone="blue" link={{ to: '/finance', label: t('common.open') }}>
      {!counts ? (
        <LoadingState label={t('common.loading')} lines={2} />
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          <li className="text-fg">{t('dashboard.financeAssets', { count: counts.assets })}</li>
          {counts.terms > 0 && <li className="text-fg">{t('dashboard.financeTerms', { count: counts.terms })}</li>}
          {counts.toReview > 0 && <li className="text-warning">{t('dashboard.financeReview', { count: counts.toReview })}</li>}
          <li className="text-xs text-muted">{t('dashboard.financePrivacy')}</li>
        </ul>
      )}
    </CardShell>
  );
}
