import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, Flag, FolderKanban, GanttChart, LayoutGrid, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createProject, purgeProject, restoreProject, updateProject, projectInputOf } from '@/data/projectsRepo';
import { addMonths, formatDateKey, monthGrid, startOfMonth, todayKey, capitalizeFirst } from '@/domain/dates';
import { emptyProjectInput, isClosedProject, isOverdueProject, positionOf, PROJECT_CATEGORIES, PROJECT_STATUSES, timelineRange, type Project, type ProjectStatus } from '@/domain/projects';
import { useObjectUrl } from '@/features/files/useObjectUrl';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { ColorPicker as AppColorPicker } from '@/ui/ColorPicker';
import { cn } from '@/ui/cn';
import { useProjectsData, type ProjectsData } from './useProjectsData';

const VIEWS = [
  { id: 'list', icon: LayoutGrid },
  { id: 'kanban', icon: Columns3 },
  { id: 'timeline', icon: GanttChart },
  { id: 'calendar', icon: CalendarDays },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];
const VIEW_KEY = 'routig.projects.view';

export const STATUS_TONE: Record<ProjectStatus, 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'> = {
  idea: 'neutral',
  planned: 'info',
  active: 'accent',
  paused: 'warning',
  done: 'success',
  cancelled: 'neutral',
  archived: 'neutral',
};

export function ProjectsPage() {
  const { t } = useSettings();
  const data = useProjectsData();
  const [view, setView] = useState<ViewId>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return VIEWS.some((x) => x.id === v) ? (v as ViewId) : 'list';
    } catch {
      return 'list';
    }
  });
  const [showClosed, setShowClosed] = useState(false);
  const location = useLocation();
  // "+ Criar → Projeto" chega aqui pedindo para abrir a criação.
  const [creating, setCreating] = useState(() => !!(location.state as { create?: boolean } | null)?.create);
  const [trashOpen, setTrashOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* só nesta sessão */
    }
  }, [view]);

  const visible = useMemo(() => data.projects.filter((p) => showClosed || view === 'kanban' || !isClosedProject(p.status)), [data.projects, showClosed, view]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber/10 text-amber">
            <FolderKanban className="h-7 w-7" aria-hidden />
          </div>
        }
        title={t('modules.projects')}
        description={t('moduleSummary.projects')}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setTrashOpen(true)}>
              {t('projects.trash')}
              {data.trash.length > 0 && <span className="rounded-full bg-surface-3 px-1.5 text-xs tabular">{data.trash.length}</span>}
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>
              {t('projects.newProject')}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label={t('projects.viewLabel')} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
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
                {t(`projects.views.${id}`)}
              </button>
            ))}
          </div>
        </div>
        {view !== 'kanban' && <Switch label={t('projects.showClosed')} checked={showClosed} onChange={setShowClosed} />}
      </div>

      {data.loading ? (
        <LoadingState label={t('common.loading')} lines={4} />
      ) : data.projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6" aria-hidden />}
          title={t('projects.emptyTitle')}
          body={t('projects.emptyBody')}
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>
              {t('projects.newProject')}
            </Button>
          }
        />
      ) : view === 'list' ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} data={data} />
            </li>
          ))}
        </ul>
      ) : view === 'kanban' ? (
        <ProjectsKanban data={data} />
      ) : view === 'timeline' ? (
        <ProjectsTimeline projects={visible} />
      ) : (
        <ProjectsCalendar projects={visible} />
      )}

      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
      {trashOpen && <ProjectsTrashDialog data={data} onClose={() => setTrashOpen(false)} />}
    </div>
  );
}

