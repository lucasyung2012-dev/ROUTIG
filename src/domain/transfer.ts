/**
 * Importação e exportação em formatos que outros apps entendem (Etapa 5 e
 * Parte 27: "importação de arquivos compatíveis"). Tudo aqui é puro: recebe
 * os registros e devolve texto, ou recebe texto e devolve linhas para prévia.
 */
import { addDays, type DateKey } from './dates';
import { fromMinutes, toMinutes, type CalendarEvent } from './events';
import { blocksToText, textToBlocks, type Block } from './notes';
import type { Recurrence } from './tasks';

/* ---------- CSV ---------- */

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV com BOM (o Excel e o Numbers abrem com acentos certos). */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Lê CSV com vírgula, ponto e vírgula ou tab (detecta pela primeira linha), com aspas. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** "dd/mm/aaaa", "dd/mm/aa", "aaaa-mm-dd" → DateKey. */
export function parseDateCell(s: string): DateKey | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  const mo = Number(m[2]);
  const d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/* ---------- Calendário (.ics) ---------- */

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (d: DateKey) => d.replace(/-/g, '');
const icsDateTime = (d: DateKey, time: string) => `${icsDate(d)}T${time.replace(':', '')}00`;
const WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Linhas de mais de 75 caracteres são "dobradas" (RFC 5545). */
function foldLine(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

function rrule(r: Recurrence): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly' && r.weekdays.length) parts.push(`BYDAY=${r.weekdays.map((d) => WEEKDAY[d]).join(',')}`);
  if (r.until) parts.push(`UNTIL=${icsDate(r.until)}`);
  return parts.join(';');
}

function vevent(lines: string[], e: { uid: string; title: string; description: string; location: string; allDay: boolean; start: DateKey; endDate: DateKey; startTime: string | null; durationMin: number }, stamp: string, extra: string[] = []) {
  lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${icsText(e.title)}`);
  if (e.allDay || !e.startTime) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.endDate, 1))}`);
  } else {
    const end = toMinutes(e.startTime) + e.durationMin;
    const endDay = addDays(e.start, Math.floor(end / 1440));
    lines.push(`DTSTART:${icsDateTime(e.start, e.startTime)}`, `DTEND:${icsDateTime(endDay, fromMinutes(end % 1440))}`);
  }
  if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
  lines.push(...extra, 'END:VEVENT');
}

/**
 * Eventos → .ics. Horários vão sem fuso ("hora local"), como no ROUTIG.
 * Repetições viram RRULE; exceções e pausas viram EXDATE; ocorrências
 * editadas saem como evento separado.
 */
export function eventsToIcs(events: CalendarEvent[], now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ROUTIG//PT', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    const extra: string[] = [];
    const skip = new Set<DateKey>();
    if (e.recurrence) {
      extra.push(`RRULE:${rrule(e.recurrence)}`);
      e.recurrence.exceptions.forEach((d) => skip.add(d));
      for (const p of e.recurrence.pauses) for (let d = p.from; d <= p.to; d = addDays(d, 1)) skip.add(d);
      Object.keys(e.overrides).forEach((d) => skip.add(d));
      const exd = [...skip].sort().map((d) => (e.allDay || !e.startTime ? `EXDATE;VALUE=DATE:${icsDate(d)}` : `EXDATE:${icsDateTime(d, e.startTime)}`));
      extra.push(...exd);
    }
    vevent(lines, { uid: `${e.id}@routig`, title: e.title, description: e.description, location: e.location, allDay: e.allDay, start: e.start, endDate: e.endDate, startTime: e.startTime, durationMin: e.durationMin }, stamp, extra);
    if (e.recurrence) {
      for (const [date, o] of Object.entries(e.overrides)) {
        const day = o.date ?? date;
        vevent(
          lines,
          {
            uid: `${e.id}-${date}@routig`,
            title: o.title ?? e.title,
            description: o.description ?? e.description,
            location: o.location ?? e.location,
            allDay: e.allDay,
            start: day,
            endDate: day,
            startTime: o.startTime === undefined ? e.startTime : o.startTime,
            durationMin: o.durationMin ?? e.durationMin,
          },
          stamp,
        );
      }
    }
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

export interface IcsEventRow {
  key: string;
  title: string;
  allDay: boolean;
  start: DateKey;
  endDate: DateKey;
  startTime: string | null;
  durationMin: number;
  location: string;
  description: string;
  recurrence: Recurrence | null;
  /** Quando a repetição tem algo que o ROUTIG não guarda (ex.: COUNT, BYMONTHDAY). */
  recurrenceNote: boolean;
  duplicate: boolean;
}

const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** Data e hora de DTSTART/DTEND. Em UTC ("Z") vira hora local; com TZID, fica a hora escrita. */
function icsMoment(value: string, params: string): { date: DateKey; time: string | null } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  if (!m[4] || /VALUE=DATE(?!-)/.test(params)) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null };
  if (m[7]) {
    const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!));
    const p = (n: number) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

