import { useMemo, type ReactNode } from 'react';
import { Check, Plus, Repeat, SkipForward } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createTask, skipOccurrence, updateTask, type UpdateResult } from '@/data/tasksRepo';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import { blockers, compareTasks, completionTimes, emptyTaskInput, isClosedKind, isOverdue, PRIORITIES, statusKind, type Priority, type Task } from '@/domain/tasks';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { useStatusName, useTasksData, type TasksData } from '@/features/tasks/useTasksData';
import { Button } from '@/ui/Button';
import { Input, Select } from '@/ui/Field';
import { LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import type { TasksSector } from '../../interiors/east';
import { Chips, Empty, SectionTitle, Stat, Station, rowClass, useStationMemory } from './station';

/**
 * Estações do Centro de Operações. Tudo lê e grava as mesmas tarefas do Tasks (tasksRepo e os hooks
 * do módulo): criar, concluir/reabrir (com o mesmo aviso de bloqueio), mudar status, prioridade e
 * prazo, pular ocorrência. O título abre o mesmo editor de tarefa do app, por cima do Campus.
 */
export function TasksStations({ id }: { id: TasksSector }) {
  const { t } = useSettings();
  const data = useTasksData();
  const actions = useTaskActions(data);
  const plate = t(`park.native.east.tasks.plates.${id}`);
  let body: ReactNode;
  if (data.loading) body = <LoadingState label={t('common.loading')} lines={3} />;
  else if (id === 'capture') body = <Capture data={data} toggle={actions.toggle} onError={actions.reportError} />;
  else if (id === 'atrium') body = <Overview data={data} toggle={actions.toggle} />;
  else if (id === 'kanban') body = <Kanban data={data} toggle={actions.toggle} report={actions.reportResult} onError={actions.reportError} />;
  else if (id === 'lists') body = <Lists data={data} toggle={actions.toggle} onError={actions.reportError} />;
  else if (id === 'planning') body = <Priorities data={data} toggle={actions.toggle} onError={actions.reportError} />;
  else if (id === 'recurrence') body = <Deadlines data={data} toggle={actions.toggle} report={actions.reportResult} onError={actions.reportError} />;
  else body = <Review data={data} toggle={actions.toggle} />;
  return (
    <Station building="tasks" plate={plate} to="/tasks">
      {body}
      {actions.dialogs}
    </Station>
  );
}

type Toggle = (task: Task) => void;

const isClosed = (data: TasksData, task: Task) => isClosedKind(statusKind(data.config, task.statusId));
const openTasks = (data: TasksData) => data.active.filter((x) => !isClosed(data, x)).sort(compareTasks(data.config));

/** Uma tarefa na estação: marcar (de verdade, só com o toque) e abrir no editor do app. */
function TaskLine({ task, data, toggle, children }: { task: Task; data: TasksData; toggle: Toggle; children?: ReactNode }) {
  const { t, settings } = useSettings();
  const editor = useTaskEditor();
  const closed = isClosed(data, task);
  const late = isOverdue(task, todayKey(), data.config);
  const list = task.listId ? data.lists.find((l) => l.id === task.listId) : undefined;
  return (
    <li className={cn(rowClass, 'flex items-start gap-2.5')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={closed}
        aria-label={t(closed ? 'tasks.reopen' : 'tasks.markDone', { title: task.title })}
        onClick={() => toggle(task)}
        className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ring-inset transition', closed ? 'bg-success text-white ring-success' : 'ring-line hover:ring-accent')}
      >
        {closed && <Check className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => editor.openTask(task.id)} className={cn('block w-full truncate text-left text-sm hover:text-accent', closed ? 'text-muted line-through' : 'text-fg')}>
          {task.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {task.dueDate && (
            <span className={cn(late && 'font-medium text-danger')}>
              {late ? `${t('tasks.overdueLabel')} · ` : ''}
              {formatDateKey(task.dueDate, settings.locale)}
              {task.dueTime ? ` ${task.dueTime}` : ''}
            </span>
          )}
          {task.priority !== 'none' && <span>{t(`tasks.priority.${task.priority}`)}</span>}
          {task.recurrence && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" aria-hidden />
              {t('tasks.recurring')}
            </span>
          )}
          {list && (
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: list.color }} aria-hidden />
              {list.name}
            </span>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}

function TaskList({ tasks, data, toggle, empty, render }: { tasks: Task[]; data: TasksData; toggle: Toggle; empty: string; render?: (task: Task) => ReactNode }) {
  if (tasks.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((task) => (
        <TaskLine key={task.id} task={task} data={data} toggle={toggle}>
          {render?.(task)}
        </TaskLine>
      ))}
    </ul>
  );
}

/* ---------- Criação rápida ---------- */

interface Draft {
  title: string;
  due: string;
  priority: Priority;
  listId: string;
}

function Capture({ data, toggle, onError }: { data: TasksData; toggle: Toggle; onError: (e: unknown) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [draft, setDraft] = useStationMemory<Draft>('tasks.capture', () => ({ title: '', due: '', priority: 'none', listId: '' }));
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const today = todayKey();
  const recent = useMemo(() => [...data.active].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [data.active]);
  const create = async () => {
    const title = draft.title.trim();
    if (!title) return;
    const sent = draft;
    // Limpa o título na hora (prazo, prioridade e lista ficam para a próxima).
    set({ title: '' });
    try {
      await createTask(emptyTaskInput({ title, dueDate: sent.due || null, priority: sent.priority, listId: sent.listId || null }));
      toast.show(t('tasks.added'));
    } catch (e) {
      setDraft((d) => ({ ...d, title: d.title || title }));
      onError(e);
    }
  };
  return (
    <>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input aria-label={t('tasks.editor.titleLabel')} placeholder={t('tasks.editor.titlePlaceholder')} value={draft.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('tasks.editor.dueDate')}
            <Input type="date" value={draft.due} onChange={(e) => set({ due: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('tasks.editor.priority')}
            <Select value={draft.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`tasks.priority.${p}`)}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['today', 'tomorrow'] as const).map((d) => {
            const v = d === 'today' ? today : addDays(today, 1);
            return (
              <button key={d} type="button" aria-pressed={draft.due === v} onClick={() => set({ due: draft.due === v ? '' : v })} className={cn('h-8 rounded-lg px-3 text-xs font-medium ring-1 ring-inset', draft.due === v ? 'bg-accent/15 text-accent ring-accent/40' : 'text-muted ring-line hover:text-fg')}>
                {t(`tasks.due.${d}`)}
              </button>
            );
          })}
          {data.lists.length > 0 && (
            <Select aria-label={t('tasks.editor.list')} value={draft.listId} onChange={(e) => set({ listId: e.target.value })} className="h-8 w-auto flex-1 text-xs">
              <option value="">{t('tasks.filters.noList')}</option>
              {data.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!draft.title.trim()}>
          {t('tasks.newTask')}
        </Button>
      </form>
      <SectionTitle>{t('park.native.east.tasks.recent')}</SectionTitle>
      <TaskList tasks={recent} data={data} toggle={toggle} empty={t('park.native.east.tasks.noneYet')} />
    </>
  );
}

/* ---------- Visão geral: hoje, atrasadas e bloqueadas ---------- */

function Overview({ data, toggle }: { data: TasksData; toggle: Toggle }) {
  const { t } = useSettings();
  const today = todayKey();
  const open = openTasks(data);
  const late = open.filter((x) => isOverdue(x, today, data.config));
  const dueToday = open.filter((x) => x.dueDate === today);
  const stuck = open.filter((x) => statusKind(data.config, x.statusId) === 'waiting' || blockers(x, data.byId, data.config).length > 0);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={late.length} label={t('tasks.due.overdue')} tone={late.length ? 'danger' : undefined} />
        <Stat value={dueToday.length} label={t('tasks.due.today')} />
        <Stat value={open.length} label={t('park.native.east.tasks.openTotal')} />
      </div>
      {late.length > 0 && (
        <>
          <SectionTitle>{t('tasks.due.overdue')}</SectionTitle>
          <TaskList tasks={late.slice(0, 20)} data={data} toggle={toggle} empty="" />
        </>
      )}
      <SectionTitle>{t('tasks.due.today')}</SectionTitle>
      <TaskList tasks={dueToday} data={data} toggle={toggle} empty={late.length ? t('park.native.east.tasks.noneToday') : t('park.native.east.tasks.noneTodayOrLate')} />
      {stuck.length > 0 && (
        <>
          <SectionTitle>{t('park.native.east.tasks.stuck')}</SectionTitle>
          <TaskList
            tasks={stuck.slice(0, 20)}
            data={data}
            toggle={toggle}
            empty=""
            render={(task) => {
              const b = blockers(task, data.byId, data.config);
              return b.length ? <p className="mt-1 text-xs text-warning">{t('tasks.blockedBy', { title: b.map((x) => x.title).join(', ') })}</p> : null;
            }}
          />
        </>
      )}
    </>
  );
}

/* ---------- Kanban: as colunas são os status abertos do Tasks ---------- */

function Kanban({ data, toggle, report, onError }: { data: TasksData; toggle: Toggle; report: (r: UpdateResult) => void; onError: (e: unknown) => void }) {
  const { t } = useSettings();
  const statusName = useStatusName();
  const columns = data.config.statuses.filter((s) => !isClosedKind(s.kind));
  const [col, setCol] = useStationMemory<string>('tasks.kanban', () => columns[0]?.id ?? '');
  const current = columns.some((s) => s.id === col) ? col : (columns[0]?.id ?? '');
  const top = openTasks(data).filter((x) => !x.parentId);
  const inCol = top.filter((x) => x.statusId === current);
  return (
    <>
      <Chips label={t('tasks.views.board')} value={current} onChange={setCol} options={columns.map((s) => ({ value: s.id, label: `${statusName(s)} · ${top.filter((x) => x.statusId === s.id).length}` }))} />
      <TaskList
        tasks={inCol}
        data={data}
        toggle={toggle}
        empty={t('park.native.east.tasks.emptyColumn')}
        render={(task) => (
          <Select
            aria-label={`${t('tasks.moveTo')}: ${task.title}`}
            value={task.statusId}
            onChange={(e) => void updateTask(task.id, { statusId: e.target.value }).then(report, onError)}
            className="mt-1.5 h-8 w-auto text-xs"
          >
            {data.config.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === task.statusId ? statusName(s) : `${t('tasks.moveTo')}: ${statusName(s)}`}
              </option>
            ))}
          </Select>
        )}
      />
    </>
  );
}

