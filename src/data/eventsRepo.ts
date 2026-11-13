import { getDb, touch } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { addDays, diffDays, type DateKey } from '@/domain/dates';
import { DEFAULT_EVENT_CATEGORIES, eventInputSchema, type CalendarEvent, type EventCategory, type EventInput, type EventTone, type OccurrenceOverride } from '@/domain/events';

const CONFIG_KEY = 'calendar.config';
const ENTITY = 'event';
const TONES: EventTone[] = ['violet', 'blue', 'teal', 'amber', 'rose', 'neutral'];

export class EventRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found') {
    super(code);
  }
}

export interface CalendarConfig {
  categories: EventCategory[];
}

/* ---------- Categorias ---------- */

export async function loadCalendarConfig(): Promise<CalendarConfig> {
  const rec = await getDb().kv.get(CONFIG_KEY);
  return migrateCalendarConfig(rec?.value);
}

export function migrateCalendarConfig(raw: unknown): CalendarConfig {
  const base = DEFAULT_EVENT_CATEGORIES.map((c) => ({ ...c }));
  const r = raw && typeof raw === 'object' ? (raw as Partial<CalendarConfig>) : {};
  const saved = Array.isArray(r.categories)
    ? r.categories.filter((c): c is EventCategory => !!c && typeof c.id === 'string' && typeof c.name === 'string' && TONES.includes(c.tone))
    : [];
  const merged = base.map((b) => saved.find((s) => s.id === b.id) ?? b);
  for (const s of saved) if (!merged.some((m) => m.id === s.id)) merged.push({ ...s, builtin: false });
  return { categories: merged };
}

async function saveCalendarConfig(config: CalendarConfig): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.kv, db.changelog, async () => {
    await db.kv.put({ key: CONFIG_KEY, value: config, updatedAt: nowIso() });
    await log({ entityType: 'calendar.config', entityId: CONFIG_KEY, action: 'update' });
  });
}

export async function addEventCategory(name: string, tone: EventTone, color: string | null = null): Promise<EventCategory> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new EventRuleError('invalid');
  const config = await loadCalendarConfig();
  const cat: EventCategory = { id: newId('cat'), name: clean, tone, color, builtin: false };
  await saveCalendarConfig({ categories: [...config.categories, cat] });
  return cat;
}

export async function updateEventCategory(id: string, patch: Partial<Pick<EventCategory, 'name' | 'tone' | 'color'>>): Promise<void> {
  const config = await loadCalendarConfig();
  await saveCalendarConfig({ categories: config.categories.map((c) => (c.id === id ? { ...c, ...patch, name: (patch.name ?? c.name).slice(0, 40) } : c)) });
}

/** Remove uma categoria criada pelo usuário; os eventos dela passam para "Outro". */
export async function removeEventCategory(id: string): Promise<number> {
  const db = getDb();
  const config = await loadCalendarConfig();
  const cat = config.categories.find((c) => c.id === id);
  if (!cat || cat.builtin) throw new EventRuleError('invalid');
  const at = nowIso();
  const moved = await db.events
    .where('categoryId')
    .equals(id)
    .modify((e) => {
      e.categoryId = 'other';
      touch(e, at);
    });
  // Ocorrências que mudaram de categoria só naquela data também vão para "Outro".
  await db.events
    .filter((e) => Object.values(e.overrides ?? {}).some((o) => o.categoryId === id))
    .modify((e) => {
      for (const o of Object.values(e.overrides)) if (o.categoryId === id) o.categoryId = 'other';
      touch(e, at);
    });
  await saveCalendarConfig({ categories: config.categories.filter((c) => c.id !== id) });
  return moved;
}

/* ---------- Eventos ---------- */

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

function clean(input: EventInput): EventInput {
  const fixed: EventInput = {
    ...input,
    // Evento com horário dura um dia só; vários dias só para dia inteiro (ex.: férias).
    endDate: input.allDay ? input.endDate : input.start,
    startTime: input.allDay ? null : input.startTime,
  };
  const parsed = eventInputSchema.safeParse(fixed);
  if (!parsed.success) throw new EventRuleError('invalid');
  return parsed.data;
}

