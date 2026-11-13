import { getDb, touchById } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { todayKey } from '@/domain/dates';
import { grammarInputSchema, type GrammarInput, type GrammarRule } from '@/domain/languages';
import { newSrsState, review, type Rating } from '@/domain/srs';
import { LanguageRuleError } from './languagesRepo';

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

function clean(input: GrammarInput): GrammarInput {
  const parsed = grammarInputSchema.safeParse({ ...input, examples: input.examples.map((e) => e.trim()).filter(Boolean) });
  if (!parsed.success) throw new LanguageRuleError('invalid');
  return parsed.data;
}

/** Mesmo título no mesmo idioma é a mesma regra: não duplica. */
async function findSame(languageId: string, title: string, exceptId?: string) {
  const key = title.trim().toLowerCase();
  return getDb()
    .grammarRules.where('languageId')
    .equals(languageId)
    .filter((g) => g.id !== exceptId && !g.deletedAt && g.title.trim().toLowerCase() === key)
    .first();
}

export async function createGrammar(input: GrammarInput): Promise<GrammarRule> {
  const data = clean(input);
  const db = getDb();
  return db.transaction('rw', db.grammarRules, db.changelog, async () => {
    if (await findSame(data.languageId, data.title)) throw new LanguageRuleError('duplicate');
    const at = nowIso();
    const g: GrammarRule = { ...data, id: newId('grm'), srs: newSrsState(), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
    await db.grammarRules.add(g);
    await log({ entityType: 'grammar', entityId: g.id, action: 'create' });
    return g;
  });
}

export async function updateGrammar(id: string, input: GrammarInput): Promise<GrammarRule> {
  const data = clean(input);
  const db = getDb();
  return db.transaction('rw', db.grammarRules, db.changelog, async () => {
    const cur = await db.grammarRules.get(id);
    if (!cur) throw new LanguageRuleError('not_found');
    if (await findSame(data.languageId, data.title, id)) throw new LanguageRuleError('duplicate');
    const next: GrammarRule = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.grammarRules.put(next);
    await log({ entityType: 'grammar', entityId: id, action: 'update' });
    return next;
  });
}

async function setDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.grammarRules, db.changelog, async () => {
    await touchById(db.grammarRules, id, { deletedAt });
    await log({ entityType: 'grammar', entityId: id, action });
  });
}
export const softDeleteGrammar = (id: string) => setDeleted(id, nowIso(), 'delete');
export const restoreGrammar = (id: string) => setDeleted(id, null, 'restore');

export async function answerGrammar(id: string, rating: Rating, manual = false, today = todayKey()): Promise<GrammarRule> {
  const db = getDb();
  return db.transaction('rw', db.grammarRules, db.cardReviews, async () => {
    const g = await db.grammarRules.get(id);
    if (!g) throw new LanguageRuleError('not_found');
    const at = nowIso();
    const next = manual ? g.srs : review(g.srs, rating, today, at);
    await db.cardReviews.add({ id: newId('rev'), cardId: id, at, rating, intervalBefore: g.srs.interval, intervalAfter: next.interval, manual });
    const out: GrammarRule = { ...g, srs: next, updatedAt: at, rev: g.rev + 1 };
    await db.grammarRules.put(out);
    return out;
  });
}
