import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play, Shuffle, Volume2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { answerGrammar } from '@/data/grammarRepo';
import { answerVocab } from '@/data/languagesRepo';
import { todayKey } from '@/domain/dates';
import { deckHasVocab, deckKey, type GrammarRule, type Language, type LanguageDeck, type VocabEntry } from '@/domain/languages';
import { masteryScore, previewIntervals, RATINGS, sessionQueue, type Rating, type SrsState } from '@/domain/srs';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Select } from '@/ui/Field';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { cn } from '@/ui/cn';
import { canSpeak, displayTerm, speak, speakTextOf } from './vocabUtils';

const NEW_PER_SESSION = 20;

type Item = { kind: 'vocab'; v: VocabEntry; srs: SrsState; id: string } | { kind: 'grammar'; g: GrammarRule; srs: SrsState; id: string };

function useReviewItems(languageId: string) {
  return useLiveQuery(async () => {
    const db = getDb();
    const [vocab, grammar] = await Promise.all([db.vocab.where('languageId').equals(languageId).filter((v) => !v.deletedAt).toArray(), db.grammarRules.where('languageId').equals(languageId).filter((g) => !g.deletedAt).toArray()]);
    return { vocab, grammar };
  }, [languageId]);
}

function itemsOf(deck: LanguageDeck, data: { vocab: VocabEntry[]; grammar: GrammarRule[] }): Item[] {
  const vocab = data.vocab.filter((v) => deckHasVocab(deck, v)).map((v): Item => ({ kind: 'vocab', v, srs: v.srs, id: v.id }));
  const grammar = deck.kind === 'all' || deck.kind === 'grammar' ? data.grammar.map((g): Item => ({ kind: 'grammar', g, srs: g.srs, id: g.id })) : [];
  return [...vocab, ...grammar];
}

