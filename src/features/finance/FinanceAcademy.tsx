import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, ExternalLink, NotebookPen, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { answerTerm, restoreLearning, restoreTerm, saveLearning, saveTerm, softDeleteLearning, softDeleteTerm } from '@/data/financeLearnRepo';
import { FinanceRuleError } from '@/data/financeRepo';
import { createNote, emptyNoteInput, linkNote } from '@/data/notesRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import { emptyLearningInput, LEARN_STATUSES, type FinLearning, type FinTerm, type LearnKind, type LearningInput } from '@/domain/finance';
import { notePreview } from '@/domain/notes';
import { isDue, previewIntervals, sessionQueue, type Rating } from '@/domain/srs';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { EmptyState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

type Section = LearnKind | 'glossary' | 'materials';
const SECTIONS: Section[] = ['course', 'lesson', 'summary', 'concept', 'glossary', 'learning', 'materials'];

/** Academia Financeira (Parte 16.2): cursos, aulas, resumos, conceitos, glossário com revisões, materiais e aprendizados. */
export function FinanceAcademy() {
  const { t } = useSettings();
  const [section, setSection] = useState<Section>('course');
  const items = useLiveQuery(() => getDb().finLearning.toArray(), []) ?? [];
  const terms = useLiveQuery(() => getDb().finTerms.toArray(), []) ?? [];
  const live = items.filter((i) => !i.deletedAt);
  const today = todayKey();
  const due = terms.filter((x) => !x.deletedAt && isDue(x.srs, today)).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={section === s}
              onClick={() => setSection(s)}
              className={cn('whitespace-nowrap rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition', section === s ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line hover:text-fg')}
            >
              {t(`finance.academy.sections.${s}`)}
              {s === 'glossary' && due > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[0.6875rem] text-white">{due}</span>}
              {s !== 'glossary' && s !== 'materials' && <span className="ml-1 text-xs opacity-70">{live.filter((i) => i.kind === s).length || ''}</span>}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted">{t(`finance.academy.hints.${section}`)}</p>
      {section === 'glossary' ? <Glossary terms={terms} /> : section === 'materials' ? <Materials /> : <LearnList kind={section} items={items} />}
    </div>
  );
}

/* ---------- Cursos, aulas, resumos, conceitos, aprendizados ---------- */

function LearnList({ kind, items }: { kind: LearnKind; items: FinLearning[] }) {
  const { t, settings } = useSettings();
  const [editing, setEditing] = useState<{ item?: FinLearning } | null>(null);
  const live = items.filter((i) => !i.deletedAt);
  const list = live.filter((i) => i.kind === kind).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title));
  const courses = live.filter((i) => i.kind === 'course');
  const trash = items.filter((i) => i.deletedAt && i.kind === kind);
  return (
    <div className="flex flex-col gap-3">
      <Button variant="primary" size="sm" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({})}>
        {t(`finance.academy.new.${kind}`)}
      </Button>
      {list.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('finance.academy.emptyTitle')} body={t(`finance.academy.empty.${kind}`)} />
        </Surface>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((i) => {
            const lessons = kind === 'course' ? live.filter((l) => l.kind === 'lesson' && l.courseId === i.id) : [];
            const course = i.courseId ? courses.find((c) => c.id === i.courseId) : undefined;
            return (
              <li key={i.id}>
                <button type="button" onClick={() => setEditing({ item: i })} className="flex h-full w-full flex-col gap-2 rounded-2xl bg-surface p-4 text-left shadow-soft ring-1 ring-line/70 transition hover:shadow-lift">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="min-w-0 flex-1 font-semibold text-fg">{i.title}</span>
                    {(kind === 'course' || kind === 'lesson') && <Badge tone={i.status === 'done' ? 'success' : i.status === 'doing' ? 'accent' : 'neutral'}>{t(`finance.academy.statuses.${i.status}`)}</Badge>}
                  </div>
                  {(i.provider || course) && <span className="text-xs text-muted">{[i.provider, course?.title].filter(Boolean).join(' · ')}</span>}
                  {i.body && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted">{i.body}</p>}
                  <div className="mt-auto flex flex-wrap gap-3 text-xs text-muted">
                    {i.date && <span>{formatDateKey(i.date, settings.locale)}</span>}
                    {kind === 'course' && lessons.length > 0 && <span>{t('finance.academy.lessonsDone', { done: lessons.filter((l) => l.status === 'done').length, total: lessons.length })}</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('finance.trash')}</h3>
          {trash.map((i) => (
            <div key={i.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{i.title}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreLearning(i.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}
      {editing && <LearnDialog kind={kind} item={editing.item} courses={courses} onClose={() => setEditing(null)} />}
    </div>
  );
}

function LearnDialog({ kind, item, courses, onClose }: { kind: LearnKind; item?: FinLearning; courses: FinLearning[]; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<LearningInput>(() => (item ? { kind: item.kind, title: item.title, body: item.body, courseId: item.courseId, status: item.status, provider: item.provider, url: item.url, date: item.date } : { ...emptyLearningInput(kind), date: kind === 'learning' || kind === 'lesson' ? todayKey() : null }));
  const set = (p: Partial<LearningInput>) => setInput((i) => ({ ...i, ...p }));
  const save = async () => {
    try {
      await saveLearning(item?.id ?? null, input);
      toast.show(t('finance.saved'));
      onClose();
    } catch {
      toast.show(input.url && !/^https?:\/\//i.test(input.url) ? t('finance.academy.errors.url') : t('finance.errors.invalid'), 'error');
    }
  };
  const remove = async () => {
    if (!item) return;
    await softDeleteLearning(item.id);
    toast.show(t('finance.academy.removed'), 'success', { label: t('notes.undo'), run: () => void restoreLearning(item.id) });
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={item ? t('finance.academy.edit') : t(`finance.academy.new.${kind}`)}
      footer={
        <>
          {item && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('finance.remove')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.title.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('finance.academy.fields.title')}>{(id) => <Input id={id} autoFocus value={input.title} maxLength={160} placeholder={t(`finance.academy.placeholders.${kind}`)} onChange={(e) => set({ title: e.target.value })} />}</Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {kind === 'course' && (
            <Field label={t('finance.academy.fields.provider')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} value={input.provider} maxLength={120} onChange={(e) => set({ provider: e.target.value })} />}
            </Field>
          )}
          {kind === 'lesson' && (
            <Field label={t('finance.academy.fields.course')} optionalLabel={t('common.optional')}>
              {(id) => (
                <Select id={id} value={input.courseId ?? ''} onChange={(e) => set({ courseId: e.target.value || null })}>
                  <option value="">—</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {(kind === 'course' || kind === 'lesson') && (
            <Field label={t('finance.academy.fields.status')}>
              {(id) => (
                <Select id={id} value={input.status} onChange={(e) => set({ status: e.target.value as LearningInput['status'] })}>
                  {LEARN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`finance.academy.statuses.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label={t('finance.academy.fields.date')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} type="date" value={input.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} />}
          </Field>
          <Field label={t('finance.academy.fields.url')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} type="url" inputMode="url" value={input.url} placeholder="https://" onChange={(e) => set({ url: e.target.value.trim() })} />}
          </Field>
        </div>
        <Field label={t(`finance.academy.bodyLabel.${kind}`)} optionalLabel={t('common.optional')} hint={kind === 'concept' ? t('finance.academy.conceptHint') : undefined}>
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={8} maxLength={40000} value={input.body} onChange={(e) => set({ body: e.target.value })} />}
        </Field>
        {item?.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm text-accent hover:underline">
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t('finance.academy.openLink')}
          </a>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- Glossário e revisões ---------- */

function Glossary({ terms }: { terms: FinTerm[] }) {
  const { t } = useSettings();
  const [editing, setEditing] = useState<{ term?: FinTerm } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [q, setQ] = useState('');
  const today = todayKey();
  const live = terms.filter((x) => !x.deletedAt).sort((a, b) => a.term.localeCompare(b.term));
  const shown = q.trim() ? live.filter((x) => `${x.term} ${x.definition}`.toLowerCase().includes(q.trim().toLowerCase())) : live;
  const due = live.filter((x) => isDue(x.srs, today));
  const trash = terms.filter((x) => x.deletedAt);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({})}>
          {t('finance.academy.newTerm')}
        </Button>
        <Button variant="secondary" size="sm" icon={<BookOpen className="h-4 w-4" />} disabled={!due.length} onClick={() => setReviewing(true)}>
          {t('finance.academy.review', { count: due.length })}
        </Button>
        <Input aria-label={t('finance.academy.search')} placeholder={t('finance.academy.search')} value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-60" />
      </div>
      {shown.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('finance.academy.emptyTitle')} body={live.length ? t('finance.academy.noMatch') : t('finance.academy.empty.glossary')} />
        </Surface>
      ) : (
        <dl className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((x) => (
            <button key={x.id} type="button" onClick={() => setEditing({ term: x })} className="flex flex-col gap-1 rounded-2xl bg-surface p-4 text-left shadow-soft ring-1 ring-line/70 transition hover:shadow-lift">
              <dt className="font-semibold text-fg">{x.term}</dt>
              <dd className="whitespace-pre-wrap text-sm text-fg">{x.definition}</dd>
              {x.example && <dd className="text-sm italic text-muted">{x.example}</dd>}
            </button>
          ))}
        </dl>
      )}
      {trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('finance.trash')}</h3>
          {trash.map((x) => (
            <div key={x.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{x.term}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreTerm(x.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}
      {editing && <TermDialog term={editing.term} onClose={() => setEditing(null)} />}
      {reviewing && <TermReview terms={due} onClose={() => setReviewing(false)} />}
    </div>
  );
}

function TermDialog({ term, onClose }: { term?: FinTerm; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState(term?.term ?? '');
  const [definition, setDefinition] = useState(term?.definition ?? '');
  const [example, setExample] = useState(term?.example ?? '');
  const save = async () => {
    try {
      await saveTerm(term?.id ?? null, name, definition, example);
      toast.show(t('finance.saved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof FinanceRuleError && e.code === 'duplicate' ? t('finance.academy.errors.duplicateTerm') : t('finance.errors.invalid'), 'error');
    }
  };
  const remove = async () => {
    if (!term) return;
    await softDeleteTerm(term.id);
    toast.show(t('finance.academy.removed'), 'success', { label: t('notes.undo'), run: () => void restoreTerm(term.id) });
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={term ? t('finance.academy.editTerm') : t('finance.academy.newTerm')}
      footer={
        <>
          {term && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('finance.remove')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim() || !definition.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('finance.academy.fields.term')}>{(id) => <Input id={id} autoFocus value={name} maxLength={120} placeholder={t('finance.academy.termPlaceholder')} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('finance.academy.fields.definition')} hint={t('finance.academy.definitionHint')}>
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={4} maxLength={4000} value={definition} onChange={(e) => setDefinition(e.target.value)} />}
        </Field>
        <Field label={t('finance.academy.fields.example')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={2} maxLength={2000} value={example} onChange={(e) => setExample(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

function TermReview({ terms, onClose }: { terms: FinTerm[]; onClose: () => void }) {
  const { t } = useSettings();
  const today = todayKey();
  const queue = useMemo(() => sessionQueue(terms, today, { newLimit: 20, reviewLimit: 100 }), [terms, today]);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const cur = queue[i];
  const answer = async (r: Rating) => {
    if (!cur) return;
    await answerTerm(cur.id, r, today);
    setDone((d) => d + 1);
    setShown(false);
    setI((x) => x + 1);
  };
  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} size="lg" title={t('finance.academy.reviewTitle')}>
      {!cur ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-lg font-semibold text-fg">{t('finance.academy.reviewDone', { count: done })}</p>
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <span className="text-xs text-muted">{t('finance.academy.reviewProgress', { n: i + 1, total: queue.length })}</span>
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl bg-surface-2/60 p-6 text-center">
            <span className="text-2xl font-semibold text-fg">{cur.term}</span>
            {shown ? (
              <>
                <p className="whitespace-pre-wrap text-fg">{cur.definition}</p>
                {cur.example && <p className="text-sm italic text-muted">{cur.example}</p>}
              </>
            ) : (
              <span className="text-sm text-muted">{t('finance.academy.recall')}</span>
            )}
          </div>
          {shown ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATINGS.map((r) => {
                const days = previewIntervals(cur.srs, today)[r];
                return (
                  <Button key={r} variant="secondary" onClick={() => void answer(r)} className="flex-col">
                    <span>{t(`academy.review.ratings.${r}`)}</span>
                    <span className="text-xs text-muted">{t('finance.academy.inDays', { count: days })}</span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <Button variant="primary" onClick={() => setShown(true)}>
              {t('finance.academy.showAnswer')}
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}

/* ---------- Materiais ---------- */

function Materials() {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [linking, setLinking] = useState(false);
  const notes = useLiveQuery(async () => (await getDb().notes.filter((n) => !n.deletedAt && n.links.some((l) => l.type === 'finance')).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), []);
  const all = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt).toArray(), []) ?? [];
  const ids = new Set((notes ?? []).map((n) => n.id));
  const others = all.filter((n) => !ids.has(n.id));
  const newNote = async () => {
    try {
      const n = await createNote(emptyNoteInput({ title: t('finance.academy.noteTitle'), links: [{ type: 'finance', id: 'academy' }] }));
      navigate(`/notes/${n.id}`);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" icon={<NotebookPen className="h-4 w-4" />} onClick={() => void newNote()}>
          {t('finance.academy.newNote')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLinking(true)}>
          {t('profile.sections.linkNote')}
        </Button>
      </div>
      {!notes?.length ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.materials.emptyTitle')} body={t('finance.academy.empty.materials')} />
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
                  <button type="button" className="w-full rounded-xl px-2 py-2 text-left text-sm text-fg hover:bg-surface-2" onClick={() => void linkNote(n.id, { type: 'finance', id: 'academy' }).then(() => setLinking(false))}>
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
