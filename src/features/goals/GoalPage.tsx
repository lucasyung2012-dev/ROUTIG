import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, Check, ChevronLeft, NotebookPen, PenLine, Plus, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { addMilestone, goalHistory, linkGoal, restoreCheckin, restoreGoal, setGoalStatus, softDeleteCheckin, softDeleteGoal, toggleMilestone, unlinkGoal } from '@/data/goalsRepo';
import { createNote, emptyNoteInput, linkNote } from '@/data/notesRepo';
import { updateTask } from '@/data/tasksRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import { GOAL_REF_TYPES, GOAL_STATUSES, goalProgress, isGoalOverdue, isOpenGoal, looksReached, type Goal, type GoalRefType, type GoalStatus } from '@/domain/goals';
import { notePreview } from '@/domain/notes';
import { isClosedKind, statusKind } from '@/domain/tasks';
import { TaskRow } from '@/features/tasks/TaskRow';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { useTasksData } from '@/features/tasks/useTasksData';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { CheckinDialog, GoalDialog, GoalProgressView } from './goalsUi';
import { useGoals, type GoalsData } from './useGoals';
import { LibraryLinked } from '@/features/library/libraryUi';

const TABS = ['overview', 'related', 'journal', 'materials', 'history'] as const;
type Tab = (typeof TABS)[number];

