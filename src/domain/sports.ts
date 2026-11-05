import { z } from 'zod';
import type { DateKey } from './dates';
import type { BaseEntity } from './entity';

/* ---------- Esportes (Parte 12) ---------- */

/** Tênis e futebol têm ambientes próprios (Partes 12.1 e 12.2); outros esportes usam a estrutura geral. */
export const SPORT_KINDS = ['tennis', 'football', 'other'] as const;
export type SportKind = (typeof SPORT_KINDS)[number];

export interface Sport extends BaseEntity {
  name: string;
  kind: SportKind;
  color: string;
  notes: string;
  order: number;
}

export const SPORT_PRESETS: Array<Pick<Sport, 'name' | 'kind' | 'color'>> = [
  { name: 'Tênis', kind: 'tennis', color: '#16B8A6' },
  { name: 'Futebol', kind: 'football', color: '#30A46C' },
];

export const sportInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(SPORT_KINDS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  notes: z.string().max(20_000),
});
export type SportInput = z.infer<typeof sportInputSchema>;

/* ---------- Atividades (Parte 12.3) ---------- */

export const ACTIVITY_TYPES = ['training', 'match', 'tournament', 'event'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const OUTCOMES = ['win', 'loss', 'draw'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface SportActivity extends BaseEntity {
  sportId: string;
  type: ActivityType;
  date: DateKey;
  durationMin: number | null;
  /** Tipo de treino (ex.: aula, bate-bola, saque) ou nome do torneio/evento. */
  title: string;
  location: string;
  /** Técnicas, fundamentos e habilidades praticados. */
  itemIds: string[];
  /** Partidas e torneios: resultado. */
  outcome: Outcome | null;
  score: string;
  /** Adversário ou time. */
  opponent: string;
  /** Futebol: posição em que jogou. */
  positionId: string | null;
  /** Como se sentiu (1 a 5), sem nada de corpo ou peso (Parte 12.4). */
  feeling: number | null;
  difficulties: string;
  evolution: string;
  notes: string;
}

export const activityInputSchema = z.object({
  sportId: z.string().min(1),
  type: z.enum(ACTIVITY_TYPES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMin: z.number().int().min(1).max(1440).nullable(),
  title: z.string().trim().max(120),
  location: z.string().trim().max(120),
  itemIds: z.array(z.string()).max(60),
  outcome: z.enum(OUTCOMES).nullable(),
  score: z.string().trim().max(60),
  opponent: z.string().trim().max(120),
  positionId: z.string().nullable(),
  feeling: z.number().int().min(1).max(5).nullable(),
  difficulties: z.string().max(4000),
  evolution: z.string().max(4000),
  notes: z.string().max(10_000),
});
export type ActivityInput = z.infer<typeof activityInputSchema>;

export function emptyActivityInput(sportId: string, type: ActivityType, date: DateKey): ActivityInput {
  return { sportId, type, date, durationMin: null, title: '', location: '', itemIds: [], outcome: null, score: '', opponent: '', positionId: null, feeling: null, difficulties: '', evolution: '', notes: '' };
}

export function activityInputOf(a: SportActivity): ActivityInput {
  const { sportId, type, date, durationMin, title, location, itemIds, outcome, score, opponent, positionId, feeling, difficulties, evolution, notes } = a;
  return { sportId, type, date, durationMin, title, location, itemIds, outcome, score, opponent, positionId, feeling, difficulties, evolution, notes };
}

/* ---------- Técnicas, fundamentos, habilidades, posições ---------- */

export const SPORT_ITEM_CATEGORIES = ['technique', 'fundamental', 'skill', 'position'] as const;
export type SportItemCategory = (typeof SPORT_ITEM_CATEGORIES)[number];

export interface SportItem extends BaseEntity {
  sportId: string;
  category: SportItemCategory;
  name: string;
  /** Confiança atual (1 a 5): a evolução fica no histórico. */
  confidence: number | null;
  difficulties: string;
  notes: string;
}

export const sportItemInputSchema = z.object({
  sportId: z.string().min(1),
  category: z.enum(SPORT_ITEM_CATEGORIES),
  name: z.string().trim().min(1).max(120),
  confidence: z.number().int().min(1).max(5).nullable(),
  difficulties: z.string().max(4000),
  notes: z.string().max(20_000),
});
export type SportItemInput = z.infer<typeof sportItemInputSchema>;

/** As áreas de cada esporte, na ordem da especificação. */
export const SPORT_TABS: Record<SportKind, readonly string[]> = {
  tennis: ['overview', 'training', 'match', 'tournament', 'technique', 'fundamental', 'evolution', 'goals', 'history', 'materials'],
  football: ['overview', 'match', 'training', 'fundamental', 'skill', 'position', 'goals', 'notes', 'history'],
  other: ['overview', 'training', 'match', 'tournament', 'event', 'technique', 'evolution', 'goals', 'history', 'materials'],
};

/* ---------- Números ---------- */

/** Vitórias, derrotas e empates; minutos e atividades por tipo. Sem nada de corpo (Parte 12.4). */
export function sportStats(acts: Array<Pick<SportActivity, 'type' | 'outcome' | 'durationMin' | 'positionId' | 'itemIds'>>) {
  const record = { win: 0, loss: 0, draw: 0 };
  const byType: Record<ActivityType, number> = { training: 0, match: 0, tournament: 0, event: 0 };
  const positions = new Map<string, number>();
  const items = new Map<string, number>();
  let minutes = 0;
  for (const a of acts) {
    byType[a.type]++;
    minutes += a.durationMin ?? 0;
    if (a.outcome) record[a.outcome]++;
    if (a.positionId) positions.set(a.positionId, (positions.get(a.positionId) ?? 0) + 1);
    for (const id of a.itemIds) items.set(id, (items.get(id) ?? 0) + 1);
  }
  return { record, byType, minutes, positions, items, total: acts.length };
}
