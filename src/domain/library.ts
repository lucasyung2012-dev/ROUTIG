import { z } from 'zod';
import type { BaseEntity, EntityRef } from './entity';

/* ---------- Library (Parte 18): biblioteca central de materiais ---------- */

/** Tipos de material (Parte 18.1). */
export const LIBRARY_KINDS = ['pdf', 'document', 'presentation', 'spreadsheet', 'image', 'video', 'audio', 'link', 'book', 'reference'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const READ_STATUSES = ['want', 'reading', 'read'] as const;
export type ReadStatus = (typeof READ_STATUSES)[number];

export interface LibraryItem extends BaseEntity {
  kind: LibraryKind;
  title: string;
  /** Livro e referência: autor(es). */
  author: string;
  /** Link (ou onde achar o livro/referência). */
  url: string;
  /** Arquivo guardado no aparelho (tabela `files`), sem cópia: o mesmo arquivo serve a vários módulos. */
  fileId: string | null;
  fileName: string;
  size: number;
  mime: string;
  /** Pasta ou agrupamento (Parte 18.2), ex.: "Escola/9º ano". */
  folder: string;
  category: string;
  tags: string[];
  collectionIds: string[];
  favorite: boolean;
  /** Livros: quero ler, lendo, lido. */
  readStatus: ReadStatus | null;
  notes: string;
  /** De onde veio e quando (Parte 18.3). */
  origin: 'upload' | 'link' | 'manual';
  importedAt: string;
  /** Módulos onde o material é usado (Parte 18.4). */
  refs: EntityRef[];
}

export interface LibraryCollection extends BaseEntity {
  name: string;
  color: string;
}

export const itemMetaSchema = z.object({
  kind: z.enum(LIBRARY_KINDS),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(200),
  url: z.union([z.literal(''), z.string().url().max(1000).refine((u) => /^https?:\/\//i.test(u), 'http')]),
  folder: z
    .string()
    .trim()
    .max(120)
    .transform((f) =>
      f
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean)
        .join('/'),
    ),
  category: z.string().trim().max(60),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
  collectionIds: z.array(z.string()).max(30),
  favorite: z.boolean(),
  readStatus: z.enum(READ_STATUSES).nullable(),
  notes: z.string().max(20_000),
});
export type ItemMeta = z.infer<typeof itemMetaSchema>;

export function metaOf(i: LibraryItem): ItemMeta {
  const { kind, title, author, url, folder, category, tags, collectionIds, favorite, readStatus, notes } = i;
  return { kind, title, author, url, folder, category, tags, collectionIds, favorite, readStatus, notes };
}

/** Tipo pelo arquivo: extensão primeiro, depois o tipo MIME. */
export function kindForFile(name: string, mime: string): LibraryKind {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (['ppt', 'pptx', 'key', 'odp'].includes(ext)) return 'presentation';
  if (['xls', 'xlsx', 'csv', 'numbers', 'ods'].includes(ext)) return 'spreadsheet';
  if (['doc', 'docx', 'pages', 'odt', 'rtf', 'txt', 'md'].includes(ext)) return 'document';
  if (['epub', 'mobi'].includes(ext)) return 'book';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

/** Título a partir do nome do arquivo: sem extensão, sem "_" e "-" repetidos. */
export function titleFromFile(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || name
  );
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.replace(/^#/, '').trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export interface LibraryFilter {
  text: string;
  kind: LibraryKind | null;
  collectionId: string | null;
  tag: string | null;
  folder: string | null;
  favorites: boolean;
}

export const EMPTY_LIBRARY_FILTER: LibraryFilter = { text: '', kind: null, collectionId: null, tag: null, folder: null, favorites: false };

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Busca (Parte 18.2): título, autor, tags, categoria, pasta e observações, sem acento. Pasta inclui subpastas. */
export function matchesLibrary(i: LibraryItem, f: LibraryFilter): boolean {
  if (f.kind && i.kind !== f.kind) return false;
  if (f.collectionId && !i.collectionIds.includes(f.collectionId)) return false;
  if (f.tag && !i.tags.some((t) => t.toLowerCase() === f.tag!.toLowerCase())) return false;
  if (f.folder && !(i.folder === f.folder || i.folder.startsWith(`${f.folder}/`))) return false;
  if (f.favorites && !i.favorite) return false;
  const q = fold(f.text.trim());
  if (!q) return true;
  return fold([i.title, i.author, i.category, i.folder, i.fileName, i.notes, ...i.tags].join(' ')).includes(q);
}

/** Pastas existentes, incluindo as intermediárias ("Escola" de "Escola/9º ano"). */
export function folderTree(items: Array<Pick<LibraryItem, 'folder'>>): string[] {
  const set = new Set<string>();
  for (const i of items) {
    const parts = i.folder.split('/').filter(Boolean);
    for (let k = 1; k <= parts.length; k++) set.add(parts.slice(0, k).join('/'));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function formatBytes(n: number, locale: string): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toLocaleString(locale, { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[u]}`;
}
