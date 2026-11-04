import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { MODULES } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { interestHistory, interestInputOf, InterestRuleError, restoreInterest, softDeleteInterest, updateInterest } from '@/data/interestsRepo';
import { storeNoteFile } from '@/data/notesRepo';
import { formatDateKey } from '@/domain/dates';
import { INTEREST_ICONS, INTEREST_STATUSES, type Interest, type InterestInput, type InterestStatus } from '@/domain/interests';
import { notePreview } from '@/domain/notes';
import { compareTasks, isClosedKind, statusKind } from '@/domain/tasks';
import { ColorPicker } from '@/features/projects/ProjectsPage';
import { useProjectsData } from '@/features/projects/useProjectsData';
import { TaskRow } from '@/features/tasks/TaskRow';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { AutoTextarea } from '@/features/notes/BlockEditor';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { CategorySelect } from './ProfilePage';
import { INTEREST_ICON, INTEREST_STATUS_TONE, InterestCover } from './interestUi';

export function InterestPage() {
  const { id } = useParams();
  const { t } = useSettings();
  const interest = useLiveQuery(() => (id ? getDb().interests.get(id) : undefined), [id], null);
  if (interest === null) return <LoadingState label={t('common.loading')} lines={5} />;
  if (!interest || interest.deletedAt)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-muted">{t('profile.interests.notFound')}</p>
      </div>
    );
  return <InterestDetail key={interest.id} interest={interest} />;
}

function BackLink() {
  const { t } = useSettings();
  return (
    <Link to="/profile" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('profile.interests.back')}
    </Link>
  );
}