/** Revisões do idioma (Parte 10.7): baralhos e sessões com vocabulário e gramática. */
export function ReviewsTab({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const data = useReviewItems(lang.id);
  const [session, setSession] = useState<{ deck: LanguageDeck; manual: boolean } | null>(null);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  if (!data) return <LoadingState label={t('common.loading')} lines={4} />;
  const today = todayKey();
  const categories = [...new Set(data.vocab.map((v) => v.category).filter(Boolean))].sort();
  const decks: { deck: LanguageDeck; name: string }[] = [
    { deck: { kind: 'all' }, name: t('languages.reviews.all') },
    { deck: { kind: 'vocab' }, name: t('languages.reviews.allVocab') },
    ...categories.map((c) => ({ deck: { kind: 'vocab' as const, category: c }, name: c })),
    ...(data.vocab.some((v) => !v.category) && categories.length ? [{ deck: { kind: 'vocab' as const, category: null }, name: t('languages.reviews.noCategory') }] : []),
    { deck: { kind: 'grammar' }, name: t('languages.tabs.grammar') },
  ];
  if (data.vocab.length + data.grammar.length === 0)
    return (
      <Surface tone="flat">
        <EmptyState title={t('languages.reviews.emptyTitle')} body={t('languages.reviews.empty')} />
      </Surface>
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 basis-60 text-sm text-muted">{t('languages.reviews.hint')}</p>
        <div className="w-56">
          <Select aria-label={t('languages.vocab.direction')} value={direction} onChange={(e) => setDirection(e.target.value as 'forward' | 'backward')}>
            <option value="forward">{t('languages.vocab.forward', { lang: lang.name })}</option>
            <option value="backward">{t('languages.vocab.backward', { lang: lang.name })}</option>
          </Select>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {decks.map(({ deck, name }) => {
          const items = itemsOf(deck, data);
          const due = items.filter((i) => i.srs.due !== null && i.srs.due <= today).length;
          const fresh = items.filter((i) => i.srs.due === null).length;
          const mastery = items.length ? Math.round(items.reduce((a, i) => a + masteryScore(i.srs), 0) / items.length) : 0;
          return (
            <li key={deckKey(deck)} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70">
              <div className="font-semibold text-fg">{name}</div>
              <div className="flex flex-wrap gap-1.5">
                <Badge>{t('academy.review.cards', { count: items.length })}</Badge>
                {due > 0 && <Badge tone="warning">{t('academy.review.dueCount', { count: due })}</Badge>}
                {fresh > 0 && <Badge tone="info">{t('academy.review.newCount', { count: fresh })}</Badge>}
                <Badge tone="success">{t('academy.review.masteryPct', { pct: mastery })}</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" icon={<Play className="h-4 w-4" />} disabled={due === 0 && fresh === 0} onClick={() => setSession({ deck, manual: false })}>
                  {t('academy.review.review')}
                </Button>
                <Button size="sm" variant="secondary" icon={<Shuffle className="h-4 w-4" />} disabled={items.length === 0} onClick={() => setSession({ deck, manual: true })}>
                  {t('academy.review.practice')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {session && <LanguageReviewSession lang={lang} deck={session.deck} manual={session.manual} direction={direction} onClose={() => setSession(null)} />}
    </div>
  );
}

const RATING_STYLE: Record<Rating, string> = {
  again: 'bg-danger/15 text-danger ring-danger/30',
  hard: 'bg-warning/15 text-fg ring-warning/30',
  good: 'bg-success/15 text-fg ring-success/30',
  easy: 'bg-blue/15 text-fg ring-blue/30',
};

/**
 * Sessão de revisão do idioma: vocabulário (nos dois sentidos) e gramática.
 * Programada: atrasados e difíceis primeiro; treino livre não muda o agendamento.
 */
export function LanguageReviewSession({ lang, deck, manual, direction, onClose }: { lang: Language; deck: LanguageDeck; manual: boolean; direction: 'forward' | 'backward'; onClose: () => void }) {
  const { t } = useSettings();
  const today = todayKey();
  const data = useReviewItems(lang.id);
  const [order, setOrder] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState<Rating[]>([]);
  const [requeued, setRequeued] = useState<string[]>([]);
  const items = data ? itemsOf(deck, data) : null;
  if (items && order === null) setOrder(manual ? [...items].sort(() => Math.random() - 0.5).map((i) => i.id) : sessionQueue(items, today, { newLimit: NEW_PER_SESSION, reviewLimit: 200 }).map((i) => i.id));
  const queue = [...(order ?? []), ...requeued];
  const item = items?.find((i) => i.id === queue[index]);
  const done = order !== null && index >= queue.length;
  const preview = item ? previewIntervals(item.srs, today) : null;

  const answer = async (r: Rating) => {
    if (!item) return;
    if (item.kind === 'vocab') await answerVocab(item.id, r, manual);
    else await answerGrammar(item.id, r, manual);
    setAnswers((a) => [...a, r]);
    if (r === 'again' && !requeued.includes(item.id)) setRequeued((q) => [...q, item.id]);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const speakText = item?.kind === 'vocab' ? speakTextOf(item.v) : '';

  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} title={manual ? t('academy.review.practiceTitle') : t(deck.kind === 'vocab' ? 'languages.vocab.sessionTitle' : deck.kind === 'grammar' ? 'languages.reviews.sessionGrammar' : 'languages.reviews.sessionAll', { lang: lang.name })} size="lg">
      {!items || order === null ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : done || !item ? (
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
            <span className="flex gap-1">
              <Badge>{item.kind === 'vocab' ? t('languages.tabs.vocab') : t('languages.tabs.grammar')}</Badge>
              {manual && <Badge>{t('academy.review.manualTag')}</Badge>}
            </span>
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
            {item.kind === 'vocab' ? (
              <>
                <span className="text-2xl font-semibold text-fg">{direction === 'forward' ? displayTerm(item.v) : item.v.translation || item.v.meaning}</span>
                {flipped ? (
                  <span className="flex w-full flex-col gap-2 border-t border-line pt-4 text-fg">
                    <span className="text-xl">{direction === 'forward' ? item.v.translation || item.v.meaning : displayTerm(item.v)}</span>
                    {item.v.mandarin?.pinyin && item.v.mandarin.characters && item.v.mandarin.pinyin !== item.v.term && <span className="text-sm text-muted">{item.v.mandarin.pinyin}</span>}
                    {item.v.german && (item.v.german.cases || item.v.german.prepositions || item.v.german.government) && (
                      <span className="text-sm text-muted">{[item.v.german.cases, item.v.german.prepositions, item.v.german.government].filter(Boolean).join(' · ')}</span>
                    )}
                    {item.v.plural && <span className="text-sm text-muted">{t('languages.vocab.pluralShort', { plural: item.v.plural })}</span>}
                    {item.v.example && <span className="text-sm italic text-muted">{item.v.example}</span>}
                  </span>
                ) : (
                  <span className="text-sm text-muted">{t('academy.review.tapToShow')}</span>
                )}
              </>
            ) : (
              <>
                <span className="text-2xl font-semibold text-fg">{item.g.title}</span>
                {item.g.topic && <span className="text-sm text-muted">{item.g.topic}</span>}
                {flipped ? (
                  <span className="flex w-full flex-col gap-2 border-t border-line pt-4 text-left text-fg">
                    {item.g.explanation && <span className="whitespace-pre-wrap text-base">{item.g.explanation}</span>}
                    {item.g.examples.slice(0, 3).map((ex, i) => (
                      <span key={i} className="text-sm italic text-muted">
                        {ex}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-sm text-muted">{t('languages.reviews.grammarPrompt')}</span>
                )}
              </>
            )}
          </button>
          {item.kind === 'vocab' && canSpeak() && (
            <Button size="sm" variant="ghost" className="w-fit self-center" icon={<Volume2 className="h-4 w-4" />} onClick={() => speak(speakText, lang.code)}>
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
