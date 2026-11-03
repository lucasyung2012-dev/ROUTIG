import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Columns3, Flag, FolderKanban, List, ListTodo, Plus, Search, Settings2, Shapes, SlidersHorizontal, Timer, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createTask } from '@/data/tasksRepo';
import { addDays, todayKey } from '@/domain/dates';
import { compareTasks, EMPTY_FILTER, emptyTaskInput, matchesFilter, PRIORITIES, type Priority, type TaskFilter } from '@/domain/tasks';
import { Button } from '@/ui/Button';
import { Input, Select } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { useTaskEditor } from './TaskEditor';
import { useTaskActions } from './useTaskActions';
import { useStatusName, useTasksData } from './useTasksData';
import { BoardView, CalendarView, GroupedView, ListView, useGroups } from './views';
import { TasksConfigDialog, TrashDialog } from './TasksDialogs';

const VIEWS = [
  { id: 'list', icon: List },
  { id: 'board', icon: Columns3 },
  { id: 'calendar', icon: CalendarDays },
  { id: 'priority', icon: Flag },
  { id: 'due', icon: Timer },
  { id: 'project', icon: FolderKanban },
  { id: 'category', icon: Shapes },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

const VIEW_KEY = 'routig.tasks.view';

function readView(): ViewId {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.id === v) ? (v as ViewId) : 'list';
  } catch {
    return 'list';
  }
}

