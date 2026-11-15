import { useState } from 'react';
import { Check, ExternalLink, Plus } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createProject, projectInputOf, updateProject } from '@/data/projectsRepo';
import { createTask } from '@/data/tasksRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { emptyProjectInput, isClosedProject, isOverdueProject, PROJECT_CATEGORIES, PROJECT_COLORS, PROJECT_STATUSES, type Project, type ProjectInput, type ProjectStatus } from '@/domain/projects';
import { emptyTaskInput, isClosedKind, statusKind, type Task } from '@/domain/tasks';
import { useProjectsData, type ProjectsData } from '@/features/projects/useProjectsData';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Input, Select } from '@/ui/Field';
import { LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import type { ProjectsSector } from '../../interiors/east';
import { Chips, Empty, SectionTitle, Station, rowClass, useStationMemory } from './station';

/**
 * Estações do Centro de Projetos. Os mesmos projetos do Projects (projectsRepo, useProjectsData):
 * criar, mudar status, marcar marcos e etapas, criar e concluir as tarefas do projeto (que são as do
 * Tasks) e abrir os materiais. O progresso é o do módulo (marcos + tarefas), sem porcentagem inventada.
 */
export function ProjectsStations({ id }: { id: ProjectsSector }) {
  const { t } = useSettings();
  const data = useProjectsData();
  const actions = useTaskActions(data.tasks);
  return (
    <Station building="projects" plate={t(`park.native.east.projects.plates.${id}`)} to="/projects">
      {data.loading ? <LoadingState label={t('common.loading')} lines={3} /> : id === 'gallery' ? <Gallery data={data} toggle={actions.toggle} /> : <Studio data={data} />}
      {actions.dialogs}
    </Station>
  );
}

const STATUS_TONE: Record<ProjectStatus, 'neutral' | 'accent' | 'success' | 'warning' | 'info'> = {
  idea: 'neutral',
  planned: 'info',
  active: 'accent',
  paused: 'warning',
  done: 'success',
  cancelled: 'neutral',
  archived: 'neutral',
};

/** Salva o projeto pelo mesmo caminho da página do projeto (o repo registra marcos concluídos). */
function useSave() {
  const { t } = useSettings();
  const toast = useToast();
  return (p: Project, change: Partial<ProjectInput>) => void updateProject(p.id, { ...projectInputOf(p), ...change }).catch(() => toast.show(t('errors.saveFailed'), 'error'));
}

function Progress({ p, data }: { p: Project; data: ProjectsData }) {
  const { t } = useSettings();
  const pr = data.progressOf(p);
  if (pr.percent === null) return <p className="text-xs text-muted">{t('projects.progressNone')}</p>;
  return (
    <div className="flex flex-col gap-1">
      <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full" style={{ width: `${pr.percent}%`, background: p.color }} />
      </span>
      <span className="text-xs text-muted">
        {`${pr.percent}% · `}
        {t('projects.progressDetail', { tasksDone: pr.tasksDone, tasksTotal: pr.tasksTotal, milestonesDone: pr.milestonesDone, milestonesTotal: pr.milestonesTotal })}
      </span>
    </div>
  );
}

function CheckBox({ checked, label, onClick, small }: { checked: boolean; label: string; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn('flex shrink-0 items-center justify-center rounded-full ring-2 ring-inset transition', small ? 'h-5 w-5' : 'h-6 w-6', checked ? 'bg-success text-white ring-success' : 'ring-line hover:ring-accent')}
    >
      {checked && <Check className="h-3 w-3" aria-hidden />}
    </button>
  );
}

/* ---------- Galeria: os projetos ativos, um estande cada ---------- */

function Gallery({ data, toggle }: { data: ProjectsData; toggle: (task: Task) => void }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const [openId, setOpenId] = useStationMemory<string | null>('projects.gallery', () => null);
  const live = data.projects.filter((p) => !isClosedProject(p.status));
  const selected = openId ? live.find((p) => p.id === openId) : undefined;
  if (live.length === 0) return <Empty>{t('park.projects.none')}</Empty>;
  return (
    <ul className="flex flex-col gap-2">
      {live.map((p) => {
        const next = p.milestones.filter((m) => !m.done).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))[0];
        const late = isOverdueProject(p, today);
        const isOpen = selected?.id === p.id;
        return (
          <li key={p.id} className={cn(rowClass, 'flex flex-col gap-2 border-l-4')} style={{ borderLeftColor: p.color }}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : p.id)} className="flex items-center gap-2 text-left">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{p.name}</span>
              <Badge tone={STATUS_TONE[p.status]}>{t(`projects.status.${p.status}`)}</Badge>
            </button>
            <Progress p={p} data={data} />
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
              {p.due && <span className={cn(late && 'font-medium text-danger')}>{`${t('projects.fields.due')}: ${formatDateKey(p.due, settings.locale)}`}</span>}
              {next && <span>{`${t('park.native.east.projects.nextMilestone')}: ${next.title}${next.date ? ` (${formatDateKey(next.date, settings.locale)})` : ''}`}</span>}
            </div>
            {isOpen && <ProjectDetail p={p} data={data} toggle={toggle} />}
          </li>
        );
      })}
    </ul>
  );
}

