import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Layers, PenLine, Play, Plus, RotateCcw, Shuffle, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { AcademyRuleError } from '@/data/academyRepo';
import { getDb } from '@/data/db';
import { answerCard, cardHistory, createCard, createDeck, resetCard, restoreCard, restoreDeck, softDeleteCard, softDeleteDeck, updateCard, updateDeck, type CardInput, type DeckInput } from '@/data/flashcardsRepo';
import { contentTree, flattenTree, type Card, type CardReview, type Content, type Deck, type Subject } from '@/domain/academy';
import { formatDateKey, todayKey } from '@/domain/dates';
import { cardStage, isDue, masteryScore, previewIntervals, RATINGS, sessionQueue, type Rating } from '@/domain/srs';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ColorPicker, PALETTE } from '@/ui/ColorPicker';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

const NEW_PER_SESSION = 20;
const REVIEWS_PER_SESSION = 200;

/** Baralhos e cartões (todos, ou só de uma disciplina). */
export function useFlashcards(subjectId?: string) {
  const data = useLiveQuery(async () => {
    const db = getDb();
    const decks = (await db.decks.toArray()).filter((d) => subjectId === undefined || d.subjectId === subjectId);
    const ids = new Set(decks.map((d) => d.id));
    const cards = await db.cards.filter((c) => ids.has(c.deckId)).toArray();
    const subjects = await db.subjects.toArray();
    return { decks, cards, subjects };
  }, [subjectId]);
  return useMemo(() => {
    const decks = (data?.decks ?? []).filter((d) => !d.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
    const live = new Set(decks.map((d) => d.id));
    const cards = (data?.cards ?? []).filter((c) => !c.deletedAt && live.has(c.deckId));
    return {
      loading: data === undefined,
      decks,
      decksTrash: (data?.decks ?? []).filter((d) => d.deletedAt),
      cards,
      cardsOf: (deckId: string) => cards.filter((c) => c.deckId === deckId),
      subjectName: (id: string | null) => (id ? (data?.subjects.find((s) => s.id === id)?.name ?? '') : ''),
      subjects: (data?.subjects ?? []).filter((s) => !s.deletedAt),
    };
  }, [data]);
}

function deckStats(cards: Card[], today: string) {
  return {
    total: cards.length,
    due: cards.filter((c) => c.srs.due !== null && c.srs.due <= today).length,
    fresh: cards.filter((c) => c.srs.due === null).length,
    mature: cards.filter((c) => cardStage(c.srs) === 'mature').length,
    mastery: cards.length ? Math.round(cards.reduce((a, c) => a + masteryScore(c.srs), 0) / cards.length) : 0,
  };
}

/* ---------- Lista de baralhos (central de revisão e aba da disciplina) ---------- */

export function DecksPanel({ subject, onStart }: { subject?: Subject; onStart: (deckIds: string[], manual: boolean) => void }) {
  const { t } = useSettings();
  const fc = useFlashcards(subject?.id);
  const [creating, setCreating] = useState(false);
  const today = todayKey();
  if (fc.loading) return <LoadingState label={t('common.loading')} lines={3} />;
  const all = deckStats(fc.cards, today);
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-fg">{t('academy.review.today')}</div>
          <p className="text-sm text-muted">{t('academy.review.todayDetail', { due: all.due, fresh: Math.min(all.fresh, NEW_PER_SESSION) })}</p>
        </div>
        <Button variant="primary" icon={<Play className="h-4 w-4" />} disabled={all.due === 0 && all.fresh === 0} onClick={() => onStart(fc.decks.map((d) => d.id), false)}>
          {t('academy.review.start')}
        </Button>
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          {t('academy.review.newDeck')}
        </Button>
      </Surface>
      {fc.decks.length === 0 ? (
        <Surface tone="flat">
          <EmptyState icon={<Layers className="h-6 w-6" />} title={t('academy.review.emptyTitle')} body={t('academy.review.empty')} />
        </Surface>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {fc.decks.map((d) => {
            const s = deckStats(fc.cardsOf(d.id), today);
            return (
              <li key={d.id} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70">
                <Link to={`/academy/decks/${d.id}`} className="flex items-start gap-3">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-line" style={{ background: d.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg hover:underline">{d.name}</span>
                    <span className="block truncate text-xs text-muted">{[fc.subjectName(d.subjectId), d.category].filter(Boolean).join(' · ') || t('academy.review.freeDeck')}</span>
                  </span>
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{t('academy.review.cards', { count: s.total })}</Badge>
                  {s.due > 0 && <Badge tone="warning">{t('academy.review.dueCount', { count: s.due })}</Badge>}
                  {s.fresh > 0 && <Badge tone="info">{t('academy.review.newCount', { count: s.fresh })}</Badge>}
                  <Badge tone="success">{t('academy.review.masteryPct', { pct: s.mastery })}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" icon={<Play className="h-4 w-4" />} disabled={s.due === 0 && s.fresh === 0} onClick={() => onStart([d.id], false)}>
                    {t('academy.review.review')}
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Shuffle className="h-4 w-4" />} disabled={s.total === 0} onClick={() => onStart([d.id], true)}>
                    {t('academy.review.practice')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <DeckDialog deck={null} subjectId={subject?.id ?? null} color={subject?.color} onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ---------- Central de revisão (/academy/review) ---------- */

export function ReviewHubPage() {
  const { t } = useSettings();
  const [session, setSession] = useState<{ deckIds: string[]; manual: boolean } | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <Link to="/academy" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t('academy.subject.back')}
      </Link>
      <PageHeader eyebrow={t('modules.academy')} title={t('academy.review.title')} description={t('academy.review.hint')} icon={<Layers className="h-7 w-7" aria-hidden />} />
      <DecksPanel onStart={(deckIds, manual) => setSession({ deckIds, manual })} />
      {session && <ReviewSession deckIds={session.deckIds} manual={session.manual} onClose={() => setSession(null)} />}
    </div>
  );
}

/* ---------- Página do baralho (/academy/decks/:id) ---------- */

export function DeckPage() {
  const { id } = useParams();
  const { t, settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const deck = useLiveQuery(() => (id ? getDb().decks.get(id) : undefined), [id], null);
  const fc = useFlashcards(deck?.subjectId ?? undefined);
  const [editingDeck, setEditingDeck] = useState(false);
  const [card, setCard] = useState<Card | 'new' | null>(null);
  const [session, setSession] = useState<boolean | null>(null);
  const [filter, setFilter] = useState('');
  if (deck === null || fc.loading) return <LoadingState label={t('common.loading')} lines={4} />;
  if (!deck || deck.deletedAt) return <p className="text-muted">{t('academy.review.deckNotFound')}</p>;
  const today = todayKey();
  const cards = fc.cardsOf(deck.id);
  const s = deckStats(cards, today);
  const q = filter.trim().toLowerCase();
  const shown = q ? cards.filter((c) => `${c.front} ${c.back} ${c.tags.join(' ')} ${c.category}`.toLowerCase().includes(q)) : cards;

  const trash = async () => {
    await softDeleteDeck(deck.id);
    toast.show(t('academy.review.deckMoved'), 'success', { label: t('notes.undo'), run: () => void restoreDeck(deck.id) });
    navigate(deck.subjectId ? `/academy/subjects/${deck.subjectId}` : '/academy/review');
  };

  return (
    <div className="flex flex-col gap-5">
      <Link to={deck.subjectId ? `/academy/subjects/${deck.subjectId}` : '/academy/review'} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {deck.subjectId ? fc.subjectName(deck.subjectId) : t('academy.review.title')}
      </Link>
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <div className="h-2" style={{ background: deck.color }} aria-hidden />
        <div className="flex flex-wrap items-start gap-3 p-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{deck.name}</h1>
            <p className="mt-1 text-sm text-muted">{[fc.subjectName(deck.subjectId), deck.category, deck.tags.map((x) => `#${x}`).join(' ')].filter(Boolean).join(' · ') || t('academy.review.freeDeck')}</p>
          </div>
          <IconButton label={t('academy.review.editDeck')} icon={<PenLine className="h-4 w-4" />} onClick={() => setEditingDeck(true)} />
          <IconButton label={t('academy.review.deleteDeck')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void trash()} />
        </div>
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          <Badge>{t('academy.review.cards', { count: s.total })}</Badge>
          <Badge tone="warning">{t('academy.review.dueCount', { count: s.due })}</Badge>
          <Badge tone="info">{t('academy.review.newCount', { count: s.fresh })}</Badge>
          <Badge tone="success">{t('academy.review.matureCount', { count: s.mature })}</Badge>
          <Badge tone="success">{t('academy.review.masteryPct', { pct: s.mastery })}</Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Play className="h-4 w-4" />} disabled={s.due === 0 && s.fresh === 0} onClick={() => setSession(false)}>
          {t('academy.review.review')}
        </Button>
        <Button variant="secondary" icon={<Shuffle className="h-4 w-4" />} disabled={s.total === 0} onClick={() => setSession(true)}>
          {t('academy.review.practice')}
        </Button>
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCard('new')}>
          {t('academy.review.newCard')}
        </Button>
        <Input aria-label={t('common.search')} placeholder={t('academy.review.search')} value={filter} className="min-w-0 flex-1 basis-40" onChange={(e) => setFilter(e.target.value)} />
      </div>
      {shown.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.review.noCardsTitle')} body={t('academy.review.noCards')} />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((c) => {
            const stage = cardStage(c.srs);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setCard(c)} className="flex w-full items-start gap-3 rounded-2xl bg-surface p-3 text-left ring-1 ring-line/70 transition hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-pre-wrap text-sm font-medium text-fg">{c.front}</span>
                    <span className="mt-0.5 block line-clamp-2 whitespace-pre-wrap text-sm text-muted">{c.back}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={stage === 'mature' ? 'success' : stage === 'new' ? 'info' : 'neutral'}>{t(`academy.review.stages.${stage}`)}</Badge>
                    <span className="text-xs text-muted">{c.srs.due ? (isDue(c.srs, today) ? t('academy.review.dueNow') : formatDateKey(c.srs.due, settings.locale, { day: 'numeric', month: 'short' })) : ''}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editingDeck && <DeckDialog deck={deck} subjectId={deck.subjectId} onClose={() => setEditingDeck(false)} />}
      {card && <CardDialog deck={deck} card={card === 'new' ? null : card} onClose={() => setCard(null)} />}
      {session !== null && <ReviewSession deckIds={[deck.id]} manual={session} onClose={() => setSession(null)} />}
    </div>
  );
}

/* ---------- Diálogos ---------- */

function DeckDialog({ deck, subjectId, color, onClose }: { deck: Deck | null; subjectId: string | null; color?: string; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const subjects = useLiveQuery(() => getDb().subjects.filter((s) => !s.deletedAt).toArray(), []) ?? [];
  const [input, setInput] = useState<DeckInput>(deck ? { name: deck.name, subjectId: deck.subjectId, color: deck.color, category: deck.category, tags: deck.tags } : { name: '', subjectId, color: color ?? PALETTE[10], category: '', tags: [] });
  const [tags, setTags] = useState(input.tags.join(', '));
  const save = async () => {
    try {
      const data = { ...input, tags: tags.split(',').map((x) => x.trim()).filter(Boolean) };
      if (deck) await updateDeck(deck.id, data);
      else {
        const d = await createDeck(data);
        navigate(`/academy/decks/${d.id}`);
      }
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
      title={deck ? t('academy.review.editDeck') : t('academy.review.newDeck')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.name.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('academy.review.deckName')}>{(id) => <Input id={id} autoFocus={!deck} value={input.name} maxLength={80} onChange={(e) => setInput({ ...input, name: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('academy.assessment.subject')}>
            {(id) => (
              <Select id={id} value={input.subjectId ?? ''} onChange={(e) => setInput({ ...input, subjectId: e.target.value || null })}>
                <option value="">{t('academy.review.freeDeck')}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('academy.review.category')}>{(id) => <Input id={id} value={input.category} maxLength={60} onChange={(e) => setInput({ ...input, category: e.target.value })} />}</Field>
        </div>
        <Field label={t('academy.review.tags')} hint={t('academy.review.tagsHint')}>
          {(id, d) => <Input id={id} aria-describedby={d} value={tags} onChange={(e) => setTags(e.target.value)} />}
        </Field>
        <ColorPicker value={input.color} onChange={(c) => setInput({ ...input, color: c })} label={t('projects.fields.color')} showLabel />
      </div>
    </Dialog>
  );
}

function CardDialog({ deck, card, onClose }: { deck: Deck; card: Card | null; onClose: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<CardInput>(card ? { deckId: card.deckId, front: card.front, back: card.back, category: card.category, tags: card.tags, contentId: card.contentId } : { deckId: deck.id, front: '', back: '', category: '', tags: [], contentId: null });
  const [tags, setTags] = useState(input.tags.join(', '));
  const [keepOpen, setKeepOpen] = useState(!card);
  const contents = useLiveQuery(async (): Promise<Content[]> => (deck.subjectId ? getDb().contents.where('subjectId').equals(deck.subjectId).filter((c) => !c.deletedAt).toArray() : []), [deck.subjectId]) ?? [];
  const history = useLiveQuery(async (): Promise<CardReview[]> => (card ? cardHistory(card.id) : []), [card?.id]) ?? [];
  const nodes = flattenTree(contentTree(contents));
  const save = async () => {
    try {
      const data = { ...input, tags: tags.split(',').map((x) => x.trim()).filter(Boolean) };
      if (card) await updateCard(card.id, data);
      else await createCard(data);
      toast.show(t('common.saved'));
      // Criando vários seguidos: limpa frente e verso e mantém o resto.
      if (!card && keepOpen) setInput({ ...input, front: '', back: '' });
      else onClose();
    } catch (e) {
      toast.show(e instanceof AcademyRuleError && e.code === 'duplicate' ? t('academy.review.duplicateCard') : t('academy.errors.invalid'), 'error');
    }
  };
  const fmt = new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={card ? t('academy.review.editCard') : t('academy.review.newCard')}
      size="lg"
      footer={
        <>
          {card && (
            <Button
              variant="danger"
              className="mr-auto"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() =>
                void softDeleteCard(card.id).then(() => {
                  toast.show(t('academy.review.cardMoved'), 'success', { label: t('notes.undo'), run: () => void restoreCard(card.id) });
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
          <Button variant="primary" disabled={!input.front.trim() || !input.back.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('academy.review.front')}>{(id) => <Textarea id={id} autoFocus rows={3} value={input.front} maxLength={4000} placeholder={t('academy.review.frontPlaceholder')} onChange={(e) => setInput({ ...input, front: e.target.value })} />}</Field>
        <Field label={t('academy.review.back')}>{(id) => <Textarea id={id} rows={3} value={input.back} maxLength={4000} placeholder={t('academy.review.backPlaceholder')} onChange={(e) => setInput({ ...input, back: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('academy.review.category')}>{(id) => <Input id={id} value={input.category} maxLength={60} onChange={(e) => setInput({ ...input, category: e.target.value })} />}</Field>
          <Field label={t('academy.review.tags')}>{(id) => <Input id={id} value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>
        </div>
        {nodes.length > 0 && (
          <Field label={t('academy.doubts.content')}>
            {(id) => (
              <Select id={id} value={input.contentId ?? ''} onChange={(e) => setInput({ ...input, contentId: e.target.value || null })}>
                <option value="">{t('academy.doubts.noContent')}</option>
                {nodes.map(({ content: c, depth }) => (
                  <option key={c.id} value={c.id}>
                    {'· '.repeat(depth)}
                    {c.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {!card && <Switch label={t('academy.review.keepOpen')} checked={keepOpen} onChange={setKeepOpen} />}
        {card && (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-2/50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-fg">{t('academy.review.cardState', { stage: t(`academy.review.stages.${cardStage(card.srs)}`), mastery: masteryScore(card.srs) })}</span>
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void resetCard(card.id)}>
                {t('academy.review.reset')}
              </Button>
            </div>
            <span className="text-muted">{t('academy.review.cardNumbers', { reps: card.srs.reps, lapses: card.srs.lapses, interval: card.srs.interval })}</span>
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

/* ---------- Sessão de revisão ---------- */

const RATING_STYLE: Record<Rating, string> = {
  again: 'bg-danger/15 text-danger ring-danger/30',
  hard: 'bg-warning/15 text-fg ring-warning/30',
  good: 'bg-success/15 text-fg ring-success/30',
  easy: 'bg-blue/15 text-fg ring-blue/30',
};

/**
 * Sessão: mostra a frente, toca para ver o verso e responde.
 * Programada: atrasados e difíceis primeiro, depois novos (Parte 9.9).
 * Treino manual: todos os cartões em ordem aleatória, sem mudar o agendamento.
 */
export function ReviewSession({ deckIds, manual, onClose }: { deckIds: string[]; manual: boolean; onClose: () => void }) {
  const { t } = useSettings();
  const today = todayKey();
  const cards = useLiveQuery(() => getDb().cards.where('deckId').anyOf(deckIds).filter((c) => !c.deletedAt).toArray(), [deckIds.join(',')]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState<Rating[]>([]);
  const [requeued, setRequeued] = useState<string[]>([]);

  // Monta a fila uma vez, quando os cartões chegam.
  if (cards && order === null) {
    const ids = manual ? shuffle(cards.map((c) => c.id)) : sessionQueue(cards, today, { newLimit: NEW_PER_SESSION, reviewLimit: REVIEWS_PER_SESSION }).map((c) => c.id);
    setOrder(ids);
  }

  const fullQueue = [...(order ?? []), ...requeued];
  const currentId = fullQueue[index];
  const card = cards?.find((c) => c.id === currentId);
  const done = order !== null && index >= fullQueue.length;

  const answer = async (r: Rating) => {
    if (!card) return;
    await answerCard(card.id, r, manual);
    setAnswers((a) => [...a, r]);
    // Errou: o cartão volta no fim desta sessão (uma vez), para fixar.
    if (r === 'again' && !requeued.includes(card.id)) setRequeued((q) => [...q, card.id]);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const preview = card ? previewIntervals(card.srs, today) : null;
  const counts = RATINGS.map((r) => [r, answers.filter((a) => a === r).length] as const);

  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} title={manual ? t('academy.review.practiceTitle') : t('academy.review.sessionTitle')} size="lg">
      {!cards || order === null ? (
        <LoadingState label={t('common.loading')} lines={3} />
      ) : done || !card ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p className="text-lg font-semibold text-fg">{fullQueue.length === 0 ? t('academy.review.nothingDue') : t('academy.review.finished')}</p>
          {answers.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {counts.map(([r, n]) => (
                <Badge key={r}>
                  {t(`academy.review.ratings.${r}`)}: {n}
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
            <span>{t('academy.review.progress', { n: index + 1, total: fullQueue.length })}</span>
            {manual && <Badge>{t('academy.review.manualTag')}</Badge>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(index / fullQueue.length) * 100}%` }} />
          </div>
          <button
            type="button"
            onClick={() => setFlipped(!flipped)}
            className="flex min-h-[14rem] flex-col items-center justify-center gap-4 rounded-3xl bg-surface-2/60 p-6 text-center ring-1 ring-line"
            aria-label={flipped ? t('academy.review.hideAnswer') : t('academy.review.showAnswer')}
          >
            <span className="whitespace-pre-wrap text-xl font-semibold text-fg">{card.front}</span>
            {flipped ? <span className="w-full whitespace-pre-wrap border-t border-line pt-4 text-lg text-fg">{card.back}</span> : <span className="text-sm text-muted">{t('academy.review.tapToShow')}</span>}
          </button>
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

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