function parseRrule(v: string): { recurrence: Recurrence | null; note: boolean } {
  const kv = Object.fromEntries(v.split(';').map((p) => p.split('=') as [string, string]));
  const FREQS: Record<string, Recurrence['freq']> = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' };
  const freq = FREQS[kv.FREQ ?? ''];
  if (!freq) return { recurrence: null, note: true };
  const until = kv.UNTIL ? icsMoment(kv.UNTIL, '')?.date ?? null : null;
  const weekdays = kv.BYDAY ? kv.BYDAY.split(',').map((d) => WEEKDAY.indexOf(d.slice(-2))).filter((d) => d >= 0) : [];
  const known = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'WKST']);
  const note = Object.keys(kv).some((k) => !known.has(k)) || (!!kv.BYDAY && freq !== 'weekly');
  return { recurrence: { freq, interval: Math.max(1, Math.min(365, Number(kv.INTERVAL) || 1)), weekdays: freq === 'weekly' ? weekdays : [], pauses: [], exceptions: [], until }, note };
}

/** .ics → eventos para prévia. Linhas "dobradas" são juntadas. */
export function parseIcsEvents(text: string): IcsEventRow[] {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const rows: IcsEventRow[] = [];
  let n = 0;
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0] ?? '';
    const prop = (key: string) => {
      const m = new RegExp(`^${key}((?:;[^:\\r\\n]*)?):(.*)$`, 'm').exec(body);
      return m ? { params: m[1] ?? '', value: (m[2] ?? '').trim() } : null;
    };
    const summary = unescape(prop('SUMMARY')?.value ?? '').trim();
    const ds = prop('DTSTART');
    const start = ds && icsMoment(ds.value, ds.params);
    if (!summary || !start) continue;
    const de = prop('DTEND');
    const end = de && icsMoment(de.value, de.params);
    const allDay = start.time === null;
    let endDate = start.date;
    let durationMin = 60;
    if (allDay) {
      // No .ics, o DTEND de dia inteiro é o dia seguinte ao último.
      if (end && end.date > start.date) endDate = addDays(end.date, -1);
    } else if (end?.time) {
      const days = Math.round((Date.parse(`${end.date}T12:00`) - Date.parse(`${start.date}T12:00`)) / 86_400_000);
      durationMin = Math.min(24 * 60, Math.max(5, days * 1440 + toMinutes(end.time) - toMinutes(start.time!)));
    } else {
      const dur = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?)$/.exec(prop('DURATION')?.value ?? '');
      if (dur) durationMin = Math.min(24 * 60, Math.max(5, Number(dur[1] ?? 0) * 60 + Number(dur[2] ?? 0)));
    }
    const rr = prop('RRULE');
    const parsed = rr ? parseRrule(rr.value) : { recurrence: null, note: false };
    rows.push({
      key: `ics${n++}`,
      title: summary.slice(0, 300),
      allDay,
      start: start.date,
      endDate,
      startTime: start.time,
      durationMin,
      location: unescape(prop('LOCATION')?.value ?? '').slice(0, 300),
      description: unescape(prop('DESCRIPTION')?.value ?? '').slice(0, 20_000),
      recurrence: parsed.recurrence,
      recurrenceNote: parsed.note,
      duplicate: false,
    });
  }
  return rows;
}

/* ---------- Tarefas ---------- */

export interface TaskImportRow {
  key: string;
  title: string;
  dueDate: DateKey | null;
  dueTime: string | null;
  notes: string;
  tags: string[];
  /** Linha marcada como feita no arquivo ("[x]" ou coluna de status). */
  done: boolean;
  duplicate: boolean;
}

const HEADERS = {
  title: ['titulo', 'title', 'tarefa', 'task', 'nome', 'name', 'subject', 'assunto'],
  due: ['prazo', 'due', 'due date', 'data', 'date', 'vencimento'],
  time: ['horario', 'hora', 'time', 'due time'],
  notes: ['descricao', 'description', 'notas', 'notes', 'observacoes', 'obs'],
  tags: ['tags', 'etiquetas', 'labels'],
  done: ['concluida', 'done', 'completed', 'status', 'feita'],
};

/**
 * Tarefas de uma lista (uma por linha, com ou sem "- ", "1.", "[ ]") ou de um
 * CSV com cabeçalho (Título, Prazo, Horário, Descrição, Tags, Concluída).
 */
