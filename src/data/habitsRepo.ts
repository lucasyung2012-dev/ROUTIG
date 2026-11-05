import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { addDays, todayKey, type DateKey } from '@/domain/dates';
import {
  currentFrequency,
  frequencyNote,
  habitInputSchema,
  normalizeFrequency,
  normalizeLogValue,
  openPause,
  sameFrequency,
  type Habit,
  type HabitInput,
  type HabitLog,
} from '@/domain/habits';

export class HabitRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'duplicate' | 'method_locked' | 'future') {
    super(code);
  }
}

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

function clean(input: HabitInput): HabitInput {
  const parsed = habitInputSchema.safeParse({ ...input, frequency: normalizeFrequency(input.frequency, input.method), unit: input.method === 'quantity' ? input.unit : '' });
  if (!parsed.success) throw new HabitRuleError('invalid');
  return parsed.data;
}

async function sameName(name: string, exceptId?: string) {
  const key = name.trim().toLowerCase();
  return getDb()
    .habits.filter((h) => h.id !== exceptId && !h.deletedAt && h.name.trim().toLowerCase() === key)
    .first();
}

/* ---------- Hábitos ---------- */

export async function createHabit(input: HabitInput): Promise<Habit> {
  const { frequency, ...data } = clean(input);
  const db = getDb();
  return db.transaction('rw', db.habits, db.changelog, async () => {
    if (await sameName(data.name)) throw new HabitRuleError('duplicate');
    const at = nowIso();
    const order = (await db.habits.toArray()).reduce((m, h) => Math.max(m, h.order), 0) + 1;
    const h: Habit = { ...data, schedule: [{ ...frequency, from: data.startDate }], pauses: [], archived: false, order, id: newId('hab'), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
    await db.habits.add(h);
    await log({ entityType: 'habit', entityId: h.id, action: 'create', note: `frequency:${frequencyNote(frequency)}` });
    return h;
  });
}

/**
 * Salva o hábito. Mudar a frequência cria uma nova frequência a partir de hoje: o passado continua
 * medido pela frequência daquela época (Parte 14.5: alterações de frequência sem reescrever o histórico).
 */
export async function updateHabit(id: string, input: HabitInput, today = todayKey()): Promise<Habit> {
  const { frequency, ...data } = clean(input);
  const db = getDb();
  return db.transaction('rw', db.habits, db.habitLogs, db.changelog, async () => {
    const cur = await db.habits.get(id);
    if (!cur) throw new HabitRuleError('not_found');
    if (await sameName(data.name, id)) throw new HabitRuleError('duplicate');
    if (data.method !== cur.method && (await db.habitLogs.where('habitId').equals(id).filter((l) => !l.deletedAt).count()) > 0) throw new HabitRuleError('method_locked');
    let schedule = cur.schedule;
    const changed = !sameFrequency(currentFrequency(cur), frequency);
    if (changed) {
      const from = today < data.startDate ? data.startDate : today;
      schedule = [...cur.schedule.filter((s) => s.from < from), { ...frequency, from }];
    }
    // Começo movido para depois das frequências antigas: a primeira passa a valer do novo começo.
    schedule = schedule.map((s, i) => (i === 0 ? { ...s, from: data.startDate } : s)).filter((s, i, all) => i === 0 || s.from > all[0]!.from);
    const next: Habit = { ...cur, ...data, schedule, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.habits.put(next);
    await log({ entityType: 'habit', entityId: id, action: 'update', ...(changed ? { note: `frequency:${frequencyNote(frequency)}` } : {}) });
    return next;
  });
}

async function patch(id: string, change: (h: Habit) => Partial<Habit>, note: string) {
  const db = getDb();
  await db.transaction('rw', db.habits, db.changelog, async () => {
    const cur = await db.habits.get(id);
    if (!cur) throw new HabitRuleError('not_found');
    await db.habits.put({ ...cur, ...change(cur), updatedAt: nowIso(), rev: cur.rev + 1 });
    await log({ entityType: 'habit', entityId: id, action: 'update', note });
  });
}

/** Pausa a partir de hoje, sem data para voltar. Dias pausados não contam contra. */
export async function pauseHabit(id: string, label: string, today = todayKey()): Promise<void> {
  await patch(id, (h) => (openPause(h) ? {} : { pauses: [...h.pauses, { from: today, to: null, label: label.trim().slice(0, 80) }] }), 'pause');
}

/** Retoma: a pausa aberta termina ontem (ou some, se começou hoje). */
export async function resumeHabit(id: string, today = todayKey()): Promise<void> {
  await patch(
    id,
    (h) => ({
      pauses: h.pauses.flatMap((p) => {
        if (p.to !== null) return [p];
        const to = addDays(today, -1);
        return to < p.from ? [] : [{ ...p, to }];
      }),
    }),
    'resume',
  );
}

/** Pausa com período definido (férias, viagem). */
export async function addPause(id: string, from: DateKey, to: DateKey, label: string): Promise<void> {
  if (to < from) throw new HabitRuleError('invalid');
  await patch(id, (h) => ({ pauses: [...h.pauses, { from, to, label: label.trim().slice(0, 80) }].sort((a, b) => a.from.localeCompare(b.from)) }), 'pause');
}

export async function removePause(id: string, index: number): Promise<void> {
  await patch(id, (h) => ({ pauses: h.pauses.filter((_, i) => i !== index) }), 'pause_removed');
}

export async function setHabitArchived(id: string, archived: boolean): Promise<void> {
  await patch(id, () => ({ archived }), archived ? 'archive' : 'unarchive');
}

async function setDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.habits, db.changelog, async () => {
    await db.habits.update(id, { deletedAt, updatedAt: nowIso() });
    await log({ entityType: 'habit', entityId: id, action });
  });
}
export const softDeleteHabit = (id: string) => setDeleted(id, nowIso(), 'delete');
export const restoreHabit = (id: string) => setDeleted(id, null, 'restore');

