import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarRange, Check, ChevronLeft, PenLine, Plus, SkipForward, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { AcademyRuleError } from '@/data/academyRepo';
import { getDb } from '@/data/db';
import { createSession, createSessions, restoreSession, setSessionStatus, softDeleteSession, updateSession } from '@/data/studyPlanRepo';
import { contentTree, flattenTree, reviewDatesBefore, sessionTotals, type Assessment, type Content, type StudySession, type StudySessionInput } from '@/domain/academy';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import { PRIORITIES, type Priority } from '@/domain/tasks';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { useAcademyData, type AcademyData } from './useAcademyData';

/** Sessões de estudo do ano letivo aberto (todas as disciplinas dele). */
export function useStudySessions(data: AcademyData) {
  const ids = data.subjects.map((s) => s.id);
  const all = useLiveQuery(() => getDb().studySessions.where('subjectId').anyOf(ids).toArray(), [ids.join(',')]);
  return useMemo(() => ({ loading: all === undefined, sessions: (all ?? []).filter((s) => !s.deletedAt).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')) }), [all]);
}

const PRIORITY_TONE: Record<Priority, 'neutral' | 'info' | 'accent' | 'warning' | 'danger'> = { none: 'neutral', low: 'info', medium: 'accent', high: 'warning', urgent: 'danger' };

/** Planejamento de estudos (Parte 9.8). */
export function StudyPlanPage() {
  const { t, settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const data = useAcademyData();
  const { loading, sessions } = useStudySessions(data);
  const [editing, setEditing] = useState<StudySession | 'new' | null>(null);
  const [distributing, setDistributing] = useState(false);
  const [completing, setCompleting] = useState<StudySession | null>(null);
  const subjectFilter = params.get('subject') ?? '';
  if (data.loading || loading) return <LoadingState label={t('common.loading')} lines={5} />;

  const today = todayKey();
  const list = subjectFilter ? sessions.filter((s) => s.subjectId === subjectFilter) : sessions;
  const overdue = list.filter((s) => s.status === 'planned' && s.date < today);
  const upcoming = list.filter((s) => s.date >= today && s.status === 'planned');
  const recent = list.filter((s) => s.status !== 'planned' && s.date >= addDays(today, -14)).reverse();
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7));
  const week = sessionTotals(list.filter((s) => s.date >= weekStart && s.date <= addDays(weekStart, 6)));
  const byDay = new Map<string, StudySession[]>();
  for (const s of upcoming) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/academy" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t('academy.subject.back')}
      </Link>
      <PageHeader
        eyebrow={t('modules.academy')}
        title={t('academy.plan.title')}
        description={t('academy.plan.hint')}
        icon={<CalendarRange className="h-7 w-7" aria-hidden />}
        actions={
          data.subjects.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={() => setDistributing(true)}>
                {t('academy.plan.distribute')}
              </Button>
              <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
                {t('academy.plan.new')}
              </Button>
            </div>
          )
        }
      />

      {data.subjects.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.dash.noSubjectsTitle')} body={t('academy.dash.noSubjects')} />
        </Surface>
      ) : (
        <>
          <Surface className="flex flex-wrap items-center gap-4">
            <div className="w-56">
              <Select aria-label={t('academy.assessment.subject')} value={subjectFilter} onChange={(e) => setParams(e.target.value ? { subject: e.target.value } : {})}>
                <option value="">{t('academy.plan.allSubjects')}</option>
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{t('academy.plan.weekPlanned', { min: week.planned })}</Badge>
              <Badge tone="success">{t('academy.plan.weekDone', { min: week.done })}</Badge>
              <Badge>{t('academy.plan.weekSessions', { done: week.completed, total: week.sessions })}</Badge>
              {week.skipped > 0 && <Badge tone="warning">{t('academy.plan.weekSkipped', { count: week.skipped })}</Badge>}
            </div>
          </Surface>

          {overdue.length > 0 && (
            <Surface className="flex flex-col gap-2 ring-warning/40">
              <h2 className="font-semibold text-warning">{t('academy.plan.overdue', { count: overdue.length })}</h2>
              <ul className="flex flex-col">
                {overdue.map((s) => (
                  <SessionRow key={s.id} s={s} data={data} onEdit={() => setEditing(s)} onDone={() => setCompleting(s)} />
                ))}
              </ul>
            </Surface>
          )}

          {upcoming.length === 0 ? (
            <Surface tone="flat">
              <EmptyState title={t('academy.plan.emptyTitle')} body={t('academy.plan.empty')} />
            </Surface>
          ) : (
            [...byDay.entries()].map(([day, items]) => (
              <Surface key={day} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold capitalize text-fg">
                  {day === today ? t('tasks.due.today') : formatDateKey(day, settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                  <span className="ml-2 text-xs font-normal text-muted">{t('academy.plan.dayTotal', { min: items.reduce((a, s) => a + s.durationMin, 0) })}</span>
                </h2>
                <ul className="flex flex-col">
                  {items.map((s) => (
                    <SessionRow key={s.id} s={s} data={data} onEdit={() => setEditing(s)} onDone={() => setCompleting(s)} />
                  ))}
                </ul>
              </Surface>
            ))
          )}

          {recent.length > 0 && (
            <Surface tone="flat" className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-fg">{t('academy.plan.recent')}</h2>
              <ul className="flex flex-col">
                {recent.map((s) => (
                  <SessionRow key={s.id} s={s} data={data} onEdit={() => setEditing(s)} onDone={() => setCompleting(s)} />
                ))}
              </ul>
            </Surface>
          )}
        </>
      )}

      {editing && <SessionDialog data={data} session={editing === 'new' ? null : editing} subjectId={subjectFilter || data.subjects[0]?.id || ''} onClose={() => setEditing(null)} />}
      {distributing && <DistributeDialog data={data} onClose={() => setDistributing(false)} />}
      {completing && <CompleteDialog s={completing} onClose={() => setCompleting(null)} />}
    </div>
  );
}

function SessionRow({ s, data, onEdit, onDone }: { s: StudySession; data: AcademyData; onEdit: () => void; onDone: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const subject = data.subjectById.get(s.subjectId);
  const exam = s.assessmentId ? data.assessments.find((a) => a.id === s.assessmentId) : null;
  const contents = useLiveQuery(async (): Promise<(Content | undefined)[]> => (s.contentIds.length ? getDb().contents.bulkGet(s.contentIds) : []), [s.contentIds.join(',')]) ?? [];
  const titles = contents.filter((c): c is NonNullable<typeof c> => !!c && !c.deletedAt).map((c) => c.title);
  return (
    <li className={cn('flex flex-wrap items-center gap-3 rounded-xl px-2 py-2', s.status !== 'planned' && 'opacity-70')}>
      <span className="h-10 w-1 shrink-0 rounded-full ring-1 ring-line/60" style={{ background: subject?.color }} aria-hidden />
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
          {subject?.name}
          <Badge tone={s.kind === 'review' ? 'warning' : 'info'}>{t(`academy.plan.kinds.${s.kind}`)}</Badge>
          {s.priority !== 'none' && <Badge tone={PRIORITY_TONE[s.priority]}>{t(`tasks.priority.${s.priority}`)}</Badge>}
          {s.status !== 'planned' && <Badge tone={s.status === 'done' ? 'success' : 'neutral'}>{t(`academy.plan.statuses.${s.status}`)}</Badge>}
        </div>
        <div className="truncate text-xs text-muted">
          {[s.time, t('academy.plan.minutes', { min: s.status === 'done' ? (s.actualMin ?? s.durationMin) : s.durationMin }), exam ? t('academy.plan.forExam', { name: exam.name }) : '', titles.join(', ')].filter(Boolean).join(' · ')}
          {s.date < todayKey() && s.status === 'planned' ? ` · ${formatDateKey(s.date, settings.locale, { day: 'numeric', month: 'short' })}` : ''}
        </div>
        {s.difficulties && <div className="text-xs text-warning">{t('academy.lessons.difficultiesShort', { text: s.difficulties })}</div>}
      </div>
      <div className="flex gap-1">
        {s.status === 'planned' ? (
          <>
            <Button size="sm" variant="secondary" icon={<Check className="h-4 w-4" />} onClick={onDone}>
              {t('academy.plan.markDone')}
            </Button>
            <IconButton size="sm" label={t('academy.plan.skip')} icon={<SkipForward className="h-4 w-4" />} onClick={() => void setSessionStatus(s.id, 'skipped')} />
          </>
        ) : (
          <IconButton size="sm" label={t('academy.plan.backToPlanned')} icon={<Undo2 className="h-4 w-4" />} onClick={() => void setSessionStatus(s.id, 'planned')} />
        )}
        <IconButton size="sm" label={t('academy.plan.edit')} icon={<PenLine className="h-4 w-4" />} onClick={onEdit} />
        <IconButton
          size="sm"
          label={t('academy.plan.remove')}
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => void softDeleteSession(s.id).then(() => toast.show(t('academy.plan.moved'), 'success', { label: t('notes.undo'), run: () => void restoreSession(s.id) }))}
        />
      </div>
    </li>
  );
}

/** Conteúdos de uma disciplina para escolher (árvore com recuo). */
export function ContentPicker({ subjectId, value, onChange }: { subjectId: string; value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useSettings();
  const contents = useLiveQuery(() => getDb().contents.where('subjectId').equals(subjectId).filter((c) => !c.deletedAt).toArray(), [subjectId]) ?? [];
  const nodes = flattenTree(contentTree(contents));
  if (nodes.length === 0) return <p className="text-xs text-muted">{t('academy.plan.noContents')}</p>;
  return (
    <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-xl bg-surface-2/50 p-2">
      {nodes.map(({ content: c, depth }) => (
        <li key={c.id} style={{ paddingLeft: `${depth}rem` }}>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={value.includes(c.id)} onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))} />
            {c.title}
            <span className="text-xs text-muted">· {t(`academy.contents.statuses.${c.status}`)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function SessionDialog({ data, session, subjectId, onClose }: { data: AcademyData; session: StudySession | null; subjectId: string; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<StudySessionInput>(() =>
    session
      ? { subjectId: session.subjectId, contentIds: session.contentIds, assessmentId: session.assessmentId, kind: session.kind, date: session.date, time: session.time, durationMin: session.durationMin, priority: session.priority, notes: session.notes }
      : { subjectId, contentIds: [], assessmentId: null, kind: 'study', date: todayKey(), time: null, durationMin: 45, priority: 'none', notes: '' },
  );
  const set = (p: Partial<StudySessionInput>) => setInput((i) => ({ ...i, ...p }));
  const exams = data.assessments.filter((a) => a.subjectId === input.subjectId && a.date && a.date >= todayKey());
  const save = async () => {
    try {
      if (session) await updateSession(session.id, input);
      else await createSession(input);
      toast.show(t('common.saved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof AcademyRuleError && e.code === 'duplicate' ? t('academy.errors.duplicate') : t('academy.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={session ? t('academy.plan.edit') : t('academy.plan.new')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('academy.assessment.subject')}>
            {(id) => (
              <Select id={id} value={input.subjectId} onChange={(e) => set({ subjectId: e.target.value, contentIds: [], assessmentId: null })}>
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('academy.plan.kind')}>
            {(id) => (
              <Select id={id} value={input.kind} onChange={(e) => set({ kind: e.target.value as 'study' | 'review' })}>
                <option value="study">{t('academy.plan.kinds.study')}</option>
                <option value="review">{t('academy.plan.kinds.review')}</option>
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('academy.lessons.date')}>{(id) => <Input id={id} type="date" value={input.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
            <Field label={t('academy.assessment.time')}>{(id) => <Input id={id} type="time" value={input.time ?? ''} onChange={(e) => set({ time: e.target.value || null })} />}</Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('academy.plan.duration')}>
              {(id) => <Input id={id} type="number" inputMode="numeric" min={5} max={600} step={5} value={input.durationMin} onChange={(e) => set({ durationMin: Math.max(5, Math.min(600, Number(e.target.value) || 5)) })} />}
            </Field>
            <Field label={t('academy.plan.priority')}>
              {(id) => (
                <Select id={id} value={input.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`tasks.priority.${p}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label={t('academy.plan.exam')}>
            {(id) => (
              <Select id={id} value={input.assessmentId ?? ''} onChange={(e) => set({ assessmentId: e.target.value || null })}>
                <option value="">{t('academy.plan.noExam')}</option>
                {exams.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t('academy.lessons.contents')}</span>
          <ContentPicker subjectId={input.subjectId} value={input.contentIds} onChange={(contentIds) => set({ contentIds })} />
        </div>
        <Field label={t('academy.lessons.notes')}>{(id) => <Textarea id={id} rows={2} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}

/** Distribui revisões antes de uma prova: mostra as datas antes de criar (nada é criado sem confirmar). */
export function DistributeDialog({ data, onClose, examId: initialExamId }: { data: AcademyData; onClose: () => void; examId?: string }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const exams = data.assessments.filter((a) => a.date && a.date >= today);
  const [examId, setExamId] = useState(initialExamId ?? exams[0]?.id ?? '');
  const exam: Assessment | undefined = exams.find((a) => a.id === examId);
  const [duration, setDuration] = useState(40);
  const [contentIds, setContentIds] = useState<string[]>(exam?.contentIds ?? []);
  const dates = exam?.date ? reviewDatesBefore(exam.date, today) : [];
  const [skip, setSkip] = useState<string[]>([]);
  const chosen = dates.filter((d) => !skip.includes(d));

  const create = async () => {
    if (!exam) return;
    const n = await createSessions(chosen.map((date) => ({ subjectId: exam.subjectId, contentIds, assessmentId: exam.id, kind: 'review' as const, date, time: null, durationMin: duration, priority: 'high' as const, notes: '' })));
    toast.show(t('academy.plan.distributed', { count: n }));
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('academy.plan.distribute')}
      description={t('academy.plan.distributeHint')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!exam || chosen.length === 0} onClick={() => void create()}>
            {t('academy.plan.createCount', { count: chosen.length })}
          </Button>
        </>
      }
    >
      {exams.length === 0 ? (
        <p className="text-sm text-muted">{t('academy.plan.noUpcomingExams')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('academy.plan.exam')}>
              {(id) => (
                <Select
                  id={id}
                  value={examId}
                  onChange={(e) => {
                    setExamId(e.target.value);
                    setSkip([]);
                    setContentIds(exams.find((a) => a.id === e.target.value)?.contentIds ?? []);
                  }}
                >
                  {exams.map((a) => (
                    <option key={a.id} value={a.id}>
                      {data.subjectById.get(a.subjectId)?.name} · {a.name} ({formatDateKey(a.date!, settings.locale, { day: 'numeric', month: 'short' })})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('academy.plan.durationEach')}>
              {(id) => <Input id={id} type="number" inputMode="numeric" min={5} max={600} step={5} value={duration} onChange={(e) => setDuration(Math.max(5, Math.min(600, Number(e.target.value) || 5)))} />}
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg">{t('academy.plan.preview')}</span>
            <ul className="flex flex-col gap-1">
              {dates.map((d) => (
                <li key={d}>
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={!skip.includes(d)} onChange={(e) => setSkip(e.target.checked ? skip.filter((x) => x !== d) : [...skip, d])} />
                    <span className="capitalize">{formatDateKey(d, settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          {exam && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-fg">{t('academy.plan.examContents')}</span>
              <ContentPicker subjectId={exam.subjectId} value={contentIds} onChange={setContentIds} />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function CompleteDialog({ s, onClose }: { s: StudySession; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [minutes, setMinutes] = useState(s.durationMin);
  const [difficulties, setDifficulties] = useState(s.difficulties);
  const save = async () => {
    try {
      await setSessionStatus(s.id, 'done', { actualMin: minutes, difficulties });
      onClose();
    } catch {
      toast.show(t('academy.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('academy.plan.markDone')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => void save()}>
            {t('academy.plan.markDone')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('academy.plan.actual')}>{(id) => <Input id={id} type="number" inputMode="numeric" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(Math.max(0, Math.min(1440, Math.round(Number(e.target.value) || 0))))} />}</Field>
        <Field label={t('academy.lessons.difficulties')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={3} value={difficulties} placeholder={t('academy.plan.difficultiesPlaceholder')} onChange={(e) => setDifficulties(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
