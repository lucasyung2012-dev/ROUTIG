import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry, EntityRef } from '@/domain/entity';
import { MAX_FILE_BYTES, sha256Hex, type StoredFile } from '@/domain/inbox';
import { isTextFile, itemMetaSchema, kindForFile, MAX_TEXT_INDEX, normalizeTags, titleFromFile, type ItemMeta, type LibraryCollection, type LibraryItem } from '@/domain/library';
import { blockFileIds } from '@/domain/notes';

export class LibraryRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'too_large' | 'quota' | 'duplicate') {
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

function cleanMeta(meta: ItemMeta): ItemMeta {
  const r = itemMetaSchema.safeParse({ ...meta, tags: normalizeTags(meta.tags) });
  if (!r.success) throw new LibraryRuleError('invalid');
  return r.data;
}

/* ---------- Importação com prévia (Parte 18.3) ---------- */

export interface ImportCandidate {
  file: File;
  name: string;
  size: number;
  hash: string;
  kind: LibraryItem['kind'];
  tooLarge: boolean;
  /** Material da Library que já tem o mesmo arquivo (mesmo conteúdo). */
  duplicateOf: { id: string; title: string } | null;
  include: boolean;
}

/** Lê os arquivos escolhidos e monta a prévia. Nada é salvo aqui. */
export async function prepareImport(files: File[]): Promise<ImportCandidate[]> {
  const db = getDb();
  const items = await db.libraryItems.filter((i) => !i.deletedAt && !!i.fileId).toArray();
  const out: ImportCandidate[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const tooLarge = file.size > MAX_FILE_BYTES;
    const hash = tooLarge ? '' : await sha256Hex(file);
    let duplicateOf: ImportCandidate['duplicateOf'] = null;
    if (hash) {
      const stored = await db.files.where('hash').equals(hash).first();
      const item = stored ? items.find((i) => i.fileId === stored.id) : undefined;
      if (item) duplicateOf = { id: item.id, title: item.title };
      else if (seen.has(hash)) duplicateOf = { id: '', title: file.name };
      seen.add(hash);
    }
    out.push({ file, name: file.name, size: file.size, hash, kind: kindForFile(file.name, file.type), tooLarge, duplicateOf, include: !tooLarge && !duplicateOf });
  }
  return out;
}

/**
 * Importa os arquivos marcados. Nunca substitui nada: duplicata importada vira um novo material
 * apontando para o mesmo arquivo (sem ocupar espaço de novo). Registra origem e data.
 */
export async function importFiles(cands: ImportCandidate[], defaults: { folder: string; collectionIds: string[]; tags: string[] }): Promise<number> {
  const db = getDb();
  const chosen = cands.filter((c) => c.include && !c.tooLarge);
  let n = 0;
  // Texto dos arquivos de texto, lido antes (fora da transação) para a busca global.
  const texts = new Map<ImportCandidate, string>();
  for (const c of chosen) if (isTextFile(c.name, c.file.type)) texts.set(c, (await readText(c.file)).slice(0, MAX_TEXT_INDEX));
  try {
    for (const c of chosen) {
      await db.transaction('rw', db.files, db.libraryItems, db.changelog, async () => {
        let stored = await db.files.where('hash').equals(c.hash).first();
        if (!stored) {
          stored = { id: newId('file'), blob: c.file, name: c.name.slice(0, 200), mime: c.file.type || 'application/octet-stream', size: c.size, hash: c.hash, createdAt: nowIso(), origin: 'library' } satisfies StoredFile;
          await db.files.add(stored);
        }
        const meta = cleanMeta({ kind: c.kind, title: titleFromFile(c.name).slice(0, 200), author: '', url: '', folder: defaults.folder, category: '', tags: defaults.tags, collectionIds: defaults.collectionIds, favorite: false, readStatus: c.kind === 'book' ? 'want' : null, notes: '' });
        const item: LibraryItem = { ...meta, fileId: stored.id, fileName: stored.name, size: stored.size, mime: stored.mime, origin: 'upload', importedAt: nowIso(), refs: [], ...(texts.has(c) ? { textContent: texts.get(c) } : {}), id: newId('lib'), ...base() };
        await db.libraryItems.add(item);
        await log({ entityType: 'library', entityId: item.id, action: 'create', note: `upload:${c.name.slice(0, 80)}` });
      });
      n++;
    }
  } catch (e) {
    if (e instanceof Error && /quota/i.test(`${e.name} ${e.message}`)) throw new LibraryRuleError('quota');
    throw e;
  }
  return n;
}

/**
 * Material a partir de um arquivo que já está guardado (por exemplo, do Inbox).
 * O arquivo é o mesmo, não é copiado. Se ele já está na Library, devolve o item que existe.
 */
export async function createFromStoredFile(fileId: string, title: string): Promise<{ item: LibraryItem; existed: boolean }> {
  const db = getDb();
  const file = await db.files.get(fileId);
  if (!file) throw new LibraryRuleError('not_found');
  const existing = await db.libraryItems.filter((i) => !i.deletedAt && i.fileId === fileId).first();
  if (existing) return { item: existing, existed: true };
  const textContent = isTextFile(file.name, file.mime) ? (await readText(file.blob)).slice(0, MAX_TEXT_INDEX) : undefined;
  const data = cleanMeta({ kind: kindForFile(file.name, file.mime), title: (title.trim() || titleFromFile(file.name)).slice(0, 200), author: '', url: '', folder: '', category: '', tags: [], collectionIds: [], favorite: false, readStatus: null, notes: '' });
  const item: LibraryItem = { ...data, fileId, fileName: file.name, size: file.size, mime: file.mime, origin: 'upload', importedAt: nowIso(), refs: [], id: newId('lib'), ...base(), ...(textContent ? { textContent } : {}) };
  await db.transaction('rw', db.libraryItems, db.changelog, async () => {
    await db.libraryItems.add(item);
    await log({ entityType: 'library', entityId: item.id, action: 'create', note: 'inbox' });
  });
  return { item, existed: false };
}

/** Link, livro ou referência sem arquivo. */
export async function createItem(meta: ItemMeta, refs: EntityRef[] = []): Promise<LibraryItem> {
  const data = cleanMeta(meta);
  const db = getDb();
  return db.transaction('rw', db.libraryItems, db.changelog, async () => {
    if (data.url) {
      const dup = await db.libraryItems.filter((i) => !i.deletedAt && i.url === data.url).first();
      if (dup) throw new LibraryRuleError('duplicate');
    }
    const item: LibraryItem = { ...data, fileId: null, fileName: '', size: 0, mime: '', origin: data.url ? 'link' : 'manual', importedAt: nowIso(), refs, id: newId('lib'), ...base() };
    await db.libraryItems.add(item);
    await log({ entityType: 'library', entityId: item.id, action: 'create', note: item.origin });
    return item;
  });
}

export async function updateItem(id: string, meta: ItemMeta): Promise<LibraryItem> {
  const data = cleanMeta(meta);
  const db = getDb();
  return db.transaction('rw', db.libraryItems, db.changelog, async () => {
    const cur = await db.libraryItems.get(id);
    if (!cur) throw new LibraryRuleError('not_found');
    if (data.url && data.url !== cur.url && (await db.libraryItems.filter((i) => i.id !== id && !i.deletedAt && i.url === data.url).first())) throw new LibraryRuleError('duplicate');
    const next: LibraryItem = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.libraryItems.put(next);
    await log({ entityType: 'library', entityId: id, action: 'update', ...(cur.readStatus !== data.readStatus && data.readStatus ? { note: `read:${data.readStatus}` } : {}) });
    return next;
  });
}

export async function toggleFavorite(id: string): Promise<void> {
  const db = getDb();
  const cur = await db.libraryItems.get(id);
  if (cur) await db.libraryItems.update(id, { favorite: !cur.favorite, updatedAt: nowIso() });
}

/* ---------- Relacionamentos (Parte 18.4) ---------- */

export async function linkItem(id: string, ref: EntityRef): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.libraryItems, db.changelog, async () => {
    const cur = await db.libraryItems.get(id);
    if (!cur) throw new LibraryRuleError('not_found');
    if (cur.refs.some((r) => r.type === ref.type && r.id === ref.id)) return;
    await db.libraryItems.put({ ...cur, refs: [...cur.refs, { type: ref.type, id: ref.id }], updatedAt: nowIso(), rev: cur.rev + 1 });
    await log({ entityType: 'library', entityId: id, action: 'update', note: `link:${ref.type}` });
  });
}