function ProjectDetail({ p, data, toggle }: { p: Project; data: ProjectsData; toggle: (task: Task) => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const editor = useTaskEditor();
  const save = useSave();
  const [milestone, setMilestone] = useStationMemory<string>(`projects.ms.${p.id}`, () => '');
  const [task, setTask] = useStationMemory<string>(`projects.task.${p.id}`, () => '');
  const tasks = data.tasksOf(p.id).filter((x) => !x.parentId);
  const isDone = (x: Task) => isClosedKind(statusKind(data.tasks.config, x.statusId));
  const openTasks = tasks.filter((x) => !isDone(x));
  const addTask = async () => {
    const title = task.trim();
    if (!title) return;
    setTask('');
    try {
      await createTask(emptyTaskInput({ title, projectId: p.id, originModule: 'projects' }));
      toast.show(t('tasks.added'));
    } catch {
      setTask((cur) => cur || title);
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  const addMilestone = () => {
    const title = milestone.trim().slice(0, 200);
    if (!title) return;
    setMilestone('');
    save(p, { milestones: [...p.milestones, { id: newId('ms'), title, date: null, done: false, doneAt: null }] });
  };
  return (
    <div className="flex flex-col gap-2 border-t border-line/60 pt-2">
      {p.objectives.length > 0 && (
        <>
          <SectionTitle>{t('projects.fields.objectives')}</SectionTitle>
          <ul className="list-disc pl-5 text-sm text-fg">
            {p.objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </>
      )}

      {p.phases.length > 0 && (
        <>
          <SectionTitle>{t('projects.phases')}</SectionTitle>
          <ul className="flex flex-col gap-1">
            {p.phases.map((ph) => (
              <li key={ph.id} className="flex items-center gap-2 text-sm">
                <CheckBox small checked={ph.done} label={`${t('projects.phaseDone')}: ${ph.name}`} onClick={() => save(p, { phases: p.phases.map((x) => (x.id === ph.id ? { ...x, done: !x.done } : x)) })} />
                <span className={cn('min-w-0 flex-1 truncate', ph.done ? 'text-muted line-through' : 'text-fg')}>{ph.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>{t('projects.milestones')}</SectionTitle>
      {p.milestones.length === 0 ? (
        <Empty>{t('projects.noMilestones')}</Empty>
      ) : (
        <ul className="flex flex-col gap-1">
          {p.milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <CheckBox small checked={m.done} label={`${t('projects.milestoneDone')}: ${m.title}`} onClick={() => save(p, { milestones: p.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })} />
              <span className={cn('min-w-0 flex-1 truncate', m.done ? 'text-muted line-through' : 'text-fg')}>{m.title}</span>
              {m.date && <span className="text-xs text-muted">{formatDateKey(m.date, settings.locale)}</span>}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addMilestone();
        }}
      >
        <Input aria-label={t('projects.milestoneTitle')} placeholder={t('projects.milestoneTitle')} value={milestone} maxLength={200} onChange={(e) => setMilestone(e.target.value)} className="h-9" />
        <Button type="submit" size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!milestone.trim()}>
          {t('projects.addMilestone')}
        </Button>
      </form>

      <SectionTitle>{`${t('projects.tasks')} · ${openTasks.length}/${tasks.length}`}</SectionTitle>
      {openTasks.length === 0 ? (
        <Empty>{t('park.native.east.projects.noOpenTasks')}</Empty>
      ) : (
        <ul className="flex flex-col gap-1">
          {openTasks.slice(0, 15).map((x) => (
            <li key={x.id} className="flex items-center gap-2 text-sm">
              <CheckBox small checked={false} label={t('tasks.markDone', { title: x.title })} onClick={() => toggle(x)} />
              <button type="button" onClick={() => editor.openTask(x.id)} className="min-w-0 flex-1 truncate text-left text-fg hover:text-accent">
                {x.title}
              </button>
              {x.dueDate && <span className="text-xs text-muted">{formatDateKey(x.dueDate, settings.locale)}</span>}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addTask();
        }}
      >
        <Input aria-label={t('projects.addTask')} placeholder={t('projects.addTask')} value={task} maxLength={300} onChange={(e) => setTask(e.target.value)} className="h-9" />
        <Button type="submit" size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!task.trim()}>
          {t('park.native.east.add')}
        </Button>
      </form>

      {p.references.length > 0 && (
        <>
          <SectionTitle>{t('projects.tabs.materials')}</SectionTitle>
          <ul className="flex flex-col gap-1">
            {p.references.map((r) => (
              <li key={r.id}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-sm text-accent hover:underline">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{r.title || r.url}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------- Estúdio: criar projetos e cuidar do status ---------- */

interface NewDraft {
  name: string;
  category: string;
  status: ProjectStatus;
  due: string;
  color: string;
}

function Studio({ data }: { data: ProjectsData }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const save = useSave();
  const [draft, setDraft] = useStationMemory<NewDraft>('projects.new', () => ({ name: '', category: '', status: 'planned', due: '', color: PROJECT_COLORS[0] }));
  const [view, setView] = useStationMemory<'open' | 'closed'>('projects.studio.view', () => 'open');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<NewDraft>) => setDraft((d) => ({ ...d, ...p }));
  const create = async () => {
    const name = draft.name.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createProject(emptyProjectInput({ name, category: draft.category, status: draft.status, due: draft.due || null, color: draft.color }));
      setDraft((d) => ({ ...d, name: '', due: '' }));
      toast.show(t('projects.created'));
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const shown = data.projects.filter((p) => (view === 'open' ? !isClosedProject(p.status) : isClosedProject(p.status)));
  return (
    <>
      <form
        className="flex flex-col gap-2 rounded-xl bg-surface-2/60 p-3 ring-1 ring-inset ring-line/60"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input aria-label={t('projects.fields.name')} placeholder={t('projects.namePlaceholder')} value={draft.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('projects.fields.category')}
            <Select value={draft.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">—</option>
              {PROJECT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`projects.category.${c}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('projects.fields.status')}
            <Select value={draft.status} onChange={(e) => set({ status: e.target.value as ProjectStatus })}>
              {PROJECT_STATUSES.filter((s) => !isClosedProject(s)).map((s) => (
                <option key={s} value={s}>
                  {t(`projects.status.${s}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('projects.fields.due')}
            <Input type="date" value={draft.due} onChange={(e) => set({ due: e.target.value })} />
          </label>
          <div className="flex flex-col gap-1 text-xs text-muted">
            {t('projects.fields.color')}
            <div className="flex h-11 items-center gap-1.5" role="radiogroup" aria-label={t('projects.fields.color')}>
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={draft.color === c} aria-label={c} onClick={() => set({ color: c })} className={cn('h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-surface', draft.color === c ? 'ring-fg' : 'ring-transparent')} style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!draft.name.trim() || busy}>
          {t('projects.create')}
        </Button>
      </form>

      <Chips
        label={t('projects.fields.status')}
        value={view}
        onChange={setView}
        options={[
          { value: 'open', label: `${t('park.native.east.projects.inProgress')} · ${data.projects.filter((p) => !isClosedProject(p.status)).length}` },
          { value: 'closed', label: `${t('park.native.east.projects.closed')} · ${data.projects.filter((p) => isClosedProject(p.status)).length}` },
        ]}
      />
      {shown.length === 0 ? (
        <Empty>{view === 'open' ? t('park.projects.none') : t('park.native.east.projects.noneClosed')}</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((p) => {
            const pr = data.progressOf(p);
            return (
              <li key={p.id} className={cn(rowClass, 'flex items-center gap-2.5')}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{p.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {pr.percent === null ? t('projects.progressNone') : `${pr.percent}%`}
                    {p.due ? ` · ${formatDateKey(p.due, settings.locale)}` : ''}
                  </span>
                </div>
                <Select aria-label={`${t('projects.fields.status')}: ${p.name}`} value={p.status} onChange={(e) => save(p, { status: e.target.value as ProjectStatus })} className="h-9 w-auto text-xs">
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`projects.status.${s}`)}
                    </option>
                  ))}
                </Select>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
