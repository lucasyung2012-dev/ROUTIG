import { getDb, touchById } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry, EntityRef } from '@/domain/entity';
import { todayKey, type DateKey } from '@/domain/dates';
import { goalInputOf, goalInputSchema, type Goal, type GoalCheckin, type GoalInput, type GoalStatus } from '@/domain/goals';

export class GoalRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'duplicate' | 'future') {
    super(code);
  }
}

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

function clean(input: GoalInput): GoalInput {
  const parsed = goalInputSchema.safeParse({
    ...input,
    // Indicadores só valem para metas mensuráveis; o nível alvo, só para habilidades.
    indicators: input.type === 'measurable' ? input.indicators : [],
    levelTarget: input.type === 'skill' ? input.levelTarget : null,
  });
  if (!parsed.success) throw new GoalRuleError('invalid');
  return parsed.data;
}

async function sameName(name: string, exceptId?: string) {
  const key = name.trim().toLowerCase();
  return getDb()
    .goals.filter((g) => g.id !== exceptId && !g.deletedAt && g.name.trim().toLowerCase() === key)
    .first();
}

/** Diferenças que entram no histórico com o valor (Parte 15.5: registrar mudanças). */
function changeNotes(cur: Goal, next: GoalInput): string[] {
  const notes: string[] = [];
  if (cur.status !== next.status) notes.push(`status:${next.status}`);
  if (cur.deadline !== next.deadline) notes.push(`deadline:${next.deadline ?? ''}`);
  if (cur.type !== next.type) notes.push(`type:${next.type}`);
  const targets = (g: Pick<Goal, 'indicators'>) => g.indicators.map((i) => `${i.name}=${i.target}`).join('|');
  if (targets(cur) !== targets(next)) notes.push(`targets:${targets(next)}`);
  if (cur.levelTarget !== next.levelTarget) notes.push(`level:${next.levelTarget ?? ''}`);
  for (const m of next.milestones) {
    const before = cur.milestones.find((x) => x.id === m.id);
    if (m.done && !before?.done) notes.push(`milestone:${m.title}`);
  }
  return notes;
}

/* ---------- Objetivos ---------- */

export async function createGoal(input: GoalInput, refs: EntityRef[] = []): Promise<Goal> {
  const data = clean(input);
  const db = getDb();
  return db.transaction('rw', db.goals, db.changelog, async () => {
    if (await sameName(data.name)) throw new GoalRuleError('duplicate');
    const at = nowIso();
    const g: Goal = { ...data, refs, doneAt: data.status === 'done' ? at : null, id: newId('goal'), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
    await db.goals.add(g);
    await log({ entityType: 'goal', entityId: g.id, action: 'create', note: `status:${g.status}` });
    return g;
  });
}

/** Salva. Nada muda sozinho: metas, prazos e status só mudam aqui, pelo usuário (Parte 15.5). */
export async function updateGoal(id: string, input: GoalInput): Promise<Goal> {
  const data = clean(input);
  const db = getDb();
  return db.transaction('rw', db.goals, db.changelog, async () => {
    const cur = await db.goals.get(id);
    if (!cur) throw new GoalRuleError('not_found');
    if (await sameName(data.name, id)) throw new GoalRuleError('duplicate');
    const at = nowIso();
    const milestones = data.milestones.map((m) => {
      const before = cur.milestones.find((x) => x.id === m.id);
      return { ...m, doneAt: m.done ? (before?.done ? before.doneAt : at) : null };
    });
    const doneAt = data.status === 'done' ? (cur.status === 'done' ? cur.doneAt : at) : null;
    const next: Goal = { ...cur, ...data, milestones, doneAt, updatedAt: at, rev: cur.rev + 1 };
    await db.goals.put(next);
    const notes = changeNotes(cur, data);
    if (notes.length) for (const note of notes) await log({ entityType: 'goal', entityId: id, action: 'update', note });
    else await log({ entityType: 'goal', entityId: id, action: 'update' });
    return next;
  });
}

async function patch(id: string, change: (g: Goal) => Partial<GoalInput>): Promise<Goal> {
  const cur = await getDb().goals.get(id);
  if (!cur) throw new GoalRuleError('not_found');
  return updateGoal(id, { ...goalInputOf(cur), ...change(cur) });
}

export const setGoalStatus = (id: string, status: GoalStatus) => patch(id, () => ({ status }));

export const toggleMilestone = (id: string, milestoneId: string) => patch(id, (g) => ({ milestones: g.milestones.map((m) => (m.id === milestoneId ? { ...m, done: !m.done } : m)) }));

export async function addMilestone(id: string, title: string, date: DateKey | null): Promise<Goal> {
  return patch(id, (g) => ({ milestones: [...g.milestones, { id: newId('ms'), title: title.trim(), date, done: false, doneAt: null }] }));
}

export const removeMilestone = (id: string, milestoneId: string) => patch(id, (g) => ({ milestones: g.milestones.filter((m) => m.id !== milestoneId) }));

/** Liga um registro de outro módulo (sem copiar). Ligar duas vezes não duplica. */
export async function linkGoal(id: string, ref: EntityRef): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.goals, db.changelog, async () => {
    const g = await db.goals.get(id);
    if (!g) throw new GoalRuleError('not_found');
    if (g.refs.some((r) => r.type === ref.type && r.id === ref.id)) return;
    await db.goals.put({ ...g, refs: [...g.refs, { type: ref.type, id: ref.id }], updatedAt: nowIso(), rev: g.rev + 1 });
    await log({ entityType: 'goal', entityId: id, action: 'update', note: `link:${ref.type}` });
  });
}

