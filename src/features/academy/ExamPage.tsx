import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, ChevronLeft, CircleX, ClipboardCheck, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { updateAssessment } from '@/data/academyRepo';
import { getDb } from '@/data/db';
import { applyPostToContents, loadExamPrep, saveExamPrep } from '@/data/examPrepRepo';
import { contentsToReinforce, contentTree, flattenTree, masteryLevelsOf, mockTrend, type Assessment, type Content, type ExamPrep, type ReinforceReason } from '@/domain/academy';
import { formatDateKey, todayKey } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { DecimalInput, GradeBadge } from './academyUi';
import { AssessmentDialog } from './dialogs';
import { ContentPicker, DistributeDialog, useStudySessions } from './StudyPlanPage';
import { formatGrade, useAcademyData, type AcademyData } from './useAcademyData';

const TABS = ['prep', 'questions', 'mocks', 'errors', 'post'] as const;
type Tab = (typeof TABS)[number];

/** Preparação para a prova (Parte 9.10) e pós-avaliação (Parte 9.11). */
export function ExamPage() {
  const { id } = useParams();
  const { t } = useSettings();
  const assessment = useLiveQuery(() => (id ? getDb().assessments.get(id) : undefined), [id], null);
  const subject = useLiveQuery(() => (assessment ? getDb().subjects.get(assessment.subjectId) : undefined), [assessment?.subjectId], null);
  const data = useAcademyData(subject?.yearId ?? null);
  const prep = useLiveQuery(() => (id ? loadExamPrep(id) : undefined), [id]);
  if (assessment === null || subject === null || data.loading || !prep) return <LoadingState label={t('common.loading')} lines={5} />;
  if (!assessment || assessment.deletedAt || !subject)
    return (
      <div className="flex flex-col gap-4">
        <Link to="/academy" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {t('academy.subject.back')}
        </Link>
        <p className="text-muted">{t('academy.exam.notFound')}</p>
      </div>
    );
  return <ExamDetail key={assessment.id} assessment={assessment} prep={prep} data={data} />;
}