export function ProjectCover({ project, className }: { project: Project; className?: string }) {
  const url = useObjectUrl(project.coverFileId);
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={url ? undefined : { background: `linear-gradient(135deg, ${project.color}, ${project.color}66)` }}
      aria-hidden
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

function ProjectCard({ project: p, data }: { project: Project; data: ProjectsData }) {
  const { t, settings } = useSettings();
  const progress = data.progressOf(p);
  const overdue = isOverdueProject(p, todayKey());
  return (
    <Link to={`/projects/${p.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
      <ProjectCover project={p} className="h-20" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-balance font-semibold text-fg">{p.name}</h3>
          <Badge tone={STATUS_TONE[p.status]}>{t(`projects.status.${p.status}`)}</Badge>
        </div>
        {p.description && <p className="line-clamp-2 text-sm text-muted">{p.description}</p>}
        <div className="mt-auto flex flex-col gap-2">
          {progress.percent === null ? (
            <p className="text-xs text-subtle">{t('projects.progressNone')}</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{t('projects.progressDetail', { tasksDone: progress.tasksDone, tasksTotal: progress.tasksTotal, milestonesDone: progress.milestonesDone, milestonesTotal: progress.milestonesTotal })}</span>
                <span className="tabular font-semibold text-fg">{progress.percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${progress.percent}%`, background: p.color }} />
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-x-3 text-xs text-muted">
            {p.category && <span>{PROJECT_CATEGORIES.includes(p.category as never) ? t(`projects.category.${p.category as (typeof PROJECT_CATEGORIES)[number]}`) : p.category}</span>}
            {p.due && (
              <span className={cn(overdue && 'font-semibold text-danger')}>
                {t('projects.dueIn', { date: formatDateKey(p.due, settings.locale) })}
                {overdue && ` · ${t('projects.overdue')}`}
              </span>
            )}
            {p.priority !== 'none' && (
              <span className="inline-flex items-center gap-1">
                <Flag className="h-3 w-3" aria-hidden />
                {t(`tasks.priority.${p.priority}`)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function ProjectsKanban({ data }: { data: ProjectsData }) {
  const { t } = useSettings();
  const toast = useToast();
  const [over, setOver] = useState<ProjectStatus | null>(null);
  const move = (p: Project, status: ProjectStatus) => {
    if (p.status === status) return;
    void updateProject(p.id, { ...projectInputOf(p), status }).catch(() => toast.show(t('errors.saveFailed'), 'error'));
  };
  return (
    <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      {PROJECT_STATUSES.map((s) => {
        const items = data.projects.filter((p) => p.status === s);
        return (
          <section
            key={s}
            aria-label={t(`projects.status.${s}`)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s);
            }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const p = data.byId.get(e.dataTransfer.getData('text/plain'));
              if (p) move(p, s);
              setOver(null);
            }}
            className={cn('flex w-[260px] shrink-0 snap-start flex-col rounded-2xl bg-surface-2/60 p-2 ring-1 transition', over === s ? 'ring-accent/60' : 'ring-line/60')}
          >
            <h3 className="px-2 py-1.5 text-sm font-semibold text-fg">
              {t(`projects.status.${s}`)} <span className="ml-1 text-xs font-normal tabular text-subtle">{items.length}</span>
            </h3>
            <ul className="flex min-h-[3rem] flex-col gap-2">
              {items.map((p) => (
                <li key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)} className="overflow-hidden rounded-xl bg-surface shadow-soft ring-1 ring-line/70">
                  <span className="block h-1.5" style={{ background: p.color }} aria-hidden />
                  <Link to={`/projects/${p.id}`} className="block px-3 pb-1 pt-2 font-medium text-fg hover:text-accent">
                    {p.name}
                  </Link>
                  <label className="flex items-center gap-2 px-3 pb-2 text-xs text-subtle">
                    {t('tasks.moveTo')}
                    <select value={p.status} onChange={(e) => move(p, e.target.value as ProjectStatus)} className="min-w-0 flex-1 rounded-md bg-transparent py-1 text-xs text-muted focus:outline-none">
                      {PROJECT_STATUSES.map((x) => (
                        <option key={x} value={x}>
                          {t(`projects.status.${x}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ProjectsTimeline({ projects }: { projects: Project[] }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const dated = projects.filter((p) => p.start || p.due || p.milestones.some((m) => m.date));
  if (dated.length === 0) return <p className="rounded-2xl bg-surface-2/50 p-6 text-center text-sm text-muted">{t('projects.timelineEmpty')}</p>;
  const range = timelineRange(dated.flatMap((p) => [p.start, p.due, ...p.milestones.map((m) => m.date)]), today);
  const months: string[] = [];
  for (let m = startOfMonth(range.from); m <= range.to; m = addMonths(m, 1, 1)) months.push(m);

  return (
    <div className="overflow-x-auto rounded-2xl bg-surface p-4 ring-1 ring-line/70">
      <div className="relative min-w-[640px]">
        <div className="relative mb-2 h-6 border-b border-line/60 text-[0.7rem] text-subtle">
          {months.map((m) => (
            <span key={m} className="absolute top-0 -translate-x-0 capitalize" style={{ left: `${positionOf(m < range.from ? range.from : m, range)}%` }}>
              {formatDateKey(m, settings.locale, { month: 'short', year: '2-digit' })}
            </span>
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-0 top-6 z-10 w-px bg-rose" style={{ left: `${positionOf(today, range)}%` }} aria-hidden />
        <ul className="flex flex-col gap-3 pt-2">
          {dated.map((p) => {
            const from = p.start ?? p.due ?? range.from;
            const to = p.due ?? p.start ?? range.to;
            const left = positionOf(from, range);
            const width = Math.max(1.5, positionOf(to, range) - left);
            return (
              <li key={p.id} className="relative h-11">
                <Link
                  to={`/projects/${p.id}`}
                  className="absolute top-1 flex h-9 items-center overflow-hidden rounded-lg px-2 text-xs font-semibold text-white shadow-soft"
                  style={{ left: `${left}%`, width: `${width}%`, minWidth: '6rem', background: p.color }}
                >
                  <span className="truncate">{p.name}</span>
                </Link>
                {p.milestones
                  .filter((m) => m.date)
                  .map((m) => (
                    <span
                      key={m.id}
                      title={m.title}
                      className={cn('absolute top-3.5 h-3 w-3 -translate-x-1/2 rotate-45 ring-2 ring-surface', m.done ? 'bg-success' : 'bg-amber')}
                      style={{ left: `${positionOf(m.date!, range)}%` }}
                    />
                  ))}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ProjectsCalendar({ projects }: { projects: Project[] }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const [month, setMonth] = useState(startOfMonth(today));
  const days = monthGrid(month, settings.weekStartsOn);
  const marks = new Map<string, Array<{ key: string; label: string; color: string; href: string; kind: 'due' | 'milestone' }>>();
  for (const p of projects) {
    if (p.due) marks.set(p.due, [...(marks.get(p.due) ?? []), { key: `d${p.id}`, label: p.name, color: p.color, href: `/projects/${p.id}`, kind: 'due' }]);
    for (const m of p.milestones)
      if (m.date) marks.set(m.date, [...(marks.get(m.date) ?? []), { key: `m${m.id}`, label: `${m.title} · ${p.name}`, color: p.color, href: `/projects/${p.id}`, kind: 'milestone' }]);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-lg font-semibold tracking-tight text-fg">{capitalizeFirst(formatDateKey(month, settings.locale, { month: 'long', year: 'numeric' }))}</h3>
        <IconButton size="sm" label={t('tasks.calendar.prev')} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setMonth(addMonths(month, -1, 1))} />
        <IconButton size="sm" label={t('tasks.calendar.next')} icon={<ChevronRight className="h-4 w-4" />} onClick={() => setMonth(addMonths(month, 1, 1))} />
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[480px] grid-cols-7 overflow-hidden rounded-2xl ring-1 ring-line/70">
          {days.slice(0, 7).map((d) => (
            <div key={d} className="bg-surface-2 px-2 py-2 text-center text-[0.7rem] font-semibold uppercase text-subtle">
              {formatDateKey(d, settings.locale, { weekday: 'short' })}
            </div>
          ))}
          {days.map((d) => (
            <div key={d} className={cn('min-h-[5.5rem] border-t border-line/50 p-1.5 [&:not(:nth-child(7n+1))]:border-l', d.slice(0, 7) === month.slice(0, 7) ? 'bg-surface' : 'bg-surface-2/40')}>
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs tabular', d === today ? 'bg-brand text-white' : 'text-muted')}>{Number(d.slice(8))}</span>
              <ul className="mt-1 flex flex-col gap-0.5">
                {(marks.get(d) ?? []).map((m) => (
                  <li key={m.key}>
                    <Link to={m.href} className="flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-[0.7rem] font-medium text-fg hover:bg-surface-2">
                      <span className={cn('h-2 w-2 shrink-0', m.kind === 'milestone' ? 'rotate-45' : 'rounded-full')} style={{ background: m.color }} aria-hidden />
                      <span className="truncate">{m.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [input, setInput] = useState(emptyProjectInput());
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    if (!input.name.trim()) return;
    try {
      const p = await createProject(input);
      toast.show(t('projects.created'));
      onClose();
      navigate(`/projects/${p.id}`);
    } catch {
      setError(t('projects.invalid'));
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('projects.newProject')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.name.trim()} onClick={() => void create()}>
            {t('projects.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('projects.fields.name')}>
          {(id) => <Input id={id} autoFocus value={input.name} maxLength={200} placeholder={t('projects.namePlaceholder')} onChange={(e) => setInput({ ...input, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void create()} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('projects.fields.category')}>
            {(id) => (
              <Select id={id} value={input.category} onChange={(e) => setInput({ ...input, category: e.target.value })}>
                <option value="">—</option>
                {PROJECT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`projects.category.${c}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('projects.fields.status')}>
            {(id) => (
              <Select id={id} value={input.status} onChange={(e) => setInput({ ...input, status: e.target.value as ProjectStatus })}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`projects.status.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('projects.fields.start')}>{(id) => <Input id={id} type="date" value={input.start ?? ''} onChange={(e) => setInput({ ...input, start: e.target.value || null })} />}</Field>
          <Field label={t('projects.fields.due')}>{(id) => <Input id={id} type="date" value={input.due ?? ''} onChange={(e) => setInput({ ...input, due: e.target.value || null })} />}</Field>
        </div>
        <ColorPicker value={input.color} onChange={(color) => setInput({ ...input, color })} />
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** Cor de projeto ou interesse: a paleta do app, com preto, branco, cinza e "Outra cor". */
export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { t } = useSettings();
  return <AppColorPicker value={value} onChange={onChange} label={t('projects.fields.color')} showLabel />;
}

function ProjectsTrashDialog({ data, onClose }: { data: ProjectsData; onClose: () => void }) {
  const { t } = useSettings();
  const [purging, setPurging] = useState<Project | null>(null);
  return (
    <>
      <Dialog open onClose={onClose} closeLabel={t('common.close')} title={t('projects.trash')}>
        {data.trash.length === 0 ? (
          <EmptyState icon={<Trash2 className="h-6 w-6" aria-hidden />} title={t('projects.trashEmpty')} />
        ) : (
          <ul className="flex flex-col divide-y divide-line/60">
            {data.trash.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-3">
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{p.name}</span>
                <Button size="sm" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => void restoreProject(p.id)}>
                  {t('projects.restore')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setPurging(p)}>
                  {t('projects.purge')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!purging}
        danger
        title={purging ? t('projects.purgeTitle', { name: purging.name }) : ''}
        body={t('projects.purgeBody')}
        confirmLabel={t('projects.purge')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          const target = purging;
          setPurging(null);
          if (target) void purgeProject(target.id);
        }}
      />
    </>
  );
}
