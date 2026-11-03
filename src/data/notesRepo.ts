import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry, EntityRef } from '@/domain/entity';
import { MAX_FILE_BYTES, sha256Hex, type StoredFile } from '@/domain/inbox';
import { normalizeTags } from '@/domain/tasks';
import { cloneBlocks, versionsToPrune, type Block, type Note, type NoteCollection, type Notebook, type NoteTemplate, type NoteVersion } from '@/domain/notes';

const ENTITY = 'note';
/** Intervalo mínimo entre versões automáticas do histórico. */
export const VERSION_INTERVAL_MS = 5 * 60 * 1000;

export class NoteRuleError extends Error {
  constructor(public code: 'not_found' | 'too_large' | 'quota' | 'invalid') {
    super(code);
  }
}

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

export type NoteInput = Pick<Note, 'title' | 'mode' | 'blocks' | 'notebookId' | 'collectionIds' | 'category' | 'tags' | 'favorite' | 'links'>;

export function emptyNoteInput(over: Partial<NoteInput> = {}): NoteInput {
  return { title: '', mode: 'quick', blocks: [{ id: newId('blk'), type: 'paragraph', text: '' }], notebookId: null, collectionIds: [], category: '', tags: [], favorite: false, links: [], ...over };
}

function clean(input: NoteInput): NoteInput {
  return {
    ...input,
    title: input.title.slice(0, 300),
    category: input.category.trim().slice(0, 60),
    tags: normalizeTags(input.tags),
    collectionIds: [...new Set(input.collectionIds)],
    blocks: input.blocks.length ? input.blocks : [{ id: newId('blk'), type: 'paragraph', text: '' }],
  };
}

export async function createNote(input: NoteInput): Promise<Note> {
  const at = nowIso();
  const note: Note = { ...clean(input), id: newId('note'), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
  const db = getDb();
  await db.transaction('rw', db.notes, db.changelog, async () => {
    await db.notes.add(note);
    await log({ entityType: ENTITY, entityId: note.id, action: 'create' });
  });
  return note;
}

/**
 * Salva a nota (salvamento automático). Antes de sobrescrever, guarda uma versão
 * do conteúdo anterior se a última versão tiver mais de 5 minutos (Parte 17.4).
 */
export async function saveNote(id: string, input: NoteInput, now = Date.now()): Promise<Note> {
  const db = getDb();
  return db.transaction('rw', db.notes, db.noteVersions, db.changelog, async () => {
    const current = await db.notes.get(id);
    if (!current) throw new NoteRuleError('not_found');
    const data = clean(input);
    const contentChanged = current.title !== data.title || JSON.stringify(current.blocks) !== JSON.stringify(data.blocks);
    if (contentChanged) {
      const versions = await db.noteVersions.where('noteId').equals(id).toArray();
      const last = versions.reduce<string>((acc, v) => (v.at > acc ? v.at : acc), '');
      if (!last || now - new Date(last).getTime() >= VERSION_INTERVAL_MS) {
        await db.noteVersions.add({ id: newId('ver'), noteId: id, at: new Date(now).toISOString(), title: current.title, blocks: current.blocks });
        // Guarda as 50 versões mais novas; as mais antigas saem para não lotar o aparelho.
        const prune = versionsToPrune(await db.noteVersions.where('noteId').equals(id).toArray());
        if (prune.length) await db.noteVersions.bulkDelete(prune);
      }
    }
    const next: Note = { ...current, ...data, updatedAt: nowIso(), rev: current.rev + 1 };
    await db.notes.put(next);
    const fields = (Object.keys(data) as (keyof NoteInput)[]).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(data[k]));
    if (fields.length) await log({ entityType: ENTITY, entityId: id, action: 'update', fields });
    return next;
  });
}

export async function noteVersions(id: string): Promise<NoteVersion[]> {
  return (await getDb().noteVersions.where('noteId').equals(id).toArray()).sort((a, b) => b.at.localeCompare(a.at));
}

/** Volta a uma versão. O conteúdo atual vira uma versão antes, então nada se perde. */
export async function restoreVersion(noteId: string, versionId: string): Promise<Note> {
  const db = getDb();
  return db.transaction('rw', db.notes, db.noteVersions, db.changelog, async () => {
    const note = await db.notes.get(noteId);
    const version = await db.noteVersions.get(versionId);
    if (!note || !version) throw new NoteRuleError('not_found');
    const at = nowIso();
    await db.noteVersions.add({ id: newId('ver'), noteId, at, title: note.title, blocks: note.blocks });
    const next: Note = { ...note, title: version.title, blocks: version.blocks, updatedAt: at, rev: note.rev + 1 };
    await db.notes.put(next);
    await log({ entityType: ENTITY, entityId: noteId, action: 'restore', note: version.at });
    return next;
  });
}

export async function softDeleteNote(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.notes, db.changelog, async () => {
    const n = await db.notes.get(id);
    if (!n) return;
    await db.notes.put({ ...n, deletedAt: nowIso(), updatedAt: nowIso() });
    await log({ entityType: ENTITY, entityId: id, action: 'delete' });
  });
}