export async function createEvent(input: EventInput): Promise<CalendarEvent> {
  const data = clean(input);
  const at = nowIso();
  const event: CalendarEvent = { ...data, id: newId('evt'), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
  const db = getDb();
  await db.transaction('rw', db.events, db.changelog, async () => {
    await db.events.add(event);
    await log({ entityType: ENTITY, entityId: event.id, action: 'create' });
  });
  return event;
}

async function getOrFail(id: string): Promise<CalendarEvent> {
  const e = await getDb().events.get(id);
  if (!e) throw new EventRuleError('not_found');
  return e;
}

function changed(a: EventInput, b: EventInput): string[] {
  return (Object.keys(b) as (keyof EventInput)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

export function inputOf(e: CalendarEvent): EventInput {
  const { title, description, location, notes, categoryId, allDay, start, endDate, startTime, durationMin, recurrence, overrides, reminders, moduleRef, seriesOf } = e;
  return { title, description, location, notes, categoryId, allDay, start, endDate, startTime, durationMin, recurrence, overrides, reminders, moduleRef, seriesOf };
}

/** Edita o evento inteiro (ou a série inteira). */
export async function updateEvent(id: string, input: EventInput): Promise<CalendarEvent> {
  const db = getDb();
  return db.transaction('rw', db.events, db.changelog, async () => {
    const current = await getOrFail(id);
    const data = clean(input);
    const fields = changed(inputOf(current), data);
    const next: CalendarEvent = { ...current, ...data, updatedAt: nowIso(), rev: current.rev + 1 };
    await db.events.put(next);
    if (fields.length) await log({ entityType: ENTITY, entityId: id, action: 'update', fields });
    return next;
  });
}

/** "Somente esta ocorrência": guarda as mudanças só para aquela data da série. */
export async function updateOccurrence(id: string, seriesDate: DateKey, patch: OccurrenceOverride): Promise<CalendarEvent> {
  const db = getDb();
  return db.transaction('rw', db.events, db.changelog, async () => {
    const current = await getOrFail(id);
    const merged = { ...(current.overrides[seriesDate] ?? {}), ...patch };
    const input = clean({ ...inputOf(current), overrides: { ...current.overrides, [seriesDate]: merged } });
    const next: CalendarEvent = { ...current, ...input, updatedAt: nowIso(), rev: current.rev + 1 };
    await db.events.put(next);
    await log({ entityType: ENTITY, entityId: id, action: 'update', fields: Object.keys(patch), note: seriesDate });
    return next;
  });
}

/**
 * "Esta e as próximas": a série original termina na véspera e uma nova série
 * começa nesta data com as mudanças. Ocorrências anteriores ficam intactas.
 */
export async function updateFollowing(id: string, seriesDate: DateKey, input: EventInput): Promise<CalendarEvent> {
  const db = getDb();
  return db.transaction('rw', db.events, db.changelog, async () => {
    const current = await getOrFail(id);
    if (!current.recurrence || seriesDate <= current.start) return updateEvent(id, { ...input, start: current.start, endDate: addDays(current.start, diffDays(input.endDate, input.start)) });

    const before: Record<string, OccurrenceOverride> = {};
    const after: Record<string, OccurrenceOverride> = {};
    for (const [d, o] of Object.entries(current.overrides)) (d < seriesDate ? before : after)[d] = o;

    const at = nowIso();
    const trimmed: CalendarEvent = {
      ...current,
      recurrence: { ...current.recurrence, until: addDays(seriesDate, -1), exceptions: current.recurrence.exceptions.filter((d) => d < seriesDate) },
      overrides: before,
      updatedAt: at,
      rev: current.rev + 1,
    };
    const span = diffDays(input.endDate, input.start);
    const data = clean({
      ...input,
      start: seriesDate,
      endDate: addDays(seriesDate, span),
      recurrence: input.recurrence ? { ...input.recurrence, exceptions: input.recurrence.exceptions.filter((d) => d >= seriesDate) } : null,
      overrides: after,
      seriesOf: current.seriesOf ?? current.id,
    });
    const created: CalendarEvent = { ...data, id: newId('evt'), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
    await db.events.put(trimmed);
    await db.events.add(created);
    await log({ entityType: ENTITY, entityId: id, action: 'update', fields: ['recurrence'], note: seriesDate });
    await log({ entityType: ENTITY, entityId: created.id, action: 'create', note: id });
    return created;
  });
}

/** Exclui só uma ocorrência (vira exceção da série). */
export async function deleteOccurrence(id: string, seriesDate: DateKey): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.events, db.changelog, async () => {
    const current = await getOrFail(id);
    if (!current.recurrence) {
      await softDelete(current);
      return;
    }
    const { [seriesDate]: _removed, ...overrides } = current.overrides;
    void _removed;
    await db.events.put({
      ...current,
      overrides,
      recurrence: { ...current.recurrence, exceptions: [...new Set([...current.recurrence.exceptions, seriesDate])] },
      updatedAt: nowIso(),
      rev: current.rev + 1,
    });
    await log({ entityType: ENTITY, entityId: id, action: 'skip', note: seriesDate });
  });
}

/** Exclui esta e as próximas: a série termina na véspera. */
export async function deleteFollowing(id: string, seriesDate: DateKey): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.events, db.changelog, async () => {
    const current = await getOrFail(id);
    if (!current.recurrence || seriesDate <= current.start) {
      await softDelete(current);
      return;
    }
    await db.events.put({ ...current, recurrence: { ...current.recurrence, until: addDays(seriesDate, -1) }, updatedAt: nowIso(), rev: current.rev + 1 });
    await log({ entityType: ENTITY, entityId: id, action: 'update', fields: ['recurrence'], note: seriesDate });
  });
}

async function softDelete(e: CalendarEvent): Promise<void> {
  const at = nowIso();
  await getDb().events.put({ ...e, deletedAt: at, updatedAt: at, rev: e.rev + 1 });
  await log({ entityType: ENTITY, entityId: e.id, action: 'delete' });
}

/** Manda o evento (a série inteira) para a Lixeira. */
export async function softDeleteEvent(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.events, db.changelog, async () => softDelete(await getOrFail(id)));
}

export async function restoreEvent(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.events, db.changelog, async () => {
    const e = await getOrFail(id);
    await db.events.put({ ...e, deletedAt: null, updatedAt: nowIso(), rev: e.rev + 1 });
    await log({ entityType: ENTITY, entityId: id, action: 'restore' });
  });
}

/** Exclusão definitiva (só pela Lixeira, com confirmação). */
export async function purgeEvent(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.events, db.changelog, async () => {
    await db.events.delete(id);
    await log({ entityType: ENTITY, entityId: id, action: 'purge' });
  });
}

export async function eventHistory(id: string): Promise<ChangeEntry[]> {
  return getDb().changelog.where('[entityType+entityId]').equals([ENTITY, id]).reverse().sortBy('seq');
}
