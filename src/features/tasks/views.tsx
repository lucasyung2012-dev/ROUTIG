import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { updateTask } from '@/data/tasksRepo';
import { addMonths, formatDateKey, monthGrid, startOfMonth, todayKey, type DateKey } from '@/domain/dates';
import { DUE_BUCKETS, dueBucket, PRIORITIES, PRIORITY_RANK, type Task } from '@/domain/tasks';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';
import { PRIORITY_CLASS, TaskRow } from './TaskRow';
import { useStatusName, type TasksData } from './useTasksData';

interface ViewProps {
  tasks: Task[];
  data: TasksData;
  onOpen: (id: string) => void;
  onToggle: (t: Task) => void;
  onNew: (defaults: { dueDate?: DateKey; statusId?: string }) => void;
}

/* ---------- Lista simples ---------- */

export function ListView({ tasks, data, onOpen, onToggle }: ViewProps) {
  return (
    <ul className="flex flex-col divide-y divide-line/50">
      {tasks.map((t) => (
        <li key={t.id}>
          <TaskRow task={t} data={data} onOpen={onOpen} onToggle={onToggle} />
        </li>
      ))}
    </ul>
  );
}

/* ---------- Agrupamentos (prioridade, prazo, projeto, categoria) ---------- */

export interface Group {
  key: string;
  label: string;
  tone?: string;
  tasks: Task[];
}

export function GroupedView({ groups, data, onOpen, onToggle }: { groups: Group[] } & Omit<ViewProps, 'tasks' | 'onNew'>) {
  const visible = groups.filter((g) => g.tasks.length > 0);
  return (
    <div className="flex flex-col gap-6">
      {visible.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h3 className={cn('mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-[0.14em]', g.tone ?? 'text-subtle')}>
            {g.label}
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[0.7rem] tabular text-muted">{g.tasks.length}</span>
          </h3>
          <ListView tasks={g.tasks} data={data} onOpen={onOpen} onToggle={onToggle} onNew={() => {}} />
        </section>
      ))}
    </div>
  );
}

