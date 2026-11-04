/**
 * Importação acadêmica (Parte 9.14): transforma texto colado, CSV ou calendário
 * (.ics) em sugestões de registros. Nada é criado aqui: a tela mostra a prévia
 * e só cria o que o usuário confirmar.
 */

import type { DateKey } from './dates';
import type { AssessmentType, ContentKind } from './academy';

export type ImportKind = 'assessment' | 'content' | 'lesson' | 'ignore';

export interface ImportRow {
  id: string;
  /** Linha original, para o usuário conferir. */
  source: string;
  kind: ImportKind;
  title: string;
  subjectId: string | null;
  date: DateKey | null;
  time: string | null;
  assessmentType: AssessmentType;
  contentKind: ContentKind;
  /** Nível na árvore de conteúdos (0 = raiz), pelo recuo ou pela palavra (Unidade, Capítulo…). */
  depth: number;
  score: number | null;
  maxScore: number | null;
  /** Possível duplicação de algo que já existe (preenchido pela tela). */
  duplicate: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Sem acentos e em minúsculas, para comparar ("Matemática" = "matematica"). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): DateKey | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null; // 31/02 não existe
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Acha uma data no texto: 2026-11-12, 12/11/2026, 12/11/26, 12/11, 12-11,
 * "12 de novembro (de 2026)" ou "12 nov". Sem ano, usa `year`.
 */
export function findDate(text: string, year: number): { date: DateKey; match: string } | null {
  const t = fold(text);
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) {
    const d = validDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) return { date: d, match: m[0] };
  }
  // Sem número, vírgula ou ponto logo antes: "8,5/10" é nota, não 5 de outubro.
  m = /(?<![\d.,/])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(t);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    const d = validDate(y, Number(m[2]), Number(m[1]));
    if (d) return { date: d, match: m[0] };
  }
  // Por extenso: procura em todo o texto ("3 aulas… 12 de novembro" acha o 12 de novembro).
  for (const x of t.matchAll(/\b(\d{1,2})º?\s*(?:de\s+)?([a-z]{3,9})\.?(?:\s+(?:de\s+)?(\d{4}))?/g)) {
    const month = MONTHS[x[2]!];
    if (!month) continue;
    const d = validDate(x[3] ? Number(x[3]) : year, month, Number(x[1]));
    if (d) return { date: d, match: x[0] };
  }
  return null;
}

/** Horário "14h", "14h30", "14:30". */
export function findTime(text: string): string | null {
  const m = /\b([01]?\d|2[0-3])(?:h|:)([0-5]\d)?\b/.exec(fold(text));
  return m ? `${pad(Number(m[1]))}:${m[2] ?? '00'}` : null;
}

/** Nota "8,5/10", "8.5 de 10" ou "nota 7". */
export function findScore(text: string): { score: number; max: number | null } | null {
  // Chamada sempre sem a data (a tela tira a data antes), para "05/11" não virar nota 5 de 11.
  const t = fold(text);
  const num = (v: string) => Number(v.replace(',', '.'));
  const m = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:\/|\sde\s)\s*(\d{1,3}(?:[.,]\d{1,2})?)/.exec(t);
  if (m) {
    const score = num(m[1]!);
    const max = num(m[2]!);
    if (max > 0 && score <= max) return { score, max };
  }
  const n = /\bnota\s*:?\s*(\d{1,3}(?:[.,]\d{1,2})?)/.exec(t);
  return n ? { score: num(n[1]!), max: null } : null;
}

const ASSESSMENT_WORDS: [RegExp, AssessmentType][] = [
  [/\b(prova|pu|pp|po|exame|avaliacao|av\d?|p\d)\b/, 'test'],
  [/\b(teste|quiz|minitest[e]?)\b/, 'quiz'],
  [/\b(trabalho|entrega|projeto|redacao|relatorio)\b/, 'assignment'],
  [/\b(apresentacao|seminario)\b/, 'presentation'],
  [/\b(simulado|atividade|lista|exercicios?|ac)\b/, 'activity'],
];

export function detectAssessmentType(text: string): AssessmentType | null {
  const t = fold(text);
  for (const [re, type] of ASSESSMENT_WORDS) if (re.test(t)) return type;
  return null;
}

const CONTENT_WORDS: [RegExp, ContentKind][] = [
  [/^(unidade|modulo|bloco|parte)\b/, 'unit'],
  [/^(capitulo|cap\.?)\b/, 'chapter'],
  [/^(tema|topico)\b/, 'topic'],
  [/^(subtema|subtopico)\b/, 'subtopic'],
];

/** Disciplina citada na linha (pelo nome, sem acento; o nome mais longo ganha). */
export function matchSubject(text: string, subjects: { id: string; name: string }[]): string | null {
  const t = fold(text);
  const hits = subjects.filter((s) => {
    const n = fold(s.name).trim();
    return n.length >= 3 && new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t);
  });
  hits.sort((a, b) => b.name.length - a.name.length);
  return hits[0]?.id ?? null;
}

let seq = 0;
const rowId = () => `imp${++seq}`;