function InterestDetail({ interest }: { interest: Interest }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<InterestInput>(() => interestInputOf(interest));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  // Conta as edições: o que mudar durante um salvamento é salvo logo depois, não se perde.
  const edits = useRef(0);
  const timer = useRef<number>();
  const lastRev = useRef(interest.rev);
  const latest = useRef(draft);
  latest.current = draft;
  const cover = useRef<HTMLInputElement>(null);

  // Mudança vinda de fora (outra aba, restauração): recarrega se não há edição pendente.
  useEffect(() => {
    if (interest.rev !== lastRev.current && !dirty.current) {
      lastRev.current = interest.rev;
      setDraft(interestInputOf(interest));
    }
  }, [interest]);

  const flush = async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    const at = edits.current;
    try {
      const next = await updateInterest(interest.id, latest.current);
      lastRev.current = next.rev;
      if (edits.current === at) dirty.current = false;
      else timer.current = window.setTimeout(() => void flush(), 300);
      setError(null);
      setSaved(true);
    } catch (e) {
      setError(e instanceof InterestRuleError && e.code === 'duplicate' ? t('profile.interests.duplicate') : t('profile.interests.invalid'));
    }
  };

  useEffect(
    () => () => {
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const change = (patch: Partial<InterestInput>) => {
    setDraft((d) => ({ ...d, ...patch }));
    dirty.current = true;
    edits.current++;
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 600);
  };

  const trash = async () => {
    await flush();
    await softDeleteInterest(interest.id);
    toast.show(t('profile.interests.moved'), 'success', { label: t('profile.interests.undo'), run: () => void restoreInterest(interest.id) });
    navigate('/profile');
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <InterestCover interest={draft} className="h-28 sm:h-36" />
        <div className="flex flex-col gap-2 p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <AutoTextarea
                value={draft.name}
                maxLength={80}
                aria-label={t('profile.fields.name')}
                onChange={(e) => change({ name: e.target.value.replace(/\n/g, ' ') })}
                className="rounded-xl px-1 text-2xl font-semibold tracking-tight text-fg focus:bg-surface-2 sm:text-3xl"
              />
            </div>
            <Badge tone={INTEREST_STATUS_TONE[draft.status]}>{t(`profile.status.${draft.status}`)}</Badge>
          </div>
          {draft.startDate && <p className="px-1 text-sm text-muted">{t('profile.interests.since', { date: formatDateKey(draft.startDate, settings.locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>}
          <p className={cn('px-1 text-xs', error ? 'text-danger' : 'text-subtle')} aria-live="polite">
            {error ?? (saved ? t('common.saved') : '')}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Surface className="flex flex-col gap-4">
          <h2 className="font-semibold text-fg">{t('profile.sections.about')}</h2>
          <Field label={t('profile.fields.description')} optionalLabel={t('common.optional')}>
            {(id) => <Textarea id={id} value={draft.description} maxLength={2000} placeholder={t('profile.fields.descriptionPlaceholder')} onChange={(e) => change({ description: e.target.value })} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.fields.category')}>{(id) => <CategorySelect id={id} value={draft.categoryId} onChange={(categoryId) => change({ categoryId })} />}</Field>
            <Field label={t('profile.fields.status')} hint={t('profile.statusHint')}>
              {(id, d) => (
                <Select id={id} aria-describedby={d} value={draft.status} onChange={(e) => change({ status: e.target.value as InterestStatus })}>
                  {INTEREST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`profile.status.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('profile.fields.startDate')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} type="date" value={draft.startDate ?? ''} onChange={(e) => change({ startDate: e.target.value || null })} />}
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">{t('profile.fields.icon')}</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('profile.fields.icon')}>
              {INTEREST_ICONS.map((ic) => {
                const Icon = INTEREST_ICON[ic];
                const on = draft.icon === ic;
                return (
                  <button
                    key={ic}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={ic}
                    onClick={() => change({ icon: ic })}
                    className={cn('flex h-10 w-10 items-center justify-center rounded-xl transition', on ? 'text-white shadow-soft' : 'bg-surface-2 text-muted hover:text-fg')}
                    style={on ? { background: draft.color } : undefined}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </button>
                );
              })}
            </div>
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
              {t('profile.fields.chooseCover')}
            </Button>
            {draft.coverFileId && (
              <Button size="sm" variant="ghost" onClick={() => change({ coverFileId: null })}>
                {t('profile.fields.removeCover')}
              </Button>
            )}
          </div>
          <Button variant="danger" size="sm" className="mt-2 w-fit" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => void trash()}>
            {t('profile.interests.moveToTrash')}
          </Button>
        </Surface>

        <div className="flex flex-col gap-5">
          <ObjectivesCard objectives={draft.objectives} onChange={(objectives) => change({ objectives })} />
          <EvolutionCard interest={interest} projectIds={draft.projectIds} noteIds={draft.noteIds} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ProjectsCard ids={draft.projectIds} onChange={(projectIds) => change({ projectIds })} />
        <MaterialsCard ids={draft.noteIds} onChange={(noteIds) => change({ noteIds })} />
      </div>
      <ActivitiesCard projectIds={draft.projectIds} />
    </div>
  );
}

/* ---------- Objetivos ---------- */

function ObjectivesCard({ objectives, onChange }: { objectives: string[]; onChange: (o: string[]) => void }) {
  const { t } = useSettings();
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v || objectives.includes(v)) return;
    onChange([...objectives, v.slice(0, 200)]);
    setText('');
  };
  return (
    <Surface className="flex flex-col gap-3">
      <h2 className="font-semibold text-fg">{t('profile.sections.objectives')}</h2>
      <p className="text-sm text-muted">{t('profile.sections.objectivesHint', { stage: MODULES.goals.stage })}</p>
      {objectives.length > 0 && (
        <ul className="flex flex-col gap-1">
          {objectives.map((o) => (
            <li key={o} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm text-fg">
              <span className="min-w-0 flex-1">{o}</span>
              <IconButton size="sm" label={t('profile.sections.removeObjective')} icon={<X className="h-4 w-4" />} onClick={() => onChange(objectives.filter((x) => x !== o))} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input aria-label={t('profile.sections.addObjective')} value={text} maxLength={200} placeholder={t('profile.sections.objectivePlaceholder')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <IconButton label={t('profile.sections.addObjective')} icon={<Plus className="h-4 w-4" />} disabled={!text.trim()} onClick={add} />
      </div>
    </Surface>
  );
}

/* ---------- Projetos e materiais ligados ---------- */

function ProjectsCard({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useSettings();
  const data = useProjectsData();
  const linked = ids.map((id) => data.byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p && !p.deletedAt);
  const available = data.projects.filter((p) => !ids.includes(p.id));
  return (
    <Surface className="flex flex-col gap-3">
      <h2 className="font-semibold text-fg">{t('profile.sections.projects')}</h2>
      {linked.length === 0 ? (
        <p className="text-sm text-muted">{t('profile.sections.projectsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {linked.map((p) => {
            const pr = data.progressOf(p);
            return (
              <li key={p.id} className="flex items-center gap-2">
                <Link to={`/projects/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 hover:bg-surface-2/70">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{p.name}</span>
                  <span className="text-xs tabular text-muted">{pr.percent === null ? t(`projects.status.${p.status}`) : `${pr.percent}%`}</span>
                </Link>
                <IconButton size="sm" label={t('profile.sections.unlink')} icon={<X className="h-4 w-4" />} onClick={() => onChange(ids.filter((x) => x !== p.id))} />
              </li>
            );
          })}
        </ul>
      )}
      {available.length > 0 && (
        <Select aria-label={t('profile.sections.linkProject')} value="" onChange={(e) => e.target.value && onChange([...ids, e.target.value])}>
          <option value="">{t('profile.sections.linkProject')}</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}
    </Surface>
  );
}

function MaterialsCard({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useSettings();
  const notes = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt).toArray(), []);
  if (!notes) return <LoadingState label={t('common.loading')} lines={2} />;
  const linked = ids.map((id) => notes.find((n) => n.id === id)).filter((n): n is NonNullable<typeof n> => !!n);
  const available = notes.filter((n) => !ids.includes(n.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <Surface className="flex flex-col gap-3">
      <h2 className="font-semibold text-fg">{t('profile.sections.materials')}</h2>
      <p className="text-sm text-muted">{t('profile.sections.materialsHint', { stage: MODULES.library.stage })}</p>
      {linked.length === 0 ? (
        <p className="text-sm text-muted">{t('profile.sections.materialsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {linked.map((n) => (
            <li key={n.id} className="flex items-center gap-2">
              <Link to={`/notes/${n.id}`} className="block min-w-0 flex-1 rounded-xl px-2 py-1.5 hover:bg-surface-2/70">
                <span className="block truncate text-sm font-medium text-fg">{n.title || t('notes.untitled')}</span>
                <span className="block truncate text-xs text-muted">{notePreview(n, 80) || '—'}</span>
              </Link>
              <IconButton size="sm" label={t('profile.sections.unlink')} icon={<X className="h-4 w-4" />} onClick={() => onChange(ids.filter((x) => x !== n.id))} />
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <Select aria-label={t('profile.sections.linkNote')} value="" onChange={(e) => e.target.value && onChange([...ids, e.target.value])}>
          <option value="">{t('profile.sections.linkNote')}</option>
          {available.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title || t('notes.untitled')}
            </option>
          ))}
        </Select>
      )}
    </Surface>
  );
}

/* ---------- Atividades, histórico e evolução ---------- */

function ActivitiesCard({ projectIds }: { projectIds: string[] }) {
  const { t } = useSettings();
  const data = useProjectsData();
  const editor = useTaskEditor();
  const actions = useTaskActions(data.tasks);
  const tasks = data.tasks.active.filter((x) => x.projectId && projectIds.includes(x.projectId));
  const open = tasks.filter((x) => !isClosedKind(statusKind(data.tasks.config, x.statusId))).sort(compareTasks(data.tasks.config));
  return (
    <Surface className="flex flex-col gap-3">
      <h2 className="font-semibold text-fg">{t('profile.sections.activities')}</h2>
      <p className="text-sm text-muted">{t('profile.sections.activitiesHint')}</p>
      {open.length === 0 ? (
        <p className="text-sm text-muted">{t('profile.sections.activitiesEmpty')}</p>
      ) : (
        <ul className="flex flex-col">
          {open.slice(0, 10).map((task) => (
            <li key={task.id}>
              <TaskRow task={task} data={data.tasks} onOpen={editor.openTask} onToggle={actions.toggle} compact />
            </li>
          ))}
        </ul>
      )}
      {actions.dialogs}
    </Surface>
  );
}

function EvolutionCard({ interest, projectIds, noteIds }: { interest: Interest; projectIds: string[]; noteIds: string[] }) {
  const { t, settings } = useSettings();
  const data = useProjectsData();
  const history = useLiveQuery(() => interestHistory(interest.id), [interest.id, interest.rev]);
  const tasks = data.tasks.active.filter((x) => x.projectId && projectIds.includes(x.projectId));
  const done = tasks.filter((x) => statusKind(data.tasks.config, x.statusId) === 'done').length;
  const fmt = new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short', year: 'numeric' });
  // A evolução do interesse é a sequência de status que o próprio usuário escolheu.
  const steps = (history ?? [])
    .filter((e) => e.action === 'create' || (e.action === 'update' && e.note && (INTEREST_STATUSES as readonly string[]).includes(e.note)))
    .reverse();
  return (
    <Surface className="flex flex-col gap-3">
      <h2 className="font-semibold text-fg">{t('profile.sections.evolution')}</h2>
      <p className="text-sm text-muted">{t('profile.sections.evolutionSummary', { done, total: tasks.length, projects: projectIds.length, notes: noteIds.length })}</p>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('profile.sections.history')}</h3>
      {!history ? (
        <LoadingState label={t('common.loading')} lines={2} />
      ) : (
        <ol className="flex flex-col gap-1.5">
          {steps.map((e) => (
            <li key={e.seq} className="flex items-baseline gap-3 text-sm">
              <span className="w-28 shrink-0 text-xs tabular text-subtle">{fmt.format(new Date(e.at))}</span>
              <span className="text-fg">{e.action === 'create' ? t('profile.sections.createdEntry') : t('profile.sections.statusEntry', { status: t(`profile.status.${e.note as InterestStatus}`) })}</span>
            </li>
          ))}
        </ol>
      )}
    </Surface>
  );
}
