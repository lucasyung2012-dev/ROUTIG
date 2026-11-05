import type { BaseEntity, EntityRef } from './entity';
import { newId } from './ids';
import { normalizeSearch } from './tasks';

/* ---------- Blocos ---------- */

export interface Stroke {
  /** Pontos [x, y, pressão] no quadro de 1000 de largura. */
  points: Array<[number, number, number]>;
  color: string;
  width: number;
  /** Forma reconhecida (linha, retângulo…): desenhada com segmentos retos. */
  shape?: ShapeKind;
  /** Marca-texto: largo, translúcido e sem variar com a pressão. */
  highlight?: boolean;
}

export const DRAWING_BACKGROUNDS = ['blank', 'lined', 'grid', 'dots'] as const;
export type DrawingBackground = (typeof DRAWING_BACKGROUNDS)[number];

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
  | { id: string; type: 'drawing'; strokes: Stroke[]; height: number; background?: DrawingBackground; imageFileId?: string | null };

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
      return { id, type, strokes: [], height: 700 };
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
    // O texto depois do marcador é opcional: "- " vazio continua sendo item de lista.
    if ((m = line.match(/^(#{1,3})(?:\s+(.*))?$/))) out.push({ id, type: 'heading', level: m[1]!.length as 1 | 2 | 3, text: m[2] ?? '' });
    else if ((m = line.match(/^\s*\[( |x|X)\](?:\s+(.*))?$/))) out.push({ id, type: 'todo', checked: m[1]!.toLowerCase() === 'x', text: m[2] ?? '' });
    else if ((m = line.match(/^\s*[-*•](?:\s+(.*))?$/)) && !/^\s*-{2,}/.test(line)) out.push({ id, type: 'bullet', text: m[1] ?? '' });
    else if ((m = line.match(/^\s*\d+[.)](?:\s+(.*))?$/))) out.push({ id, type: 'numbered', text: m[1] ?? '' });
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

/** Trecho do modo rápido: texto corrido (vários blocos de texto) ou um bloco que não é texto (imagem, tabela, desenho…). */
export type QuickSegment = { kind: 'text'; blocks: Block[] } | { kind: 'block'; block: Block };

const QUICK_TEXT_TYPES = new Set<BlockType>(['paragraph', 'heading', 'bullet', 'numbered', 'todo', 'quote', 'divider']);

/** Divide a nota em trechos na ordem original, para editar o texto sem mover imagens, tabelas e desenhos. */
export function quickSegments(blocks: Block[]): QuickSegment[] {
  const out: QuickSegment[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (QUICK_TEXT_TYPES.has(b.type)) {
      if (last?.kind === 'text') last.blocks.push(b);
      else out.push({ kind: 'text', blocks: [b] });
    } else out.push({ kind: 'block', block: b });
  }
  return out;
}

export function joinSegments(segments: QuickSegment[]): Block[] {
  return segments.flatMap((s) => (s.kind === 'text' ? s.blocks : [s.block]));
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
  if (s.highlight || s.points.length === 0) return s.width;
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

/* ---------- Formas automáticas (segurar a caneta parada no fim do traço) ---------- */

export type ShapeKind = 'line' | 'arrow' | 'triangle' | 'rectangle' | 'ellipse';
type Pt = [number, number];

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2));
  return dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}

/** Simplificação de Douglas–Peucker: mantém só os "cantos" do traço. */
export function simplify(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points;
  let maxD = 0;
  let idx = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i]!, first, last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= epsilon) return [first, last];
  return [...simplify(points.slice(0, idx + 1), epsilon).slice(0, -1), ...simplify(points.slice(idx), epsilon)];
}

/** Cantos de um traço fechado: simplifica e junta o último canto com o primeiro. */
function cornersOfClosed(points: Pt[], diag: number): Pt[] {
  // Começa no ponto mais distante do início, para o canto inicial não sumir na simplificação.
  const start = points[0]!;
  let far = 0;
  points.forEach((p, i) => {
    if (dist(p, start) > dist(points[far]!, start)) far = i;
  });
  const a = simplify(points.slice(0, far + 1), diag * 0.07);
  const b = simplify(points.slice(far), diag * 0.07);
  const corners = [...a.slice(0, -1), ...b];
  // O fim do traço fechado volta perto do começo: é o mesmo canto.
  if (corners.length > 1 && dist(corners[0]!, corners[corners.length - 1]!) < diag * 0.2) corners.pop();
  // Junta cantos muito próximos.
  return corners.filter((c, i) => i === 0 || dist(c, corners[i - 1]!) > diag * 0.12);
}

/**
 * Reconhece a forma de um traço feito à mão e devolve os pontos da forma "perfeita".
 * Retorna null quando o traço não parece nenhuma forma (fica como desenho livre).
 */