export async function unlinkGoal(id: string, ref: EntityRef): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.goals, db.changelog, async () => {
    const g = await db.goals.get(id);
    if (!g) throw new GoalRuleError('not_found');
    await db.goals.put({ ...g, refs: g.refs.filter((r) => !(r.type === ref.type && r.id === ref.id)), updatedAt: nowIso(), rev: g.rev + 1 });
    await log({ entityType: 'goal', entityId: id, action: 'update', note: `unlink:${ref.type}` });
  });
}

async function setDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.goals, db.changelog, async () => {
    await touchById(db.goals, id, { deletedAt });
    await log({ entityType: 'goal', entityId: id, action });
  });
}
export const softDeleteGoal = (id: string) => setDeleted(id, nowIso(), 'delete');
export const restoreGoal = (id: string) => setDeleted(id, null, 'restore');

export async function goalHistory(id: string): Promise<ChangeEntry[]> {
  return getDb().changelog.where('[entityType+entityId]').equals(['goal', id]).reverse().sortBy('seq');
}

/* ---------- Acompanhamento ---------- */

export interface CheckinInput {
  date: DateKey;
  indicatorId: string | null;
  value: number | null;
  level: number | null;
  note: string;
}

/** Registra um valor, um nível ou uma reflexão. Não muda a meta nem o status (Parte 15.5). */
export async function addCheckin(goalId: string, input: CheckinInput, today = todayKey()): Promise<GoalCheckin> {
  const db = getDb();
  return db.transaction('rw', db.goals, db.goalCheckins, async () => {
    const g = await db.goals.get(goalId);
    if (!g || g.deletedAt) throw new GoalRuleError('not_found');
    if (input.date > today) throw new GoalRuleError('future');
    const note = input.note.trim().slice(0, 4000);
    const indicatorOk = input.indicatorId === null ? input.value === null : g.indicators.some((i) => i.id === input.indicatorId) && input.value !== null && Number.isFinite(input.value);
    const levelOk = input.level === null || (Number.isInteger(input.level) && input.level >= 1 && input.level <= g.levelMax);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !indicatorOk || !levelOk || (input.value === null && input.level === null && !note)) throw new GoalRuleError('invalid');
    const at = nowIso();
    const c: GoalCheckin = { id: newId('gck'), goalId, date: input.date, indicatorId: input.indicatorId, value: input.value, level: input.level, note, createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
    await db.goalCheckins.add(c);
    return c;
  });
}

export async function softDeleteCheckin(id: string): Promise<void> {
  await touchById(getDb().goalCheckins, id, { deletedAt: nowIso() });
}
export async function restoreCheckin(id: string): Promise<void> {
  await touchById(getDb().goalCheckins, id, { deletedAt: null });
}
