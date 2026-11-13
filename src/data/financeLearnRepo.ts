import { getDb, touchById } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { todayKey } from '@/domain/dates';
import { learningInputSchema, marketInputSchema, type FinLearning, type FinTerm, type LearningInput, type MarketEntry, type MarketInput } from '@/domain/finance';
import { newSrsState, review, type Rating } from '@/domain/srs';
import { FinanceRuleError } from './financeRepo';

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

const base = () => {
  const at = nowIso();
  return { createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
};

async function setDeleted(table: 'finLearning' | 'finTerms' | 'marketEntries', entityType: string, id: string, deletedAt: string | null) {
  const db = getDb();
  await db.transaction('rw', db.table(table), db.changelog, async () => {
    await touchById(db.table(table), id, { deletedAt });
    await log({ entityType, entityId: id, action: deletedAt ? 'delete' : 'restore' });
  });
}

/* ---------- Academia Financeira ---------- */

export async function saveLearning(id: string | null, input: LearningInput): Promise<FinLearning> {
  const r = learningInputSchema.safeParse({ ...input, courseId: input.kind === 'lesson' ? input.courseId : null });
  if (!r.success) throw new FinanceRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.finLearning, db.changelog, async () => {
    if (id) {
      const cur = await db.finLearning.get(id);
      if (!cur) throw new FinanceRuleError('not_found');
      const next: FinLearning = { ...cur, ...r.data, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.finLearning.put(next);
      await log({ entityType: 'finLearning', entityId: id, action: 'update', ...(cur.status !== r.data.status ? { note: `status:${r.data.status}` } : {}) });
      return next;
    }
    const l: FinLearning = { ...r.data, id: newId('flr'), ...base() };
    await db.finLearning.add(l);
    await log({ entityType: 'finLearning', entityId: l.id, action: 'create', note: l.kind });
    return l;
  });
}
export const softDeleteLearning = (id: string) => setDeleted('finLearning', 'finLearning', id, nowIso());
export const restoreLearning = (id: string) => setDeleted('finLearning', 'finLearning', id, null);

/* ---------- Glossário com revisão ---------- */

export async function saveTerm(id: string | null, term: string, definition: string, example: string): Promise<FinTerm> {
  const t = term.trim();
  if (!t || t.length > 120 || !definition.trim() || definition.length > 4000 || example.length > 2000) throw new FinanceRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.finTerms, db.changelog, async () => {
    const dup = await db.finTerms.filter((x) => x.id !== id && !x.deletedAt && x.term.trim().toLowerCase() === t.toLowerCase()).first();
    if (dup) throw new FinanceRuleError('duplicate');
    if (id) {
      const cur = await db.finTerms.get(id);
      if (!cur) throw new FinanceRuleError('not_found');
      const next: FinTerm = { ...cur, term: t, definition: definition.trim(), example: example.trim(), updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.finTerms.put(next);
      await log({ entityType: 'finTerm', entityId: id, action: 'update' });
      return next;
    }
    const x: FinTerm = { term: t, definition: definition.trim(), example: example.trim(), srs: newSrsState(), id: newId('ftm'), ...base() };
    await db.finTerms.add(x);
    await log({ entityType: 'finTerm', entityId: x.id, action: 'create' });
    return x;
  });
}
export const softDeleteTerm = (id: string) => setDeleted('finTerms', 'finTerm', id, nowIso());
export const restoreTerm = (id: string) => setDeleted('finTerms', 'finTerm', id, null);

/** Resposta na revisão: reagenda pela repetição espaçada e guarda no histórico de respostas. */
export async function answerTerm(id: string, rating: Rating, today = todayKey()): Promise<FinTerm> {
  const db = getDb();
  return db.transaction('rw', db.finTerms, db.cardReviews, async () => {
    const x = await db.finTerms.get(id);
    if (!x) throw new FinanceRuleError('not_found');
    const at = nowIso();
    const next = review(x.srs, rating, today, at);
    await db.cardReviews.add({ id: newId('rev'), cardId: id, at, rating, intervalBefore: x.srs.interval, intervalAfter: next.interval, manual: false });
    const out: FinTerm = { ...x, srs: next, updatedAt: at, rev: x.rev + 1 };
    await db.finTerms.put(out);
    return out;
  });
}

/* ---------- Mercado ---------- */

export async function saveMarket(id: string | null, input: MarketInput): Promise<MarketEntry> {
  const r = marketInputSchema.safeParse(input);
  if (!r.success) throw new FinanceRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.marketEntries, db.changelog, async () => {
    if (id) {
      const cur = await db.marketEntries.get(id);
      if (!cur) throw new FinanceRuleError('not_found');
      const next: MarketEntry = { ...cur, ...r.data, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.marketEntries.put(next);
      await log({ entityType: 'market', entityId: id, action: 'update' });
      return next;
    }
    const m: MarketEntry = { ...r.data, id: newId('mkt'), ...base() };
    await db.marketEntries.add(m);
    await log({ entityType: 'market', entityId: m.id, action: 'create', note: m.kind });
    return m;
  });
}
export const softDeleteMarket = (id: string) => setDeleted('marketEntries', 'market', id, nowIso());
export const restoreMarket = (id: string) => setDeleted('marketEntries', 'market', id, null);