/* ---------- Listas ---------- */

function Lists({ data, toggle, onError }: { data: TasksData; toggle: Toggle; onError: (e: unknown) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [listId, setListId] = useStationMemory<string>('tasks.lists', () => data.lists[0]?.id ?? 'none');
  const [text, setText] = useStationMemory<string>('tasks.lists.text', () => '');
  const current = listId === 'none' || data.lists.some((l) => l.id === listId) ? listId : 'none';
  const tasks = openTasks(data).filter((x) => !x.parentId && (current === 'none' ? !x.listId : x.listId === current));
  const add = async () => {
    const title = text.trim();
    if (!title) return;
    setText('');
    try {
      await createTask(emptyTaskInput({ title, listId: current === 'none' ? null : current }));
      toast.show(t('tasks.added'));
    } catch (e) {
      setText((cur) => cur || title);
      onError(e);
    }
  };
  return (
    <>
      <Chips
        label={t('tasks.filters.list')}
        value={current}
        onChange={setListId}
        options={[{ value: 'none', label: t('tasks.filters.noList') }, ...data.lists.map((l) => ({ value: l.id, label: l.name, color: l.color }))]}
      />
      {data.lists.length === 0 && <p className="text-xs text-muted">{t('park.native.east.tasks.noLists')}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input aria-label={t('tasks.quickAddPlaceholder')} placeholder={t('tasks.quickAddPlaceholder')} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!text.trim()}>
          {t('park.native.east.add')}
        </Button>
      </form>
      <TaskList tasks={tasks} data={data} toggle={toggle} empty={t('park.native.east.tasks.emptyList')} />
    </>
  );
}

/* ---------- Prioridades e prazos ---------- */

function Priorities({ data, toggle, onError }: { data: TasksData; toggle: Toggle; onError: (e: unknown) => void }) {
  const { t } = useSettings();
  const open = openTasks(data);
  const order = [...PRIORITIES].reverse();
  return (
    <>
      <p className="text-xs text-muted">{t('park.native.east.tasks.prioritiesHint')}</p>
      {order.map((p) => {
        const group = open.filter((x) => x.priority === p);
        if (group.length === 0) return null;
        return (
          <section key={p} className="flex flex-col gap-1.5">
            <SectionTitle>{`${t(`tasks.priority.${p}`)} · ${group.length}`}</SectionTitle>
            <TaskList
              tasks={group.slice(0, 15)}
              data={data}
              toggle={toggle}
              empty=""
              render={(task) => (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Select aria-label={`${t('tasks.editor.priority')}: ${task.title}`} value={task.priority} onChange={(e) => void updateTask(task.id, { priority: e.target.value as Priority }).catch(onError)} className="h-8 w-auto text-xs">
                    {PRIORITIES.map((x) => (
                      <option key={x} value={x}>
                        {t(`tasks.priority.${x}`)}
                      </option>
                    ))}
                  </Select>
                  <Input type="date" aria-label={`${t('tasks.editor.dueDate')}: ${task.title}`} value={task.dueDate ?? ''} onChange={(e) => void updateTask(task.id, { dueDate: e.target.value || null }).catch(onError)} className="h-8 w-auto text-xs" />
                </div>
              )}
            />
          </section>
        );
      })}
      {open.length === 0 && <Empty>{t('park.native.east.tasks.noneOpen')}</Empty>}
    </>
  );
}

/* ---------- Prazos dos próximos 14 dias e recorrências ---------- */

function Deadlines({ data, toggle, report, onError }: { data: TasksData; toggle: Toggle; report: (r: UpdateResult) => void; onError: (e: unknown) => void }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const end = addDays(today, 13);
  const open = openTasks(data);
  const soon = open.filter((x) => x.dueDate && x.dueDate >= today && x.dueDate <= end);
  const days = [...new Set(soon.map((x) => x.dueDate as string))].sort();
  const noDue = open.filter((x) => !x.dueDate && !x.parentId).length;
  const skip = (task: Task) => (
    <button type="button" onClick={() => void skipOccurrence(task.id).then(report, onError)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
      <SkipForward className="h-3.5 w-3.5" aria-hidden />
      {t('tasks.editor.skipNext')}
    </button>
  );
  return (
    <>
      <p className="text-xs text-muted">{t('park.native.east.tasks.nextDays', { count: soon.length })}</p>
      {days.length === 0 ? (
        <Empty>{t('park.native.east.tasks.noDeadlines')}</Empty>
      ) : (
        days.map((d) => (
          <section key={d} className="flex flex-col gap-1.5">
            <SectionTitle>{d === today ? t('tasks.due.today') : formatDateKey(d, settings.locale, { weekday: 'long', day: 'numeric', month: 'short' })}</SectionTitle>
            <TaskList tasks={soon.filter((x) => x.dueDate === d)} data={data} toggle={toggle} empty="" render={(task) => (task.recurrence && task.dueDate ? skip(task) : null)} />
          </section>
        ))
      )}
      {noDue > 0 && <p className="text-xs text-muted">{t('park.native.east.tasks.withoutDue', { count: noDue })}</p>}
    </>
  );
}

/* ---------- Arquivo de execução: o que foi concluído ---------- */

function Review({ data, toggle }: { data: TasksData; toggle: Toggle }) {
  const { t } = useSettings();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const closed = data.active.filter((x) => isClosed(data, x)).sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  // Conclusões reais dos últimos 7 dias (inclui as ocorrências de tarefas recorrentes).
  const doneWeek = data.active.reduce((n, x) => n + completionTimes(x).filter((at) => at >= weekAgo).length, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat value={doneWeek} label={t('park.native.east.tasks.doneWeek')} tone="accent" />
        <Stat value={closed.length} label={t('park.native.east.tasks.closedTotal')} />
      </div>
      <SectionTitle>{t('park.native.east.tasks.recentlyDone')}</SectionTitle>
      <TaskList tasks={closed.slice(0, 30)} data={data} toggle={toggle} empty={t('park.native.east.tasks.noneDone')} />
    </>
  );
}
