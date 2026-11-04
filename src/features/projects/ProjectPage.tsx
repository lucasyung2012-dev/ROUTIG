import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ImagePlus, Link2, NotebookPen, Plus, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createNote, emptyNoteInput, storeNoteFile } from '@/data/notesRepo';
import { projectHistory, projectInputOf, restoreProject, softDeleteProject, updateProject } from '@/data/projectsRepo';
import { createTask } from '@/data/tasksRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { notePreview } from '@/domain/notes';
import { positionOf, PROJECT_CATEGORIES, PROJECT_STATUSES, timelineRange, type Project, type ProjectInput, type ProjectStatus } from '@/domain/projects';
import { emptyTaskInput, normalizeTags, PRIORITIES, type Priority } from '@/domain/tasks';
import { TaskRow } from '@/features/tasks/TaskRow';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { BoardView, CalendarView } from '@/features/tasks/views';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { ColorPicker, ProjectCover, STATUS_TONE } from './ProjectsPage';
import { AutoTextarea } from '@/features/notes/BlockEditor';
import { useProjectsData, type ProjectsData } from './useProjectsData';

const TABS = ['overview', 'work', 'milestones', 'timeline', 'calendar', 'notes', 'materials', 'history'] as const;
type Tab = (typeof TABS)[number];

export function ProjectPage() {
  const { id } = useParams();
  const { t } = useSettings();
  const data = useProjectsData();
  const project = id ? data.byId.get(id) : undefined;
  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  if (!project || project.deletedAt)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-muted">{t('projects.notFound')}</p>
      </div>
    );
  return <ProjectDetail key={project.id} project={project} data={data} />;
}

function BackLink() {
  const { t } = useSettings();
  return (
    <Link to="/projects" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('projects.back')}
    </Link>
  );
}

function ProjectDetail({ project, data }: { project: Project; data: ProjectsData }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [draft, setDraft] = useState<ProjectInput>(() => projectInputOf(project));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  // Conta as edições: o que mudar durante um salvamento é salvo logo depois, não se perde.
  const edits = useRef(0);
  const timer = useRef<number>();
  const lastRev = useRef(project.rev);
  const latest = useRef(draft);
  latest.current = draft;

  useEffect(() => {
    if (project.rev !== lastRev.current && !dirty.current) {
      lastRev.current = project.rev;
      setDraft(projectInputOf(project));
    }
  }, [project]);

  const flush = async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    const at = edits.current;
    try {
      const next = await updateProject(project.id, latest.current);
      lastRev.current = next.rev;
      if (edits.current === at) dirty.current = false;
      else timer.current = window.setTimeout(() => void flush(), 300);
      setError(null);
      setSaved(true);
    } catch {
      setError(t('projects.invalid'));
    }
  };

  useEffect(
    () => () => {
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const change = (patch: Partial<ProjectInput>) => {
    setDraft((d) => ({ ...d, ...patch }));
    dirty.current = true;
    edits.current++;
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 600);
  };

  const progress = data.progressOf({ ...project, ...draft });

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <ProjectCover project={{ ...project, ...draft }} className="h-28 sm:h-36" />
        <div className="flex flex-col gap-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <AutoTextarea
                value={draft.name}
                maxLength={200}
                aria-label={t('projects.fields.name')}
                onChange={(e) => change({ name: e.target.value.replace(/\n/g, ' ') })}
                className="rounded-xl px-1 text-2xl font-semibold tracking-tight text-fg focus:bg-surface-2 sm:text-3xl"
              />
            </div>
            <Badge tone={STATUS_TONE[draft.status]}>{t(`projects.status.${draft.status}`)}</Badge>
          </div>
          {progress.percent !== null ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm text-muted">
                <span>
                  {t('projects.progress')}: {t('projects.progressDetail', { tasksDone: progress.tasksDone, tasksTotal: progress.tasksTotal, milestonesDone: progress.milestonesDone, milestonesTotal: progress.milestonesTotal })}
                </span>
                <span className="tabular text-lg font-semibold text-fg">{progress.percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress.percent}%`, background: draft.color }} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-subtle">{t('projects.progressNone')}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-subtle">
            <span aria-live="polite">{saved ? t('projects.saved') : ''}</span>
            {error && (
              <span role="alert" className="font-medium text-danger">
                {error}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
          {TABS.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => {
                void flush();
                setTab(id);
              }}
              className={cn('h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition', tab === id ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg')}
            >
              {t(`projects.tabs.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <Overview
          draft={draft}
          change={change}
          onTrash={async () => {
            await flush();
            await softDeleteProject(project.id);
            navigate('/projects');
            toast.show(t('projects.movedToTrash'), 'success', { label: t('projects.undo'), run: () => void restoreProject(project.id) });
          }}
        />
      )}
      {tab === 'work' && <Work project={project} draft={draft} change={change} data={data} />}
      {tab === 'milestones' && <Milestones draft={draft} change={change} />}
      {tab === 'timeline' && <Timeline draft={draft} data={data} projectId={project.id} />}
      {tab === 'calendar' && <ProjectCalendar data={data} projectId={project.id} />}
      {tab === 'notes' && <ProjectNotes project={project} />}
      {tab === 'materials' && <Materials draft={draft} change={change} />}
      {tab === 'history' && <ProjectHistory project={project} />}
    </div>
  );
}

