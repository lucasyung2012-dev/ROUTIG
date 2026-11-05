import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { Check, Link2, Lock, Plus, Repeat, SkipForward, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createTask, restoreTask, skipOccurrence, softDeleteTask, taskHistory, updateTask } from '@/data/tasksRepo';
import { formatDateKey } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { isOpenGoal } from '@/domain/goals';
import {
  emptyTaskInput,
  isClosedKind,
  normalizeTags,
  PRIORITIES,
  statusKind,
  upcomingOccurrences,
  wouldCreateCycle,
  type Recurrence,
  type Task,
  type TaskInput,
} from '@/domain/tasks';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { useStatusName, useTasksData, type TasksData } from './useTasksData';
import { useTaskActions } from './useTaskActions';

/* ---------- Contexto: abrir o editor de qualquer lugar do app ---------- */

interface EditorState {
  taskId: string | null;
  defaults: Partial<TaskInput>;
  open: boolean;
}

interface TaskEditorApi {
  openTask: (id: string) => void;
  newTask: (defaults?: Partial<TaskInput>) => void;
}

const TaskEditorContext = createContext<TaskEditorApi | null>(null);

export function TaskEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>({ taskId: null, defaults: {}, open: false });
  const api = useMemo<TaskEditorApi>(
    () => ({
      openTask: (id) => setState({ taskId: id, defaults: {}, open: true }),
      newTask: (defaults = {}) => setState({ taskId: null, defaults, open: true }),
    }),
    [],
  );
  return (
    <TaskEditorContext.Provider value={api}>
      {children}
      {state.open && (
        <TaskEditorDialog
          key={state.taskId ?? 'new'}
          taskId={state.taskId}
          defaults={state.defaults}
          onCreated={(id) => setState({ taskId: id, defaults: {}, open: true })}
          onClose={() => setState((s) => ({ ...s, open: false }))}
          onOpenOther={(id) => setState({ taskId: id, defaults: {}, open: true })}
        />
      )}
    </TaskEditorContext.Provider>
  );
}

export function useTaskEditor(): TaskEditorApi {
  const ctx = useContext(TaskEditorContext);
  if (!ctx) throw new Error('useTaskEditor precisa estar dentro de TaskEditorProvider');
  return ctx;
}

/* ---------- Janela do editor ---------- */

function inputOf(t: Task): TaskInput {
  const { title, description, notes, statusId, priority, dueDate, dueTime, listId, category, tags, parentId, checklist, attachments, projectId, goalId, originModule, recurrence, dependsOn } = t;
  const subjectId = t.subjectId ?? null;
  return { title, description, notes, statusId, priority, dueDate, dueTime, listId, category, tags, parentId, checklist, attachments, projectId, goalId, subjectId, originModule, recurrence, dependsOn };
}

interface DialogProps {
  taskId: string | null;
  defaults: Partial<TaskInput>;
  onCreated: (id: string) => void;
  onClose: () => void;
  onOpenOther: (id: string) => void;
}

