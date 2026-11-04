import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play, Plus, RotateCcw, Shuffle, Trash2, Volume2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { answerVocab, createVocab, LanguageRuleError, resetVocab, restoreVocab, softDeleteVocab, updateVocab, vocabReviews } from '@/data/languagesRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import { emptyVocabInput, GERMAN_ARTICLES, numberedToPinyin, PARTS_OF_SPEECH, speechLang, tonesOf, vocabInputOf, type GermanArticle, type Language, type PartOfSpeech, type VocabEntry, type VocabInput } from '@/domain/languages';
import { cardStage, masteryScore, previewIntervals, RATINGS, sessionQueue, type CardStage, type Rating } from '@/domain/srs';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

const NEW_PER_SESSION = 20;

/** Lê o texto em voz alta com a voz do aparelho (funciona sem internet quando a voz está instalada). */
export function speak(text: string, code: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechLang(code);
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Como a palavra aparece: "der Hund", "你好 · nǐ hǎo". */
export function displayTerm(v: Pick<VocabEntry, 'term' | 'german' | 'mandarin'>): string {
  if (v.german?.article) return `${v.german.article} ${v.term}`;
  if (v.mandarin?.characters && v.mandarin.characters !== v.term) return `${v.mandarin.characters} · ${v.term}`;
  return v.term;
}

export function useVocab(languageId: string) {
  const all = useLiveQuery(() => getDb().vocab.where('languageId').equals(languageId).toArray(), [languageId]);
  return useMemo(() => ({ loading: all === undefined, list: (all ?? []).filter((v) => !v.deletedAt).sort((a, b) => a.term.localeCompare(b.term)), trash: (all ?? []).filter((v) => v.deletedAt) }), [all]);
}

export function VocabTab({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const { loading, list, trash } = useVocab(lang.id);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<PartOfSpeech | ''>('');
  const [category, setCategory] = useState('');
  const [stage, setStage] = useState<CardStage | ''>('');
  const [editing, setEditing] = useState<VocabEntry | 'new' | null>(null);
  const [session, setSession] = useState<{ manual: boolean } | null>(null);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  if (loading) return <LoadingState label={t('common.loading')} lines={4} />;
  const today = todayKey();
  const due = list.filter((v) => v.srs.due !== null && v.srs.due <= today).length;
  const fresh = list.filter((v) => v.srs.due === null).length;
  const categories = [...new Set(list.map((v) => v.category).filter(Boolean))].sort();
  const key = q.trim().toLowerCase();
  const shown = list.filter(
    (v) =>
      (!key || `${v.term} ${v.translation} ${v.meaning} ${v.tags.join(' ')} ${v.mandarin?.characters ?? ''} ${v.mandarin?.pinyin ?? ''}`.toLowerCase().includes(key)) &&
      (!pos || v.partOfSpeech === pos) &&
      (!category || v.category === category) &&
      (!stage || cardStage(v.srs) === stage),
  );
  const avg = list.length ? Math.round(list.reduce((a, v) => a + masteryScore(v.srs), 0) / list.length) : 0;

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{t('languages.vocab.count', { count: list.length })}</Badge>
          <Badge tone="warning">{t('academy.review.dueCount', { count: due })}</Badge>
          <Badge tone="info">{t('academy.review.newCount', { count: fresh })}</Badge>
          <Badge tone="success">{t('academy.review.masteryPct', { pct: avg })}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            {t('languages.vocab.new')}
          </Button>
          <Button variant="secondary" icon={<Play className="h-4 w-4" />} disabled={due === 0 && fresh === 0} onClick={() => setSession({ manual: false })}>
            {t('academy.review.review')}
          </Button>
          <Button variant="secondary" icon={<Shuffle className="h-4 w-4" />} disabled={list.length === 0} onClick={() => setSession({ manual: true })}>
            {t('academy.review.practice')}
          </Button>
          <div className="w-52">
            <Select aria-label={t('languages.vocab.direction')} value={direction} onChange={(e) => setDirection(e.target.value as 'forward' | 'backward')}>
              <option value="forward">{t('languages.vocab.forward', { lang: lang.name })}</option>
              <option value="backward">{t('languages.vocab.backward', { lang: lang.name })}</option>
            </Select>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input aria-label={t('common.search')} placeholder={t('languages.vocab.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Select aria-label={t('languages.vocab.pos')} value={pos} onChange={(e) => setPos(e.target.value as PartOfSpeech | '')}>
            <option value="">{t('languages.vocab.anyPos')}</option>
            {PARTS_OF_SPEECH.map((p) => (
              <option key={p} value={p}>
                {t(`languages.vocab.posNames.${p}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t('academy.review.category')} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('languages.vocab.anyCategory')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select aria-label={t('languages.vocab.stage')} value={stage} onChange={(e) => setStage(e.target.value as CardStage | '')}>
            <option value="">{t('languages.vocab.anyStage')}</option>
            {(['new', 'learning', 'young', 'mature'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`academy.review.stages.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </Surface>

      {shown.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={list.length ? t('languages.vocab.noMatch') : t('languages.vocab.emptyTitle')} body={list.length ? '' : t('languages.vocab.empty')} />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line/70">
              <button type="button" onClick={() => setEditing(v)} className="flex min-w-0 flex-1 flex-col text-left">
                <span className="flex flex-wrap items-baseline gap-x-2 text-[0.9375rem] font-semibold text-fg">
                  {displayTerm(v)}
                  {v.mandarin?.pinyin && v.mandarin.characters && <span className="text-sm font-normal text-muted">{v.mandarin.pinyin}</span>}
                  {v.plural && <span className="text-xs font-normal text-muted">{t('languages.vocab.pluralShort', { plural: v.plural })}</span>}
                </span>
                <span className="truncate text-sm text-muted">{v.translation || v.meaning}</span>
              </button>
              {v.partOfSpeech && <Badge>{t(`languages.vocab.posNames.${v.partOfSpeech}`)}</Badge>}
              <Badge tone={cardStage(v.srs) === 'mature' ? 'success' : cardStage(v.srs) === 'new' ? 'info' : 'neutral'}>{t(`academy.review.stages.${cardStage(v.srs)}`)}</Badge>
              {canSpeak() && <IconButton size="sm" label={t('languages.vocab.listen')} icon={<Volume2 className="h-4 w-4" />} onClick={() => speak(v.mandarin?.characters || (v.german?.article ? `${v.german.article} ${v.term}` : v.term), lang.code)} />}
            </li>
          ))}
        </ul>
      )}

      {trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('languages.trash')}</h3>
          {trash.map((v) => (
            <div key={v.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{v.term}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreVocab(v.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}

      {editing && <VocabDialog lang={lang} entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {session && <VocabSession lang={lang} manual={session.manual} direction={direction} onClose={() => setSession(null)} />}
    </div>
  );
}

/* ---------- Cadastro da palavra ---------- */

function VocabDialog({ lang, entry, onClose }: { lang: Language; entry: VocabEntry | null; onClose: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<VocabInput>(() => (entry ? vocabInputOf(entry) : emptyVocabInput(lang.id, lang.profile)));
  const [tags, setTags] = useState(input.tags.join(', '));
  const [keepOpen, setKeepOpen] = useState(!entry);
  const history = useLiveQuery(async () => (entry ? vocabReviews(entry.id) : []), [entry?.id]) ?? [];
  const set = (p: Partial<VocabInput>) => setInput((i) => ({ ...i, ...p }));
  // Alemão e mandarim aparecem quando o idioma pede (ou se a palavra já tem esses dados).
  const german = input.german ?? (lang.profile === 'german' ? { article: null, cases: '', prepositions: '', government: '' } : null);
  const mandarin = input.mandarin ?? (lang.profile === 'mandarin' ? { characters: '', pinyin: '', tones: '' } : null);
  const ok = input.term.trim() && (input.translation.trim() || input.meaning.trim());

  const save = async () => {
    try {
      const data = { ...input, tags: tags.split(',').map((x) => x.trim()).filter(Boolean), german, mandarin };
      if (entry) await updateVocab(entry.id, data);
      else await createVocab(data);
      toast.show(t('common.saved'));
      if (!entry && keepOpen) {
        setInput(emptyVocabInput(lang.id, lang.profile));
        setInput((i) => ({ ...i, category: data.category, source: data.source }));
      } else onClose();
    } catch (e) {
      toast.show(e instanceof LanguageRuleError && e.code === 'duplicate' ? t('languages.vocab.duplicate') : t('languages.vocab.invalid'), 'error');
    }
  };

  const fmt = new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={entry ? t('languages.vocab.edit') : t('languages.vocab.new')}
      size="lg"
      footer={
        <>
          {entry && (
            <Button
              variant="danger"
              className="mr-auto"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() =>
                void softDeleteVocab(entry.id).then(() => {
                  toast.show(t('languages.vocab.moved'), 'success', { label: t('notes.undo'), run: () => void restoreVocab(entry.id) });
                  onClose();
                })
              }
            >
              {t('academy.assessment.moveToTrash')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button variant="primary" disabled={!ok} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={mandarin ? t('languages.vocab.termPinyin') : t('languages.vocab.term')}>
            {(id) => (
              <div className="flex gap-2">
                <Input id={id} autoFocus value={input.term} maxLength={300} onChange={(e) => set({ term: e.target.value })} onBlur={() => mandarin && /\d/.test(input.term) && set({ term: numberedToPinyin(input.term), mandarin: { ...mandarin, pinyin: numberedToPinyin(input.term), tones: mandarin.tones || tonesOf(input.term) } })} />
                {canSpeak() && <IconButton label={t('languages.vocab.listen')} icon={<Volume2 className="h-4 w-4" />} onClick={() => speak(mandarin?.characters || input.term, lang.code)} />}
              </div>
            )}
          </Field>
          <Field label={t('languages.vocab.translation')}>{(id) => <Input id={id} value={input.translation} maxLength={500} onChange={(e) => set({ translation: e.target.value })} />}</Field>
        </div>

        {german && (
          <div className="grid gap-3 rounded-2xl bg-surface-2/50 p-3 sm:grid-cols-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle sm:col-span-2">{t('languages.vocab.germanTitle')}</p>
            <Field label={t('languages.vocab.article')}>
              {(id) => (
                <div id={id} className="flex gap-1.5" role="radiogroup" aria-label={t('languages.vocab.article')}>
                  {GERMAN_ARTICLES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={german.article === a}
                      onClick={() => set({ german: { ...german, article: german.article === a ? null : (a as GermanArticle) }, gender: german.article === a ? '' : t(`languages.vocab.genders.${a}`) })}
                      className={cn('h-10 flex-1 rounded-xl text-sm font-semibold ring-1 ring-line transition', german.article === a ? 'bg-accent text-white' : 'bg-surface text-fg')}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label={t('languages.vocab.cases')}>{(id) => <Input id={id} value={german.cases} maxLength={200} placeholder="Akkusativ, Dativ…" onChange={(e) => set({ german: { ...german, cases: e.target.value } })} />}</Field>
            <Field label={t('languages.vocab.prepositions')}>{(id) => <Input id={id} value={german.prepositions} maxLength={200} placeholder="auf, mit…" onChange={(e) => set({ german: { ...german, prepositions: e.target.value } })} />}</Field>
            <Field label={t('languages.vocab.government')}>{(id) => <Input id={id} value={german.government} maxLength={500} placeholder={t('languages.vocab.governmentPlaceholder')} onChange={(e) => set({ german: { ...german, government: e.target.value } })} />}</Field>
          </div>
        )}

        {mandarin && (
          <div className="grid gap-3 rounded-2xl bg-surface-2/50 p-3 sm:grid-cols-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle sm:col-span-3">{t('languages.vocab.mandarinTitle')}</p>
            <Field label={t('languages.vocab.characters')}>{(id) => <Input id={id} value={mandarin.characters} maxLength={100} placeholder="你好" className="text-lg" onChange={(e) => set({ mandarin: { ...mandarin, characters: e.target.value } })} />}</Field>
            <Field label={t('languages.vocab.pinyin')} hint={t('languages.vocab.pinyinHint')}>
              {(id, d) => (
                <Input
                  id={id}
                  aria-describedby={d}
                  value={mandarin.pinyin}
                  maxLength={300}
                  placeholder="ni3 hao3"
                  onChange={(e) => set({ mandarin: { ...mandarin, pinyin: e.target.value } })}
                  onBlur={(e) => /\d/.test(e.target.value) && set({ mandarin: { ...mandarin, pinyin: numberedToPinyin(e.target.value), tones: mandarin.tones || tonesOf(e.target.value) } })}
                />
              )}
            </Field>
            <Field label={t('languages.vocab.tones')}>{(id) => <Input id={id} value={mandarin.tones} maxLength={100} placeholder="3 3" onChange={(e) => set({ mandarin: { ...mandarin, tones: e.target.value } })} />}</Field>
          </div>
        )}

        <Field label={t('languages.vocab.meaning')} optionalLabel={t('common.optional')}>{(id) => <Textarea id={id} rows={2} value={input.meaning} maxLength={2000} placeholder={t('languages.vocab.meaningPlaceholder')} onChange={(e) => set({ meaning: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('languages.vocab.example')}>{(id) => <Textarea id={id} rows={2} value={input.example} maxLength={2000} onChange={(e) => set({ example: e.target.value })} />}</Field>
          <Field label={t('languages.vocab.exampleTranslation')}>{(id) => <Textarea id={id} rows={2} value={input.exampleTranslation} maxLength={2000} onChange={(e) => set({ exampleTranslation: e.target.value })} />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('languages.vocab.pos')}>
            {(id) => (
              <Select id={id} value={input.partOfSpeech ?? ''} onChange={(e) => set({ partOfSpeech: (e.target.value || null) as PartOfSpeech | null })}>
                <option value="">—</option>
                {PARTS_OF_SPEECH.map((p) => (
                  <option key={p} value={p}>
                    {t(`languages.vocab.posNames.${p}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {!german && <Field label={t('languages.vocab.gender')}>{(id) => <Input id={id} value={input.gender} maxLength={40} placeholder={t('languages.vocab.genderPlaceholder')} onChange={(e) => set({ gender: e.target.value })} />}</Field>}
          <Field label={t('languages.vocab.plural')}>{(id) => <Input id={id} value={input.plural} maxLength={200} onChange={(e) => set({ plural: e.target.value })} />}</Field>
          <Field label={t('languages.vocab.pronunciation')}>{(id) => <Input id={id} value={input.pronunciation} maxLength={300} placeholder={t('languages.vocab.pronunciationPlaceholder')} onChange={(e) => set({ pronunciation: e.target.value })} />}</Field>
          <Field label={t('academy.review.category')}>{(id) => <Input id={id} value={input.category} maxLength={60} placeholder={t('languages.vocab.categoryPlaceholder')} onChange={(e) => set({ category: e.target.value })} />}</Field>
          <Field label={t('academy.review.tags')}>{(id) => <Input id={id} value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>
        </div>
        <Field label={t('languages.vocab.source')}>{(id) => <Input id={id} value={input.source} maxLength={300} placeholder={t('languages.vocab.sourcePlaceholder')} onChange={(e) => set({ source: e.target.value })} />}</Field>
        {!entry && <Switch label={t('academy.review.keepOpen')} checked={keepOpen} onChange={setKeepOpen} />}
        {entry && (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-2/50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-fg">{t('academy.review.cardState', { stage: t(`academy.review.stages.${cardStage(entry.srs)}`), mastery: masteryScore(entry.srs) })}</span>
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void resetVocab(entry.id)}>
                {t('academy.review.reset')}
              </Button>
            </div>
            <span className="text-muted">
              {t('academy.review.cardNumbers', { reps: entry.srs.reps, lapses: entry.srs.lapses, interval: entry.srs.interval })}
              {entry.srs.due && ` · ${t('languages.vocab.nextReview', { date: formatDateKey(entry.srs.due, settings.locale, { day: 'numeric', month: 'short' }) })}`}
            </span>
            {history.length > 0 && (
              <ul className="flex max-h-32 flex-col gap-0.5 overflow-y-auto text-xs text-muted">
                {history.map((h) => (
                  <li key={h.id}>
                    {fmt.format(new Date(h.at))} · {t(`academy.review.ratings.${h.rating}`)}
                    {h.manual ? ` · ${t('academy.review.manualTag')}` : ` · ${t('academy.review.nextIn', { days: h.intervalAfter })}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- Revisão de vocabulário ---------- */

const RATING_STYLE: Record<Rating, string> = {
  again: 'bg-danger/15 text-danger ring-danger/30',
  hard: 'bg-warning/15 text-fg ring-warning/30',
  good: 'bg-success/15 text-fg ring-success/30',
  easy: 'bg-blue/15 text-fg ring-blue/30',
};

function VocabSession({ lang, manual, direction, onClose }: { lang: Language; manual: boolean; direction: 'forward' | 'backward'; onClose: () => void }) {
  const { t } = useSettings();
  const today = todayKey();
  const all = useLiveQuery(() => getDb().vocab.where('languageId').equals(lang.id).filter((v) => !v.deletedAt).toArray(), [lang.id]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState<Rating[]>([]);
  const [requeued, setRequeued] = useState<string[]>([]);
  if (all && order === null) {
    setOrder(manual ? [...all].sort(() => Math.random() - 0.5).map((v) => v.id) : sessionQueue(all, today, { newLimit: NEW_PER_SESSION, reviewLimit: 200 }).map((v) => v.id));
  }
  const queue = [...(order ?? []), ...requeued];
  const v = all?.find((x) => x.id === queue[index]);
  const done = order !== null && index >= queue.length;
  const preview = v ? previewIntervals(v.srs, today) : null;

  const answer = async (r: Rating) => {
    if (!v) return;
    await answerVocab(v.id, r, manual);
    setAnswers((a) => [...a, r]);
    if (r === 'again' && !requeued.includes(v.id)) setRequeued((q) => [...q, v.id]);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const term = v ? displayTerm(v) : '';
  const front = direction === 'forward' ? term : (v?.translation || v?.meaning || '');
  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} title={manual ? t('academy.review.practiceTitle') : t('languages.vocab.sessionTitle', { lang: lang.name })} size="lg">
      {!all || order === null ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : done || !v ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p className="text-lg font-semibold text-fg">{queue.length === 0 ? t('academy.review.nothingDue') : t('academy.review.finished')}</p>
          {answers.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {RATINGS.map((r) => (
                <Badge key={r}>
                  {t(`academy.review.ratings.${r}`)}: {answers.filter((a) => a === r).length}
                </Badge>
              ))}
            </div>
          )}
          <Button variant="primary" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t('academy.review.progress', { n: index + 1, total: queue.length })}</span>
            {manual && <Badge>{t('academy.review.manualTag')}</Badge>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full transition-all" style={{ width: `${(index / queue.length) * 100}%`, background: lang.color }} />
          </div>
          <button
            type="button"
            onClick={() => setFlipped(!flipped)}
            className="flex min-h-[14rem] flex-col items-center justify-center gap-3 rounded-3xl bg-surface-2/60 p-6 text-center ring-1 ring-line"
            aria-label={flipped ? t('academy.review.hideAnswer') : t('academy.review.showAnswer')}
          >
            <span className="text-2xl font-semibold text-fg">{front}</span>
            {direction === 'forward' && v.mandarin?.pinyin && v.mandarin.characters && !flipped && <span className="text-sm text-muted">{t('languages.vocab.tapForPinyin')}</span>}
            {flipped ? (
              <span className="flex w-full flex-col gap-2 border-t border-line pt-4 text-fg">
                <span className="text-xl">{direction === 'forward' ? v.translation || v.meaning : term}</span>
                {v.mandarin?.pinyin && v.mandarin.characters && <span className="text-sm text-muted">{v.mandarin.pinyin}</span>}
                {v.german && (v.german.cases || v.german.prepositions || v.german.government) && (
                  <span className="text-sm text-muted">{[v.german.cases, v.german.prepositions, v.german.government].filter(Boolean).join(' · ')}</span>
                )}
                {v.plural && <span className="text-sm text-muted">{t('languages.vocab.pluralShort', { plural: v.plural })}</span>}
                {v.example && <span className="text-sm italic text-muted">{v.example}</span>}
              </span>
            ) : (
              <span className="text-sm text-muted">{t('academy.review.tapToShow')}</span>
            )}
          </button>
          {canSpeak() && (
            <Button size="sm" variant="ghost" className="w-fit self-center" icon={<Volume2 className="h-4 w-4" />} onClick={() => speak(v.mandarin?.characters || (v.german?.article ? `${v.german.article} ${v.term}` : v.term), lang.code)}>
              {t('languages.vocab.listen')}
            </Button>
          )}
          {flipped ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATINGS.map((r) => (
                <button key={r} type="button" onClick={() => void answer(r)} className={cn('flex flex-col items-center gap-0.5 rounded-2xl px-3 py-3 text-sm font-semibold ring-1 transition hover:brightness-110', RATING_STYLE[r])}>
                  {t(`academy.review.ratings.${r}`)}
                  {!manual && preview && <span className="text-xs font-normal opacity-80">{t('academy.review.inDays', { days: preview[r] })}</span>}
                </button>
              ))}
            </div>
          ) : (
            <Button variant="primary" size="lg" onClick={() => setFlipped(true)}>
              {t('academy.review.showAnswer')}
            </Button>
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={onClose}>
              {t('academy.review.stop')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
