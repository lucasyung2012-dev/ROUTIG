import { z } from 'zod';
import type { BaseEntity } from './entity';
import { addDays, toDateKey, type DateKey } from './dates';

/* ---------- Interesses (Parte 21.2–21.4) ---------- */

/** Status escolhido pelo usuário; nunca inferido (Parte 21.4). */
export const INTEREST_STATUSES = ['exploring', 'developing', 'consolidated', 'paused'] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

/** Categorias sugeridas (Parte 21.2). Personalizadas ficam no kv e têm id `cat_…`. */
export const BUILTIN_INTEREST_CATEGORIES = ['technology', 'science', 'engineering', 'languages', 'music', 'sports', 'reading', 'culture', 'creativity', 'finance', 'other'] as const;
export type BuiltinInterestCategory = (typeof BUILTIN_INTEREST_CATEGORIES)[number];

/** Ícones que o usuário pode escolher (nomes do Lucide, desenhados na tela de interesses). */
export const INTEREST_ICONS = ['sparkles', 'cpu', 'flask', 'wrench', 'languages', 'music', 'trophy', 'book', 'palette', 'lightbulb', 'piggy', 'globe', 'camera', 'gamepad', 'heart', 'star'] as const;
export type InterestIcon = (typeof INTEREST_ICONS)[number];

export interface InterestCategory {
  id: string;
  name: string;
}

export interface Interest extends BaseEntity {
  name: string;
  description: string;
  categoryId: string;
  icon: InterestIcon;
  color: string;
  coverFileId: string | null;
  startDate: DateKey | null;
  status: InterestStatus;
  /** Objetivos em texto (a ligação com Goals chega com o módulo Goals). */
  objectives: string[];
  /** Ligações por id: o registro continua no módulo dele, nada é copiado. */
  projectIds: string[];
  noteIds: string[];
}

export type InterestInput = Pick<Interest, 'name' | 'description' | 'categoryId' | 'icon' | 'color' | 'coverFileId' | 'startDate' | 'status' | 'objectives' | 'projectIds' | 'noteIds'>;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const interestInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000),
  categoryId: z.string().min(1).max(60),
  icon: z.enum(INTEREST_ICONS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  coverFileId: z.string().nullable(),
  startDate: dateKey.nullable(),
  status: z.enum(INTEREST_STATUSES),
  objectives: z.array(z.string().trim().min(1).max(200)).max(30),
  projectIds: z.array(z.string()).max(100),
  noteIds: z.array(z.string()).max(200),
});

export function emptyInterestInput(): InterestInput {
  return { name: '', description: '', categoryId: 'other', icon: 'sparkles', color: '#7357F6', coverFileId: null, startDate: null, status: 'exploring', objectives: [], projectIds: [], noteIds: [] };
}

export function isBuiltinCategory(id: string): id is BuiltinInterestCategory {
  return (BUILTIN_INTEREST_CATEGORIES as readonly string[]).includes(id);
}

/* ---------- Minha história (Parte 21.6) ---------- */

/** Registro escrito pelo usuário na linha do tempo. */
export interface HistoryEntry extends BaseEntity {
  date: DateKey;
  title: string;
  description: string;
}

/** O usuário pode renomear ou ocultar qualquer registro, inclusive os automáticos. */
export interface TimelineOverride {
  title?: string;
  hidden?: boolean;
}

export type TimelineKind = 'manual' | 'interestStart' | 'projectCreated' | 'projectDone' | 'milestoneDone';

export interface TimelineItem {
  /** Chave estável: `kind:id` (ou `kind:projeto:marco`). */
  key: string;
  kind: TimelineKind;
  date: DateKey;
  title: string;
  /** Contexto: nome do projeto do marco, por exemplo. */
  context?: string;
  href: string;
  hidden: boolean;
  edited: boolean;
}

export interface TimelineSources {
  manual: Pick<HistoryEntry, 'id' | 'date' | 'title' | 'deletedAt'>[];
  interests: Pick<Interest, 'id' | 'name' | 'startDate' | 'deletedAt'>[];
  projects: {
    id: string;
    name: string;
    createdAt: string;
    deletedAt: string | null;
    status: string;
    /** Quando o status virou "concluído" (do histórico); null se não se sabe. */
    doneAt: string | null;
    milestones: { id: string; title: string; done: boolean; doneAt: string | null }[];
  }[];
}

/** Monta a linha do tempo só com dados reais, do mais recente para o mais antigo. */
export function buildTimeline(src: TimelineSources, overrides: Record<string, TimelineOverride>): TimelineItem[] {
  const raw: Omit<TimelineItem, 'hidden' | 'edited'>[] = [];
  for (const m of src.manual) if (!m.deletedAt) raw.push({ key: `manual:${m.id}`, kind: 'manual', date: m.date, title: m.title, href: '' });
  for (const i of src.interests) if (!i.deletedAt && i.startDate) raw.push({ key: `interestStart:${i.id}`, kind: 'interestStart', date: i.startDate, title: i.name, href: `/profile/interests/${i.id}` });
  for (const p of src.projects) {
    if (p.deletedAt) continue;
    const href = `/projects/${p.id}`;
    raw.push({ key: `projectCreated:${p.id}`, kind: 'projectCreated', date: toDateKey(new Date(p.createdAt)), title: p.name, href });
    if (p.status === 'done' && p.doneAt) raw.push({ key: `projectDone:${p.id}`, kind: 'projectDone', date: toDateKey(new Date(p.doneAt)), title: p.name, href });
    for (const m of p.milestones)
      if (m.done && m.doneAt) raw.push({ key: `milestoneDone:${p.id}:${m.id}`, kind: 'milestoneDone', date: toDateKey(new Date(m.doneAt)), title: m.title, context: p.name, href });
  }
  return raw
    .map((r) => {
      const o = overrides[r.key];
      return { ...r, title: o?.title?.trim() || r.title, hidden: !!o?.hidden, edited: !!o?.title?.trim() };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

/* ---------- Minha evolução (Parte 21.5) ---------- */

export interface WeekBucket {
  /** Segunda-feira da semana. */
  start: DateKey;
  count: number;
}

/** Segunda-feira da semana de uma data. */
export function weekStart(day: DateKey): DateKey {
  const d = new Date(`${day}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  return addDays(day, -dow);
}

/** Conta datas por semana nas últimas `weeks` semanas (inclui a atual). Datas fora do período são ignoradas. */
export function countByWeek(dates: DateKey[], today: DateKey, weeks: number): WeekBucket[] {
  const last = weekStart(today);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({ start: addDays(last, -7 * (weeks - 1 - i)), count: 0 }));
  const index = new Map(buckets.map((b, i) => [b.start, i]));
  for (const d of dates) {
    const i = index.get(weekStart(d));
    if (i !== undefined) buckets[i]!.count++;
  }
  return buckets;
}
