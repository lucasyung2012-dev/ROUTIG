import type { BaseEntity, EntityRef } from './entity';
import { newId } from './ids';
import { normalizeSearch } from './tasks';

/* ---------- Blocos ---------- */

export interface Stroke {
  /** Pontos [x, y, pressão] no quadro de 1000 de largura. */
  points: Array<[number, number, number]>;
  color: string;
  width: number;
}

export type Block =
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'heading'; level: 1 | 2 | 3; text: string }
  | { id: string; type: 'bullet'; text: string }
  | { id: string; type: 'numbered'; text: string }
  | { id: string; type: 'todo'; text: string; checked: boolean }
  | { id: string; type: 'quote'; text: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'table'; rows: string[][] }
  | { id: string; type: 'image'; fileId: string; caption: string }
  | { id: string; type: 'file'; fileId: string; name: string; size: number }
  | { id: string; type: 'link'; url: string; title: string }
  | { id: string; type: 'drawing'; strokes: Stroke[]; height: number };

export type BlockType = Block['type'];

/** Blocos com texto editável numa linha (o modo rápido vira estes). */
export type TextBlock = Extract<Block, { text: string }>;

export function isTextBlock(b: Block): b is TextBlock {
  return 'text' in b;
}

export function newBlock(type: BlockType): Block {
  const id = newId('blk');
  switch (type) {
    case 'paragraph':
    case 'bullet':
    case 'numbered':
    case 'quote':
      return { id, type, text: '' };
    case 'heading':
      return { id, type, level: 2, text: '' };
    case 'todo':
      return { id, type, text: '', checked: false };
    case 'divider':
      return { id, type };
    case 'table':
      return { id, type, rows: [['', ''], ['', '']] };
    case 'image':
      return { id, type, fileId: '', caption: '' };
    case 'file':
      return { id, type, fileId: '', name: '', size: 0 };
    case 'link':
      return { id, type, url: '', title: '' };
    case 'drawing':
      return { id, type, strokes: [], height: 420 };
  }
}

/* ---------- Nota ---------- */

export type NoteMode = 'quick' | 'blocks';

export interface Note extends BaseEntity {
  title: string;
  mode: NoteMode;
  blocks: Block[];
  notebookId: string | null;
  collectionIds: string[];
  category: string;
  tags: string[];
  favorite: boolean;
  /** Ligações com registros de outros módulos (a nota continua sendo um registro só). */
  links: EntityRef[];
}

export interface Notebook {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: string;
}

export interface NoteCollection {
  id: string;
  name: string;
  createdAt: string;
}

export interface NoteVersion {
  id: string;
  noteId: string;
  at: string;
  title: string;
  blocks: Block[];
}

export interface NoteTemplate {
  id: string;
  name: string;
  builtin: boolean;
  title: string;
  blocks: Block[];
}

/* ---------- Modo rápido ⇄ blocos ---------- */

/**
 * Texto do modo rápido → blocos. Entende "# título", "- item", "1. item",
 * "[ ] tarefa", "[x] feita", "> citação" e "---".
 */
export function textToBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const id = newId('blk');
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) out.push({ id, type: 'heading', level: m[1]!.length as 1 | 2 | 3, text: m[2]! });
    else if ((m = line.match(/^\s*\[( |x|X)\]\s+(.*)$/))) out.push({ id, type: 'todo', checked: m[1]!.toLowerCase() === 'x', text: m[2]! });
    else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) out.push({ id, type: 'bullet', text: m[1]! });
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) out.push({ id, type: 'numbered', text: m[1]! });
    else if ((m = line.match(/^>\s?(.*)$/))) out.push({ id, type: 'quote', text: m[1]! });
    else if (/^\s*(-{3,}|_{3,})\s*$/.test(line)) out.push({ id, type: 'divider' });
    else out.push({ id, type: 'paragraph', text: line });
  }
  // Remove parágrafos vazios no fim.
  while (out.length > 1 && out[out.length - 1]!.type === 'paragraph' && (out[out.length - 1] as TextBlock).text === '') out.pop();
  return out;
}

/** Blocos de texto → texto do modo rápido. Blocos que não são texto ficam separados (imagens, tabelas…). */
export function blocksToText(blocks: Block[]): { text: string; rest: Block[] } {
  const lines: string[] = [];
  const rest: Block[] = [];
  let n = 0;
  for (const b of blocks) {
    if (b.type !== 'numbered') n = 0;
    switch (b.type) {
      case 'paragraph':
        lines.push(b.text);
        break;
      case 'heading':
        lines.push(`${'#'.repeat(b.level)} ${b.text}`);
        break;
      case 'bullet':
        lines.push(`- ${b.text}`);
        break;
      case 'numbered':
        lines.push(`${++n}. ${b.text}`);
        break;
      case 'todo':
        lines.push(`[${b.checked ? 'x' : ' '}] ${b.text}`);
        break;
      case 'quote':
        lines.push(`> ${b.text}`);
        break;
      case 'divider':
        lines.push('---');
        break;
      default:
        rest.push(b);
    }
  }
  return { text: lines.join('\n'), rest };
}