export function useGroups(tasks: Task[], data: TasksData) {
  const { t } = useSettings();
  const today = todayKey();
  return {
    priority: (): Group[] =>
      [...PRIORITIES]
        .sort((a, b) => PRIORITY_RANK[b] - PRIORITY_RANK[a])
        .map((p) => ({ key: p, label: t(`tasks.priority.${p}`), tone: PRIORITY_CLASS[p], tasks: tasks.filter((x) => x.priority === p) })),
    due: (): Group[] =>
      DUE_BUCKETS.map((b) => ({
        key: b,
        label: t(`tasks.due.${b}`),
        tone: b === 'overdue' ? 'text-danger' : b === 'today' ? 'text-accent' : undefined,
        tasks: tasks.filter((x) => dueBucket(x.dueDate, today) === b),
      })),
    project: (): Group[] => {
      const ids = [...new Set(tasks.map((x) => x.projectId))];
      return ids.map((id) => ({ key: id ?? 'none', label: id ?? t('tasks.noProject'), tasks: tasks.filter((x) => x.projectId === id) }));
    },
    category: (): Group[] => {
      const cats = [...new Set(tasks.map((x) => x.category))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
      return cats.map((c) => ({ key: c || 'none', label: c || t('tasks.noCategory'), tasks: tasks.filter((x) => x.category === c) }));
    },
    data,
  };
}

/* ---------- Quadro (Kanban por status) ---------- */

export function BoardView({ tasks, data, onOpen, onToggle, onNew, showClosed }: ViewProps & { showClosed: boolean }) {
  const { t } = useSettings();
  const statusName = useStatusName();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const columns = data.config.statuses.filter((s) => showClosed || (s.kind !== 'archived' && s.kind !== 'cancelled'));

  const move = (taskId: string, statusId: string) => {
    const task = data.byId.get(taskId);
    if (!task || task.statusId === statusId) return;
    if (data.config.statuses.find((s) => s.id === statusId)?.kind === 'done') onToggle(task);
    else void updateTask(taskId, { statusId });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-subtle">{t('tasks.dragHint')}</p>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {columns.map((col) => {
          const items = tasks.filter((x) => x.statusId === col.id);
          return (
            <section
              key={col.id}
              aria-label={statusName(col)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain') || dragId;
                if (id) move(id, col.id);
                setDragId(null);
                setOver(null);
              }}
              className={cn('flex w-[280px] shrink-0 snap-start flex-col rounded-2xl bg-surface-2/60 p-2 ring-1 transition', over === col.id ? 'ring-accent/60' : 'ring-line/60')}
            >
              <header className="flex items-center justify-between px-2 py-1.5">
                <h3 className="text-sm font-semibold text-fg">
                  {statusName(col)} <span className="ml-1 text-xs font-normal tabular text-subtle">{items.length}</span>
                </h3>
                <IconButton size="sm" label={`${t('tasks.newTask')}: ${statusName(col)}`} icon={<Plus className="h-4 w-4" />} onClick={() => onNew({ statusId: col.id })} />
              </header>
              <ul className="flex min-h-[3rem] flex-col gap-2">
                {items.map((task) => (
                  <li
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(task.id);
                      e.dataTransfer.setData('text/plain', task.id);
                    }}
                    className="rounded-xl bg-surface shadow-soft ring-1 ring-line/70"
                  >
                    <TaskRow task={task} data={data} onOpen={onOpen} onToggle={onToggle} compact />
                    <div className="border-t border-line/50 px-3 py-1.5">
                      <label className="flex items-center gap-2 text-xs text-subtle">
                        {t('tasks.moveTo')}
                        <select
                          value={task.statusId}
                          onChange={(e) => move(task.id, e.target.value)}
                          className="min-w-0 flex-1 rounded-md bg-transparent py-1 text-xs text-muted focus:outline-none"
                        >
                          {data.config.statuses.map((s) => (
                            <option key={s.id} value={s.id}>
                              {statusName(s)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Calendário (mês) ---------- */

export function CalendarView({ tasks, data, onOpen, onNew }: ViewProps) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const [month, setMonth] = useState(startOfMonth(today));
  const days = monthGrid(month, settings.weekStartsOn);
  const byDay = new Map<string, Task[]>();
  for (const task of tasks) if (task.dueDate) byDay.set(task.dueDate, [...(byDay.get(task.dueDate) ?? []), task]);
  const weekdayLabels = days.slice(0, 7).map((d) => formatDateKey(d, settings.locale, { weekday: 'short' }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-lg font-semibold capitalize tracking-tight text-fg">{formatDateKey(month, settings.locale, { month: 'long', year: 'numeric' })}</h3>
        <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(today))}>
          {t('tasks.calendar.today')}
        </Button>
        <IconButton size="sm" label={t('tasks.calendar.prev')} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setMonth(addMonths(month, -1, 1))} />
        <IconButton size="sm" label={t('tasks.calendar.next')} icon={<ChevronRight className="h-4 w-4" />} onClick={() => setMonth(addMonths(month, 1, 1))} />
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-2xl ring-1 ring-line/70">
          {weekdayLabels.map((w, i) => (
            <div key={i} className="bg-surface-2 px-2 py-2 text-center text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            return (
              <div key={d} className={cn('group relative min-h-[6.5rem] border-t border-line/50 p-1.5 [&:not(:nth-child(7n+1))]:border-l', inMonth ? 'bg-surface' : 'bg-surface-2/40')}>
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium tabular',
                      d === today ? 'bg-brand text-white' : inMonth ? 'text-fg' : 'text-subtle',
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  <button
                    type="button"
                    aria-label={t('tasks.calendar.addOn', { date: formatDateKey(d, settings.locale, { dateStyle: 'long' }) })}
                    onClick={() => onNew({ dueDate: d })}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-subtle opacity-0 transition hover:bg-surface-2 hover:text-fg focus:opacity-100 group-hover:opacity-100"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <ul className="mt-1 flex flex-col gap-1">
                  {items.slice(0, 3).map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(task.id)}
                        className={cn(
                          'w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs font-medium',
                          task.completedAt ? 'bg-surface-3 text-subtle line-through' : 'bg-accent/10 text-fg hover:bg-accent/20',
                        )}
                      >
                        {task.dueTime && <span className="mr-1 tabular text-muted">{task.dueTime}</span>}
                        {task.title}
                      </button>
                    </li>
                  ))}
                  {items.length > 3 && <li className="px-1.5 text-[0.7rem] text-muted">{t('tasks.calendar.more', { count: items.length - 3 })}</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <TasksWithoutDate tasks={tasks} data={data}>
        {(n) => n}
      </TasksWithoutDate>
    </div>
  );
}

function TasksWithoutDate({ tasks, children }: { tasks: Task[]; data: TasksData; children: (n: ReactNode) => ReactNode }) {
  const { t } = useSettings();
  const count = tasks.filter((x) => !x.dueDate).length;
  if (count === 0) return null;
  return <p className="text-xs text-subtle">{children(`${t('tasks.due.none')}: ${count}`)}</p>;
}