/** Lê texto colado (ou CSV) linha por linha. */
export function parseText(text: string, opts: { year: number; subjects: { id: string; name: string }[]; defaultSubjectId: string | null }): ImportRow[] {
  const rows: ImportRow[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  for (const raw of lines) {
    if (!raw.trim()) continue;
    // CSV com ; ou tab: junta as colunas com espaço (o leitor procura data, tipo e disciplina em qualquer lugar).
    const line = raw.includes(';') || raw.includes('\t') ? raw.split(/[;\t]/).map((c) => c.trim()).filter(Boolean).join(' · ') : raw;
    const indent = (/^\s*/.exec(raw)?.[0] ?? '').replace(/\t/g, '    ').length;
    const bullet = /^\s*(?:[-•*–]|\d+[.)]|[a-z][.)])\s+/i.exec(raw);
    const plain = line.replace(/^\s*(?:[-•*–]|\d+[.)]|[a-z][.)])\s+/i, '').trim();
    const found = findDate(plain, opts.year);
    const type = detectAssessmentType(plain);
    const subjectId = matchSubject(plain, opts.subjects) ?? opts.defaultSubjectId;
    const score = findScore(found ? fold(plain).replace(found.match, ' ') : plain);
    const isLesson = /^aula\b/.test(fold(plain)) && !!found;
    const contentWord = CONTENT_WORDS.find(([re]) => re.test(fold(plain)));
    const base: ImportRow = {
      id: rowId(),
      source: raw.trim(),
      kind: 'ignore',
      title: plain,
      subjectId,
      date: found?.date ?? null,
      time: findTime(found ? fold(plain).replace(found.match, ' ') : plain),
      assessmentType: type ?? 'test',
      contentKind: 'topic',
      depth: 0,
      score: score?.score ?? null,
      maxScore: score?.max ?? null,
      duplicate: false,
    };
    if (isLesson) rows.push({ ...base, kind: 'lesson', title: cleanTitle(plain, found?.match) || plain });
    else if (type && (found || score)) rows.push({ ...base, kind: 'assessment', title: cleanTitle(plain, found?.match) || plain });
    else if (contentWord || bullet || indent > 0) {
      const kind = contentWord?.[1] ?? 'topic';
      rows.push({ ...base, kind: 'content', contentKind: kind, depth: contentWord ? ['unit', 'chapter', 'topic', 'subtopic'].indexOf(kind) : Math.min(4, Math.floor(indent / 2)), date: null, time: null });
    } else rows.push(base);
  }
  return normalizeDepths(rows);
}

/** Recuo relativo: o primeiro conteúdo é raiz e ninguém pula mais de um nível. */
function normalizeDepths(rows: ImportRow[]): ImportRow[] {
  let prev = -1;
  return rows.map((r) => {
    if (r.kind !== 'content') return r;
    const depth = Math.max(0, Math.min(r.depth, prev + 1));
    prev = depth;
    return { ...r, depth };
  });
}

/** Tira a data e separadores do título ("PU de frações - 12/11" → "PU de frações"). */
function cleanTitle(text: string, dateMatch?: string): string {
  let t = text;
  if (dateMatch) {
    const i = fold(t).indexOf(dateMatch);
    if (i >= 0) t = t.slice(0, i) + t.slice(i + dateMatch.length);
  }
  return t
    .replace(/\b(?:[01]?\d|2[0-3])(?:h(?:[0-5]\d)?|:[0-5]\d)\b/gi, ' ') // horário vai para o campo próprio
    .replace(/\s+(?:as|às)\s*$/i, '')
    .replace(/\b(dia|em|no dia|data)\s*:?\s*$/i, '')
    .replace(/\s*[-–·:|,]+\s*$/g, '')
    .replace(/^\s*[-–·:|,]+\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ---------- Calendário (.ics) ---------- */

/** Lê eventos de um arquivo .ics (SUMMARY e DTSTART). Linhas "dobradas" são juntadas. */
export function parseIcs(text: string, opts: { subjects: { id: string; name: string }[]; defaultSubjectId: string | null }): ImportRow[] {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const rows: ImportRow[] = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0] ?? '';
    const get = (key: string) => new RegExp(`^${key}(?:;[^:\\n]*)?:(.*)$`, 'm').exec(body)?.[1]?.trim() ?? '';
    const summary = get('SUMMARY').replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\;/g, ';');
    const start = get('DTSTART');
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(start);
    if (!summary || !m) continue;
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    const type = detectAssessmentType(summary);
    rows.push({
      id: rowId(),
      source: `${summary} (${date})`,
      kind: type ? 'assessment' : /^aula\b/.test(fold(summary)) ? 'lesson' : 'ignore',
      title: summary,
      subjectId: matchSubject(summary, opts.subjects) ?? opts.defaultSubjectId,
      date,
      time: m[4] ? `${m[4]}:${m[5]}` : null,
      assessmentType: type ?? 'test',
      contentKind: 'topic',
      depth: 0,
      score: null,
      maxScore: null,
      duplicate: false,
    });
  }
  return rows;
}
