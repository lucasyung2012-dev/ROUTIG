import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import {
  instrumentInputSchema,
  musicItemInputSchema,
  practiceInputSchema,
  songInputSchema,
  type Instrument,
  type InstrumentInput,
  type MusicItem,
  type MusicItemInput,
  type PracticeInput,
  type PracticeSession,
  type Song,
  type SongInput,
} from '@/domain/music';

export class MusicRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'duplicate') {
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

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new MusicRuleError('invalid');
  return r.data;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/* ---------- Instrumentos (Parte 11.1) ---------- */

/** Cria um instrumento. Mesmo nome não se repete; não existe página de instrumento que não foi adicionado. */
export async function createInstrument(input: InstrumentInput): Promise<Instrument> {
  const data = parse(instrumentInputSchema, input);
  const db = getDb();
  return db.transaction('rw', db.instruments, db.changelog, async () => {
    const all = await db.instruments.filter((i) => !i.deletedAt).toArray();
    if (all.some((i) => same(i.name, data.name))) throw new MusicRuleError('duplicate');
    const inst: Instrument = { ...data, id: newId('ins'), order: all.reduce((m, i) => Math.max(m, i.order), 0) + 1, ...base() };
    await db.instruments.add(inst);
    await log({ entityType: 'instrument', entityId: inst.id, action: 'create' });
    return inst;
  });
}

export async function updateInstrument(id: string, input: InstrumentInput): Promise<Instrument> {
  const data = parse(instrumentInputSchema, input);
  const db = getDb();
  return db.transaction('rw', db.instruments, db.changelog, async () => {
    const cur = await db.instruments.get(id);
    if (!cur) throw new MusicRuleError('not_found');
    if ((await db.instruments.filter((i) => i.id !== id && !i.deletedAt).toArray()).some((i) => same(i.name, data.name))) throw new MusicRuleError('duplicate');
    const next: Instrument = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.instruments.put(next);
    await log({ entityType: 'instrument', entityId: id, action: 'update' });
    return next;
  });
}

async function setDeleted(table: 'instruments' | 'musicItems' | 'songs' | 'practiceSessions', entityType: string, id: string, deletedAt: string | null) {
  const db = getDb();
  await db.transaction('rw', db.table(table), db.changelog, async () => {
    await db.table(table).update(id, { deletedAt, updatedAt: nowIso() });
    await log({ entityType, entityId: id, action: deletedAt ? 'delete' : 'restore' });
  });
}
export const softDeleteInstrument = (id: string) => setDeleted('instruments', 'instrument', id, nowIso());
export const restoreInstrument = (id: string) => setDeleted('instruments', 'instrument', id, null);

/* ---------- Técnicas, acordes, ritmos, escalas, dedilhados, teoria ---------- */

/** Mudanças de status e de confiança entram no histórico com o valor (Parte 11.4: evolução). */
function itemNotes(cur: MusicItem | undefined, next: MusicItemInput): string[] {
  const out: string[] = [];
  if (!cur || cur.status !== next.status) out.push(`status:${next.status}`);
  if (next.confidence !== null && cur?.confidence !== next.confidence) out.push(`confidence:${next.confidence}`);
  return out;
}

export async function createItem(input: MusicItemInput): Promise<MusicItem> {
  const data = parse(musicItemInputSchema, input);
  const db = getDb();
  return db.transaction('rw', db.musicItems, db.changelog, async () => {
    const dup = await db.musicItems
      .where('instrumentId')
      .equals(data.instrumentId)
      .filter((i) => !i.deletedAt && i.category === data.category && same(i.name, data.name))
      .first();
    if (dup) throw new MusicRuleError('duplicate');
    const item: MusicItem = { ...data, id: newId('mit'), ...base() };
    await db.musicItems.add(item);
    await log({ entityType: 'musicItem', entityId: item.id, action: 'create', note: `status:${item.status}` });
    if (item.confidence !== null) await log({ entityType: 'musicItem', entityId: item.id, action: 'update', note: `confidence:${item.confidence}` });
    return item;
  });
}

export async function updateItem(id: string, input: MusicItemInput): Promise<MusicItem> {
  const data = parse(musicItemInputSchema, input);
  const db = getDb();
  return db.transaction('rw', db.musicItems, db.changelog, async () => {
    const cur = await db.musicItems.get(id);
    if (!cur) throw new MusicRuleError('not_found');
    const dup = await db.musicItems
      .where('instrumentId')
      .equals(data.instrumentId)
      .filter((i) => i.id !== id && !i.deletedAt && i.category === data.category && same(i.name, data.name))
      .first();
    if (dup) throw new MusicRuleError('duplicate');
    const next: MusicItem = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.musicItems.put(next);
    const notes = itemNotes(cur, data);
    if (notes.length) for (const note of notes) await log({ entityType: 'musicItem', entityId: id, action: 'update', note });
    else await log({ entityType: 'musicItem', entityId: id, action: 'update' });
    return next;
  });
}
export const softDeleteItem = (id: string) => setDeleted('musicItems', 'musicItem', id, nowIso());
export const restoreItem = (id: string) => setDeleted('musicItems', 'musicItem', id, null);

/* ---------- Repertório ---------- */

export async function createSong(input: SongInput): Promise<Song> {
  const data = parse(songInputSchema, input);
  const db = getDb();
  return db.transaction('rw', db.songs, db.changelog, async () => {
    const dup = await db.songs
      .where('instrumentId')
      .equals(data.instrumentId)
      .filter((s) => !s.deletedAt && same(s.name, data.name) && same(s.artist, data.artist))
      .first();
    if (dup) throw new MusicRuleError('duplicate');
    const song: Song = { ...data, id: newId('sng'), ...base() };
    await db.songs.add(song);
    await log({ entityType: 'song', entityId: song.id, action: 'create', note: `status:${song.status}` });
    return song;
  });
}

export async function updateSong(id: string, input: SongInput): Promise<Song> {
  const data = parse(songInputSchema, input);
  const db = getDb();
  return db.transaction('rw', db.songs, db.changelog, async () => {
    const cur = await db.songs.get(id);
    if (!cur) throw new MusicRuleError('not_found');
    const dup = await db.songs
      .where('instrumentId')
      .equals(data.instrumentId)
      .filter((s) => s.id !== id && !s.deletedAt && same(s.name, data.name) && same(s.artist, data.artist))
      .first();
    if (dup) throw new MusicRuleError('duplicate');
    const next: Song = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.songs.put(next);
    const notes: string[] = [];
    if (cur.status !== data.status) notes.push(`status:${data.status}`);
    if (cur.progress !== data.progress && data.progress !== null) notes.push(`progress:${data.progress}`);
    if (notes.length) for (const note of notes) await log({ entityType: 'song', entityId: id, action: 'update', note });
    else await log({ entityType: 'song', entityId: id, action: 'update' });
    return next;
  });
}
export const softDeleteSong = (id: string) => setDeleted('songs', 'song', id, nowIso());
export const restoreSong = (id: string) => setDeleted('songs', 'song', id, null);

/* ---------- Prática (Parte 11.5) ---------- */

export async function savePractice(id: string | null, input: PracticeInput): Promise<PracticeSession> {
  const data = parse(practiceInputSchema, { ...input, songIds: [...new Set(input.songIds)], itemIds: [...new Set(input.itemIds)], noteIds: [...new Set(input.noteIds)] });
  const db = getDb();
  return db.transaction('rw', db.practiceSessions, db.changelog, async () => {
    if (id) {
      const cur = await db.practiceSessions.get(id);
      if (!cur) throw new MusicRuleError('not_found');
      const next: PracticeSession = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.practiceSessions.put(next);
      await log({ entityType: 'practice', entityId: id, action: 'update' });
      return next;
    }
    const p: PracticeSession = { ...data, id: newId('prc'), ...base() };
    await db.practiceSessions.add(p);
    await log({ entityType: 'practice', entityId: p.id, action: 'create', note: `${p.durationMin}` });
    return p;
  });
}
export const softDeletePractice = (id: string) => setDeleted('practiceSessions', 'practice', id, nowIso());
export const restorePractice = (id: string) => setDeleted('practiceSessions', 'practice', id, null);

/** Histórico do instrumento: o próprio, as músicas e os itens dele, do mais novo ao mais antigo. */
export async function instrumentHistory(instrumentId: string): Promise<ChangeEntry[]> {
  const db = getDb();
  const ids = [instrumentId, ...(await db.songs.where('instrumentId').equals(instrumentId).primaryKeys()), ...(await db.musicItems.where('instrumentId').equals(instrumentId).primaryKeys())];
  return (await db.changelog.where('entityId').anyOf(ids).toArray()).sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
}
