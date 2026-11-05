import { z } from 'zod';
import type { DateKey } from './dates';
import type { BaseEntity } from './entity';

/* ---------- Música (Parte 11) ---------- */

/** Violão é o principal (Parte 11.1); outros instrumentos usam a mesma estrutura (Parte 11.7). */
export const INSTRUMENT_KINDS = ['guitar', 'other'] as const;
export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];

export interface Instrument extends BaseEntity {
  name: string;
  kind: InstrumentKind;
  color: string;
  /** Afinação (ex.: "E A D G B E"). */
  tuning: string;
  /** Quantas cordas o diagrama de acorde desenha (violão: 6). 0 = sem diagrama. */
  strings: number;
  startedOn: DateKey | null;
  notes: string;
  order: number;
}

export const GUITAR_PRESET = { name: 'Violão', kind: 'guitar' as const, color: '#A0522D', tuning: 'E A D G B E', strings: 6 };

export const instrumentInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(INSTRUMENT_KINDS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tuning: z.string().trim().max(60),
  strings: z.number().int().min(0).max(12),
  startedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  notes: z.string().max(20_000),
});
export type InstrumentInput = z.infer<typeof instrumentInputSchema>;

export function instrumentInputOf(i: Instrument): InstrumentInput {
  const { name, kind, color, tuning, strings, startedOn, notes } = i;
  return { name, kind, color, tuning, strings, startedOn, notes };
}

/* ---------- Técnicas, acordes, ritmos, escalas, dedilhados e teoria (Parte 11.2 e 11.4) ---------- */

export const MUSIC_CATEGORIES = ['technique', 'chord', 'rhythm', 'scale', 'fingerpicking', 'theory'] as const;
export type MusicCategory = (typeof MUSIC_CATEGORIES)[number];

export const ITEM_STATUSES = ['todo', 'learning', 'practicing', 'mastered'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export interface MusicItem extends BaseEntity {
  instrumentId: string;
  category: MusicCategory;
  name: string;
  status: ItemStatus;
  /** 1 a 5. */
  difficulty: number | null;
  /** Confiança atual (1 a 5): a evolução fica no histórico. */
  confidence: number | null;
  /** Acorde: casas por corda, da mais grave à mais aguda ("x32010"; x = não toca, 0 = solta). */
  frets: string;
  /** Ritmo e dedilhado: o padrão ("↓ ↓ ↑ ↑ ↓ ↑", "P i m a m i"). Escala: notas ou posição. */
  pattern: string;
  description: string;
  difficulties: string;
  notes: string;
}

export const musicItemInputSchema = z.object({
  instrumentId: z.string().min(1),
  category: z.enum(MUSIC_CATEGORIES),
  name: z.string().trim().min(1).max(120),
  status: z.enum(ITEM_STATUSES),
  difficulty: z.number().int().min(1).max(5).nullable(),
  confidence: z.number().int().min(1).max(5).nullable(),
  frets: z.string().trim().max(40),
  pattern: z.string().max(500),
  description: z.string().max(20_000),
  difficulties: z.string().max(4000),
  notes: z.string().max(20_000),
});
export type MusicItemInput = z.infer<typeof musicItemInputSchema>;

export function emptyItemInput(instrumentId: string, category: MusicCategory): MusicItemInput {
  return { instrumentId, category, name: '', status: 'learning', difficulty: null, confidence: null, frets: '', pattern: '', description: '', difficulties: '', notes: '' };
}

export function itemInputOf(i: MusicItem): MusicItemInput {
  const { instrumentId, category, name, status, difficulty, confidence, frets, pattern, description, difficulties, notes } = i;
  return { instrumentId, category, name, status, difficulty, confidence, frets, pattern, description, difficulties, notes };
}

/**
 * Lê as casas de um acorde: "x32010", "x 3 2 0 1 0" ou "8 10 10 9 8 8".
 * Devolve null por corda que não toca; precisa de exatamente `strings` posições.
 */
export function parseFrets(text: string, strings: number): Array<number | null> | null {
  const t = text.trim().toLowerCase();
  if (!t || strings <= 0) return null;
  const parts = /[\s,-]/.test(t) ? t.split(/[\s,-]+/).filter(Boolean) : [...t];
  if (parts.length !== strings) return null;
  const out: Array<number | null> = [];
  for (const p of parts) {
    if (p === 'x') out.push(null);
    else if (/^\d{1,2}$/.test(p) && Number(p) <= 24) out.push(Number(p));
    else return null;
  }
  return out;
}

/* ---------- Repertório (Parte 11.3) ---------- */

export const SONG_STATUSES = ['want', 'learning', 'reviewing', 'mastered', 'archived'] as const;
export type SongStatus = (typeof SONG_STATUSES)[number];

export interface SongFile {
  fileId: string;
  name: string;
  size: number;
}

export interface Song extends BaseEntity {
  instrumentId: string;
  name: string;
  artist: string;
  composer: string;
  genre: string;
  difficulty: number | null;
  status: SongStatus;
  /** 0 a 100, informado por você (não é calculado). */
  progress: number | null;
  chords: string[];
  /** Cifra: letra com os acordes em cima, em texto. */
  chordSheet: string;
  /** Partitura e outros arquivos (PDF, imagem). */
  files: SongFile[];
  videoUrl: string;
  notes: string;
}

export const songInputSchema = z.object({
  instrumentId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  artist: z.string().trim().max(120),
  composer: z.string().trim().max(120),
  genre: z.string().trim().max(60),
  difficulty: z.number().int().min(1).max(5).nullable(),
  status: z.enum(SONG_STATUSES),
  progress: z.number().int().min(0).max(100).nullable(),
  chords: z.array(z.string().trim().min(1).max(20)).max(60),
  chordSheet: z.string().max(60_000),
  files: z.array(z.object({ fileId: z.string().min(1), name: z.string().max(200), size: z.number().min(0) })).max(20),
  videoUrl: z.union([z.literal(''), z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'http')]),
  notes: z.string().max(20_000),
});
export type SongInput = z.infer<typeof songInputSchema>;