/** Texto puro da nota, para busca e prévia. */
export function noteText(note: Pick<Note, 'title' | 'blocks'>): string {
  const parts: string[] = [note.title];
  for (const b of note.blocks) {
    if (isTextBlock(b)) parts.push(b.text);
    else if (b.type === 'table') parts.push(b.rows.flat().join(' '));
    else if (b.type === 'image') parts.push(b.caption);
    else if (b.type === 'file') parts.push(b.name);
    else if (b.type === 'link') parts.push(`${b.title} ${b.url}`);
  }
  return parts.filter(Boolean).join('\n');
}

export function notePreview(note: Pick<Note, 'title' | 'blocks'>, max = 140): string {
  const text = note.blocks
    .filter(isTextBlock)
    .map((b) => b.text)
    .filter(Boolean)
    .join(' · ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function matchesNote(note: Note, query: string): boolean {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  const hay = normalizeSearch(`${noteText(note)} ${note.tags.join(' ')} ${note.category}`);
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/* ---------- Modelos de fábrica (Parte 17.2) ---------- */

const tb = (type: 'paragraph' | 'bullet' | 'todo' | 'numbered', text = ''): Block =>
  type === 'todo' ? { id: newId('blk'), type, text, checked: false } : { id: newId('blk'), type, text };
const h = (text: string, level: 1 | 2 | 3 = 2): Block => ({ id: newId('blk'), type: 'heading', level, text });

/** Modelos prontos. Os textos vêm traduzidos de fora (`labels`) para seguir o idioma do app. */
export function builtinTemplates(labels: Record<string, string>): NoteTemplate[] {
  const L = (k: string) => labels[k] ?? k;
  return [
    {
      id: 'tpl_class',
      name: L('class'),
      builtin: true,
      title: L('class'),
      blocks: [h(L('topic')), tb('paragraph'), h(L('mainIdeas')), tb('bullet'), h(L('doubts')), tb('bullet'), h(L('homework')), tb('todo')],
    },
    {
      id: 'tpl_chapter',
      name: L('chapter'),
      builtin: true,
      title: L('chapter'),
      blocks: [h(L('summary')), tb('paragraph'), h(L('keyConcepts')), tb('bullet'), h(L('reviewQuestions')), tb('numbered')],
    },
    {
      id: 'tpl_meeting',
      name: L('meeting'),
      builtin: true,
      title: L('meeting'),
      blocks: [h(L('participants')), tb('bullet'), h(L('decisions')), tb('bullet'), h(L('nextSteps')), tb('todo')],
    },
    {
      id: 'tpl_journal',
      name: L('journal'),
      builtin: true,
      title: L('journal'),
      blocks: [h(L('highlights')), tb('bullet'), h(L('learned')), tb('paragraph'), h(L('tomorrow')), tb('todo')],
    },
  ];
}

/** Copia blocos com ids novos (para criar nota a partir de modelo ou versão). */
export function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...structuredCloneSafe(b), id: newId('blk') }));
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/* ---------- Desenho ---------- */

/** Caminho SVG suave de um traço (curvas entre pontos médios). */
export function strokePath(points: Stroke['points']): string {
  if (points.length === 0) return '';
  const [x0, y0] = points[0]!;
  if (points.length === 1) return `M${x0} ${y0} L${x0 + 0.1} ${y0 + 0.1}`;
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;
    d += ` Q${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
  }
  const [xl, yl] = points[points.length - 1]!;
  return `${d} L${xl} ${yl}`;
}

/** Espessura do traço pela pressão média da caneta (Apple Pencil); mouse e dedo usam pressão 0,5. */
export function strokeWidth(s: Stroke): number {
  if (s.points.length === 0) return s.width;
  const avg = s.points.reduce((a, p) => a + p[2], 0) / s.points.length;
  return Math.max(0.6, s.width * (0.4 + avg * 1.2));
}

/** Mantém no máximo `max` versões por nota (as mais novas). */
export function versionsToPrune(versions: NoteVersion[], max = 50): string[] {
  return [...versions]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(max)
    .map((v) => v.id);
}
