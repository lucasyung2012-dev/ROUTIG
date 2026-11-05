import type { DateKey } from './dates';

/* ---------- Busca global (Parte 4.3) ---------- */

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Todas as palavras da busca aparecem em algum dos campos (sem acento, sem maiúsculas). */
export function matchesAll(query: string, ...fields: Array<string | null | undefined>): boolean {
  const words = normalizeText(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const hay = normalizeText(fields.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}

/** Grupos de resultado: de onde veio (o módulo). */
export const SEARCH_GROUPS = ['projects', 'tasks', 'events', 'notes', 'goals', 'habits', 'academy', 'languages', 'music', 'sports', 'focus', 'library', 'inbox', 'finance', 'modules', 'settings'] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

/** Módulos que podem sair da busca pela privacidade (Parte 26.1). Finanças começa de fora (Parte 26.5). */
export const SEARCHABLE_MODULES = ['tasks', 'events', 'notes', 'projects', 'goals', 'habits', 'academy', 'languages', 'music', 'sports', 'focus', 'library', 'inbox', 'finance'] as const;
export type SearchableModule = (typeof SEARCHABLE_MODULES)[number];
export const DEFAULT_SEARCH_HIDDEN: SearchableModule[] = ['finance'];

export interface SearchHit {
  key: string;
  group: SearchGroup;
  /** Tipo do registro dentro do módulo (chave de tradução em search.types). */
  type: string;
  label: string;
  /** Data do registro, quando houver (Parte 4.3: origem, tipo e data). */
  date: DateKey | null;
  /** Um trecho do texto que bateu, para mostrar onde achou. */
  snippet: string;
  path: string;
}

/** Trecho em volta da primeira palavra encontrada, para mostrar por que o resultado apareceu. */
export function snippetFor(query: string, text: string, size = 70): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const words = normalizeText(query.trim()).split(/\s+/).filter(Boolean);
  const norm = normalizeText(clean);
  const at = Math.min(...words.map((w) => norm.indexOf(w)).filter((i) => i >= 0), Number.MAX_SAFE_INTEGER);
  if (at === Number.MAX_SAFE_INTEGER) return clean.slice(0, size);
  const start = Math.max(0, at - Math.floor(size / 3));
  return `${start > 0 ? '…' : ''}${clean.slice(start, start + size)}${start + size < clean.length ? '…' : ''}`;
}

/** Ordena: título que começa com a busca primeiro, depois título que contém, depois o resto; mais recente antes. */
export function rankHits(query: string, hits: SearchHit[]): SearchHit[] {
  const q = normalizeText(query.trim());
  const score = (h: SearchHit) => {
    const l = normalizeText(h.label);
    return l.startsWith(q) ? 0 : l.includes(q) ? 1 : 2;
  };
  return [...hits].sort((a, b) => score(a) - score(b) || (b.date ?? '').localeCompare(a.date ?? ''));
}