export function emptySongInput(instrumentId: string): SongInput {
  return { instrumentId, name: '', artist: '', composer: '', genre: '', difficulty: null, status: 'want', progress: null, chords: [], chordSheet: '', files: [], videoUrl: '', notes: '' };
}

export function songInputOf(s: Song): SongInput {
  const { instrumentId, name, artist, composer, genre, difficulty, status, progress, chords, chordSheet, files, videoUrl, notes } = s;
  return { instrumentId, name, artist, composer, genre, difficulty, status, progress, chords, chordSheet, files, videoUrl, notes };
}

/** Separa "Am, C G7 / D" em acordes, sem repetir. */
export function parseChordList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\s,;/|]+/)) {
    const c = raw.trim();
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    out.push(c);
  }
  return out;
}

const CHORD_TOKEN = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?\d{0,2}(?:[#b]\d{1,2})*(?:\/[A-G](?:#|b)?)?$/;

/** Acordes que aparecem numa cifra (linhas só de acordes). Ajuda a preencher a lista. */
export function chordsInSheet(sheet: string): string[] {
  const found: string[] = [];
  for (const line of sheet.split('\n')) {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length || !tokens.every((tk) => CHORD_TOKEN.test(tk))) continue;
    found.push(...tokens);
  }
  return parseChordList(found.join(' '));
}

/** Uma linha da cifra é só de acordes? (para destacar na leitura). */
export const isChordLine = (line: string) => {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((tk) => CHORD_TOKEN.test(tk));
};

/* ---------- Prática (Parte 11.5) ---------- */

export interface PracticeSession extends BaseEntity {
  instrumentId: string;
  date: DateKey;
  durationMin: number;
  songIds: string[];
  itemIds: string[];
  /** Objetivo da sessão. */
  goal: string;
  practiced: string;
  difficulties: string;
  notes: string;
  /** Materiais: notas do Notes usadas. */
  noteIds: string[];
}

export const practiceInputSchema = z.object({
  instrumentId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMin: z.number().int().min(1).max(1440),
  songIds: z.array(z.string()).max(50),
  itemIds: z.array(z.string()).max(100),
  goal: z.string().max(2000),
  practiced: z.string().max(10_000),
  difficulties: z.string().max(4000),
  notes: z.string().max(10_000),
  noteIds: z.array(z.string()).max(50),
});
export type PracticeInput = z.infer<typeof practiceInputSchema>;

export function emptyPracticeInput(instrumentId: string, date: DateKey): PracticeInput {
  return { instrumentId, date, durationMin: 30, songIds: [], itemIds: [], goal: '', practiced: '', difficulties: '', notes: '', noteIds: [] };
}

export function practiceInputOf(p: PracticeSession): PracticeInput {
  const { instrumentId, date, durationMin, songIds, itemIds, goal, practiced, difficulties, notes, noteIds } = p;
  return { instrumentId, date, durationMin, songIds, itemIds, goal, practiced, difficulties, notes, noteIds };
}

/** Minutos e sessões num período, e quantas vezes cada música ou item foi praticado. */
export function practiceStats(sessions: Array<Pick<PracticeSession, 'durationMin' | 'songIds' | 'itemIds' | 'date'>>) {
  const times = new Map<string, { count: number; last: DateKey }>();
  for (const s of sessions)
    for (const id of [...s.songIds, ...s.itemIds]) {
      const cur = times.get(id);
      times.set(id, { count: (cur?.count ?? 0) + 1, last: cur && cur.last > s.date ? cur.last : s.date });
    }
  return { minutes: sessions.reduce((a, s) => a + s.durationMin, 0), sessions: sessions.length, times };
}
