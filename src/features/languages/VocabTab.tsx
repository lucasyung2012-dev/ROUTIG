import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play, Plus, RotateCcw, Shuffle, Trash2, Volume2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createVocab, LanguageRuleError, resetVocab, restoreVocab, softDeleteVocab, updateVocab, vocabReviews } from '@/data/languagesRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import { emptyVocabInput, GERMAN_ARTICLES, numberedToPinyin, PARTS_OF_SPEECH, tonesOf, vocabInputOf, type GermanArticle, type Language, type PartOfSpeech, type VocabEntry, type VocabInput } from '@/domain/languages';
import { cardStage, masteryScore, type CardStage } from '@/domain/srs';
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
import { LanguageReviewSession } from './ReviewsTab';
import { canSpeak, displayTerm, speak, speakTextOf } from './vocabUtils';


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
                  {v.mandarin?.pinyin && v.mandarin.characters && v.mandarin.pinyin !== v.term && <span className="text-sm font-normal text-muted">{v.mandarin.pinyin}</span>}
                  {v.plural && <span className="text-xs font-normal text-muted">{t('languages.vocab.pluralShort', { plural: v.plural })}</span>}
                </span>
                <span className="truncate text-sm text-muted">{v.translation || v.meaning}</span>
              </button>
              {v.partOfSpeech && <Badge>{t(`languages.vocab.posNames.${v.partOfSpeech}`)}</Badge>}
              <Badge tone={cardStage(v.srs) === 'mature' ? 'success' : cardStage(v.srs) === 'new' ? 'info' : 'neutral'}>{t(`academy.review.stages.${cardStage(v.srs)}`)}</Badge>
              {canSpeak() && <IconButton size="sm" label={t('languages.vocab.listen')} icon={<Volume2 className="h-4 w-4" />} onClick={() => speak(speakTextOf(v), lang.code)} />}
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
      {session && <LanguageReviewSession lang={lang} deck={{ kind: 'vocab' }} manual={session.manual} direction={direction} onClose={() => setSession(null)} />}
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

