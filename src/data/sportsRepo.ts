import { getDb, touchById } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { activityInputSchema, sportInputSchema, sportItemInputSchema, type ActivityInput, type Sport, type SportActivity, type SportInput, type SportItem, type SportItemInput } from '@/domain/sports';

export class SportRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'duplicate' | 'future') {
    super(code);
  }
}

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

const base = () => {
  const at = nowIso();
  return { createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
};
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/* ---------- Esportes ---------- */

export async function createSport(input: SportInput): Promise<Sport> {
  const r = sportInputSchema.safeParse(input);
  if (!r.success) throw new SportRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.sports, db.changelog, async () => {
    const all = await db.sports.filter((s) => !s.deletedAt).toArray();
    if (all.some((s) => same(s.name, r.data.name))) throw new SportRuleError('duplicate');
    const s: Sport = { ...r.data, id: newId('spt'), order: all.reduce((m, x) => Math.max(m, x.order), 0) + 1, ...base() };
    await db.sports.add(s);
    await log({ entityType: 'sport', entityId: s.id, action: 'create' });
    return s;
  });
}

/** Cria os presets que faltam (tênis e futebol); devolve quantos criou. */
export async function createSports(inputs: SportInput[]): Promise<number> {
  let n = 0;
  for (const i of inputs) {
    try {
      await createSport(i);
      n++;
    } catch (e) {
      if (!(e instanceof SportRuleError && e.code === 'duplicate')) throw e;
    }
  }
  return n;
}

export async function updateSport(id: string, input: SportInput): Promise<Sport> {
  const r = sportInputSchema.safeParse(input);
  if (!r.success) throw new SportRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.sports, db.changelog, async () => {
    const cur = await db.sports.get(id);
    if (!cur) throw new SportRuleError('not_found');
    if ((await db.sports.filter((s) => s.id !== id && !s.deletedAt).toArray()).some((s) => same(s.name, r.data.name))) throw new SportRuleError('duplicate');
    const next: Sport = { ...cur, ...r.data, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.sports.put(next);
    await log({ entityType: 'sport', entityId: id, action: 'update' });
    return next;
  });
}

async function setDeleted(table: 'sports' | 'sportActivities' | 'sportItems', entityType: string, id: string, deletedAt: string | null) {
  const db = getDb();
  await db.transaction('rw', db.table(table), db.changelog, async () => {
    await touchById(db.table(table), id, { deletedAt });
    await log({ entityType, entityId: id, action: deletedAt ? 'delete' : 'restore' });
  });
}
export const softDeleteSport = (id: string) => setDeleted('sports', 'sport', id, nowIso());
export const restoreSport = (id: string) => setDeleted('sports', 'sport', id, null);

/* ---------- Atividades (Parte 12.3: registro rápido) ---------- */

export async function saveActivity(id: string | null, input: ActivityInput, today: string): Promise<SportActivity> {
  const r = activityInputSchema.safeParse({ ...input, itemIds: [...new Set(input.itemIds)], outcome: input.type === 'match' || input.type === 'tournament' ? input.outcome : null });
  if (!r.success) throw new SportRuleError('invalid');
  if (r.data.date > today) throw new SportRuleError('future');
  const db = getDb();
  return db.transaction('rw', db.sportActivities, db.changelog, async () => {
    if (id) {
      const cur = await db.sportActivities.get(id);
      if (!cur) throw new SportRuleError('not_found');
      const next: SportActivity = { ...cur, ...r.data, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.sportActivities.put(next);
      await log({ entityType: 'sportActivity', entityId: id, action: 'update' });
      return next;
    }
    const a: SportActivity = { ...r.data, id: newId('act'), ...base() };
    await db.sportActivities.add(a);
    await log({ entityType: 'sportActivity', entityId: a.id, action: 'create', note: a.type });
    return a;
  });
}
export const softDeleteActivity = (id: string) => setDeleted('sportActivities', 'sportActivity', id, nowIso());
export const restoreActivity = (id: string) => setDeleted('sportActivities', 'sportActivity', id, null);

/* ---------- Técnicas, fundamentos, habilidades, posições ---------- */

export async function saveSportItem(id: string | null, input: SportItemInput): Promise<SportItem> {
  const r = sportItemInputSchema.safeParse(input);
  if (!r.success) throw new SportRuleError('invalid');
  const data = r.data;
  const db = getDb();
  return db.transaction('rw', db.sportItems, db.changelog, async () => {
    const dup = await db.sportItems
      .where('sportId')
      .equals(data.sportId)
      .filter((i) => i.id !== id && !i.deletedAt && i.category === data.category && same(i.name, data.name))
      .first();
    if (dup) throw new SportRuleError('duplicate');
    if (id) {
      const cur = await db.sportItems.get(id);
      if (!cur) throw new SportRuleError('not_found');
      await db.sportItems.put({ ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 });
      // Evolução (Parte 12.1): cada mudança de confiança fica registrada com o valor.
      await log({ entityType: 'sportItem', entityId: id, action: 'update', ...(data.confidence !== null && data.confidence !== cur.confidence ? { note: `confidence:${data.confidence}` } : {}) });
      return { ...cur, ...data };
    }
    const item: SportItem = { ...data, id: newId('sit'), ...base() };
    await db.sportItems.add(item);
    await log({ entityType: 'sportItem', entityId: item.id, action: 'create', ...(item.confidence !== null ? { note: `confidence:${item.confidence}` } : {}) });
    return item;
  });
}
export const softDeleteSportItem = (id: string) => setDeleted('sportItems', 'sportItem', id, nowIso());
export const restoreSportItem = (id: string) => setDeleted('sportItems', 'sportItem', id, null);

/** Histórico do esporte: o próprio, as atividades e os itens, do mais novo ao mais antigo. */
export async function sportHistory(sportId: string): Promise<ChangeEntry[]> {
  const db = getDb();
  const ids = [sportId, ...(await db.sportActivities.where('sportId').equals(sportId).primaryKeys()), ...(await db.sportItems.where('sportId').equals(sportId).primaryKeys())];
  return (await db.changelog.where('entityId').anyOf(ids).toArray()).sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
}