export function parseTasks(text: string, fileName = ''): TaskImportRow[] {
  const csv = /\.(csv|tsv)$/i.test(fileName) ? parseCsv(text) : null;
  const rows: TaskImportRow[] = [];
  if (csv && csv.length) {
    const head = csv[0]!.map(fold);
    const col = (names: string[]) => head.findIndex((h) => names.includes(h));
    const ti = col(HEADERS.title);
    const idx = { title: ti >= 0 ? ti : 0, due: col(HEADERS.due), time: col(HEADERS.time), notes: col(HEADERS.notes), tags: col(HEADERS.tags), done: col(HEADERS.done) };
    const body = ti >= 0 ? csv.slice(1) : csv;
    body.forEach((r, i) => {
      const title = (r[idx.title] ?? '').trim();
      if (!title) return;
      const cell = (k: keyof typeof idx) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
      const time = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(cell('time'));
      const doneCell = fold(cell('done'));
      rows.push({
        key: `t${i}`,
        title: title.slice(0, 300),
        dueDate: parseDateCell(cell('due')),
        dueTime: time ? `${time[1]!.padStart(2, '0')}:${time[2]}` : null,
        notes: cell('notes').slice(0, 20_000),
        tags: cell('tags')
          .split(/[,;#]/)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 30),
        done: ['sim', 'yes', 'x', 'true', '1', 'concluida', 'done', 'completed', 'feita'].includes(doneCell),
        duplicate: false,
      });
    });
    return rows;
  }
  text.split(/\r?\n/).forEach((raw, i) => {
    const m = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(?:\[( |x|X)\]\s*)?(.*)$/.exec(raw);
    const title = (m?.[2] ?? '').trim();
    if (!title) return;
    rows.push({ key: `t${i}`, title: title.slice(0, 300), dueDate: null, dueTime: null, notes: '', tags: [], done: (m?.[1] ?? ' ').toLowerCase() === 'x', duplicate: false });
  });
  return rows;
}

/* ---------- Notas (Markdown) ---------- */

/** Blocos → Markdown. O que não é texto vira uma linha que diz o que era. */
export function blocksToMarkdown(blocks: Block[], labels: { image: string; file: string; drawing: string }): string {
  const out: string[] = [];
  let n = 0;
  for (const b of blocks) {
    if (b.type !== 'numbered') n = 0;
    switch (b.type) {
      case 'todo':
        out.push(`- [${b.checked ? 'x' : ' '}] ${b.text}`);
        break;
      case 'numbered':
        out.push(`${++n}. ${b.text}`);
        break;
      case 'table':
        if (b.rows.length) {
          const cols = Math.max(...b.rows.map((r) => r.length));
          const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => (r[i] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
          out.push(line(b.rows[0]!), `| ${Array(cols).fill('---').join(' | ')} |`, ...b.rows.slice(1).map(line));
        }
        break;
      case 'image':
        out.push(`*[${labels.image}${b.caption ? `: ${b.caption}` : ''}]*`);
        break;
      case 'file':
        out.push(`*[${labels.file}: ${b.name}]*`);
        break;
      case 'link':
        out.push(`[${b.title || b.url}](${b.url})`);
        break;
      case 'drawing':
        out.push(`*[${labels.drawing}]*`);
        break;
      default:
        out.push(blocksToText([b]).text);
    }
  }
  return out.join('\n');
}

export interface NoteImportRow {
  key: string;
  title: string;
  blocks: Block[];
  preview: string;
  duplicate: boolean;
}

/** Um arquivo .md ou .txt → uma nota. O título é o primeiro "# " ou o nome do arquivo. */
export function parseNoteFile(text: string, fileName: string, key: string): NoteImportRow {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const h = lines.findIndex((l) => /^#\s+\S/.test(l));
  const firstText = lines.findIndex((l) => l.trim() !== '');
  let title = fileName.replace(/\.(md|markdown|txt)$/i, '');
  let body = lines;
  if (h >= 0 && h === firstText) {
    title = lines[h]!.replace(/^#\s+/, '').trim();
    body = lines.slice(h + 1);
  }
  // "- [ ]" do Markdown vira o "[ ]" que o ROUTIG entende.
  const text2 = body.map((l) => l.replace(/^(\s*)[-*]\s+\[( |x|X)\]/, '$1[$2]')).join('\n').replace(/^\n+/, '');
  const blocks = textToBlocks(text2);
  return { key, title: title.slice(0, 300), blocks, preview: text2.slice(0, 140), duplicate: false };
}