export function GoalPage() {
  const { id } = useParams();
  const { t, settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const data = useGoals();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [checkin, setCheckin] = useState(false);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  const goal = id ? data.byId.get(id) : undefined;
  if (!goal || goal.deletedAt)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Surface tone="flat">
          <EmptyState title={t('goals.notFound')} />
        </Surface>
      </div>
    );
  const today = todayKey();
  const overdue = isGoalOverdue(goal, today);

  const trash = async () => {
    await softDeleteGoal(goal.id);
    toast.show(t('goals.moved'), 'success', { label: t('notes.undo'), run: () => void restoreGoal(goal.id) });
    navigate('/goals');
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <div className="h-2 bg-brand" aria-hidden />
        <div className="flex flex-wrap items-start gap-3 p-5 sm:p-6">
          <div className="min-w-0 flex-1 basis-60">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge>{t(`goals.areas.${goal.area}`)}</Badge>
              {goal.horizon && <Badge>{t(`goals.horizons.${goal.horizon}`)}</Badge>}
              <Badge>{t(`goals.types.${goal.type}`)}</Badge>
              {goal.priority !== 'none' && <Badge tone={goal.priority === 'high' || goal.priority === 'urgent' ? 'danger' : 'neutral'}>{t(`tasks.priority.${goal.priority}`)}</Badge>}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{goal.name}</h1>
            {goal.description && <p className="mt-1 max-w-2xl whitespace-pre-wrap text-sm text-fg">{goal.description}</p>}
            {goal.deadline && (
              <p className={cn('mt-2 inline-flex items-center gap-1 text-sm', overdue ? 'font-medium text-danger' : 'text-muted')}>
                <CalendarClock className="h-4 w-4" aria-hidden />
                {overdue ? t('goals.overdue', { date: formatDateKey(goal.deadline, settings.locale) }) : t('goals.until', { date: formatDateKey(goal.deadline, settings.locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label={t('goals.fields.status')} value={goal.status} onChange={(e) => void setGoalStatus(goal.id, e.target.value as GoalStatus).then(() => toast.show(t('goals.statusChanged')))} className="h-10 w-44">
              {GOAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`goals.statuses.${s}`)}
                </option>
              ))}
            </Select>
            <IconButton label={t('goals.edit')} icon={<PenLine className="h-4 w-4" />} onClick={() => setEditing(true)} />
            <IconButton label={t('goals.moveToTrash')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void trash()} />
          </div>
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label={goal.name} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
          {TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              role="tab"
              aria-selected={tab === tb}
              onClick={() => setTab(tb)}
              className={cn('h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition', tab === tb ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg')}
            >
              {t(`goals.tabs.${tb}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <Overview goal={goal} data={data} onCheckin={() => setCheckin(true)} />}
      {tab === 'related' && <RelatedTab goal={goal} />}
      {tab === 'journal' && <JournalTab goal={goal} data={data} onCheckin={() => setCheckin(true)} />}
      {tab === 'materials' && <MaterialsTab goal={goal} />}
      {tab === 'history' && <HistoryTab goal={goal} />}

      {editing && <GoalDialog goal={goal} onClose={() => setEditing(false)} />}
      {checkin && <CheckinDialog goal={goal} onClose={() => setCheckin(false)} />}
    </div>
  );
}

function BackLink() {
  const { t } = useSettings();
  return (
    <Link to="/goals" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-fg">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('goals.back')}
    </Link>
  );
}

/* ---------- Visão geral ---------- */

function Overview({ goal, data, onCheckin }: { goal: Goal; data: GoalsData; onCheckin: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const checkins = data.checkinsOf(goal.id);
  const reached = isOpenGoal(goal) && looksReached(goalProgress(goal, checkins));
  const [msTitle, setMsTitle] = useState('');
  const [msDate, setMsDate] = useState('');
  const sorted = [...goal.milestones];
  const last = checkins[0];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-4">
        <Surface className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-fg">{t('goals.progressTitle')}</h2>
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={onCheckin}>
              {goal.type === 'measurable' ? t('goals.logValue') : goal.type === 'skill' ? t('goals.logLevel') : t('goals.logReflection')}
            </Button>
          </div>
          <GoalProgressView goal={goal} checkins={checkins} />
          {last && (
            <p className="text-xs text-muted">
              {t('goals.lastCheckin', { date: formatDateKey(last.date, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}
              {last.note && ` · “${last.note.slice(0, 120)}${last.note.length > 120 ? '…' : ''}”`}
            </p>
          )}
          {reached && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-success/10 p-3 text-sm text-fg ring-1 ring-success/30">
              <span className="min-w-0 flex-1">{t('goals.reachedHint')}</span>
              <Button size="sm" variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => void setGoalStatus(goal.id, 'done').then(() => toast.show(t('goals.statusChanged')))}>
                {t('goals.markDone')}
              </Button>
            </div>
          )}
        </Surface>

        <Surface className="flex flex-col gap-3">
          <h2 className="font-semibold text-fg">{goal.type === 'stages' ? t('goals.fields.stages') : t('goals.fields.milestones')}</h2>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted">{goal.type === 'stages' ? t('goals.noStages') : t('goals.noMilestones')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sorted.map((m, i) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={m.done}
                    aria-label={m.title}
                    className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition', m.done ? 'bg-brand text-white ring-transparent' : 'bg-surface-2 ring-line hover:ring-accent/60')}
                    onClick={() => void toggleMilestone(goal.id, m.id)}
                  >
                    {m.done && <Check className="h-4 w-4" />}
                  </button>
                  <span className="w-5 text-xs tabular text-subtle">{i + 1}.</span>
                  <span className={cn('min-w-0 flex-1 text-sm', m.done ? 'text-muted line-through' : 'text-fg')}>{m.title}</span>
                  {m.date && <span className="text-xs text-muted">{formatDateKey(m.date, settings.locale)}</span>}
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!msTitle.trim()) return;
              void addMilestone(goal.id, msTitle, msDate || null).then(() => {
                setMsTitle('');
                setMsDate('');
              });
            }}
          >
            <Input aria-label={t('goals.fields.milestoneTitle')} value={msTitle} maxLength={200} placeholder={t('goals.milestonePlaceholder')} onChange={(e) => setMsTitle(e.target.value)} className="min-w-40 flex-1" />
            <Input aria-label={t('goals.fields.milestoneDate')} type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} className="w-40" />
            <Button type="submit" size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!msTitle.trim()}>
              {t('goals.addMilestone')}
            </Button>
          </form>
        </Surface>
      </div>

      <div className="flex flex-col gap-4">
        <RelatedSummary goal={goal} />
        {goal.notes && (
          <Surface className="flex flex-col gap-2">
            <h2 className="font-semibold text-fg">{t('goals.fields.notes')}</h2>
            <p className="whitespace-pre-wrap text-sm text-fg">{goal.notes}</p>
          </Surface>
        )}
      </div>
    </div>
  );
}

/* ---------- Relacionados (Parte 15.2) ---------- */

function useRefNames() {
  return useLiveQuery(async () => {
    const db = getDb();
    const years = new Map((await db.academicYears.toArray()).map((y) => [y.id, y.label]));
    const opts: Record<GoalRefType, Array<{ id: string; name: string; color?: string }>> = {
      project: (await db.projects.filter((p) => !p.deletedAt).toArray()).map((p) => ({ id: p.id, name: p.name, color: p.color })),
      habit: (await db.habits.filter((h) => !h.deletedAt).toArray()).map((h) => ({ id: h.id, name: h.name, color: h.color })),
      language: (await db.languages.filter((l) => !l.deletedAt).toArray()).map((l) => ({ id: l.id, name: l.name, color: l.color })),
      subject: (await db.subjects.filter((s) => !s.deletedAt).toArray()).map((s) => ({ id: s.id, name: `${s.name}${years.get(s.yearId) ? ` · ${years.get(s.yearId)}` : ''}`, color: s.color })),
      instrument: (await db.instruments.filter((i) => !i.deletedAt).toArray()).map((i) => ({ id: i.id, name: i.name, color: i.color })),
      sport: (await db.sports.filter((s) => !s.deletedAt).toArray()).map((s) => ({ id: s.id, name: s.name, color: s.color })),
    };
    return opts;
  }, []);
}

const REF_PATH: Record<GoalRefType, string> = { project: '/projects/', habit: '/habits/', language: '/languages/', subject: '/academy/subjects/', instrument: '/music/', sport: '/sports/' };

function RelatedSummary({ goal }: { goal: Goal }) {
  const { t } = useSettings();
  const names = useRefNames();
  const tasks = useLiveQuery(() => getDb().tasks.where('goalId').equals(goal.id).filter((x) => !x.deletedAt).count(), [goal.id]);
  return (
    <Surface className="flex flex-col gap-2">
      <h2 className="font-semibold text-fg">{t('goals.tabs.related')}</h2>
      <p className="text-sm text-muted">{t('goals.relatedTasks', { count: tasks ?? 0 })}</p>
      {goal.refs.length === 0 ? (
        <p className="text-sm text-muted">{t('goals.noRelated')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {goal.refs.map((r) => {
            const type = r.type as GoalRefType;
            const item = names?.[type]?.find((x) => x.id === r.id);
            return (
              <li key={`${r.type}:${r.id}`} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item?.color ?? 'rgb(var(--line))' }} aria-hidden />
                {item ? (
                  <Link to={`${REF_PATH[type]}${r.id}`} className="min-w-0 flex-1 truncate text-fg hover:text-accent">
                    {item.name}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-muted">{t('goals.refMissing')}</span>
                )}
                <span className="text-xs text-subtle">{t(`goals.refTypes.${type}`)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}

function RelatedTab({ goal }: { goal: Goal }) {
  const { t } = useSettings();
  const toast = useToast();
  const names = useRefNames();
  const tasks = useTasksData();
  const editor = useTaskEditor();
  const actions = useTaskActions(tasks);
  const linked = tasks.active.filter((x) => x.goalId === goal.id);
  const openLinked = linked.filter((x) => !isClosedKind(statusKind(tasks.config, x.statusId)));
  const closedLinked = linked.filter((x) => isClosedKind(statusKind(tasks.config, x.statusId)));
  const candidates = tasks.active.filter((x) => !x.goalId && !isClosedKind(statusKind(tasks.config, x.statusId))).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-fg">{t('goals.refTypes.task')}</h2>
          <div className="flex flex-wrap gap-2">
            {candidates.length > 0 && (
              <Select aria-label={t('goals.linkTask')} value="" onChange={(e) => e.target.value && void updateTask(e.target.value, { goalId: goal.id }).then(() => toast.show(t('goals.linked')))} className="h-9 w-auto max-w-56">
                <option value="">{t('goals.linkTask')}</option>
                {candidates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </Select>
            )}
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => editor.newTask({ goalId: goal.id })}>
              {t('goals.newTask')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted">{t('goals.tasksHint')}</p>
        {linked.length === 0 ? (
          <p className="text-sm text-muted">{t('goals.noTasks')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {[...openLinked, ...closedLinked].map((task) => (
              <li key={task.id} className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <TaskRow task={task} data={tasks} onOpen={editor.openTask} onToggle={actions.toggle} />
                </div>
                <IconButton label={t('goals.unlink')} icon={<X className="h-4 w-4" />} onClick={() => void updateTask(task.id, { goalId: null })} />
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {GOAL_REF_TYPES.map((type) => {
          const refs = goal.refs.filter((r) => r.type === type);
          const options = (names?.[type] ?? []).filter((o) => !refs.some((r) => r.id === o.id)).sort((a, b) => a.name.localeCompare(b.name));
          return (
            <Surface key={type} className="flex flex-col gap-2">
              <h2 className="font-semibold text-fg">{t(`goals.refTypes.${type}`)}</h2>
              {refs.length === 0 ? (
                <p className="text-sm text-muted">{t('goals.noneLinked')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {refs.map((r) => {
                    const item = names?.[type]?.find((x) => x.id === r.id);
                    return (
                      <li key={r.id} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item?.color ?? 'rgb(var(--line))' }} aria-hidden />
                        {item ? (
                          <Link to={`${REF_PATH[type]}${r.id}`} className="min-w-0 flex-1 truncate text-fg hover:text-accent">
                            {item.name}
                          </Link>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-muted">{t('goals.refMissing')}</span>
                        )}
                        <IconButton label={t('goals.unlink')} icon={<X className="h-4 w-4" />} onClick={() => void unlinkGoal(goal.id, r)} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {options.length > 0 ? (
                <Select aria-label={t(`goals.link.${type}`)} value="" onChange={(e) => e.target.value && void linkGoal(goal.id, { type, id: e.target.value })} className="h-9">
                  <option value="">{t(`goals.link.${type}`)}</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              ) : (
                refs.length === 0 && <p className="text-xs text-subtle">{t(`goals.nothingToLink.${type}`)}</p>
              )}
            </Surface>
          );
        })}
      </div>
      {actions.dialogs}
    </div>
  );
}

/* ---------- Acompanhamento ---------- */

function JournalTab({ goal, data, onCheckin }: { goal: Goal; data: GoalsData; onCheckin: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const checkins = data.checkinsOf(goal.id);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString(settings.locale, { maximumFractionDigits: 2 }));
  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-fg">{t('goals.tabs.journal')}</h2>
        <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onCheckin}>
          {t('goals.newCheckin')}
        </Button>
      </div>
      <p className="text-sm text-muted">{t('goals.journalHint')}</p>
      {checkins.length === 0 ? (
        <p className="text-sm text-muted">{t('goals.noCheckins')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/60">
          {checkins.map((c) => {
            const ind = goal.indicators.find((i) => i.id === c.indicatorId);
            return (
              <li key={c.id} className="flex items-start gap-3 py-2.5">
                <span className="w-28 shrink-0 text-sm text-muted">{formatDateKey(c.date, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <div className="min-w-0 flex-1">
                  {c.value !== null && (
                    <span className="block text-sm font-medium text-fg">
                      {ind?.name ?? t('goals.indicatorRemoved')}: {fmt(c.value)} {ind?.unit}
                    </span>
                  )}
                  {c.level !== null && <span className="block text-sm font-medium text-fg">{t('goals.progress.level', { current: c.level, max: goal.levelMax })}</span>}
                  {c.note && <p className="whitespace-pre-wrap text-sm text-fg">{c.note}</p>}
                </div>
                <IconButton
                  label={t('goals.removeCheckin')}
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => void softDeleteCheckin(c.id).then(() => toast.show(t('goals.checkinRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreCheckin(c.id) }))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}

/* ---------- Materiais ---------- */

function MaterialsTab({ goal }: { goal: Goal }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [linking, setLinking] = useState(false);
  const notes = useLiveQuery(async () => (await getDb().notes.filter((n) => !n.deletedAt && n.links.some((l) => l.type === 'goal' && l.id === goal.id)).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [goal.id]);
  const all = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt).toArray(), []) ?? [];
  const ids = new Set((notes ?? []).map((n) => n.id));
  const others = all.filter((n) => !ids.has(n.id));
  const newNote = async () => {
    try {
      const n = await createNote(emptyNoteInput({ title: goal.name, links: [{ type: 'goal', id: goal.id }] }));
      navigate(`/notes/${n.id}`);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<NotebookPen className="h-4 w-4" />} onClick={() => void newNote()}>
          {t('goals.newNote')}
        </Button>
        <Button variant="secondary" onClick={() => setLinking(true)}>
          {t('profile.sections.linkNote')}
        </Button>
      </div>
      <p className="text-sm text-muted">{t('goals.materialsHint')}</p>
      <LibraryLinked refType="goal" refId={goal.id} />
      {!notes?.length ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.materials.emptyTitle')} body={t('goals.materialsEmpty')} />
        </Surface>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="block h-full rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="block truncate font-medium text-fg">{n.title || t('notes.untitled')}</span>
                <span className="mt-1 line-clamp-2 block text-sm text-muted">{notePreview(n, 140) || '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {linking && (
        <Dialog open onClose={() => setLinking(false)} closeLabel={t('common.close')} title={t('profile.sections.linkNote')} footer={<Button onClick={() => setLinking(false)}>{t('common.close')}</Button>}>
          {others.length === 0 ? (
            <p className="text-sm text-muted">{t('academy.materials.nothingToLink')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {others.map((n) => (
                <li key={n.id}>
                  <button type="button" className="w-full rounded-xl px-2 py-2 text-left text-sm text-fg hover:bg-surface-2" onClick={() => void linkNote(n.id, { type: 'goal', id: goal.id }).then(() => setLinking(false))}>
                    {n.title || t('notes.untitled')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </div>
  );
}

/* ---------- Histórico ---------- */

function HistoryTab({ goal }: { goal: Goal }) {
  const { t, settings } = useSettings();
  const changes = useLiveQuery(() => goalHistory(goal.id), [goal.id, goal.rev]) ?? [];
  const text = (note: string | undefined, action: string): string => {
    if (action === 'create') return t('goals.history.created');
    if (action === 'delete') return t('goals.history.deleted');
    if (action === 'restore') return t('goals.history.restored');
    if (!note) return t('goals.history.edited');
    const [kind, ...rest] = note.split(':');
    const value = rest.join(':');
    switch (kind) {
      case 'status':
        return t('goals.history.status', { status: (GOAL_STATUSES as readonly string[]).includes(value) ? t(`goals.statuses.${value as GoalStatus}`) : value });
      case 'deadline':
        return value ? t('goals.history.deadline', { date: formatDateKey(value, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('goals.history.deadlineRemoved');
      case 'targets':
        return t('goals.history.targets', { targets: value.split('|').join(', ').split('=').join(': ') });
      case 'level':
        return value ? t('goals.history.level', { level: value }) : t('goals.history.levelRemoved');
      case 'milestone':
        return t('goals.history.milestone', { title: value });
      case 'type':
        return t('goals.history.type');
      case 'link':
        return t('goals.history.link');
      case 'unlink':
        return t('goals.history.unlink');
      default:
        return t('goals.history.edited');
    }
  };
  return (
    <Surface className="flex flex-col gap-2">
      <h2 className="font-semibold text-fg">{t('goals.tabs.history')}</h2>
      <p className="text-sm text-muted">{t('goals.historyHint')}</p>
      <ul className="flex flex-col gap-2">
        {changes.map((c) => (
          <li key={c.seq ?? c.at} className="flex gap-3 text-sm">
            <span className="w-32 shrink-0 text-muted">{new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(c.at))}</span>
            <span className="text-fg">{text(c.note, c.action)}</span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
