import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import type { DateKey } from '@/domain/dates';
import {
  buildTimeline,
  interestInputSchema,
  type HistoryEntry,
  type Interest,
  type InterestCategory,
  type InterestInput,
  type TimelineItem,
  type TimelineOverride,
} from '@/domain/interests';

const ENTITY = 'interest';
const CATEGORIES_KEY = 'interests.categories';
const OVERRIDES_KEY = 'history.overrides';

export class InterestRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'duplicate') {
    super(code);
  }
}

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

function clean(input: InterestInput): InterestInput {
  const parsed = interestInputSchema.safeParse({
    ...input,
    objectives: input.objectives.map((o) => o.trim()).filter(Boolean),
    projectIds: [...new Set(input.projectIds)],
    noteIds: [...new Set(input.noteIds)],
  });
  if (!parsed.success) throw new InterestRuleError('invalid');
  return parsed.data;
}

export function interestInputOf(i: Interest): InterestInput {
  const { name, description, categoryId, icon, color, coverFileId, startDate, status, objectives, projectIds, noteIds } = i;
  return { name, description, categoryId, icon, color, coverFileId, startDate, status, objectives, projectIds, noteIds };
}

/* ---------- Interesses ---------- */

/** Cria um interesse. Nome repetido (ignorando maiúsculas) não é aceito: evita registros duplicados. */
export async function createInterest(input: InterestInput): Promise<Interest> {
  const data = clean(input);
  const db = getDb();
  return db.transaction('rw', db.interests, db.changelog, async () => {
    const same = await db.interests.filter((i) => !i.deletedAt && i.name.trim().toLowerCase() === data.name.trim().toLowerCase()).first();
    if (same) throw new InterestRuleError('duplicate');
    const at = nowIso();
    const interest: Interest = { ...data, id: newId('int'), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
    await db.interests.add(interest);
    await log({ entityType: ENTITY, entityId: interest.id, action: 'create' });
    return interest;
  });
}

export async function updateInterest(id: string, input: InterestInput): Promise<Interest> {
  const db = getDb();
  return db.transaction('rw', db.interests, db.changelog, async () => {
    const current = await db.interests.get(id);
    if (!current) throw new InterestRuleError('not_found');
    const data = clean(input);
    const same = await db.interests.filter((i) => i.id !== id && !i.deletedAt && i.name.trim().toLowerCase() === data.name.trim().toLowerCase()).first();
    if (same) throw new InterestRuleError('duplicate');
    const before = interestInputOf(current);
    const fields = (Object.keys(data) as (keyof InterestInput)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(data[k]));
    if (!fields.length) return current;
    const next: Interest = { ...current, ...data, updatedAt: nowIso(), rev: current.rev + 1 };
    await db.interests.put(next);
    // O status é guardado no histórico com o valor novo: vira a "evolução" do interesse.
    await log({ entityType: ENTITY, entityId: id, action: 'update', fields, note: fields.includes('status') ? data.status : undefined });
    return next;
  });
}

async function setDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore'): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.interests, db.changelog, async () => {
    const i = await db.interests.get(id);
    if (!i) return;
    await db.interests.put({ ...i, deletedAt, updatedAt: nowIso() });
    await log({ entityType: ENTITY, entityId: id, action });
  });
}

export const softDeleteInterest = (id: string) => setDeleted(id, nowIso(), 'delete');
export const restoreInterest = (id: string) => setDeleted(id, null, 'restore');

/** Exclusão definitiva. Projetos e notas ligados continuam nos módulos deles. */
export async function purgeInterest(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.interests, db.changelog, async () => {
    await db.interests.delete(id);
    await log({ entityType: ENTITY, entityId: id, action: 'purge' });
  });
}

export async function interestHistory(id: string): Promise<ChangeEntry[]> {
  return getDb().changelog.where('[entityType+entityId]').equals([ENTITY, id]).reverse().sortBy('seq');
}

/* ---------- Categorias personalizadas ---------- */