export async function unlinkItem(id: string, ref: EntityRef): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.libraryItems, db.changelog, async () => {
    const cur = await db.libraryItems.get(id);
    if (!cur) throw new LibraryRuleError('not_found');
    await db.libraryItems.put({ ...cur, refs: cur.refs.filter((r) => !(r.type === ref.type && r.id === ref.id)), updatedAt: nowIso(), rev: cur.rev + 1 });
    await log({ entityType: 'library', entityId: id, action: 'update', note: `unlink:${ref.type}` });
  });
}

/* ---------- Lixeira e exclusão definitiva ---------- */

export async function softDeleteItem(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.libraryItems, db.changelog, async () => {
    await db.libraryItems.update(id, { deletedAt: nowIso(), updatedAt: nowIso() });
    await log({ entityType: 'library', entityId: id, action: 'delete' });
  });
}

export async function restoreItem(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.libraryItems, db.changelog, async () => {
    await db.libraryItems.update(id, { deletedAt: null, updatedAt: nowIso() });
    await log({ entityType: 'library', entityId: id, action: 'restore' });
  });
}

/** O arquivo ainda é usado por outro lugar? (notas, Inbox, capas, foto do perfil, partituras ou outro material) */
export async function isFileUsed(fileId: string, exceptLibraryId?: string): Promise<boolean> {
  const db = getDb();
  const avatar = ((await db.kv.get('settings'))?.value as { profile?: { avatarFileId?: string | null } } | undefined)?.profile?.avatarFileId;
  if (avatar === fileId) return true;
  if ((await db.libraryItems.where('fileId').equals(fileId).filter((i) => i.id !== exceptLibraryId).count()) > 0) return true;
  if ((await db.notes.filter((n) => blockFileIds(n.blocks).includes(fileId)).count()) > 0) return true;
  if ((await db.inbox.filter((i) => i.fileId === fileId).count()) > 0) return true;
  if ((await db.projects.filter((p) => p.coverFileId === fileId).count()) + (await db.interests.filter((i) => i.coverFileId === fileId).count()) > 0) return true;
  return (await db.songs.filter((s) => s.files.some((f) => f.fileId === fileId)).count()) > 0;
}