export async function moveHabit(id: string, dir: -1 | 1): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.habits, async () => {
    const list = (await db.habits.filter((h) => !h.deletedAt && !h.archived).toArray()).sort((a, b) => a.order - b.order);
    const i = list.findIndex((h) => h.id === id);
    const other = list[i + dir];
    const cur = list[i];
    if (!cur || !other) return;
    await db.habits.update(cur.id, { order: other.order });
    await db.habits.update(other.id, { order: cur.order });
  });
}

/* ---------- Registros ---------- */

/** Registra (ou corrige) o dia: um registro por hábito por dia, nunca duplicado. */
export async function setHabitLog(habitId: string, date: DateKey, value: number, note: string, today = todayKey()): Promise<HabitLog> {
  const db = getDb();
  return db.transaction('rw', db.habits, db.habitLogs, async () => {
    const h = await db.habits.get(habitId);
    if (!h || h.deletedAt) throw new HabitRuleError('not_found');
    if (date > today) throw new HabitRuleError('future');
    const v = normalizeLogValue(h.method, h.scaleMax, value);
    if (v === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HabitRuleError('invalid');
    const at = nowIso();
    const existing = await db.habitLogs.where('[habitId+date]').equals([habitId, date]).first();
    const text = note.trim().slice(0, 2000);
    if (existing) {
      const next: HabitLog = { ...existing, value: v, note: text, deletedAt: null, updatedAt: at, rev: existing.rev + 1 };
      await db.habitLogs.put(next);
      return next;
    }
    const l: HabitLog = { id: newId('hlg'), habitId, date, value: v, note: text, createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
    await db.habitLogs.add(l);
    return l;
  });
}

export async function softDeleteHabitLog(id: string): Promise<void> {
  await getDb().habitLogs.update(id, { deletedAt: nowIso(), updatedAt: nowIso() });
}
export async function restoreHabitLog(id: string): Promise<void> {
  await getDb().habitLogs.update(id, { deletedAt: null, updatedAt: nowIso() });
}

/** Mudanças do hábito (criação, frequência, pausas, arquivamento), da mais nova para a mais antiga. */
export async function habitHistory(id: string): Promise<ChangeEntry[]> {
  return getDb().changelog.where('[entityType+entityId]').equals(['habit', id]).reverse().sortBy('seq');
}