function Lines({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join('\n'));
  useEffect(() => setText(value.join('\n')), [value]);
  return (
    <Field label={label} hint={hint}>
      {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(text.split('\n'))} />}
    </Field>
  );
}

function Overview({ draft, change, onTrash }: { draft: ProjectInput; change: (p: Partial<ProjectInput>) => void; onTrash: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const cover = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState(draft.tags.join(', '));
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Surface className="flex flex-col gap-4">
        <Field label={t('projects.fields.description')}>{(id) => <Textarea id={id} rows={5} value={draft.description} onChange={(e) => change({ description: e.target.value })} />}</Field>
        <Lines label={t('projects.fields.objectives')} hint={t('projects.fields.objectivesHint')} value={draft.objectives} onChange={(objectives) => change({ objectives })} />
        <Lines label={t('projects.fields.participants')} hint={t('projects.fields.participantsHint')} value={draft.participants} onChange={(participants) => change({ participants })} />
      </Surface>
      <Surface className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('projects.fields.status')}>
            {(id) => (
              <Select id={id} value={draft.status} onChange={(e) => change({ status: e.target.value as ProjectStatus })}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`projects.status.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('projects.fields.priority')}>
            {(id) => (
              <Select id={id} value={draft.priority} onChange={(e) => change({ priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`tasks.priority.${p}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('projects.fields.category')}>
            {(id) => (
              <Select id={id} value={draft.category} onChange={(e) => change({ category: e.target.value })}>
                <option value="">—</option>
                {PROJECT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`projects.category.${c}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('projects.fields.tags')}>
            {(id) => <Input id={id} value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => change({ tags: normalizeTags(tags.split(',')) })} />}
          </Field>
          <Field label={t('projects.fields.start')}>{(id) => <Input id={id} type="date" value={draft.start ?? ''} onChange={(e) => change({ start: e.target.value || null })} />}</Field>
          <Field label={t('projects.fields.due')}>{(id) => <Input id={id} type="date" value={draft.due ?? ''} onChange={(e) => change({ due: e.target.value || null })} />}</Field>
        </div>
        <ColorPicker value={draft.color} onChange={(color) => change({ color })} />
        <div className="flex flex-wrap gap-2">
          <input
            ref={cover}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void storeNoteFile(f, f.name).then((s) => change({ coverFileId: s.id }), () => toast.show(t('errors.saveFailed'), 'error'));
            }}
          />
          <Button size="sm" variant="secondary" icon={<ImagePlus className="h-4 w-4" aria-hidden />} onClick={() => cover.current?.click()}>
            {t('projects.fields.chooseCover')}
          </Button>
          {draft.coverFileId && (
            <Button size="sm" variant="ghost" onClick={() => change({ coverFileId: null })}>
              {t('projects.fields.removeCover')}
            </Button>
          )}
        </div>
        <Button variant="danger" size="sm" className="mt-2 w-fit" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={onTrash}>
          {t('projects.moveToTrash')}
        </Button>
      </Surface>
    </div>
  );
}

function Work({ project, draft, change, data }: { project: Project; draft: ProjectInput; change: (p: Partial<ProjectInput>) => void; data: ProjectsData }) {
  const { t } = useSettings();
  const toast = useToast();
  const editor = useTaskEditor();
  const actions = useTaskActions(data.tasks);
  const [mode, setMode] = useState<'list' | 'kanban'>('list');
  const [newTask, setNewTask] = useState('');
  const [newPhase, setNewPhase] = useState('');
  const tasks = data.tasksOf(project.id).filter((x) => !x.parentId);
  const groups: Array<{ id: string | null; name: string }> = [...draft.phases.map((p) => ({ id: p.id, name: p.name })), { id: null, name: t('projects.noPhase') }];

  return (
    <div className="flex flex-col gap-5">
      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('projects.phases')}</h2>
        <ul className="flex flex-col gap-2">
          {draft.phases.map((ph, i) => (
            <li key={ph.id} className="flex flex-wrap items-center gap-2">
              <input type="checkbox" checked={ph.done} aria-label={`${t('projects.phaseDone')}: ${ph.name}`} onChange={() => change({ phases: draft.phases.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} className="h-5 w-5 accent-[rgb(var(--accent))]" />
              <Input value={ph.name} aria-label={t('projects.phaseName')} onChange={(e) => change({ phases: draft.phases.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className={cn('min-w-[10rem] flex-1', ph.done && 'text-subtle line-through')} />
              <Input type="date" aria-label={t('projects.fields.start')} value={ph.start ?? ''} onChange={(e) => change({ phases: draft.phases.map((x, j) => (j === i ? { ...x, start: e.target.value || null } : x)) })} className="w-auto" />
              <Input type="date" aria-label={t('projects.fields.due')} value={ph.end ?? ''} onChange={(e) => change({ phases: draft.phases.map((x, j) => (j === i ? { ...x, end: e.target.value || null } : x)) })} className="w-auto" />
              <IconButton size="sm" label={t('projects.removePhase', { name: ph.name })} icon={<X className="h-4 w-4" />} onClick={() => change({ phases: draft.phases.filter((_, j) => j !== i) })} />
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newPhase.trim()) return;
            change({ phases: [...draft.phases, { id: newId('ph'), name: newPhase.trim().slice(0, 120), start: null, end: null, done: false }] });
            setNewPhase('');
          }}
        >
          <Input value={newPhase} onChange={(e) => setNewPhase(e.target.value)} placeholder={t('projects.addPhase')} aria-label={t('projects.phaseName')} className="min-w-0 flex-1" />
          <Button type="submit" icon={<Plus className="h-4 w-4" aria-hidden />} disabled={!newPhase.trim()}>
            {t('projects.addPhase')}
          </Button>
        </form>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 font-semibold text-fg">{t('projects.tasks')}</h2>
          <Segmented
            label={t('projects.viewLabel')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'list', label: t('projects.views.list') },
              { value: 'kanban', label: t('projects.views.kanban') },
            ]}
          />
        </div>
        <p className="text-xs text-subtle">{t('projects.tasksHint')}</p>
        <Input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder={t('projects.addTask')}
          aria-label={t('projects.addTask')}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !newTask.trim()) return;
            const title = newTask.trim();
            setNewTask('');
            void createTask(emptyTaskInput({ title, projectId: project.id, originModule: 'projects' })).catch(() => {
              setNewTask((cur) => cur || title);
              toast.show(t('errors.saveFailed'), 'error');
            });
          }}
        />
        {mode === 'kanban' ? (
          <BoardView tasks={tasks} data={data.tasks} onOpen={editor.openTask} onToggle={actions.toggle} onNew={(d) => editor.newTask({ ...d, projectId: project.id, originModule: 'projects' })} showClosed />
        ) : (
          groups.map((g) => {
            const list = tasks.filter((x) => (draft.taskPhases[x.id] ?? null) === g.id || (g.id === null && !draft.phases.some((p) => p.id === draft.taskPhases[x.id])));
            if (g.id === null && list.length === 0) return null;
            return (
              <section key={g.id ?? 'none'} aria-label={g.name}>
                <h3 className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{g.name}</h3>
                <ul className="flex flex-col divide-y divide-line/50">
                  {list.map((task) => (
                    <li key={task.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <TaskRow task={task} data={data.tasks} onOpen={editor.openTask} onToggle={actions.toggle} />
                      </div>
                      {draft.phases.length > 0 && (
                        <select
                          aria-label={`${t('projects.phaseOf')}: ${task.title}`}
                          value={draft.taskPhases[task.id] ?? ''}
                          onChange={(e) => {
                            const next = { ...draft.taskPhases };
                            if (e.target.value) next[task.id] = e.target.value;
                            else delete next[task.id];
                            change({ taskPhases: next });
                          }}
                          className="h-9 max-w-[9rem] rounded-lg bg-surface-2 px-2 text-xs text-muted ring-1 ring-line"
                        >
                          <option value="">{t('projects.noPhase')}</option>
                          {draft.phases.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </Surface>
      {actions.dialogs}
    </div>
  );
}

function Milestones({ draft, change }: { draft: ProjectInput; change: (p: Partial<ProjectInput>) => void }) {
  const { t, settings } = useSettings();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const sorted = [...draft.milestones].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  return (
    <Surface className="flex flex-col gap-3">
      {sorted.length === 0 && <p className="text-sm text-muted">{t('projects.noMilestones')}</p>}
      <ol className="flex flex-col gap-2">
        {sorted.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2/60">
            <button
              type="button"
              aria-pressed={m.done}
              aria-label={`${t('projects.milestoneDone')}: ${m.title}`}
              onClick={() => change({ milestones: draft.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })}
              className={cn('h-5 w-5 shrink-0 rotate-45 rounded-[3px] ring-2 transition', m.done ? 'bg-success ring-success' : 'ring-amber')}
            />
            <Input value={m.title} aria-label={t('projects.milestoneTitle')} onChange={(e) => change({ milestones: draft.milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)) })} className={cn('min-w-[10rem] flex-1', m.done && 'text-subtle line-through')} />
            <Input type="date" aria-label={t('inbox.dateLabel')} value={m.date ?? ''} onChange={(e) => change({ milestones: draft.milestones.map((x) => (x.id === m.id ? { ...x, date: e.target.value || null } : x)) })} className="w-auto" />
            {m.done && m.doneAt && <span className="text-xs text-success">{new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(m.doneAt))}</span>}
            <IconButton size="sm" label={t('projects.removeMilestone', { title: m.title })} icon={<X className="h-4 w-4" />} onClick={() => change({ milestones: draft.milestones.filter((x) => x.id !== m.id) })} />
          </li>
        ))}
      </ol>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          change({ milestones: [...draft.milestones, { id: newId('ms'), title: title.trim().slice(0, 200), date: date || null, done: false, doneAt: null }] });
          setTitle('');
          setDate('');
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('projects.addMilestone')} aria-label={t('projects.milestoneTitle')} className="min-w-[12rem] flex-1" />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('inbox.dateLabel')} className="w-auto" />
        <Button type="submit" icon={<Plus className="h-4 w-4" aria-hidden />} disabled={!title.trim()}>
          {t('projects.addMilestone')}
        </Button>
      </form>
    </Surface>
  );
}

function Timeline({ draft, data, projectId }: { draft: ProjectInput; data: ProjectsData; projectId: string }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const tasks = data.tasksOf(projectId).filter((x) => x.dueDate);
  const dates = [draft.start, draft.due, ...draft.phases.flatMap((p) => [p.start, p.end]), ...draft.milestones.map((m) => m.date), ...tasks.map((x) => x.dueDate)];
  if (!dates.some(Boolean)) return <p className="rounded-2xl bg-surface-2/50 p-6 text-center text-sm text-muted">{t('projects.timelineEmpty')}</p>;
  const range = timelineRange(dates, today);
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-3">
      <span className="truncate text-xs font-medium text-muted">{label}</span>
      <div className="relative h-8 rounded-lg bg-surface-2/50">{children}</div>
    </div>
  );
  return (
    <Surface className="overflow-x-auto">
      <div className="relative flex min-w-[600px] flex-col gap-2">
        <div className="grid grid-cols-[8rem_1fr] gap-3 text-[0.7rem] text-subtle">
          <span />
          <div className="flex justify-between">
            <span>{formatDateKey(range.from, settings.locale)}</span>
            <span>{formatDateKey(range.to, settings.locale)}</span>
          </div>
        </div>
        {(draft.start || draft.due) && (
          <Row label={draft.name}>
            <span
              className="absolute inset-y-1 rounded-md opacity-80"
              style={{ left: `${positionOf(draft.start ?? range.from, range)}%`, width: `${Math.max(1, positionOf(draft.due ?? range.to, range) - positionOf(draft.start ?? range.from, range))}%`, background: draft.color }}
            />
          </Row>
        )}
        {draft.phases.map((p) => (
          <Row key={p.id} label={p.name}>
            {(p.start || p.end) && (
              <span
                className={cn('absolute inset-y-1.5 rounded-md', p.done ? 'bg-success/60' : 'bg-accent/50')}
                style={{ left: `${positionOf(p.start ?? p.end!, range)}%`, width: `${Math.max(1, positionOf(p.end ?? p.start!, range) - positionOf(p.start ?? p.end!, range))}%` }}
              />
            )}
          </Row>
        ))}
        <Row label={t('projects.milestones')}>
          {draft.milestones
            .filter((m) => m.date)
            .map((m) => (
              <span key={m.id} title={m.title} className={cn('absolute top-2.5 h-3 w-3 -translate-x-1/2 rotate-45', m.done ? 'bg-success' : 'bg-amber')} style={{ left: `${positionOf(m.date!, range)}%` }} />
            ))}
        </Row>
        <Row label={t('projects.tasks')}>
          {tasks.map((x) => (
            <span key={x.id} title={x.title} className="absolute top-3 h-2 w-2 -translate-x-1/2 rounded-full bg-violet" style={{ left: `${positionOf(x.dueDate!, range)}%` }} />
          ))}
        </Row>
        <div className="pointer-events-none absolute bottom-0 top-5 w-px bg-rose" style={{ left: `calc(8rem + 0.75rem + (100% - 8.75rem) * ${positionOf(today, range) / 100})` }} aria-label={t('projects.today')} />
      </div>
    </Surface>
  );
}

function ProjectCalendar({ data, projectId }: { data: ProjectsData; projectId: string }) {
  const editor = useTaskEditor();
  const actions = useTaskActions(data.tasks);
  return (
    <Surface padded={false} className="p-3">
      <CalendarView tasks={data.tasksOf(projectId)} data={data.tasks} onOpen={editor.openTask} onToggle={actions.toggle} onNew={(d) => editor.newTask({ ...d, projectId, originModule: 'projects' })} />
    </Surface>
  );
}

function ProjectNotes({ project }: { project: Project }) {
  const { t } = useSettings();
  const navigate = useNavigate();
  const notes = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt && n.links.some((l) => l.type === 'project' && l.id === project.id)).toArray(), [project.id]);
  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-semibold text-fg">{t('projects.notesLinked')}</h2>
        <Button
          size="sm"
          variant="secondary"
          icon={<NotebookPen className="h-4 w-4" aria-hidden />}
          onClick={() => void createNote(emptyNoteInput({ title: project.name, links: [{ type: 'project', id: project.id }] })).then((n) => navigate(`/notes/${n.id}`))}
        >
          {t('projects.newNote')}
        </Button>
      </div>
      {!notes?.length ? (
        <p className="text-sm text-muted">{t('projects.noNotes')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {notes.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="block rounded-xl bg-surface-2/60 px-3 py-2 ring-1 ring-line/60 hover:bg-surface-2">
                <span className="font-medium text-fg">{n.title || t('notes.untitled')}</span>
                <span className="mt-0.5 block line-clamp-1 text-xs text-muted">{notePreview(n)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

function Materials({ draft, change }: { draft: ProjectInput; change: (p: Partial<ProjectInput>) => void }) {
  const { t } = useSettings();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  return (
    <Surface className="flex flex-col gap-3">
      <h2 className="font-semibold text-fg">{t('projects.references')}</h2>
      <ul className="flex flex-col gap-1.5">
        {draft.references.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <a href={r.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-sm text-accent hover:underline">
              {r.title || r.url}
            </a>
            <IconButton size="sm" label={t('projects.removeReference', { title: r.title || r.url })} icon={<X className="h-4 w-4" />} onClick={() => change({ references: draft.references.filter((x) => x.id !== r.id) })} />
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (!/^https?:$/.test(new URL(url.trim()).protocol)) throw new Error('protocol');
          } catch {
            setError(true);
            return;
          }
          change({ references: [...draft.references, { id: newId('ref'), title: title.trim(), url: url.trim() }] });
          setTitle('');
          setUrl('');
          setError(false);
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('projects.referenceTitle')} aria-label={t('projects.referenceTitle')} className="sm:w-48" />
        <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('projects.referenceUrl')} aria-label={t('projects.referenceUrl')} className="min-w-0 flex-1" />
        <Button type="submit" disabled={!url.trim()}>
          {t('projects.addReference')}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {t('projects.invalidUrl')}
        </p>
      )}
      <p className="text-xs text-subtle">{t('projects.filesLater')}</p>
    </Surface>
  );
}

function ProjectHistory({ project }: { project: Project }) {
  const { t, settings } = useSettings();
  const entries = useLiveQuery(() => projectHistory(project.id), [project.id, project.rev]);
  const fmt = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'short', timeStyle: 'short' });
  return (
    <Surface>
      {!entries?.length ? (
        <p className="text-sm text-muted">{t('tasks.editor.historyEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {entries.slice(0, 100).map((e) => (
            <li key={e.seq} className="flex gap-3 text-sm">
              <span className="w-32 shrink-0 tabular text-subtle">{fmt.format(new Date(e.at))}</span>
              <span className="text-muted">
                {e.action === 'complete'
                  ? t('projects.history.complete', { note: e.note ?? '' })
                  : e.action === 'update'
                    ? t('tasks.history.update', { fields: (e.fields ?? []).join(', ') })
                    : e.action === 'skip'
                      ? t('tasks.history.skip', { note: e.note ?? '' })
                      : t(`tasks.history.${e.action}`)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Surface>
  );
}