/**
 * Exclusão definitiva (só pela lixeira, com confirmação na tela). O arquivo só sai do aparelho
 * se nada mais usa ele: nunca apaga em silêncio o que outra parte do app precisa (Parte 18.5).
 */
export async function purgeItem(id: string): Promise<{ fileRemoved: boolean }> {
  const db = getDb();
  return db.transaction('rw', [db.libraryItems, db.files, db.notes, db.inbox, db.projects, db.interests, db.songs, db.kv, db.changelog], async () => {
    const cur = await db.libraryItems.get(id);
    if (!cur) return { fileRemoved: false };
    await db.libraryItems.delete(id);
    let fileRemoved = false;
    if (cur.fileId && !(await isFileUsed(cur.fileId, id))) {
      await db.files.delete(cur.fileId);
      fileRemoved = true;
    }
    await log({ entityType: 'library', entityId: id, action: 'purge' });
    return { fileRemoved };
  });
}

/* ---------- Coleções (Parte 18.2) ---------- */

export async function saveCollection(id: string | null, name: string, color: string): Promise<LibraryCollection> {
  const n = name.trim();
  if (!n || n.length > 60 || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new LibraryRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.libraryCollections, async () => {
    const dup = await db.libraryCollections.filter((c) => c.id !== id && !c.deletedAt && c.name.toLowerCase() === n.toLowerCase()).first();
    if (dup) throw new LibraryRuleError('duplicate');
    if (id) {
      const cur = await db.libraryCollections.get(id);
      if (!cur) throw new LibraryRuleError('not_found');
      const next = { ...cur, name: n, color, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.libraryCollections.put(next);
      return next;
    }
    const c: LibraryCollection = { name: n, color, id: newId('lco'), ...base() };
    await db.libraryCollections.add(c);
    return c;
  });
}

export async function deleteCollection(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.libraryCollections, db.libraryItems, async () => {
    await db.libraryCollections.update(id, { deletedAt: nowIso(), updatedAt: nowIso() });
    // Os materiais continuam; só saem da coleção.
    for (const i of await db.libraryItems.where('collectionIds').equals(id).toArray()) await db.libraryItems.update(i.id, { collectionIds: i.collectionIds.filter((c) => c !== id) });
  });
}

/* ---------- Armazenamento (Parte 18.5) ---------- */

/** Espaço dos arquivos da Library (cada arquivo contado uma vez) e de todos os arquivos do app. */
export async function storageUsage(): Promise<{ library: number; libraryFiles: number; allFiles: number; allCount: number }> {
  const db = getDb();
  const items = await db.libraryItems.filter((i) => !!i.fileId).toArray();
  const ids = new Set(items.map((i) => i.fileId!));
  let library = 0;
  let allFiles = 0;
  let allCount = 0;
  await db.files.each((f) => {
    allFiles += f.size;
    allCount++;
    if (ids.has(f.id)) library += f.size;
  });
  return { library, libraryFiles: ids.size, allFiles, allCount };
}

async function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => resolve('');
    r.readAsText(file);
  });
}
