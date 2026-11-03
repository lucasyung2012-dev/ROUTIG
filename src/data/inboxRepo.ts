import { getDb } from './db';
import { createTask } from './tasksRepo';
import { createEvent } from './eventsRepo';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import type { DateKey } from '@/domain/dates';
import { sha256Hex, type InboxItem, type InboxKind, type StoredFile } from '@/domain/inbox';
import type { TaskInput } from '@/domain/tasks';
import type { EventInput } from '@/domain/events';

const ENTITY = 'inbox';
/** Limite por arquivo para não estourar o armazenamento do aparelho. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export class InboxRuleError extends Error {
  constructor(public code: 'empty' | 'too_large' | 'not_found' | 'quota') {
    super(code);
  }
}

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

function baseItem(kind: InboxKind, text: string): InboxItem {
  const at = nowIso();
  return {
    id: newId('inb'),
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    rev: 1,
    kind,
    text: text.slice(0, 20_000),
    url: null,
    fileId: null,
    fileName: null,
    mime: null,
    size: null,
    status: 'open',
    snoozedUntil: null,
    processedTo: null,
  };
}

function isQuota(e: unknown): boolean {
  return e instanceof Error && /quota/i.test(`${e.name} ${e.message}`);
}

/** Captura texto (ideia, tarefa, evento, link…). */
export async function captureText(text: string): Promise<InboxItem> {
  const clean = text.trim();
  if (!clean) throw new InboxRuleError('empty');
  const urlOnly = /^https?:\/\/\S+$/i.test(clean);
  const item: InboxItem = { ...baseItem(urlOnly ? 'link' : 'text', clean), url: urlOnly ? clean : null };
  const db = getDb();
  await db.transaction('rw', db.inbox, db.changelog, async () => {
    await db.inbox.add(item);
    await log({ entityType: ENTITY, entityId: item.id, action: 'create' });
  });
  return item;
}

export interface FileCaptureResult {
  item: InboxItem;
  /** O mesmo arquivo já estava guardado: foi reaproveitado em vez de salvo de novo. */
  reusedFile: boolean;
}

export function kindFromMime(mime: string): InboxKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Captura um arquivo (foto, documento, áudio). Arquivo idêntico já guardado é reaproveitado. */
export async function captureFile(blob: Blob, name: string, text = ''): Promise<FileCaptureResult> {
  if (blob.size === 0) throw new InboxRuleError('empty');
  if (blob.size > MAX_FILE_BYTES) throw new InboxRuleError('too_large');
  const mime = blob.type || 'application/octet-stream';
  const hash = await sha256Hex(blob);
  const db = getDb();
  try {
    return await db.transaction('rw', db.inbox, db.files, db.changelog, async () => {
      const existing = await db.files.where('hash').equals(hash).first();
      let fileId = existing?.id;
      if (!fileId) {
        const file: StoredFile = { id: newId('file'), blob, name: name.slice(0, 200), mime, size: blob.size, hash, createdAt: nowIso(), origin: 'inbox' };
        await db.files.add(file);
        fileId = file.id;
      }
      const item: InboxItem = { ...baseItem(kindFromMime(mime), text.trim() || name), fileId, fileName: name.slice(0, 200), mime, size: blob.size };
      await db.inbox.add(item);
      await log({ entityType: ENTITY, entityId: item.id, action: 'create', note: existing ? 'file_reused' : undefined });
      return { item, reusedFile: !!existing };
    });
  } catch (e) {
    if (isQuota(e)) throw new InboxRuleError('quota');
    throw e;
  }
}

async function patch(id: string, change: Partial<InboxItem>, entry: Omit<ChangeEntry, 'at' | 'seq' | 'entityType' | 'entityId'>): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.inbox, db.changelog, async () => {
    const item = await db.inbox.get(id);
    if (!item) throw new InboxRuleError('not_found');
    await db.inbox.put({ ...item, ...change, updatedAt: nowIso(), rev: item.rev + 1 });
    await log({ entityType: ENTITY, entityId: id, ...entry });
  });
}

export const updateText = (id: string, text: string) => patch(id, { text: text.slice(0, 20_000) }, { action: 'update', fields: ['text'] });
export const snooze = (id: string, until: DateKey) => patch(id, { snoozedUntil: until }, { action: 'update', fields: ['snoozedUntil'], note: until });
export const unsnooze = (id: string) => patch(id, { snoozedUntil: null }, { action: 'update', fields: ['snoozedUntil'] });
export const archive = (id: string) => patch(id, { status: 'archived' }, { action: 'update', fields: ['status'], note: 'archived' });
export const reopen = (id: string) => patch(id, { status: 'open', snoozedUntil: null }, { action: 'update', fields: ['status'], note: 'open' });
export const softDeleteItem = (id: string) => patch(id, { deletedAt: nowIso() }, { action: 'delete' });
export const restoreItem = (id: string) => patch(id, { deletedAt: null }, { action: 'restore' });

/** Exclusão definitiva. O arquivo só é apagado se nenhum outro item usar. */
export async function purgeItem(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.inbox, db.files, db.changelog, async () => {
    const item = await db.inbox.get(id);
    if (!item) return;
    await db.inbox.delete(id);
    if (item.fileId) {
      const others = await db.inbox.filter((i) => i.fileId === item.fileId).count();
      if (others === 0) await db.files.delete(item.fileId);
    }
    await log({ entityType: ENTITY, entityId: id, action: 'purge' });
  });
}

/** Converte em tarefa: cria a tarefa e marca o item como processado, ligado a ela. */
export async function convertToTask(id: string, input: TaskInput): Promise<string> {
  const task = await createTask({ ...input, originModule: 'inbox' });
  await patch(id, { status: 'processed', processedTo: { type: 'task', id: task.id }, snoozedUntil: null }, { action: 'update', fields: ['status'], note: `task:${task.id}` });
  return task.id;
}

/** Converte em evento do Calendar. */
export async function convertToEvent(id: string, input: EventInput): Promise<string> {
  const event = await createEvent({ ...input, moduleRef: input.moduleRef ?? null });
  await patch(id, { status: 'processed', processedTo: { type: 'event', id: event.id }, snoozedUntil: null }, { action: 'update', fields: ['status'], note: `event:${event.id}` });
  return event.id;
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  return getDb().files.get(id);
}
