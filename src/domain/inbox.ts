import type { BaseEntity, EntityRef } from './entity';
import { addDays, isDateKey, todayKey, weekday, type DateKey } from './dates';
import { normalizeSearch, normalizeTags } from './tasks';

/* ---------- Tipos ---------- */

export type InboxKind = 'text' | 'link' | 'image' | 'file' | 'audio';
export type InboxStatus = 'open' | 'processed' | 'archived';

export interface InboxItem extends BaseEntity {
  kind: InboxKind;
  text: string;
  url: string | null;
  /** Arquivo guardado na tabela `files` (imagem, documento, áudio). */
  fileId: string | null;
  fileName: string | null;
  mime: string | null;
  size: number | null;
  status: InboxStatus;
  /** Adiado: some da entrada até esta data. */
  snoozedUntil: DateKey | null;
  /** Registro criado a partir deste item (o item não é copiado de novo). */
  processedTo: EntityRef | null;
}

/** Arquivo binário guardado separado dos dados (Parte 24.1). A Library vai reutilizar esta tabela. */
export interface StoredFile {
  id: string;
  blob: Blob;
  name: string;
  mime: string;
  size: number;
  /** SHA-256 em hexadecimal, para detectar arquivos repetidos. */
  hash: string;
  createdAt: string;
  origin: string;
}

/* ---------- Sugestão (lógica local determinística, Parte 28 nível 1) ---------- */

export type SuggestedType = 'task' | 'event' | 'note' | 'link' | 'idea';

export interface Suggestion {
  type: SuggestedType;
  title: string;
  date: DateKey | null;
  time: string | null;
  tags: string[];
  url: string | null;
  /** Por que o app sugeriu isso (mostrado ao usuário). */
  reasons: Array<'url' | 'time' | 'date' | 'verb' | 'idea' | 'long' | 'file'>;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i;
const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]{1,40})/gu;
const TIME_RE = /\b(?:às\s+|as\s+|at\s+)?([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)\b/i;
const NUM_DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const DAY_RE = /\bdia\s+(\d{1,2})\b/i;

const WEEKDAYS: Array<[RegExp, number]> = [
  [/\bdomingo\b|\bsunday\b/i, 0],
  [/\bsegunda(-feira)?\b|\bmonday\b/i, 1],
  [/\bter[cç]a(-feira)?\b|\btuesday\b/i, 2],
  [/\bquarta(-feira)?\b|\bwednesday\b/i, 3],
  [/\bquinta(-feira)?\b|\bthursday\b/i, 4],
  [/\bsexta(-feira)?\b|\bfriday\b/i, 5],
  [/\bs[áa]bado\b|\bsaturday\b/i, 6],
];

/** Verbos que costumam começar uma tarefa. */
const TASK_VERBS = /^(fazer|estudar|revisar|ler|comprar|ligar|mandar|enviar|terminar|entregar|preparar|treinar|praticar|pagar|marcar|organizar|limpar|escrever|resolver|lembrar|pesquisar|do|study|review|read|buy|call|send|finish|prepare|practice|pay|write|fix)\b/i;

export function extractTags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TAG_RE)) out.push(m[2]!);
  return normalizeTags(out);
}

/** Interpreta datas simples em português e inglês: hoje, amanhã, dia da semana, "dia 12", "12/11". */
export function parseDate(text: string, today: DateKey = todayKey()): DateKey | null {
  const t = normalizeSearch(text);
  if (/\bdepois de amanha\b/.test(t)) return addDays(today, 2);
  if (/\bamanha\b|\btomorrow\b/.test(t)) return addDays(today, 1);
  if (/\bhoje\b|\btoday\b/.test(t)) return today;

  const num = text.match(NUM_DATE_RE);
  if (num) {
    const d = Number(num[1]);
    const m = Number(num[2]);
    let y = num[3] ? Number(num[3]) : Number(today.slice(0, 4));
    if (y < 100) y += 2000;
    let key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (isDateKey(key)) {
      // Sem ano e já passou: é do ano que vem.
      if (!num[3] && key < today) key = `${y + 1}${key.slice(4)}`;
      return isDateKey(key) ? key : null;
    }
  }

  const day = text.match(DAY_RE);
  if (day) {
    const d = Number(day[1]);
    let y = Number(today.slice(0, 4));
    let m = Number(today.slice(5, 7));
    if (d < Number(today.slice(8, 10))) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (isDateKey(key)) return key;
  }

  for (const [re, wd] of WEEKDAYS) {
    if (re.test(text)) {
      const diff = (wd - weekday(today) + 7) % 7 || 7;
      return addDays(today, diff);
    }
  }
  return null;
}

export function parseTime(text: string): string | null {
  const m = text.match(TIME_RE);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? m[3] ?? 0);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Título limpo: sem tags, sem link e sem o prefixo "ideia:". */
export function cleanTitle(text: string): string {
  return text
    .replace(URL_RE, '')
    .replace(TAG_RE, ' ')
    .replace(/^\s*(ideia|idea|nota|note)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function suggest(item: Pick<InboxItem, 'kind' | 'text' | 'url'>, today: DateKey = todayKey()): Suggestion {
  const text = item.text ?? '';
  const url = item.url ?? text.match(URL_RE)?.[0] ?? null;
  const tags = extractTags(text);
  const date = parseDate(text, today);
  const time = parseTime(text);
  const title = cleanTitle(text) || (url ?? '');
  const reasons: Suggestion['reasons'] = [];

  if (item.kind === 'image' || item.kind === 'file' || item.kind === 'audio') {
    reasons.push('file');
    return { type: 'note', title, date, time, tags, url, reasons };
  }
  if (/^\s*(ideia|idea)\s*:/i.test(text)) {
    reasons.push('idea');
    return { type: 'idea', title, date, time, tags, url, reasons };
  }
  if (date && time) {
    reasons.push('date', 'time');
    return { type: 'event', title, date, time, tags, url, reasons };
  }
  if (url && cleanTitle(text).length < 3) {
    reasons.push('url');
    return { type: 'link', title, date, time, tags, url, reasons };
  }
  if (TASK_VERBS.test(cleanTitle(text)) || date) {
    if (TASK_VERBS.test(cleanTitle(text))) reasons.push('verb');
    if (date) reasons.push('date');
    return { type: 'task', title, date, time, tags, url, reasons };
  }
  if (text.length > 140 || text.includes('\n')) {
    reasons.push('long');
    return { type: 'note', title: title.split('\n')[0]!.slice(0, 120), date, time, tags, url, reasons };
  }
  return { type: 'task', title, date, time, tags, url, reasons };
}

/* ---------- Duplicados ---------- */

function words(s: string): Set<string> {
  return new Set(
    normalizeSearch(s)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Semelhança entre 0 e 1 (palavras em comum sobre o total). */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return normalizeSearch(a).trim() === normalizeSearch(b).trim() ? 1 : 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / new Set([...wa, ...wb]).size;
}

export interface DuplicateCandidate {
  ref: EntityRef;
  title: string;
  score: number;
}

/** Registros parecidos (mesmo título ou quase), para avisar antes de criar outro. */
export function findDuplicates(title: string, candidates: Array<{ ref: EntityRef; title: string }>, threshold = 0.75): DuplicateCandidate[] {
  if (!title.trim()) return [];
  return candidates
    .map((c) => ({ ...c, score: similarity(title, c.title) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) return `size:${blob.size}:${blob.type}`;
  const buf = await blob.arrayBuffer();
  const digest = await subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
