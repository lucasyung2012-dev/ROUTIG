import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, CheckCircle2, CircleHelp, CornerDownRight, FolderKanban, NotebookPen, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import {
  createContent,
  createDoubt,
  moveContent,
  restoreContents,
  restoreDoubt,
  restoreLesson,
  saveLesson,
  softDeleteContent,
  softDeleteDoubt,
  softDeleteLesson,
  updateContent,
  updateDoubt,
} from '@/data/academyContentRepo';
import { AcademyRuleError } from '@/data/academyRepo';
import { getDb } from '@/data/db';
import { createNote, emptyNoteInput, linkNote } from '@/data/notesRepo';
import { createProject } from '@/data/projectsRepo';
import { createTask } from '@/data/tasksRepo';
import {
  childKind,
  CONTENT_KINDS,
  CONTENT_STATUSES,
  contentProgress,
  contentTree,
  flattenTree,
  masteryLevelsOf,
  type Content,
  type ContentKind,
  type ContentStatus,
  type Lesson,
  type LessonInput,
  type Subject,
} from '@/domain/academy';
import { formatDateKey, todayKey } from '@/domain/dates';
import { notePreview } from '@/domain/notes';
import { emptyProjectInput } from '@/domain/projects';
import { emptyTaskInput, isClosedKind, statusKind } from '@/domain/tasks';
import { TaskRow } from '@/features/tasks/TaskRow';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { useTasksData } from '@/features/tasks/useTasksData';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { EmptyState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import type { AcademyData } from './useAcademyData';
import type { SubjectExtras } from './useSubjectExtras';

/* ---------- Conteúdo programático (Parte 9.4) ---------- */

export function ContentsTab({ subject, data, extras }: { subject: Subject; data: AcademyData; extras: SubjectExtras }) {
  const { t } = useSettings();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ContentKind>('unit');
  const [addingUnder, setAddingUnder] = useState<Content | null>(null);
  const levels = masteryLevelsOf(data.year);
  const nodes = flattenTree(contentTree(extras.contents));
  const progress = contentProgress(extras.contents, levels.length);
  const fail = (e: unknown) => toast.show(e instanceof AcademyRuleError && e.code === 'duplicate' ? t('academy.errors.duplicate') : t('errors.saveFailed'), 'error');

  const add = async () => {
    if (!title.trim()) return;
    const text = title;
    setTitle('');
    try {
      await createContent(subject.id, null, kind, text);
    } catch (e) {
      setTitle(text);
      fail(e);
    }
  };

  const remove = async (c: Content) => {
    const ids = await softDeleteContent(c.id);
    toast.show(t('academy.contents.moved', { count: ids.length }), 'success', { label: t('notes.undo'), run: () => void restoreContents(ids) });
  };

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('academy.contents.hint')}</p>
        {progress.total > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge>{t('academy.contents.total', { count: progress.total })}</Badge>
            <Badge tone="accent">{t('academy.contents.studied', { count: progress.studied })}</Badge>
            <Badge tone="success">{t('academy.contents.masteredCount', { count: progress.mastered, level: levels[levels.length - 1] ?? '' })}</Badge>
            {progress.weak > 0 && <Badge tone="warning">{t('academy.contents.weak', { count: progress.weak })}</Badge>}
            <Badge>{t('academy.contents.unrated', { count: progress.total - progress.rated })}</Badge>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <div className="w-36">
            <Select aria-label={t('academy.contents.kind')} value={kind} onChange={(e) => setKind(e.target.value as ContentKind)}>
              {CONTENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`academy.contents.kinds.${k}`)}
                </option>
              ))}
            </Select>
          </div>
          <Input aria-label={t('academy.contents.new')} placeholder={t('academy.contents.newPlaceholder')} value={title} maxLength={200} className="min-w-0 flex-1 basis-48" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <Button icon={<Plus className="h-4 w-4" />} disabled={!title.trim()} onClick={() => void add()}>
            {t('academy.contents.add')}
          </Button>
        </div>
      </Surface>

      {nodes.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.contents.emptyTitle')} body={t('academy.contents.empty')} />
        </Surface>
      ) : (
        <Surface padded={false} className="divide-y divide-line/60">
          {nodes.map(({ content: c, depth }) => (
            <div key={c.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />}
                <span className="shrink-0 text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">{t(`academy.contents.kinds.${c.kind}`)}</span>
                <input
                  aria-label={t('academy.contents.title')}
                  defaultValue={c.title}
                  maxLength={200}
                  className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-0.5 text-sm font-medium text-fg focus:bg-surface-2 focus:outline-none"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== c.title && void updateContent(c.id, { title: e.target.value }).catch(fail)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  aria-label={t('academy.contents.status')}
                  value={c.status}
                  onChange={(e) => void updateContent(c.id, { status: e.target.value as ContentStatus }).catch(fail)}
                  className={cn('h-8 rounded-lg px-2 text-xs font-medium ring-1 ring-inset ring-line', c.status === 'mastered' ? 'bg-success/15 text-fg' : 'bg-surface-2 text-fg')}
                >
                  {CONTENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`academy.contents.statuses.${s}`)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('academy.contents.mastery')}
                  value={c.mastery ?? ''}
                  onChange={(e) => void updateContent(c.id, { mastery: e.target.value === '' ? null : Number(e.target.value) }).catch(fail)}
                  className="h-8 rounded-lg bg-surface-2 px-2 text-xs font-medium text-fg ring-1 ring-inset ring-line"
                >
                  <option value="">{t('academy.contents.masteryUnrated')}</option>
                  {levels.map((l, i) => (
                    <option key={i} value={i}>
                      {t('academy.contents.masteryValue', { level: l })}
                    </option>
                  ))}
                </select>
                <IconButton size="sm" label={t('academy.contents.addInside', { title: c.title })} icon={<Plus className="h-4 w-4" />} onClick={() => setAddingUnder(c)} />
                <IconButton size="sm" label={t('common.moveUp')} icon={<ArrowUp className="h-4 w-4" />} onClick={() => void moveContent(c.id, -1)} />
                <IconButton size="sm" label={t('common.moveDown')} icon={<ArrowDown className="h-4 w-4" />} onClick={() => void moveContent(c.id, 1)} />
                <IconButton size="sm" label={t('academy.contents.remove', { title: c.title })} icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove(c)} />
              </div>
            </div>
          ))}
        </Surface>
      )}
      {addingUnder && <AddChildDialog parent={addingUnder} subjectId={subject.id} onClose={() => setAddingUnder(null)} />}
    </div>
  );
}