export function TasksPage() {
  const { t } = useSettings();
  const toast = useToast();
  const data = useTasksData();
  const editor = useTaskEditor();
  const actions = useTaskActions(data);
  const statusName = useStatusName();
  const [view, setView] = useState<ViewId>(readView);
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const [quick, setQuick] = useState('');
  const [quickDue, setQuickDue] = useState<'' | 'today' | 'tomorrow'>('');
  const [trashOpen, setTrashOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const quickRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* preferência só desta sessão */
    }
  }, [view]);

  // Atalho: "n" cria tarefa quando o foco não está num campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        quickRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showClosed = filter.showClosed || view === 'board';
  const visible = useMemo(() => {
    const f = { ...filter, showClosed };
    return data.active.filter((x) => !x.parentId || filter.text.trim() !== '').filter((x) => matchesFilter(x, f, data.config)).sort(compareTasks(data.config));
  }, [data, filter, showClosed]);

  const g = useGroups(visible, data);

  const addQuick = async () => {
    const title = quick.trim();
    if (!title) return;
    const today = todayKey();
    const listId = filter.listId && filter.listId !== 'none' ? filter.listId : null;
    try {
      await createTask(emptyTaskInput({ title, listId, dueDate: quickDue === 'today' ? today : quickDue === 'tomorrow' ? addDays(today, 1) : null }));
      setQuick('');
      toast.show(t('tasks.added'));
    } catch (e) {
      actions.reportError(e);
    }
  };

  const filtered =
    filter.text !== '' || filter.statusIds.length > 0 || filter.priorities.length > 0 || filter.listId !== null || filter.tag !== null || filter.category !== null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet/10 text-violet">
            <ListTodo className="h-7 w-7" aria-hidden />
          </div>
        }
        title={t('modules.tasks')}
        description={t('moduleSummary.tasks')}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setTrashOpen(true)}>
              {t('tasks.trashButton')}
              {data.trash.length > 0 && <span className="rounded-full bg-surface-3 px-1.5 text-xs tabular">{data.trash.length}</span>}
            </Button>
            <Button variant="ghost" size="sm" icon={<Settings2 className="h-4 w-4" aria-hidden />} onClick={() => setConfigOpen(true)}>
              {t('tasks.configButton')}
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => editor.newTask({ listId: filter.listId && filter.listId !== 'none' ? filter.listId : null })}>
              {t('tasks.newTask')}
            </Button>
          </>
        }
      />

      {/* Criação rápida */}
      <div className="flex flex-col gap-2 rounded-2xl bg-surface p-2 shadow-soft ring-1 ring-line/70 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Plus className="h-5 w-5 shrink-0 text-accent" aria-hidden />
          <input
            ref={quickRef}
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addQuick();
            }}
            maxLength={300}
            aria-label={t('tasks.quickAddPlaceholder')}
            placeholder={t('tasks.quickAddPlaceholder')}
            className="h-11 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-fg placeholder:text-subtle focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1 px-1" role="group" aria-label={t('tasks.quickAddDate')}>
          {(['today', 'tomorrow'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={quickDue === d}
              onClick={() => setQuickDue((v) => (v === d ? '' : d))}
              className={cn('h-9 rounded-lg px-3 text-sm font-medium ring-1 transition', quickDue === d ? 'bg-accent/15 text-accent ring-accent/40' : 'text-muted ring-line hover:text-fg')}
            >
              {t(`tasks.due.${d}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Listas */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('tasks.filters.list')}>
        <ListChip active={filter.listId === null} onClick={() => setFilter({ ...filter, listId: null })} label={t('tasks.filters.allLists')} />
        <ListChip active={filter.listId === 'none'} onClick={() => setFilter({ ...filter, listId: 'none' })} label={t('tasks.filters.noList')} />
        {data.lists.map((l) => (
          <ListChip key={l.id} active={filter.listId === l.id} onClick={() => setFilter({ ...filter, listId: l.id })} label={l.name} color={l.color} />
        ))}
      </div>

      {/* Visualizações e filtros */}
      <div className="flex flex-col gap-3">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label={t('tasks.viewLabel')} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
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
                {t(`tasks.views.${id}`)}
              </button>
            ))}
          </div>
        </div>

        {/* No celular os filtros ficam recolhidos para não empurrar as tarefas para baixo. */}
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="task-filters"
          onClick={() => setFiltersOpen((o) => !o)}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-surface-2 px-3.5 text-sm font-medium text-fg ring-1 ring-inset ring-line sm:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {t('tasks.filters.toggle')}
          {filtered && <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />}
        </button>
        <div id="task-filters" className={cn('gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto] lg:items-center', filtersOpen ? 'grid' : 'hidden')}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} placeholder={t('tasks.filters.search')} aria-label={t('tasks.filters.search')} className="pl-9" />
          </div>
          <Select aria-label={t('tasks.filters.status')} value={filter.statusIds[0] ?? ''} onChange={(e) => setFilter({ ...filter, statusIds: e.target.value ? [e.target.value] : [] })}>
            <option value="">{t('tasks.filters.allStatuses')}</option>
            {data.config.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {statusName(s)}
              </option>
            ))}
          </Select>
          <Select aria-label={t('tasks.filters.priority')} value={filter.priorities[0] ?? ''} onChange={(e) => setFilter({ ...filter, priorities: e.target.value ? [e.target.value as Priority] : [] })}>
            <option value="">{t('tasks.filters.allPriorities')}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`tasks.priority.${p}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t('tasks.filters.tag')} value={filter.tag ?? ''} onChange={(e) => setFilter({ ...filter, tag: e.target.value || null })}>
            <option value="">{t('tasks.filters.allTags')}</option>
            {data.tags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-3">
            {view !== 'board' && <Switch label={t('tasks.filters.showClosed')} checked={filter.showClosed} onChange={(showClosed) => setFilter({ ...filter, showClosed })} />}
            {filtered && (
              <Button size="sm" variant="ghost" onClick={() => setFilter({ ...EMPTY_FILTER, showClosed: filter.showClosed })}>
                {t('tasks.filters.clear')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Surface padded={false} className="p-2 sm:p-3">
        {data.loading ? (
          <LoadingState label={t('common.loading')} lines={4} />
        ) : visible.length === 0 && view !== 'calendar' && view !== 'board' ? (
          <EmptyState
            icon={<ListTodo className="h-6 w-6" aria-hidden />}
            title={filtered ? t('tasks.empty.filtered') : t('tasks.empty.title')}
            body={filtered ? undefined : t('tasks.empty.body')}
            action={
              filtered ? (
                <Button size="sm" onClick={() => setFilter(EMPTY_FILTER)}>
                  {t('tasks.filters.clear')}
                </Button>
              ) : undefined
            }
          />
        ) : view === 'list' ? (
          <ListView tasks={visible} data={data} onOpen={editor.openTask} onToggle={actions.toggle} onNew={(d) => editor.newTask(d)} />
        ) : view === 'board' ? (
          <BoardView tasks={visible} data={data} onOpen={editor.openTask} onToggle={actions.toggle} onNew={(d) => editor.newTask(d)} showClosed={filter.showClosed} />
        ) : view === 'calendar' ? (
          <CalendarView tasks={visible} data={data} onOpen={editor.openTask} onToggle={actions.toggle} onNew={(d) => editor.newTask(d)} />
        ) : (
          <>
            <GroupedView
              groups={view === 'priority' ? g.priority() : view === 'due' ? g.due() : view === 'project' ? g.project() : g.category()}
              data={data}
              onOpen={editor.openTask}
              onToggle={actions.toggle}
            />
          </>
        )}
      </Surface>

      <TrashDialog open={trashOpen} onClose={() => setTrashOpen(false)} data={data} />
      <TasksConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} data={data} />
      {actions.dialogs}
    </div>
  );
}

function ListChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn('inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium ring-1 transition', active ? 'bg-fg text-bg ring-fg' : 'bg-surface text-muted ring-line hover:text-fg')}
    >
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />}
      {label}
    </button>
  );
}