function TaskEditorDialog({ taskId, defaults, onCreated, onClose, onOpenOther }: DialogProps) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const data = useTasksData();
  const statusName = useStatusName();
  const actions = useTaskActions(data);
  const task = taskId ? data.byId.get(taskId) : undefined;
  const isNew = !taskId;

  const [draft, setDraft] = useState<TaskInput>(() => (task ? inputOf(task) : emptyTaskInput(defaults)));
  const [titleError, setTitleError] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<number>();
  const lastRev = useRef(task?.rev ?? 0);

  // Quando a tarefa muda no banco (ex.: ocorrência avançou), atualiza o rascunho se não houver edição pendente.
  useEffect(() => {
    if (task && task.rev !== lastRev.current && !dirty.current) {
      lastRev.current = task.rev;
      setDraft(inputOf(task));
    }
  }, [task]);

  const save = useCallback(
    async (next: TaskInput) => {
      if (!taskId) return;
      if (!next.title.trim()) {
        setTitleError(true);
        return;
      }
      setTitleError(false);
      try {
        const result = await updateTask(taskId, next);
        lastRev.current = result.task.rev;
        dirty.current = false;
        setSaved(true);
        actions.reportResult(result);
        if (result.completedOccurrence) setDraft(inputOf(result.task));
      } catch (e) {
        actions.reportError(e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taskId],
  );

  const change = (patch: Partial<TaskInput>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (!isNew) {
        dirty.current = true;
        setSaved(false);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void save(next), 450);
      }
      return next;
    });
  };

  // Ao fechar, grava o que estiver pendente.
  const close = () => {
    if (dirty.current) {
      window.clearTimeout(timer.current);
      void save(draft);
    }
    onClose();
  };

  const create = async () => {
    if (!draft.title.trim()) {
      setTitleError(true);
      return;
    }
    try {
      const created = await createTask(draft);
      toast.show(t('tasks.added'));
      onCreated(created.id);
    } catch (e) {
      actions.reportError(e);
    }
  };

  const trash = async () => {
    if (!taskId) return;
    await softDeleteTask(taskId);
    onClose();
    toast.show(t('tasks.editor.movedToTrash'), 'success', { label: t('tasks.editor.undo'), run: () => void restoreTask(taskId) });
  };

  if (taskId && !data.loading && !task) return null;

  const closed = isClosedKind(statusKind(data.config, draft.statusId));

  return (
    <Dialog
      open
      size="lg"
      onClose={close}
      closeLabel={t('common.close')}
      title={isNew ? t('tasks.editor.newTitle') : t('tasks.editor.editTitle')}
      description={task ? t('tasks.editor.created', { date: new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(task.createdAt)) }) : undefined}
      footer={
        isNew ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => void create()}>
              {t('tasks.editor.create')}
            </Button>
          </>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => void trash()}>
              {t('tasks.editor.moveToTrash')}
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-subtle" aria-live="polite">
                {saved ? t('tasks.editor.saved') : ''}
              </span>
              <Button variant="primary" onClick={close}>
                {t('common.done')}
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-3">
          {!isNew && (
            <button
              type="button"
              onClick={() => task && actions.toggle(task)}
              aria-label={closed ? t('tasks.reopen', { title: draft.title }) : t('tasks.markDone', { title: draft.title })}
              className={cn('mt-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-2 transition', closed ? 'bg-success text-white ring-success' : 'ring-line hover:ring-accent')}
            >
              {closed && <Check className="h-4 w-4" aria-hidden />}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <label htmlFor="task-title" className="sr-only">
              {t('tasks.editor.titleLabel')}
            </label>
            <input
              id="task-title"
              autoFocus={isNew}
              value={draft.title}
              maxLength={300}
              placeholder={t('tasks.editor.titlePlaceholder')}
              onChange={(e) => change({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isNew) void create();
              }}
              aria-invalid={titleError || undefined}
              className="w-full rounded-xl bg-transparent px-1 py-1.5 text-xl font-semibold tracking-tight text-fg placeholder:text-subtle focus:bg-surface-2 focus:outline-none"
            />
            {titleError && (
              <p role="alert" className="px-1 text-xs font-medium text-danger">
                {t('tasks.editor.titleRequired')}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('tasks.editor.status')}>
            {(id) => (
              <Select id={id} value={draft.statusId} onChange={(e) => change({ statusId: e.target.value })}>
                {data.config.statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {statusName(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('tasks.editor.priority')}>
            {(id) => (
              <Select id={id} value={draft.priority} onChange={(e) => change({ priority: e.target.value as TaskInput['priority'] })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`tasks.priority.${p}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('tasks.editor.list')}>
            {(id) => (
              <Select id={id} value={draft.listId ?? ''} onChange={(e) => change({ listId: e.target.value || null })}>
                <option value="">{t('tasks.filters.noList')}</option>
                {data.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('tasks.editor.dueDate')}>
            {(id) => <Input id={id} type="date" value={draft.dueDate ?? ''} onChange={(e) => change({ dueDate: e.target.value || null })} />}
          </Field>
          <Field label={t('tasks.editor.dueTime')}>
            {(id) => <Input id={id} type="time" value={draft.dueTime ?? ''} disabled={!draft.dueDate} onChange={(e) => change({ dueTime: e.target.value || null })} />}
          </Field>
          <Field label={t('tasks.editor.category')}>
            {(id) => (
              <>
                <Input id={id} list="task-categories" value={draft.category} maxLength={60} placeholder={t('tasks.editor.categoryPlaceholder')} onChange={(e) => change({ category: e.target.value })} />
                <datalist id="task-categories">
                  {data.categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>

        <TagsInput tags={draft.tags} suggestions={data.tags} onChange={(tags) => change({ tags })} />

        <Field label={t('tasks.editor.description')}>
          {(id) => <Textarea id={id} rows={3} value={draft.description} onChange={(e) => change({ description: e.target.value })} />}
        </Field>

        <ChecklistEditor items={draft.checklist} onChange={(checklist) => change({ checklist })} />

        {task && <SubtasksEditor parent={task} data={data} onOpen={onOpenOther} onToggle={actions.toggle} />}

        <DependenciesEditor taskId={taskId} value={draft.dependsOn} data={data} onChange={(dependsOn) => change({ dependsOn })} />

        <RecurrenceEditor draft={draft} onChange={(recurrence) => change({ recurrence })} task={task} onSkip={() => taskId && void skipOccurrence(taskId).then((r) => {
          const occ = r.completedOccurrence;
          if (occ?.next) toast.show(t('tasks.occurrenceSkipped', { date: formatDateKey(occ.date, settings.locale), next: formatDateKey(occ.next, settings.locale) }));
        }, actions.reportError)} />

        <AttachmentsEditor items={draft.attachments} onChange={(attachments) => change({ attachments })} />

        <Field label={t('tasks.editor.notes')}>
          {(id) => <Textarea id={id} rows={3} value={draft.notes} onChange={(e) => change({ notes: e.target.value })} />}
        </Field>

        <Section title={t('tasks.editor.links')}>
          <ProjectField value={draft.projectId} onChange={(projectId) => change({ projectId })} />
          <SubjectField value={draft.subjectId ?? null} onChange={(subjectId) => change({ subjectId })} />
          <GoalField value={draft.goalId} onChange={(goalId) => change({ goalId })} />
          <p className="text-xs text-subtle">{t('tasks.editor.linkLater')}</p>
        </Section>

        {task && <HistoryList taskId={task.id} rev={task.rev} />}
      </div>
      {actions.dialogs}
    </Dialog>
  );
}

/* ---------- Partes do editor ---------- */

/** Projeto da tarefa (a tarefa continua sendo uma só; o projeto só aponta para ela). */
function ProjectField({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useSettings();
  const projects = useLiveQuery(() => getDb().projects.filter((p) => !p.deletedAt).toArray(), []);
  return (
    <Field label={t('tasks.editor.project')}>
      {(id) => (
        <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t('tasks.noProject')}</option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** Disciplina da Academy: a tarefa vira atividade da disciplina e aparece na página dela. */
/** Objetivo do Goals (Parte 15.2): a tarefa aponta para o objetivo, sem cópia. */
function GoalField({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useSettings();
  const goals = useLiveQuery(async () => (await getDb().goals.filter((g) => !g.deletedAt && (isOpenGoal(g) || g.id === value)).toArray()).sort((a, b) => a.name.localeCompare(b.name)), [value]);
  if (!goals?.length && !value) return null;
  return (
    <Field label={t('tasks.editor.goal')}>
      {(id) => (
        <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t('tasks.editor.noGoal')}</option>
          {(goals ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function SubjectField({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useSettings();
  const subjects = useLiveQuery(async () => {
    const db = getDb();
    const years = new Map((await db.academicYears.toArray()).map((y) => [y.id, y.label]));
    return (await db.subjects.filter((s) => !s.deletedAt).toArray())
      .map((s) => ({ id: s.id, label: `${s.name} · ${years.get(s.yearId) ?? ''}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);
  if (!subjects?.length && !value) return null;
  return (
    <Field label={t('tasks.editor.subject')}>
      {(id) => (
        <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t('tasks.editor.noSubject')}</option>
          {(subjects ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function TagsInput({ tags, suggestions, onChange }: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useSettings();
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    onChange(normalizeTags([...tags, ...text.split(',')]));
    setText('');
  };
  return (
    <Section title={t('tasks.editor.tags')}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-surface-2 p-2 ring-1 ring-inset ring-line">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-surface px-2 py-1 text-sm font-medium text-fg ring-1 ring-line">
            #{tag}
            <button type="button" aria-label={t('tasks.editor.removeTag', { tag })} className="text-subtle hover:text-danger" onClick={() => onChange(tags.filter((x) => x !== tag))}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={text}
          list="task-tags"
          aria-label={t('tasks.editor.tags')}
          placeholder={t('tasks.editor.tagsPlaceholder')}
          onChange={(e) => setText(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
            if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
          }}
          className="h-8 min-w-[10rem] flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-subtle focus:outline-none"
        />
        <datalist id="task-tags">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </Section>
  );
}

function ChecklistEditor({ items, onChange }: { items: TaskInput['checklist']; onChange: (items: TaskInput['checklist']) => void }) {
  const { t } = useSettings();
  const [text, setText] = useState('');
  const done = items.filter((i) => i.done).length;
  return (
    <Section title={t('tasks.editor.checklist')} aside={items.length > 0 && <span className="text-xs tabular text-muted">{t('tasks.checklistCount', { done, total: items.length })}</span>}>
      {items.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-surface-2">
            <input
              type="checkbox"
              checked={item.done}
              aria-label={item.text}
              onChange={() => onChange(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              className="h-5 w-5 rounded accent-[rgb(var(--accent))]"
            />
            <input
              value={item.text}
              aria-label={t('tasks.editor.checklist')}
              onChange={(e) => onChange(items.map((i) => (i.id === item.id ? { ...i, text: e.target.value } : i)))}
              className={cn('min-w-0 flex-1 bg-transparent text-sm focus:outline-none', item.done ? 'text-subtle line-through' : 'text-fg')}
            />
            <IconButton size="sm" label={t('tasks.editor.removeItem')} icon={<X className="h-4 w-4" />} onClick={() => onChange(items.filter((i) => i.id !== item.id))} />
          </li>
        ))}
      </ul>
      <Input
        value={text}
        aria-label={t('tasks.editor.addItem')}
        placeholder={t('tasks.editor.addItem')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            e.preventDefault();
            onChange([...items, { id: newId('ck'), text: text.trim().slice(0, 500), done: false }]);
            setText('');
          }
        }}
      />
    </Section>
  );
}

function SubtasksEditor({ parent, data, onOpen, onToggle }: { parent: Task; data: TasksData; onOpen: (id: string) => void; onToggle: (t: Task) => void }) {
  const { t } = useSettings();
  const [text, setText] = useState('');
  const children = data.active.filter((c) => c.parentId === parent.id);
  return (
    <Section title={t('tasks.editor.subtasks')}>
      <ul className="flex flex-col gap-1">
        {children.map((c) => {
          const closed = isClosedKind(statusKind(data.config, c.statusId));
          return (
            <li key={c.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-surface-2">
              <button
                type="button"
                onClick={() => onToggle(c)}
                aria-label={closed ? t('tasks.reopen', { title: c.title }) : t('tasks.markDone', { title: c.title })}
                className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2', closed ? 'bg-success text-white ring-success' : 'ring-line')}
              >
                {closed && <Check className="h-3 w-3" aria-hidden />}
              </button>
              <button type="button" onClick={() => onOpen(c.id)} className={cn('min-w-0 flex-1 truncate text-left text-sm', closed ? 'text-subtle line-through' : 'text-fg')}>
                {c.title}
              </button>
            </li>
          );
        })}
      </ul>
      <Input
        value={text}
        aria-label={t('tasks.editor.addSubtask')}
        placeholder={t('tasks.editor.addSubtask')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            e.preventDefault();
            void createTask(emptyTaskInput({ title: text.trim(), parentId: parent.id, listId: parent.listId, projectId: parent.projectId, originModule: parent.originModule }));
            setText('');
          }
        }}
      />
    </Section>
  );
}

function DependenciesEditor({ taskId, value, data, onChange }: { taskId: string | null; value: string[]; data: TasksData; onChange: (ids: string[]) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const options = data.active.filter((o) => o.id !== taskId && !value.includes(o.id));
  return (
    <Section title={t('tasks.editor.dependencies')}>
      {value.length === 0 && <p className="text-sm text-subtle">{t('tasks.editor.noDependencies')}</p>}
      <ul className="flex flex-col gap-1">
        {value.map((id) => {
          const dep = data.byId.get(id);
          const done = dep ? isClosedKind(statusKind(data.config, dep.statusId)) : true;
          return (
            <li key={id} className="flex items-center gap-2.5 rounded-lg bg-surface-2/70 px-3 py-2">
              {done ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Lock className="h-4 w-4 text-warning" aria-hidden />}
              <span className={cn('min-w-0 flex-1 truncate text-sm', done ? 'text-subtle line-through' : 'text-fg')}>{dep?.title ?? '—'}</span>
              <IconButton size="sm" label={t('tasks.editor.removeDependency')} icon={<X className="h-4 w-4" />} onClick={() => onChange(value.filter((v) => v !== id))} />
            </li>
          );
        })}
      </ul>
      {options.length > 0 && (
        <Select
          aria-label={t('tasks.editor.addDependency')}
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            if (taskId && wouldCreateCycle(taskId, id, data.byId)) {
              toast.show(t('tasks.editor.cycle'), 'error');
              return;
            }
            onChange([...value, id]);
          }}
        >
          <option value="">{t('tasks.editor.addDependency')}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </Select>
      )}
    </Section>
  );
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function emptyRecurrence(freq: Recurrence['freq']): Recurrence {
  return { freq, interval: 1, weekdays: [], pauses: [], exceptions: [], until: null };
}

function RecurrenceEditor({ draft, onChange, task, onSkip }: { draft: TaskInput; onChange: (r: Recurrence | null) => void; task?: Task; onSkip: () => void }) {
  const { t, settings } = useSettings();
  const r = draft.recurrence;
  const [pause, setPause] = useState({ from: '', to: '', label: '' });
  const weekdayName = (d: number) => new Intl.DateTimeFormat(settings.locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + d, 12));
  const upcoming = r && draft.dueDate ? upcomingOccurrences({ dueDate: draft.dueDate, recurrence: r }, 5) : [];

  return (
    <Section title={t('tasks.editor.recurrence')} aside={r && <Repeat className="h-4 w-4 text-accent" aria-hidden />}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('tasks.editor.recurrence')}>
          {(id) => (
            <Select id={id} value={r?.freq ?? ''} onChange={(e) => onChange(e.target.value ? { ...(r ?? emptyRecurrence('daily')), freq: e.target.value as Recurrence['freq'] } : null)}>
              <option value="">{t('tasks.editor.noRepeat')}</option>
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`tasks.editor.freqName.${f}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {r && (
          <>
            <Field label={t('tasks.editor.every')}>
              {(id) => (
                <div className="flex items-center gap-2">
                  <Input id={id} type="number" min={1} max={365} value={r.interval} className="w-20" onChange={(e) => onChange({ ...r, interval: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />
                  <span className="text-sm text-muted">{t(`tasks.editor.freq.${r.freq}`)}</span>
                </div>
              )}
            </Field>
            <Field label={t('tasks.editor.until')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} type="date" value={r.until ?? ''} onChange={(e) => onChange({ ...r, until: e.target.value || null })} />}
            </Field>
          </>
        )}
      </div>

      {r?.freq === 'weekly' && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('tasks.editor.weekdays')}>
          <span className="mr-1 text-sm text-muted">{t('tasks.editor.weekdays')}</span>
          {WEEKDAY_ORDER.map((d) => {
            const on = r.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...r, weekdays: on ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d] })}
                className={cn('h-9 min-w-[2.75rem] rounded-lg px-2 text-sm font-medium capitalize ring-1 transition', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line')}
              >
                {weekdayName(d)}
              </button>
            );
          })}
        </div>
      )}

      {r && !draft.dueDate && <p className="text-sm text-warning">{t('tasks.editor.needsDue')}</p>}

      {r && upcoming.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{t('tasks.editor.nextDates')}:</span>
          {upcoming.map((d) => (
            <span key={d} className="rounded-md bg-surface-2 px-2 py-0.5 tabular text-fg">
              {formatDateKey(d, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          ))}
          {task?.recurrence && task.dueDate && (
            <Button size="sm" variant="ghost" icon={<SkipForward className="h-4 w-4" aria-hidden />} onClick={onSkip}>
              {t('tasks.editor.skipNext')}
            </Button>
          )}
        </div>
      )}

      {r && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2/60 p-3 ring-1 ring-line/60">
          <div className="text-sm font-medium text-fg">{t('tasks.editor.pauses')}</div>
          {r.pauses.map((p, i) => (
            <div key={`${p.from}-${i}`} className="flex items-center gap-2 text-sm text-muted">
              <span className="tabular text-fg">
                {formatDateKey(p.from, settings.locale)} – {formatDateKey(p.to, settings.locale)}
              </span>
              {p.label && <span>· {p.label}</span>}
              <IconButton size="sm" label={t('tasks.editor.removeItem')} icon={<X className="h-4 w-4" />} onClick={() => onChange({ ...r, pauses: r.pauses.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" aria-label={t('tasks.editor.pauseFrom')} value={pause.from} onChange={(e) => setPause({ ...pause, from: e.target.value })} className="w-auto" />
            <Input type="date" aria-label={t('tasks.editor.pauseTo')} value={pause.to} onChange={(e) => setPause({ ...pause, to: e.target.value })} className="w-auto" />
            <Input aria-label={t('tasks.editor.pauseLabel')} placeholder={t('tasks.editor.pauseLabel')} value={pause.label} maxLength={80} onChange={(e) => setPause({ ...pause, label: e.target.value })} className="w-40" />
            <Button
              size="sm"
              disabled={!pause.from || !pause.to || pause.from > pause.to}
              onClick={() => {
                onChange({ ...r, pauses: [...r.pauses, { ...pause, label: pause.label.trim() }] });
                setPause({ from: '', to: '', label: '' });
              }}
            >
              {t('tasks.editor.addPause')}
            </Button>
          </div>
          {r.exceptions.length > 0 && (
            <div className="text-xs text-subtle">
              {t('tasks.editor.exceptions')}: {r.exceptions.map((d) => formatDateKey(d, settings.locale)).join(', ')}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function AttachmentsEditor({ items, onChange }: { items: TaskInput['attachments']; onChange: (items: TaskInput['attachments']) => void }) {
  const { t } = useSettings();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const add = () => {
    let valid = false;
    try {
      valid = /^https?:$/.test(new URL(url.trim()).protocol);
    } catch {
      valid = false;
    }
    if (!valid) {
      setError(true);
      return;
    }
    onChange([...items, { id: newId('att'), name: name.trim() || url.trim(), url: url.trim() }]);
    setName('');
    setUrl('');
    setError(false);
  };
  return (
    <Section title={t('tasks.editor.attachments')}>
      <ul className="flex flex-col gap-1">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
            <Link2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <a href={a.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-sm text-accent hover:underline">
              {a.name}
            </a>
            <IconButton size="sm" label={t('tasks.editor.removeItem')} icon={<X className="h-4 w-4" />} onClick={() => onChange(items.filter((x) => x.id !== a.id))} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Input aria-label={t('tasks.editor.attachmentName')} placeholder={t('tasks.editor.attachmentName')} value={name} onChange={(e) => setName(e.target.value)} className="sm:w-48" />
        <Input
          type="url"
          aria-label={t('tasks.editor.attachmentUrl')}
          placeholder={t('tasks.editor.attachmentUrl')}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(false);
          }}
          className="min-w-0 flex-1"
        />
        <Button size="md" onClick={add} disabled={!url.trim()}>
          {t('tasks.editor.addAttachment')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {t('tasks.editor.invalidUrl')}
        </p>
      )}
      <p className="text-xs text-subtle">{t('tasks.editor.filesLater')}</p>
    </Section>
  );
}

function HistoryList({ taskId, rev }: { taskId: string; rev: number }) {
  const { t, settings } = useSettings();
  const entries = useLiveQuery(() => taskHistory(taskId), [taskId, rev]);
  const fmt = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'short', timeStyle: 'short' });
  return (
    <Section title={t('tasks.editor.history')}>
      {!entries || entries.length === 0 ? (
        <p className="text-sm text-subtle">{t('tasks.editor.historyEmpty')}</p>
      ) : (
        <ol className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {entries.slice(0, 50).map((e) => (
            <li key={e.seq} className="flex gap-3 text-sm">
              <span className="w-28 shrink-0 tabular text-subtle">{fmt.format(new Date(e.at))}</span>
              <span className="text-muted">
                {e.action === 'update'
                  ? t('tasks.history.update', { fields: (e.fields ?? []).map((f) => fieldLabel(t, f)).join(', ') })
                  : e.action === 'complete' || e.action === 'skip'
                    ? t(`tasks.history.${e.action}`, { note: e.note ? formatDateKey(e.note, settings.locale) : '' })
                    : t(`tasks.history.${e.action}`)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

const FIELD_KEYS = ['title', 'description', 'notes', 'statusId', 'priority', 'dueDate', 'dueTime', 'listId', 'category', 'tags', 'parentId', 'checklist', 'attachments', 'projectId', 'goalId', 'originModule', 'recurrence', 'dependsOn'] as const;

function fieldLabel(t: ReturnType<typeof useSettings>['t'], f: string): string {
  return (FIELD_KEYS as readonly string[]).includes(f) ? t(`tasks.fields.${f as (typeof FIELD_KEYS)[number]}`) : f;
}