export function recognizeShape(stroke: Stroke): { kind: ShapeKind; points: Stroke['points'] } | null {
  const pts: Pt[] = stroke.points.map(([x, y]) => [x, y]);
  if (pts.length < 4) return null;
  const pressure = stroke.points.reduce((a, p) => a + p[2], 0) / stroke.points.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  const diag = Math.hypot(w, h);
  if (diag < 20) return null;
  const withP = (list: Pt[]): Stroke['points'] => list.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10, pressure]);

  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const closed = dist(first, last) < diag * 0.22;

  if (!closed) {
    // Linha: todos os pontos perto do segmento entre o começo e o fim.
    const maxDev = Math.max(...pts.map((p) => distToSegment(p, first, last)));
    if (maxDev < Math.max(6, dist(first, last) * 0.08)) return { kind: 'line', points: withP([first, last]) };
    return null;
  }

  // Elipse: a distância "normalizada" até o centro fica perto de 1 em todo o contorno.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(w / 2, 1);
  const ry = Math.max(h / 2, 1);
  const radialErr = pts.reduce((a, [x, y]) => a + Math.abs(Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) - 1), 0) / pts.length;

  const corners = cornersOfClosed(pts, diag);
  if (corners.length === 3 && radialErr > 0.08) return { kind: 'triangle', points: withP([...corners, corners[0]!]) };
  if (corners.length === 4 && radialErr > 0.06) {
    // Quase alinhado com a tela: vira retângulo reto; inclinado: mantém os 4 cantos.
    const axisAligned = corners.every((c) => (Math.abs(c[0] - minX) < w * 0.2 || Math.abs(c[0] - maxX) < w * 0.2) && (Math.abs(c[1] - minY) < h * 0.2 || Math.abs(c[1] - maxY) < h * 0.2));
    const rect: Pt[] = axisAligned ? [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]] : corners;
    return { kind: 'rectangle', points: withP([...rect, rect[0]!]) };
  }
  if (radialErr < 0.12) {
    // Quase redondo: vira círculo de verdade.
    const round = Math.abs(rx - ry) / Math.max(rx, ry) < 0.15;
    const r = (rx + ry) / 2;
    const ell: Pt[] = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return [cx + (round ? r : rx) * Math.cos(a), cy + (round ? r : ry) * Math.sin(a)];
    });
    return { kind: 'ellipse', points: withP(ell) };
  }
  return null;
}

/** Traço de forma: segmentos retos, sem a suavização do traço livre. */
export function polylinePath(points: Stroke['points']): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}

/* ---------- Formas por arrastar, laço e mover ---------- */

export type DragShape = 'line' | 'arrow' | 'rectangle' | 'ellipse';

/** Pontos de uma forma desenhada arrastando do ponto `a` ao ponto `b`. */
export function dragShapePoints(kind: DragShape, a: Pt, b: Pt, pressure = 0.5): Stroke['points'] {
  const r = (v: number) => Math.round(v * 10) / 10;
  const out = (list: Pt[]): Stroke['points'] => list.map(([x, y]) => [r(x), r(y), pressure]);
  switch (kind) {
    case 'line':
      return out([a, b]);
    case 'arrow': {
      // A ponta: duas "asas" de 30° saindo do fim, com tamanho proporcional (entre 14 e 40).
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const len = Math.min(40, Math.max(14, dist(a, b) * 0.25));
      const wing = (d: number): Pt => [b[0] - len * Math.cos(ang + d), b[1] - len * Math.sin(ang + d)];
      return out([a, b, wing(Math.PI / 6), b, wing(-Math.PI / 6)]);
    }
    case 'rectangle':
      return out([a, [b[0], a[1]], b, [a[0], b[1]], a]);
    case 'ellipse': {
      const cx = (a[0] + b[0]) / 2;
      const cy = (a[1] + b[1]) / 2;
      const rx = Math.abs(b[0] - a[0]) / 2;
      const ry = Math.abs(b[1] - a[1]) / 2;
      return out(Array.from({ length: 49 }, (_, i) => [cx + rx * Math.cos((i / 48) * Math.PI * 2), cy + ry * Math.sin((i / 48) * Math.PI * 2)] as Pt));
    }
  }
}

/** Ponto dentro de um polígono (regra par-ímpar). */
export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Índices dos traços que o laço pegou: a maior parte dos pontos dentro da volta. */
export function strokesInLasso(strokes: Stroke[], lasso: Pt[]): number[] {
  if (lasso.length < 3) return [];
  return strokes.flatMap((s, i) => {
    const inside = s.points.filter(([x, y]) => pointInPolygon([x, y], lasso)).length;
    return s.points.length > 0 && inside / s.points.length >= 0.5 ? [i] : [];
  });
}

/** Move os traços escolhidos (o resto fica igual). */
export function moveStrokes(strokes: Stroke[], indices: number[], dx: number, dy: number): Stroke[] {
  const set = new Set(indices);
  const r = (v: number) => Math.round(v * 10) / 10;
  return strokes.map((s, i) => (set.has(i) ? { ...s, points: s.points.map(([x, y, p]) => [r(x + dx), r(y + dy), p] as [number, number, number]) } : s));
}

/** Caixa que envolve traços (para desenhar a seleção). */
export function strokesBounds(strokes: Stroke[]): { x: number; y: number; w: number; h: number } | null {
  const pts = strokes.flatMap((s) => s.points);
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Arquivos que os blocos usam (imagem, arquivo e imagem de fundo do desenho). */
export function blockFileIds(blocks: Block[]): string[] {
  return blocks.flatMap((b) => (b.type === 'image' || b.type === 'file' ? [b.fileId] : b.type === 'drawing' && b.imageFileId ? [b.imageFileId] : [])).filter(Boolean);
}
