import { getDb, touchById } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import type { Card, CardReview, Deck } from '@/domain/academy';
import { todayKey } from '@/domain/dates';
import { newSrsState, review, type Rating } from '@/domain/srs';
import { normalizeTags } from '@/domain/tasks';
import { AcademyRuleError } from './academyRepo';

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

const base = () => {
  const at = nowIso();
  return { createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
};

/* ---------- Baralhos ---------- */

export interface DeckInput {
  name: string;
  subjectId: string | null;
  color: string;
  category: string;
  tags: string[];
}

function cleanDeck(input: DeckInput): DeckInput {
  const name = input.name.trim().slice(0, 80);
  if (!name || !/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new AcademyRuleError('invalid');
  return { ...input, name, category: input.category.trim().slice(0, 60), tags: normalizeTags(input.tags) };
}

export async function createDeck(input: DeckInput): Promise<Deck> {
  const data = cleanDeck(input);
  const db = getDb();
  return db.transaction('rw', db.decks, db.changelog, async () => {
    const same = await db.decks.filter((d) => !d.deletedAt && d.name.toLowerCase() === data.name.toLowerCase() && d.subjectId === data.subjectId).first();
    if (same) throw new AcademyRuleError('duplicate');
    const deck: Deck = { ...data, id: newId('dck'), ...base() };
    await db.decks.add(deck);
    await log({ entityType: 'deck', entityId: deck.id, action: 'create' });
    return deck;
  });
}

export async function updateDeck(id: string, input: DeckInput): Promise<void> {
  const data = cleanDeck(input);
  const db = getDb();
  await db.transaction('rw', db.decks, db.changelog, async () => {
    const d = await db.decks.get(id);
    if (!d) throw new AcademyRuleError('not_found');
    await db.decks.put({ ...d, ...data, updatedAt: nowIso(), rev: d.rev + 1 });
    await log({ entityType: 'deck', entityId: id, action: 'update' });
  });
}

async function setDeckDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.decks, db.changelog, async () => {
    await touchById(db.decks, id, { deletedAt });
    await log({ entityType: 'deck', entityId: id, action });
  });
}
export const softDeleteDeck = (id: string) => setDeckDeleted(id, nowIso(), 'delete');
export const restoreDeck = (id: string) => setDeckDeleted(id, null, 'restore');

/** Exclusão definitiva: o baralho, os cartões e o histórico de revisões deles. */
export async function purgeDeck(id: string): Promise<number> {
  const db = getDb();
  return db.transaction('rw', [db.decks, db.cards, db.cardReviews, db.changelog], async () => {
    const cards = await db.cards.where('deckId').equals(id).toArray();
    for (const c of cards) await db.cardReviews.where('cardId').equals(c.id).delete();
    await db.cards.where('deckId').equals(id).delete();
    await db.decks.delete(id);
    await log({ entityType: 'deck', entityId: id, action: 'purge', note: String(cards.length) });
    return cards.length;
  });
}

/* ---------- Cartões ---------- */

export interface CardInput {
  deckId: string;
  front: string;
  back: string;
  category: string;
  tags: string[];
  contentId: string | null;
}

function cleanCard(input: CardInput): CardInput {
  const front = input.front.trim().slice(0, 4000);
  const back = input.back.trim().slice(0, 4000);
  if (!front || !back) throw new AcademyRuleError('invalid');
  return { ...input, front, back, category: input.category.trim().slice(0, 60), tags: normalizeTags(input.tags) };
}

/** Mesma frente no mesmo baralho é o mesmo cartão: não duplica. */
export async function createCard(input: CardInput): Promise<Card> {
  const data = cleanCard(input);
  const db = getDb();
  return db.transaction('rw', db.cards, db.changelog, async () => {
    const same = await db.cards.where('deckId').equals(data.deckId).filter((c) => !c.deletedAt && c.front.toLowerCase() === data.front.toLowerCase()).first();
    if (same) throw new AcademyRuleError('duplicate');
    const card: Card = { ...data, id: newId('crd'), srs: newSrsState(), ...base() };
    await db.cards.add(card);
    await log({ entityType: 'card', entityId: card.id, action: 'create' });
    return card;
  });
}

export async function updateCard(id: string, input: CardInput): Promise<void> {
  const data = cleanCard(input);
  const db = getDb();
  await db.transaction('rw', db.cards, db.changelog, async () => {
    const c = await db.cards.get(id);
    if (!c) throw new AcademyRuleError('not_found');
    const same = await db.cards.where('deckId').equals(data.deckId).filter((x) => x.id !== id && !x.deletedAt && x.front.toLowerCase() === data.front.toLowerCase()).first();
    if (same) throw new AcademyRuleError('duplicate');
    await db.cards.put({ ...c, ...data, updatedAt: nowIso(), rev: c.rev + 1 });
    await log({ entityType: 'card', entityId: id, action: 'update' });
  });
}

/** Recomeçar o aprendizado do cartão (o histórico de revisões continua guardado). */
export async function resetCard(id: string): Promise<void> {
  const db = getDb();
  await touchById(db.cards, id, { srs: newSrsState() });
  await log({ entityType: 'card', entityId: id, action: 'update', fields: ['srs'], note: 'reset' });
}

async function setCardDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.cards, db.changelog, async () => {
    await touchById(db.cards, id, { deletedAt });
    await log({ entityType: 'card', entityId: id, action });
  });
}
export const softDeleteCard = (id: string) => setCardDeleted(id, nowIso(), 'delete');
export const restoreCard = (id: string) => setCardDeleted(id, null, 'restore');

/* ---------- Revisão ---------- */

/**
 * Registra a resposta. Na revisão programada, o agendamento muda conforme a
 * resposta; no treino manual, só o histórico é guardado.
 */
export async function answerCard(id: string, rating: Rating, manual = false, today = todayKey()): Promise<Card> {
  const db = getDb();
  return db.transaction('rw', db.cards, db.cardReviews, async () => {
    const c = await db.cards.get(id);
    if (!c) throw new AcademyRuleError('not_found');
    const at = nowIso();
    const next = manual ? c.srs : review(c.srs, rating, today, at);
    const entry: CardReview = { id: newId('rev'), cardId: id, at, rating, intervalBefore: c.srs.interval, intervalAfter: next.interval, manual };
    await db.cardReviews.add(entry);
    const card: Card = { ...c, srs: next, updatedAt: at, rev: c.rev + 1 };
    await db.cards.put(card);
    return card;
  });
}

export async function cardHistory(id: string): Promise<CardReview[]> {
  return (await getDb().cardReviews.where('cardId').equals(id).toArray()).sort((a, b) => b.at.localeCompare(a.at));
}
