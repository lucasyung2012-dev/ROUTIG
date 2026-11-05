import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, CircleX, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createGrammar, restoreGrammar, softDeleteGrammar, updateGrammar } from '@/data/grammarRepo';
import { LanguageRuleError } from '@/data/languagesRepo';
import { newId } from '@/domain/ids';
import { CEFR_LEVELS, emptyGrammarInput, grammarInputOf, type CefrLevel, type GrammarInput, type GrammarRule, type Language } from '@/domain/languages';
import { cardStage } from '@/domain/srs';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

export function useGrammar(languageId: string) {
  const all = useLiveQuery(() => getDb().grammarRules.where('languageId').equals(languageId).toArray(), [languageId]);
  return useMemo(() => ({ loading: all === undefined, list: (all ?? []).filter((g) => !g.deletedAt).sort((a, b) => a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title)), trash: (all ?? []).filter((g) => g.deletedAt) }), [all]);
}

/** Gramática (Parte 10.4): regras, explicações, exemplos, exercícios e observações. */
export function GrammarTab({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const { loading, list, trash } = useGrammar(lang.id);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<GrammarRule | 'new' | null>(null);
  if (loading) return <LoadingState label={t('common.loading')} lines={4} />;
  const key = q.trim().toLowerCase();
  const shown = key ? list.filter((g) => `${g.title} ${g.topic} ${g.explanation} ${g.examples.join(' ')}`.toLowerCase().includes(key)) : list;
  const topics = [...new Set(shown.map((g) => g.topic || ''))];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          {t('languages.grammar.new')}
        </Button>
        <Input aria-label={t('common.search')} placeholder={t('languages.grammar.search')} value={q} className="min-w-0 flex-1 basis-48" onChange={(e) => setQ(e.target.value)} />
      </div>
      {shown.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={list.length ? t('languages.vocab.noMatch') : t('languages.grammar.emptyTitle')} body={list.length ? '' : t('languages.grammar.empty')} />
        </Surface>
      ) : (
        topics.map((topic) => (
          <section key={topic} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{topic || t('languages.grammar.noTopic')}</h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {shown
                .filter((g) => (g.topic || '') === topic)
                .map((g) => {
                  const right = g.exercises.filter((e) => e.result === 'right').length;
                  const tried = g.exercises.filter((e) => e.result !== 'pending').length;
                  return (
                    <li key={g.id}>
                      <button type="button" onClick={() => setEditing(g)} className="flex h-full w-full flex-col gap-1.5 rounded-2xl bg-surface p-4 text-left ring-1 ring-line/70 transition hover:bg-surface-2">
                        <span className="flex flex-wrap items-center gap-2 font-semibold text-fg">
                          {g.title}
                          {g.level && <Badge tone="accent">{g.level}</Badge>}
                        </span>
                        {g.explanation && <span className="line-clamp-2 text-sm text-muted">{g.explanation}</span>}
                        <span className="flex flex-wrap gap-1.5 text-xs text-muted">
                          <span>{t('languages.grammar.examplesCount', { count: g.examples.length })}</span>
                          <span>· {t('languages.grammar.exercisesSummary', { right, tried, total: g.exercises.length })}</span>
                          <span>· {t(`academy.review.stages.${cardStage(g.srs)}`)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))
      )}
      {trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('languages.trash')}</h3>
          {trash.map((g) => (
            <div key={g.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{g.title}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreGrammar(g.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}
      {editing && <GrammarDialog lang={lang} rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GrammarDialog({ lang, rule, onClose }: { lang: Language; rule: GrammarRule | null; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<GrammarInput>(() => (rule ? grammarInputOf(rule) : emptyGrammarInput(lang.id)));
  const [example, setExample] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const set = (p: Partial<GrammarInput>) => setInput((i) => ({ ...i, ...p }));
  const save = async () => {
    try {
      if (rule) await updateGrammar(rule.id, input);
      else await createGrammar(input);
      toast.show(t('common.saved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof LanguageRuleError && e.code === 'duplicate' ? t('languages.grammar.duplicate') : t('academy.errors.invalid'), 'error');
    }
  };
  const addExample = () => {
    if (!example.trim()) return;
    set({ examples: [...input.examples, example.trim()] });
    setExample('');
  };
  const addExercise = () => {
    if (!question.trim()) return;
    set({ exercises: [...input.exercises, { id: newId('gex'), question: question.trim(), answer: answer.trim(), result: 'pending' }] });
    setQuestion('');
    setAnswer('');
  };
  const mark = (id: string, result: 'right' | 'wrong') => set({ exercises: input.exercises.map((x) => (x.id === id ? { ...x, result: x.result === result ? 'pending' : result } : x)) });
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={rule ? t('languages.grammar.edit') : t('languages.grammar.new')}
      size="lg"
      footer={
        <>
          {rule && (
            <Button
              variant="danger"
              className="mr-auto"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() =>
                void softDeleteGrammar(rule.id).then(() => {
                  toast.show(t('languages.grammar.moved'), 'success', { label: t('notes.undo'), run: () => void restoreGrammar(rule.id) });
                  onClose();
                })
              }
            >
              {t('academy.assessment.moveToTrash')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.title.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('languages.grammar.title')}>{(id) => <Input id={id} autoFocus={!rule} value={input.title} maxLength={200} placeholder={t('languages.grammar.titlePlaceholder')} onChange={(e) => set({ title: e.target.value })} />}</Field>
          <Field label={t('languages.grammar.topic')}>{(id) => <Input id={id} value={input.topic} maxLength={60} placeholder={t('languages.grammar.topicPlaceholder')} onChange={(e) => set({ topic: e.target.value })} />}</Field>
          <Field label={t('languages.level')}>
            {(id) => (
              <Select id={id} value={input.level ?? ''} onChange={(e) => set({ level: (e.target.value || null) as CefrLevel | null })}>
                <option value="">—</option>
                {CEFR_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('languages.grammar.explanation')}>{(id) => <Textarea id={id} rows={4} value={input.explanation} placeholder={t('languages.grammar.explanationPlaceholder')} onChange={(e) => set({ explanation: e.target.value })} />}</Field>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('languages.grammar.examples')}</h3>
          {input.examples.length > 0 && (
            <ul className="flex flex-col gap-1">
              {input.examples.map((ex, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm italic text-fg">
                  <span className="min-w-0 flex-1">{ex}</span>
                  <IconButton size="sm" label={t('languages.grammar.removeExample')} icon={<X className="h-4 w-4" />} onClick={() => set({ examples: input.examples.filter((_, j) => j !== i) })} />
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input aria-label={t('languages.grammar.addExample')} placeholder={t('languages.grammar.examplePlaceholder')} value={example} maxLength={1000} onChange={(e) => setExample(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExample()} />
            <IconButton label={t('languages.grammar.addExample')} icon={<Plus className="h-4 w-4" />} disabled={!example.trim()} onClick={addExample} />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('languages.grammar.exercises')}</h3>
          {input.exercises.length > 0 && (
            <ol className="flex flex-col gap-2">
              {input.exercises.map((x, i) => (
                <li key={x.id} className={cn('flex flex-col gap-1.5 rounded-xl p-3 ring-1', x.result === 'right' ? 'ring-success/40' : x.result === 'wrong' ? 'ring-danger/40' : 'ring-line/70')}>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="font-semibold text-subtle">{i + 1}.</span>
                    <span className="min-w-0 flex-1 text-fg">{x.question}</span>
                    <IconButton size="sm" label={t('languages.grammar.removeExercise')} icon={<X className="h-4 w-4" />} onClick={() => set({ exercises: input.exercises.filter((y) => y.id !== x.id) })} />
                  </div>
                  {x.answer && (
                    <details className="text-sm text-muted">
                      <summary className="cursor-pointer text-accent">{t('languages.grammar.showAnswer')}</summary>
                      <p className="mt-1 whitespace-pre-wrap text-fg">{x.answer}</p>
                    </details>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant={x.result === 'right' ? 'primary' : 'secondary'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => mark(x.id, 'right')}>
                      {t('academy.exam.right')}
                    </Button>
                    <Button size="sm" variant={x.result === 'wrong' ? 'danger' : 'secondary'} icon={<CircleX className="h-4 w-4" />} onClick={() => mark(x.id, 'wrong')}>
                      {t('academy.exam.wrong')}
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input aria-label={t('languages.grammar.exerciseQuestion')} placeholder={t('languages.grammar.exerciseQuestion')} value={question} maxLength={2000} onChange={(e) => setQuestion(e.target.value)} />
            <div className="flex gap-2">
              <Input aria-label={t('languages.grammar.exerciseAnswer')} placeholder={t('languages.grammar.exerciseAnswer')} value={answer} maxLength={2000} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExercise()} />
              <IconButton label={t('languages.grammar.addExercise')} icon={<Plus className="h-4 w-4" />} disabled={!question.trim()} onClick={addExercise} />
            </div>
          </div>
        </section>

        <Field label={t('languages.notes')}>{(id) => <Textarea id={id} rows={2} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}