function AddChildDialog({ parent, subjectId, onClose }: { parent: Content; subjectId: string; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ContentKind>(childKind(parent.kind));
  const save = async () => {
    try {
      await createContent(subjectId, parent.id, kind, title);
      onClose();
    } catch (e) {
      toast.show(e instanceof AcademyRuleError && e.code === 'duplicate' ? t('academy.errors.duplicate') : t('errors.saveFailed'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('academy.contents.addInside', { title: parent.title })}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => void save()}>
            {t('academy.contents.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select aria-label={t('academy.contents.kind')} value={kind} onChange={(e) => setKind(e.target.value as ContentKind)}>
          {CONTENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`academy.contents.kinds.${k}`)}
            </option>
          ))}
        </Select>
        <Input autoFocus aria-label={t('academy.contents.title')} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && void save()} />
      </div>
    </Dialog>
  );
}

/* ---------- Aulas (Parte 9.5) ---------- */

export function LessonsTab({ subject, data, extras }: { subject: Subject; data: AcademyData; extras: SubjectExtras }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [editing, setEditing] = useState<Lesson | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Button variant="primary" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
        {t('academy.lessons.new')}
      </Button>
      {extras.lessons.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.lessons.emptyTitle')} body={t('academy.lessons.empty')} />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-2">
          {extras.lessons.map((l) => {
            const contents = l.contentIds.map((id) => extras.contentById.get(id)?.title).filter(Boolean);
            return (
              <li key={l.id}>
                <button type="button" onClick={() => setEditing(l)} className="flex w-full flex-col gap-1 rounded-2xl bg-surface p-4 text-left shadow-soft ring-1 ring-line/70 transition hover:bg-surface-2">
                  <span className="text-xs font-medium capitalize text-muted">{formatDateKey(l.date, settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                  <span className="font-medium text-fg">{[l.topic, ...contents].filter(Boolean).join(' · ') || t('academy.lessons.noTopic')}</span>
                  {l.difficulties && <span className="text-sm text-warning">{t('academy.lessons.difficultiesShort', { text: l.difficulties })}</span>}
                  {l.notes && <span className="line-clamp-2 text-sm text-muted">{l.notes}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {extras.lessonsTrash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('academy.assessment.trash')}</h3>
          {extras.lessonsTrash.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">
                {formatDateKey(l.date, settings.locale)} · {l.topic || t('academy.lessons.noTopic')}
              </span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreLesson(l.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}
      {editing && (
        <LessonDialog
          subject={subject}
          data={data}
          extras={extras}
          lesson={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDeleted={(id) => toast.show(t('academy.lessons.moved'), 'success', { label: t('notes.undo'), run: () => void restoreLesson(id) })}
        />
      )}
    </div>
  );
}

function LessonDialog({ subject, data, extras, lesson, onClose, onDeleted }: { subject: Subject; data: AcademyData; extras: SubjectExtras; lesson: Lesson | null; onClose: () => void; onDeleted: (id: string) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<LessonInput>(() =>
    lesson
      ? { ...lesson }
      : { subjectId: subject.id, date: todayKey(), teacherId: subject.teacherId, contentIds: [], topic: '', notes: '', difficulties: '', activities: '', observations: '', noteIds: [] },
  );
  const [markStudied, setMarkStudied] = useState(!lesson);
  const set = (p: Partial<LessonInput>) => setInput((i) => ({ ...i, ...p }));
  const nodes = flattenTree(contentTree(extras.contents));

  const save = async () => {
    try {
      await saveLesson(lesson?.id ?? null, input);
      // Conteúdo visto em aula passa a "em andamento" (nunca a "dominado": domínio é outra coisa).
      if (markStudied) for (const id of input.contentIds) if (extras.contentById.get(id)?.status === 'notStarted') await updateContent(id, { status: 'inProgress' });
      toast.show(t('common.saved'));
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
      title={lesson ? t('academy.lessons.edit') : t('academy.lessons.new')}
      size="lg"
      footer={
        <>
          {lesson && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void softDeleteLesson(lesson.id).then(() => (onDeleted(lesson.id), onClose()))}>
              {t('academy.assessment.moveToTrash')}
            </Button>
          )}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('academy.lessons.date')}>{(id) => <Input id={id} type="date" value={input.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
          <Field label={t('academy.subject.teacher')}>
            {(id) => (
              <Select id={id} value={input.teacherId ?? ''} onChange={(e) => set({ teacherId: e.target.value || null })}>
                <option value="">{t('academy.subject.noTeacher')}</option>
                {data.teachers.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('academy.lessons.topic')}>{(id) => <Input id={id} value={input.topic} maxLength={300} placeholder={t('academy.lessons.topicPlaceholder')} onChange={(e) => set({ topic: e.target.value })} />}</Field>
        {nodes.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg">{t('academy.lessons.contents')}</span>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl bg-surface-2/50 p-2">
              {nodes.map(({ content: c, depth }) => (
                <li key={c.id} style={{ paddingLeft: `${depth * 1}rem` }}>
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[rgb(var(--accent))]"
                      checked={input.contentIds.includes(c.id)}
                      onChange={(e) => set({ contentIds: e.target.checked ? [...input.contentIds, c.id] : input.contentIds.filter((x) => x !== c.id) })}
                    />
                    {c.title}
                  </label>
                </li>
              ))}
            </ul>
            <Switch label={t('academy.lessons.markStudied')} checked={markStudied} onChange={setMarkStudied} />
          </div>
        )}
        <Field label={t('academy.lessons.notes')}>{(id) => <Textarea id={id} rows={4} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('academy.lessons.difficulties')}>{(id) => <Textarea id={id} rows={2} value={input.difficulties} onChange={(e) => set({ difficulties: e.target.value })} />}</Field>
          <Field label={t('academy.lessons.activities')}>{(id) => <Textarea id={id} rows={2} value={input.activities} onChange={(e) => set({ activities: e.target.value })} />}</Field>
        </div>
        <Field label={t('academy.lessons.observations')}>{(id) => <Textarea id={id} rows={2} value={input.observations} onChange={(e) => set({ observations: e.target.value })} />}</Field>
        <Field label={t('academy.assessment.materials')}>
          {(id) => (
            <Select id={id} value="" onChange={(e) => e.target.value && set({ noteIds: [...input.noteIds, e.target.value] })}>
              <option value="">{input.noteIds.length ? t('academy.lessons.notesLinked', { count: input.noteIds.length }) : t('profile.sections.linkNote')}</option>
              {extras.notes
                .filter((n) => !input.noteIds.includes(n.id))
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title || t('notes.untitled')}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------- Dúvidas ---------- */

export function DoubtsTab({ subject, extras }: { subject: Subject; extras: SubjectExtras }) {
  const { t } = useSettings();
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [contentId, setContentId] = useState<string>('');
  const nodes = flattenTree(contentTree(extras.contents));
  const add = async () => {
    if (!question.trim()) return;
    const q = question;
    setQuestion('');
    try {
      await createDoubt(subject.id, q, contentId || null);
    } catch (e) {
      setQuestion(q);
      toast.show(e instanceof AcademyRuleError && e.code === 'duplicate' ? t('academy.errors.duplicate') : t('errors.saveFailed'), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <Textarea aria-label={t('academy.doubts.question')} rows={2} placeholder={t('academy.doubts.placeholder')} value={question} maxLength={2000} onChange={(e) => setQuestion(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {nodes.length > 0 && (
            <div className="min-w-0 flex-1 basis-48">
              <Select aria-label={t('academy.doubts.content')} value={contentId} onChange={(e) => setContentId(e.target.value)}>
                <option value="">{t('academy.doubts.noContent')}</option>
                {nodes.map(({ content: c, depth }) => (
                  <option key={c.id} value={c.id}>
                    {'· '.repeat(depth)}
                    {c.title}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button variant="primary" icon={<CircleHelp className="h-4 w-4" />} disabled={!question.trim()} onClick={() => void add()}>
            {t('academy.doubts.add')}
          </Button>
        </div>
      </Surface>
      {extras.doubts.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.doubts.emptyTitle')} body={t('academy.doubts.empty')} />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-2">
          {extras.doubts.map((d) => (
            <li key={d.id} className={cn('flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70', d.status === 'resolved' && 'opacity-70')}>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm font-medium text-fg">{d.question}</p>
                <Badge tone={d.status === 'open' ? 'warning' : 'success'}>{t(`academy.doubts.status.${d.status}`)}</Badge>
              </div>
              {d.contentId && extras.contentById.get(d.contentId) && <span className="text-xs text-muted">{extras.contentById.get(d.contentId)!.title}</span>}
              <Textarea aria-label={t('academy.doubts.answer')} rows={2} placeholder={t('academy.doubts.answerPlaceholder')} defaultValue={d.answer} onBlur={(e) => e.target.value !== d.answer && void updateDoubt(d.id, { answer: e.target.value })} />
              <div className="flex gap-2">
                <Button size="sm" variant={d.status === 'open' ? 'secondary' : 'ghost'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void updateDoubt(d.id, { status: d.status === 'open' ? 'resolved' : 'open' })}>
                  {d.status === 'open' ? t('academy.doubts.resolve') : t('academy.doubts.reopen')}
                </Button>
                <IconButton
                  size="sm"
                  label={t('academy.doubts.remove')}
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => void softDeleteDoubt(d.id).then(() => toast.show(t('academy.doubts.moved'), 'success', { label: t('notes.undo'), run: () => void restoreDoubt(d.id) }))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Trabalhos e atividades (Parte 9.7) ---------- */

export function WorkTab({ subject, extras }: { subject: Subject; extras: SubjectExtras }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const tasksData = useTasksData();
  const editor = useTaskEditor();
  const actions = useTaskActions(tasksData);
  const [taskTitle, setTaskTitle] = useState('');
  const [workName, setWorkName] = useState('');
  const open = extras.tasks.filter((x) => !isClosedKind(statusKind(tasksData.config, x.statusId)));
  const done = extras.tasks.filter((x) => isClosedKind(statusKind(tasksData.config, x.statusId)));
  // Usa as tarefas vivas do Tasks (mesmo registro, já atualizado).
  const live = (id: string) => tasksData.active.find((x) => x.id === id);

  const addTask = async () => {
    if (!taskTitle.trim()) return;
    const title = taskTitle;
    setTaskTitle('');
    try {
      await createTask(emptyTaskInput({ title, subjectId: subject.id, originModule: 'academy' }));
    } catch {
      setTaskTitle(title);
      toast.show(t('errors.saveFailed'), 'error');
    }
  };

  const addWork = async () => {
    if (!workName.trim()) return;
    try {
      const p = await createProject(emptyProjectInput({ name: workName, category: 'school', color: subject.color, subjectId: subject.id }));
      navigate(`/projects/${p.id}`);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Surface className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-fg">
          <FolderKanban className="h-5 w-5 text-amber" aria-hidden />
          {t('academy.work.title')}
        </h2>
        <p className="text-sm text-muted">{t('academy.work.hint')}</p>
        {extras.projects.length === 0 ? (
          <p className="text-sm text-muted">{t('academy.work.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {extras.projects.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-surface-2/70">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{p.name}</span>
                  <span className="text-xs text-muted">{p.due ? formatDateKey(p.due, settings.locale, { day: 'numeric', month: 'short' }) : '—'}</span>
                  <Badge>{t(`projects.status.${p.status}`)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input aria-label={t('academy.work.new')} placeholder={t('academy.work.newPlaceholder')} value={workName} maxLength={200} className="min-w-0 flex-1" onChange={(e) => setWorkName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addWork()} />
          <Button icon={<Plus className="h-4 w-4" />} disabled={!workName.trim()} onClick={() => void addWork()}>
            {t('academy.work.create')}
          </Button>
        </div>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('academy.work.activities')}</h2>
        <p className="text-sm text-muted">{t('academy.work.activitiesHint')}</p>
        <div className="flex gap-2">
          <Input aria-label={t('academy.work.newActivity')} placeholder={t('academy.work.newActivityPlaceholder')} value={taskTitle} maxLength={300} className="min-w-0 flex-1" onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addTask()} />
          <IconButton label={t('academy.work.newActivity')} icon={<Plus className="h-4 w-4" />} disabled={!taskTitle.trim()} onClick={() => void addTask()} />
        </div>
        {open.length === 0 && done.length === 0 ? (
          <p className="text-sm text-muted">{t('academy.work.activitiesEmpty')}</p>
        ) : (
          <ul className="flex flex-col">
            {[...open, ...done].map((x) => {
              const task = live(x.id) ?? x;
              return (
                <li key={x.id}>
                  <TaskRow task={task} data={tasksData} onOpen={editor.openTask} onToggle={actions.toggle} compact />
                </li>
              );
            })}
          </ul>
        )}
        {actions.dialogs}
      </Surface>
    </div>
  );
}

/* ---------- Materiais e anotações ---------- */

export function MaterialsTab({ subject, extras }: { subject: Subject; extras: SubjectExtras }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [linking, setLinking] = useState(false);
  const newNote = async () => {
    try {
      const n = await createNote(emptyNoteInput({ title: subject.name, links: [{ type: 'subject', id: subject.id }] }));
      navigate(`/notes/${n.id}`);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<NotebookPen className="h-4 w-4" />} onClick={() => void newNote()}>
          {t('academy.materials.newNote')}
        </Button>
        <Button variant="secondary" onClick={() => setLinking(true)}>
          {t('profile.sections.linkNote')}
        </Button>
      </div>
      <p className="text-sm text-muted">{t('academy.materials.hint')}</p>
      {extras.notes.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.materials.emptyTitle')} body={t('academy.materials.empty')} />
        </Surface>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {extras.notes.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="block h-full rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="block truncate font-medium text-fg">{n.title || t('notes.untitled')}</span>
                <span className="mt-1 line-clamp-2 block text-sm text-muted">{notePreview(n, 140) || '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {linking && <LinkNoteDialog subject={subject} exclude={extras.notes.map((n) => n.id)} onClose={() => setLinking(false)} />}
    </div>
  );
}

function LinkNoteDialog({ subject, exclude, onClose }: { subject: Subject; exclude: string[]; onClose: () => void }) {
  const { t } = useSettings();
  const notes = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt && !exclude.includes(n.id)).toArray(), [exclude.join(',')]);
  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} title={t('profile.sections.linkNote')} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      {!notes?.length ? (
        <p className="text-sm text-muted">{t('academy.materials.nothingToLink')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {notes.map((n) => (
            <li key={n.id}>
              <button type="button" className="w-full rounded-xl px-2 py-2 text-left text-sm text-fg hover:bg-surface-2" onClick={() => void linkNote(n.id, { type: 'subject', id: subject.id }).then(onClose)}>
                {n.title || t('notes.untitled')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