export async function restoreNote(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.notes, db.changelog, async () => {
    const n = await db.notes.get(id);
    if (!n) return;
    await db.notes.put({ ...n, deletedAt: null, updatedAt: nowIso() });
    await log({ entityType: ENTITY, entityId: id, action: 'restore' });
  });
}

/** Exclusão definitiva: apaga a nota, as versões e os arquivos que só ela usava. */
export async function purgeNote(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.notes, db.noteVersions, db.files, db.inbox, db.changelog], async () => {
    const n = await db.notes.get(id);
    if (!n) return;
    await db.notes.delete(id);
    await db.noteVersions.where('noteId').equals(id).delete();
    const fileIds = n.blocks.flatMap((b) => (b.type === 'image' || b.type === 'file' ? [b.fileId] : [])).filter(Boolean);
    for (const fid of fileIds) {
      const usedByNote = await db.notes.filter((o) => o.blocks.some((b) => (b.type === 'image' || b.type === 'file') && b.fileId === fid)).count();
      const usedByInbox = await db.inbox.filter((i) => i.fileId === fid).count();
      if (usedByNote === 0 && usedByInbox === 0) await db.files.delete(fid);
    }
    await log({ entityType: ENTITY, entityId: id, action: 'purge' });
  });
}

/** Guarda um arquivo (imagem ou documento) para usar num bloco. Arquivo idêntico é reaproveitado. */
export async function storeNoteFile(blob: Blob, name: string): Promise<StoredFile> {
  if (blob.size > MAX_FILE_BYTES) throw new NoteRuleError('too_large');
  const hash = await sha256Hex(blob);
  const db = getDb();
  try {
    return await db.transaction('rw', db.files, async () => {
      const existing = await db.files.where('hash').equals(hash).first();
      if (existing) return existing;
      const file: StoredFile = { id: newId('file'), blob, name: name.slice(0, 200), mime: blob.type || 'application/octet-stream', size: blob.size, hash, createdAt: nowIso(), origin: 'notes' };
      await db.files.add(file);
      return file;
    });
  } catch (e) {
    if (e instanceof Error && /quota/i.test(`${e.name} ${e.message}`)) throw new NoteRuleError('quota');
    throw e;
  }
}

/* ---------- Cadernos, coleções e modelos ---------- */

export async function createNotebook(name: string, color: string): Promise<Notebook> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new NoteRuleError('invalid');
  const db = getDb();
  const nb: Notebook = { id: newId('nb'), name: clean, color, order: await db.notebooks.count(), createdAt: nowIso() };
  await db.notebooks.add(nb);
  await log({ entityType: 'notebook', entityId: nb.id, action: 'create' });
  return nb;
}

export async function renameNotebook(id: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 60);
  if (!clean) return;
  await getDb().notebooks.update(id, { name: clean });
  await log({ entityType: 'notebook', entityId: id, action: 'update', fields: ['name'] });
}

/** Exclui o caderno; as notas continuam existindo, sem caderno. */
export async function deleteNotebook(id: string): Promise<number> {
  const db = getDb();
  return db.transaction('rw', db.notebooks, db.notes, db.changelog, async () => {
    const moved = await db.notes.where('notebookId').equals(id).modify({ notebookId: null });
    await db.notebooks.delete(id);
    await log({ entityType: 'notebook', entityId: id, action: 'purge', note: String(moved) });
    return moved;
  });
}

export async function createCollection(name: string): Promise<NoteCollection> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new NoteRuleError('invalid');
  const c: NoteCollection = { id: newId('col'), name: clean, createdAt: nowIso() };
  await getDb().noteCollections.add(c);
  await log({ entityType: 'noteCollection', entityId: c.id, action: 'create' });
  return c;
}

/** Exclui a coleção; as notas só deixam de fazer parte dela. */
export async function deleteCollection(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.noteCollections, db.notes, db.changelog, async () => {
    await db.notes.where('collectionIds').equals(id).modify((n) => {
      n.collectionIds = n.collectionIds.filter((c) => c !== id);
    });
    await db.noteCollections.delete(id);
    await log({ entityType: 'noteCollection', entityId: id, action: 'purge' });
  });
}

/** Salva a nota como modelo próprio. */
export async function saveAsTemplate(name: string, title: string, blocks: Block[]): Promise<NoteTemplate> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new NoteRuleError('invalid');
  const tpl: NoteTemplate = { id: newId('tpl'), name: clean, builtin: false, title, blocks: cloneBlocks(blocks) };
  await getDb().noteTemplates.add(tpl);
  return tpl;
}

export async function deleteTemplate(id: string): Promise<void> {
  await getDb().noteTemplates.delete(id);
}

/** Liga a nota a um registro de outro módulo (sem copiar nada). */
export async function linkNote(id: string, ref: EntityRef): Promise<void> {
  const db = getDb();
  const n = await db.notes.get(id);
  if (!n || n.links.some((l) => l.type === ref.type && l.id === ref.id)) return;
  await saveNote(id, { ...n, links: [...n.links, ref] });
}