export async function loadCategories(): Promise<InterestCategory[]> {
  const rec = await getDb().kv.get(CATEGORIES_KEY);
  const list = Array.isArray(rec?.value) ? (rec.value as InterestCategory[]) : [];
  return list.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string');
}

export async function createCategory(name: string): Promise<InterestCategory> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new InterestRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.kv, async () => {
    const list = await loadCategories();
    const same = list.find((c) => c.name.toLowerCase() === clean.toLowerCase());
    if (same) return same;
    const cat = { id: newId('cat'), name: clean };
    await db.kv.put({ key: CATEGORIES_KEY, value: [...list, cat], updatedAt: nowIso() });
    return cat;
  });
}

/* ---------- Minha história ---------- */

export async function addHistoryEntry(date: DateKey, title: string, description = ''): Promise<HistoryEntry> {
  const t = title.trim().slice(0, 140);
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new InterestRuleError('invalid');
  const at = nowIso();
  const entry: HistoryEntry = { id: newId('his'), date, title: t, description: description.slice(0, 2000), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
  const db = getDb();
  await db.transaction('rw', db.historyEntries, db.changelog, async () => {
    await db.historyEntries.add(entry);
    await log({ entityType: 'history', entityId: entry.id, action: 'create' });
  });
  return entry;
}

export async function updateHistoryEntry(id: string, date: DateKey, title: string): Promise<void> {
  const t = title.trim().slice(0, 140);
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new InterestRuleError('invalid');
  const db = getDb();
  await db.transaction('rw', db.historyEntries, db.changelog, async () => {
    const e = await db.historyEntries.get(id);
    if (!e) throw new InterestRuleError('not_found');
    await db.historyEntries.put({ ...e, date, title: t, updatedAt: nowIso(), rev: e.rev + 1 });
    await log({ entityType: 'history', entityId: id, action: 'update' });
  });
}

/** Registro escrito à mão: sai da linha do tempo (fica no histórico de alterações). */
export async function deleteHistoryEntry(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.historyEntries, db.changelog, async () => {
    const e = await db.historyEntries.get(id);
    if (!e) return;
    await db.historyEntries.put({ ...e, deletedAt: nowIso(), updatedAt: nowIso() });
    await log({ entityType: 'history', entityId: id, action: 'delete' });
  });
}

export async function loadOverrides(): Promise<Record<string, TimelineOverride>> {
  const rec = await getDb().kv.get(OVERRIDES_KEY);
  return rec?.value && typeof rec.value === 'object' ? (rec.value as Record<string, TimelineOverride>) : {};
}

/** Renomeia ou oculta um registro da linha do tempo (o dado original não muda). */
export async function setOverride(key: string, change: TimelineOverride): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.kv, async () => {
    const all = await loadOverrides();
    const next = { ...all[key], ...change };
    if (!next.title?.trim()) delete next.title;
    if (!next.hidden) delete next.hidden;
    const map = { ...all };
    if (Object.keys(next).length) map[key] = next;
    else delete map[key];
    await db.kv.put({ key: OVERRIDES_KEY, value: map, updatedAt: nowIso() });
  });
}

/** Linha do tempo com projetos, marcos, interesses e registros escritos à mão. */
export async function loadTimeline(): Promise<TimelineItem[]> {
  const db = getDb();
  const [manual, interests, projects, overrides] = await Promise.all([db.historyEntries.toArray(), db.interests.toArray(), db.projects.toArray(), loadOverrides()]);
  // Quando o projeto foi concluído: a última mudança de status registrada enquanto ele está "concluído".
  const statusChanges = await db.changelog.where('entityType').equals('project').filter((e) => !!e.fields?.includes('status')).toArray();
  const lastStatus = new Map<string, string>();
  for (const e of statusChanges) if ((lastStatus.get(e.entityId) ?? '') < e.at) lastStatus.set(e.entityId, e.at);
  return buildTimeline(
    {
      manual,
      interests,
      projects: projects.map((p) => ({ ...p, doneAt: p.status === 'done' ? (lastStatus.get(p.id) ?? null) : null })),
    },
    overrides,
  );
}