function ExamDetail({ assessment, prep, data }: { assessment: Assessment; prep: ExamPrep; data: AcademyData }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const subject = data.subjectById.get(assessment.subjectId)!;
  const [tab, setTab] = useState<Tab>(() => (assessment.date && assessment.date < todayKey() ? 'post' : 'prep'));
  const [editing, setEditing] = useState(false);
  const contents = useLiveQuery(() => getDb().contents.where('subjectId').equals(subject.id).filter((c) => !c.deletedAt).toArray(), [subject.id]) ?? [];
  const contentById = new Map(contents.map((c) => [c.id, c]));
  const save = (next: ExamPrep) => saveExamPrep(next).catch(() => toast.show(t('academy.errors.invalid'), 'error'));
  const model = data.modelOf(subject);
  const g = assessment.periodId ? data.gradeOf(subject, assessment.periodId) : null;
  const days = assessment.date ? Math.round((new Date(`${assessment.date}T12:00:00`).getTime() - new Date(`${todayKey()}T12:00:00`).getTime()) / 86_400_000) : null;

  return (
    <div className="flex flex-col gap-5">
      <Link to={`/academy/subjects/${subject.id}`} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {subject.name}
      </Link>
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <div className="h-2" style={{ background: subject.color }} aria-hidden />
        <div className="flex flex-wrap items-start gap-3 p-5 sm:p-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{assessment.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {[t(`academy.assessment.types.${assessment.type}`), assessment.date ? formatDateKey(assessment.date, settings.locale, { weekday: 'long', day: 'numeric', month: 'long' }) : t('academy.exam.noDate'), assessment.time].filter(Boolean).join(' · ')}
            </p>
            {days !== null && days >= 0 && <p className="mt-1 text-sm font-medium text-accent">{days === 0 ? t('academy.exam.today') : t('academy.exam.inDays', { count: days })}</p>}
          </div>
          <div className="flex items-center gap-2">
            {assessment.score !== null ? (
              <Badge tone="success">
                {formatGrade(assessment.score, settings.locale)}/{formatGrade(assessment.maxScore, settings.locale)}
              </Badge>
            ) : (
              <Badge>{t('academy.assessment.noScore')}</Badge>
            )}
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              {t('academy.exam.editAssessment')}
            </Button>
          </div>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label={assessment.name} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
          {TABS.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition', tab === id ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg')}
            >
              {t(`academy.exam.tabs.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'prep' && <PrepTab assessment={assessment} prep={prep} data={data} contents={contents} contentById={contentById} />}
      {tab === 'questions' && <QuestionsTab prep={prep} contents={contents} contentById={contentById} onSave={save} />}
      {tab === 'mocks' && <MocksTab prep={prep} onSave={save} />}
      {tab === 'errors' && <ErrorsTab prep={prep} contents={contents} contentById={contentById} onSave={save} />}
      {tab === 'post' && <PostTab assessment={assessment} prep={prep} data={data} contents={contents} onSave={save} />}

      {g && (
        <p className="text-xs text-subtle">
          {t('academy.exam.periodGrade')}: <GradeBadge result={g} locale={settings.locale} passing={model.passing} />
        </p>
      )}
      {editing && <AssessmentDialog data={data} assessment={assessment} subjectId={subject.id} periodId={assessment.periodId} onClose={() => setEditing(false)} />}
    </div>
  );
}

/* ---------- Preparação ---------- */

function PrepTab({ assessment, prep, data, contents, contentById }: { assessment: Assessment; prep: ExamPrep; data: AcademyData; contents: Content[]; contentById: Map<string, Content> }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [distributing, setDistributing] = useState(false);
  const { sessions } = useStudySessions(data);
  const levels = masteryLevelsOf(data.year);
  const covered = assessment.contentIds ?? [];
  const reinforce = contentsToReinforce(covered, contents, prep);
  const mySessions = sessions.filter((s) => s.assessmentId === assessment.id);
  const setCovered = (contentIds: string[]) => void updateAssessment(assessment.id, { ...assessment, contentIds }).catch(() => toast.show(t('errors.saveFailed'), 'error'));
  const right = prep.questions.filter((q) => q.result === 'right').length;
  const tried = prep.questions.filter((q) => q.result !== 'pending').length;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('academy.exam.covered')}</h2>
        <p className="text-sm text-muted">{t('academy.exam.coveredHint')}</p>
        <ContentPicker subjectId={assessment.subjectId} value={covered} onChange={setCovered} />
        {assessment.topics && <p className="whitespace-pre-wrap rounded-xl bg-surface-2/50 p-3 text-sm text-muted">{assessment.topics}</p>}
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-fg">
          <Sparkles className="h-5 w-5 text-warning" aria-hidden />
          {t('academy.exam.reinforce')}
        </h2>
        {reinforce.size === 0 ? (
          <p className="text-sm text-muted">{covered.length ? t('academy.exam.reinforceNone') : t('academy.exam.reinforceNeedsContents')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...reinforce.entries()].map(([id, reasons]) => {
              const c = contentById.get(id)!;
              return (
                <li key={id} className="rounded-xl bg-warning/10 p-2.5 ring-1 ring-warning/20">
                  <div className="text-sm font-medium text-fg">{c.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {reasons.map((r: ReinforceReason) => (
                      <Badge key={r} tone="warning">
                        {t(`academy.exam.reasons.${r}`)}
                      </Badge>
                    ))}
                    <Badge>{c.mastery === null ? t('academy.contents.masteryUnrated') : t('academy.contents.masteryValue', { level: levels[c.mastery] ?? '' })}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('academy.exam.reviewPlan')}</h2>
        {mySessions.length === 0 ? (
          <p className="text-sm text-muted">{t('academy.exam.noPlan')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {mySessions.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 capitalize text-muted">{formatDateKey(s.date, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="min-w-0 flex-1 text-fg">
                  {t(`academy.plan.kinds.${s.kind}`)} · {t('academy.plan.minutes', { min: s.durationMin })}
                </span>
                <Badge tone={s.status === 'done' ? 'success' : s.status === 'skipped' ? 'neutral' : 'info'}>{t(`academy.plan.statuses.${s.status}`)}</Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4" />} disabled={!assessment.date || assessment.date < todayKey()} onClick={() => setDistributing(true)}>
            {t('academy.plan.distribute')}
          </Button>
          <Link to="/academy/plan" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-accent hover:underline">
            {t('academy.exam.openPlan')}
          </Link>
        </div>
      </Surface>

      <Surface className="flex flex-col gap-2">
        <h2 className="font-semibold text-fg">{t('academy.exam.progress')}</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted">
          <li>{t('academy.exam.questionsSummary', { right, tried, total: prep.questions.length })}</li>
          <li>{t('academy.exam.mocksSummary', { count: prep.mocks.length, last: prep.mocks.length ? `${mockTrend(prep.mocks).at(-1)!.pct}%` : '—' })}</li>
          <li>{t('academy.exam.errorsSummary', { open: prep.errors.filter((e) => !e.fixed).length, total: prep.errors.length })}</li>
        </ul>
      </Surface>

      {distributing && <DistributeDialog data={data} examId={assessment.id} onClose={() => setDistributing(false)} />}
    </div>
  );
}

/* ---------- Questões ---------- */

function ContentSelect({ contents, value, onChange, label }: { contents: Content[]; value: string | null; onChange: (id: string | null) => void; label: string }) {
  const { t } = useSettings();
  const nodes = flattenTree(contentTree(contents));
  if (nodes.length === 0) return null;
  return (
    <Select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t('academy.doubts.noContent')}</option>
      {nodes.map(({ content: c, depth }) => (
        <option key={c.id} value={c.id}>
          {'· '.repeat(depth)}
          {c.title}
        </option>
      ))}
    </Select>
  );
}

function QuestionsTab({ prep, contents, contentById, onSave }: { prep: ExamPrep; contents: Content[]; contentById: Map<string, Content>; onSave: (p: ExamPrep) => Promise<unknown> }) {
  const { t } = useSettings();
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [contentId, setContentId] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const add = async () => {
    if (!text.trim()) return;
    await onSave({ ...prep, questions: [...prep.questions, { id: newId('q'), text: text.trim(), answer: answer.trim(), contentId, result: 'pending' }] });
    setText('');
    setAnswer('');
  };
  const setResult = (id: string, result: 'right' | 'wrong' | 'pending') => void onSave({ ...prep, questions: prep.questions.map((q) => (q.id === id ? { ...q, result } : q)) });
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <Textarea aria-label={t('academy.exam.question')} rows={2} placeholder={t('academy.exam.questionPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
        <Textarea aria-label={t('academy.exam.answer')} rows={2} placeholder={t('academy.exam.answerPlaceholder')} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1 basis-48">
            <ContentSelect contents={contents} value={contentId} onChange={setContentId} label={t('academy.doubts.content')} />
          </div>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!text.trim()} onClick={() => void add()}>
            {t('academy.exam.addQuestion')}
          </Button>
        </div>
      </Surface>
      {prep.questions.length > 0 && (
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => setShowAnswers(!showAnswers)}>
          {showAnswers ? t('academy.exam.hideAnswers') : t('academy.exam.showAnswers')}
        </Button>
      )}
      {prep.questions.length === 0 ? (
        <p className="text-sm text-muted">{t('academy.exam.questionsEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {prep.questions.map((q, i) => (
            <li key={q.id} className={cn('flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-soft ring-1', q.result === 'wrong' ? 'ring-danger/40' : q.result === 'right' ? 'ring-success/40' : 'ring-line/70')}>
              <div className="flex items-start gap-2">
                <span className="text-sm font-semibold text-subtle">{i + 1}.</span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm font-medium text-fg">{q.text}</p>
                <IconButton size="sm" label={t('academy.exam.removeQuestion')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void onSave({ ...prep, questions: prep.questions.filter((x) => x.id !== q.id) })} />
              </div>
              {q.contentId && contentById.get(q.contentId) && <span className="text-xs text-muted">{contentById.get(q.contentId)!.title}</span>}
              {showAnswers && q.answer && <p className="whitespace-pre-wrap rounded-xl bg-surface-2/60 p-2.5 text-sm text-fg">{q.answer}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant={q.result === 'right' ? 'primary' : 'secondary'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setResult(q.id, q.result === 'right' ? 'pending' : 'right')}>
                  {t('academy.exam.right')}
                </Button>
                <Button size="sm" variant={q.result === 'wrong' ? 'danger' : 'secondary'} icon={<CircleX className="h-4 w-4" />} onClick={() => setResult(q.id, q.result === 'wrong' ? 'pending' : 'wrong')}>
                  {t('academy.exam.wrong')}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- Simulados ---------- */

function MocksTab({ prep, onSave }: { prep: ExamPrep; onSave: (p: ExamPrep) => Promise<unknown> }) {
  const { t, settings } = useSettings();
  const [date, setDate] = useState(todayKey());
  const [score, setScore] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(10);
  const [notes, setNotes] = useState('');
  const trend = mockTrend(prep.mocks);
  const ok = score !== null && max !== null && max > 0 && score <= max;
  const add = async () => {
    if (!ok) return;
    await onSave({ ...prep, mocks: [...prep.mocks, { id: newId('mk'), date, score: score!, maxScore: max!, notes: notes.trim() }] });
    setScore(null);
    setNotes('');
  };
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('academy.lessons.date')}>{(id) => <Input id={id} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
          <Field label={t('academy.assessment.score')}>{(id) => <DecimalInput id={id} value={score} onChange={setScore} />}</Field>
          <Field label={t('academy.assessment.maxScore')}>{(id) => <DecimalInput id={id} value={max} onChange={setMax} />}</Field>
        </div>
        <Input aria-label={t('academy.assessment.notes')} placeholder={t('academy.exam.mockNotes')} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        <Button variant="primary" className="w-fit" icon={<Plus className="h-4 w-4" />} disabled={!ok} onClick={() => void add()}>
          {t('academy.exam.addMock')}
        </Button>
      </Surface>
      {trend.length === 0 ? (
        <p className="text-sm text-muted">{t('academy.exam.mocksEmpty')}</p>
      ) : (
        <Surface className="flex flex-col gap-3">
          <h2 className="font-semibold text-fg">{t('academy.exam.trend')}</h2>
          <ul className="flex h-32 items-end gap-2" aria-label={t('academy.exam.trend')}>
            {trend.map((m, i) => (
              <li key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${m.pct}%`}>
                <span className="text-xs tabular text-muted">{m.pct}%</span>
                <span className={cn('w-full rounded-t-md', m.pct >= 60 ? 'bg-success' : 'bg-warning')} style={{ height: `${Math.max(4, m.pct)}%` }} />
                <span className="text-[0.6875rem] text-subtle">{formatDateKey(m.date, settings.locale, { day: 'numeric', month: 'numeric' })}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1">
            {[...prep.mocks]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((m) => (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-muted">{formatDateKey(m.date, settings.locale)}</span>
                  <span className="tabular text-fg">
                    {formatGrade(m.score, settings.locale)}/{formatGrade(m.maxScore, settings.locale)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">{m.notes}</span>
                  <IconButton size="sm" label={t('academy.exam.removeMock')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void onSave({ ...prep, mocks: prep.mocks.filter((x) => x.id !== m.id) })} />
                </li>
              ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}

/* ---------- Erros ---------- */

function ErrorsTab({ prep, contents, contentById, onSave }: { prep: ExamPrep; contents: Content[]; contentById: Map<string, Content>; onSave: (p: ExamPrep) => Promise<unknown> }) {
  const { t } = useSettings();
  const [text, setText] = useState('');
  const [contentId, setContentId] = useState<string | null>(null);
  const add = async () => {
    if (!text.trim()) return;
    await onSave({ ...prep, errors: [...prep.errors, { id: newId('err'), description: text.trim(), contentId, fixed: false }] });
    setText('');
  };
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('academy.exam.errorsHint')}</p>
        <Textarea aria-label={t('academy.exam.error')} rows={2} placeholder={t('academy.exam.errorPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1 basis-48">
            <ContentSelect contents={contents} value={contentId} onChange={setContentId} label={t('academy.doubts.content')} />
          </div>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!text.trim()} onClick={() => void add()}>
            {t('academy.exam.addError')}
          </Button>
        </div>
      </Surface>
      {prep.errors.length === 0 ? (
        <p className="text-sm text-muted">{t('academy.exam.errorsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {prep.errors.map((e) => (
            <li key={e.id} className={cn('flex items-start gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line/70', e.fixed && 'opacity-60')}>
              <input
                type="checkbox"
                aria-label={t('academy.exam.fixed')}
                className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--accent))]"
                checked={e.fixed}
                onChange={(ev) => void onSave({ ...prep, errors: prep.errors.map((x) => (x.id === e.id ? { ...x, fixed: ev.target.checked } : x)) })}
              />
              <div className="min-w-0 flex-1">
                <p className={cn('whitespace-pre-wrap text-sm text-fg', e.fixed && 'line-through')}>{e.description}</p>
                {e.contentId && contentById.get(e.contentId) && <span className="text-xs text-muted">{contentById.get(e.contentId)!.title}</span>}
              </div>
              <IconButton size="sm" label={t('academy.exam.removeError')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void onSave({ ...prep, errors: prep.errors.filter((x) => x.id !== e.id) })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Pós-avaliação ---------- */

function PostTab({ assessment, prep, data, contents, onSave }: { assessment: Assessment; prep: ExamPrep; data: AcademyData; contents: Content[]; onSave: (p: ExamPrep) => Promise<unknown> }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const levels = masteryLevelsOf(data.year);
  const post = prep.post;
  const set = (patch: Partial<ExamPrep['post']>) => void onSave({ ...prep, post: { ...post, ...patch } });
  const scope = (assessment.contentIds ?? []).length ? contents.filter((c) => assessment.contentIds!.includes(c.id)) : contents;
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-fg">
          <ClipboardCheck className="h-5 w-5 text-accent" aria-hidden />
          {t('academy.exam.result')}
        </h2>
        <p className="text-sm text-muted">
          {assessment.score !== null ? t('academy.exam.resultValue', { score: formatGrade(assessment.score, settings.locale), max: formatGrade(assessment.maxScore, settings.locale) }) : t('academy.exam.resultMissing')}
        </p>
      </Surface>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label={t('academy.lessons.difficulties')}>{(id) => <Textarea id={id} rows={4} defaultValue={post.difficulties} onBlur={(e) => e.target.value !== post.difficulties && set({ difficulties: e.target.value })} />}</Field>
        <Field label={t('academy.exam.postErrors')}>{(id) => <Textarea id={id} rows={4} defaultValue={post.errors} onBlur={(e) => e.target.value !== post.errors && set({ errors: e.target.value })} />}</Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-success">{t('academy.exam.mastered')}</h3>
          <ContentPickerFrom list={scope} value={post.masteredContentIds} onChange={(ids) => set({ masteredContentIds: ids, reviewContentIds: post.reviewContentIds.filter((x) => !ids.includes(x)) })} />
        </Surface>
        <Surface className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-warning">{t('academy.exam.needReview')}</h3>
          <ContentPickerFrom list={scope} value={post.reviewContentIds} onChange={(ids) => set({ reviewContentIds: ids, masteredContentIds: post.masteredContentIds.filter((x) => !ids.includes(x)) })} />
        </Surface>
      </div>
      <Field label={t('academy.exam.reflections')}>{(id) => <Textarea id={id} rows={4} defaultValue={post.reflections} placeholder={t('academy.exam.reflectionsPlaceholder')} onBlur={(e) => e.target.value !== post.reflections && set({ reflections: e.target.value })} />}</Field>
      <Surface tone="flat" className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 basis-60 text-sm text-muted">
          {post.appliedAt ? t('academy.exam.appliedAt', { date: new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.appliedAt)) }) : t('academy.exam.applyHint', { top: levels[levels.length - 1] ?? '' })}
        </p>
        <Button variant="secondary" disabled={post.masteredContentIds.length + post.reviewContentIds.length === 0} onClick={() => setConfirming(true)}>
          {t('academy.exam.apply')}
        </Button>
      </Surface>
      <ConfirmDialog
        open={confirming}
        title={t('academy.exam.applyTitle')}
        body={t('academy.exam.applyBody', { mastered: post.masteredContentIds.length, review: post.reviewContentIds.length, top: levels[levels.length - 1] ?? '', second: levels[1] ?? '' })}
        confirmLabel={t('academy.exam.apply')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void applyPostToContents(assessment.id, levels.length).then((n) => toast.show(t('academy.exam.applied', { count: n })));
        }}
      />
    </div>
  );
}

function ContentPickerFrom({ list, value, onChange }: { list: Content[]; value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useSettings();
  const nodes = flattenTree(contentTree(list));
  if (nodes.length === 0) return <p className="text-xs text-muted">{t('academy.plan.noContents')}</p>;
  return (
    <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
      {nodes.map(({ content: c, depth }) => (
        <li key={c.id} style={{ paddingLeft: `${depth}rem` }}>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={value.includes(c.id)} onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))} />
            {c.title}
          </label>
        </li>
      ))}
    </ul>
  );
}
