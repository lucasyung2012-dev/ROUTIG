import { z } from 'zod';
import type { DateKey } from './dates';
import type { BaseEntity, EntityRef } from './entity';
import type { Milestone } from './projects';
import { PRIORITIES, type Priority } from './tasks';

/* ---------- Objetivos (Parte 15) ---------- */

/** Área do objetivo (Parte 15.1). */
export const GOAL_AREAS = ['academic', 'personal', 'professional', 'creative', 'sports', 'financial', 'learning'] as const;
export type GoalArea = (typeof GOAL_AREAS)[number];

/** Horizonte (Parte 15.1: curto, médio e longo prazo). */
export const GOAL_HORIZONS = ['short', 'medium', 'long'] as const;
export type GoalHorizon = (typeof GOAL_HORIZONS)[number];

/** Tipos (Parte 15.3). Só o mensurável e o por etapas mostram porcentagem: nada de número inventado. */
export const GOAL_TYPES = ['measurable', 'qualitative', 'skill', 'stages'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

/** Status (Parte 15.4). */
export const GOAL_STATUSES = ['idea', 'planned', 'active', 'paused', 'done', 'cancelled', 'archived'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const OPEN_STATUSES: readonly GoalStatus[] = ['idea', 'planned', 'active', 'paused'];

/** O que um objetivo pode ter ligado: os registros originais, nunca cópias. Tarefas apontam para o objetivo pelo próprio `goalId`. */
export const GOAL_REF_TYPES = ['project', 'habit', 'language', 'subject', 'instrument'] as const;
export type GoalRefType = (typeof GOAL_REF_TYPES)[number];

/** Indicador de uma meta mensurável: de onde parte, aonde quer chegar. */
export interface GoalIndicator {
  id: string;
  name: string;
  unit: string;
  start: number;
  target: number;
}

export interface Goal extends BaseEntity {
  name: string;
  description: string;
  area: GoalArea;
  horizon: GoalHorizon | null;
  type: GoalType;
  status: GoalStatus;
  priority: Priority;
  deadline: DateKey | null;
  indicators: GoalIndicator[];
  /** Habilidade: nível alvo numa escala de 1 a `levelMax` (autoavaliação). */
  levelMax: number;
  levelTarget: number | null;
  milestones: Milestone[];
  refs: EntityRef[];
  notes: string;
  doneAt: string | null;
}

/** Acompanhamento: valor de um indicador, nível da habilidade ou só uma reflexão. */
export interface GoalCheckin extends BaseEntity {
  goalId: string;
  date: DateKey;
  indicatorId: string | null;
  value: number | null;
  level: number | null;
  note: string;
}

export type GoalInput = Pick<Goal, 'name' | 'description' | 'area' | 'horizon' | 'type' | 'status' | 'priority' | 'deadline' | 'indicators' | 'levelMax' | 'levelTarget' | 'milestones' | 'notes'>;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const goalInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().max(4000),
    area: z.enum(GOAL_AREAS),
    horizon: z.enum(GOAL_HORIZONS).nullable(),
    type: z.enum(GOAL_TYPES),
    status: z.enum(GOAL_STATUSES),
    priority: z.enum(PRIORITIES),
    deadline: dateKey.nullable(),
    indicators: z
      .array(z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(120), unit: z.string().trim().max(30), start: z.number().finite(), target: z.number().finite() }))
      .max(20),
    levelMax: z.number().int().min(3).max(10),
    levelTarget: z.number().int().min(1).max(10).nullable(),
    milestones: z.array(z.object({ id: z.string(), title: z.string().trim().min(1).max(200), date: dateKey.nullable(), done: z.boolean(), doneAt: z.string().nullable() })).max(200),
    notes: z.string().max(20_000),
  })
  .refine((g) => g.type !== 'measurable' || g.indicators.length > 0, 'indicators_required')
  .refine((g) => g.indicators.every((i) => i.start !== i.target), 'indicator_range')
  .refine((g) => g.levelTarget === null || g.levelTarget <= g.levelMax, 'level_range');

export function emptyGoalInput(over: Partial<GoalInput> = {}): GoalInput {
  return { name: '', description: '', area: 'personal', horizon: null, type: 'qualitative', status: 'planned', priority: 'none', deadline: null, indicators: [], levelMax: 5, levelTarget: null, milestones: [], notes: '', ...over };
}

export function goalInputOf(g: Goal): GoalInput {
  const { name, description, area, horizon, type, status, priority, deadline, indicators, levelMax, levelTarget, milestones, notes } = g;
  return { name, description, area, horizon, type, status, priority, deadline, indicators, levelMax, levelTarget, milestones, notes };
}

export const isOpenGoal = (g: Pick<Goal, 'status'>) => OPEN_STATUSES.includes(g.status);

/* ---------- Progresso ---------- */

/** Valor atual do indicador: o último registrado (por data); sem registro, o ponto de partida. */
export function indicatorCurrent(ind: GoalIndicator, checkins: Array<Pick<GoalCheckin, 'indicatorId' | 'value' | 'date' | 'createdAt'>>): number {
  let best: (typeof checkins)[number] | undefined;
  for (const c of checkins) {
    if (c.indicatorId !== ind.id || c.value === null) continue;
    if (!best || c.date > best.date || (c.date === best.date && c.createdAt > best.createdAt)) best = c;
  }
  return best?.value ?? ind.start;
}

/** 0 a 100. Funciona para subir (ler 12 livros) e para descer (de 90 para 70 segundos). */
export function indicatorPercent(ind: Pick<GoalIndicator, 'start' | 'target'>, current: number): number {
  if (ind.target === ind.start) return current === ind.target ? 100 : 0;
  const p = ((current - ind.start) / (ind.target - ind.start)) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
}

/** Nível atual da habilidade: o último registrado, ou null. */
export function currentLevel(checkins: Array<Pick<GoalCheckin, 'level' | 'date' | 'createdAt'>>): number | null {
  let best: (typeof checkins)[number] | undefined;
  for (const c of checkins) {
    if (c.level === null) continue;
    if (!best || c.date > best.date || (c.date === best.date && c.createdAt > best.createdAt)) best = c;
  }
  return best?.level ?? null;
}

export type GoalProgress =
  | { kind: 'percent'; percent: number; parts: Array<{ indicator: GoalIndicator; current: number; percent: number }> }
  | { kind: 'stages'; done: number; total: number; percent: number | null }
  | { kind: 'level'; current: number | null; target: number | null; max: number }
  | { kind: 'none' };

/**
 * Progresso real de cada tipo (Parte 15.3). Qualitativo não tem porcentagem; habilidade mostra o nível
 * autoavaliado, não uma conta inventada.
 */
export function goalProgress(goal: Pick<Goal, 'type' | 'indicators' | 'milestones' | 'levelMax' | 'levelTarget'>, checkins: GoalCheckin[]): GoalProgress {
  switch (goal.type) {
    case 'measurable': {
      const parts = goal.indicators.map((indicator) => {
        const current = indicatorCurrent(indicator, checkins);
        return { indicator, current, percent: indicatorPercent(indicator, current) };
      });
      return { kind: 'percent', parts, percent: parts.length ? Math.round(parts.reduce((a, p) => a + p.percent, 0) / parts.length) : 0 };
    }
    case 'stages': {
      const total = goal.milestones.length;
      const done = goal.milestones.filter((m) => m.done).length;
      return { kind: 'stages', done, total, percent: total ? Math.round((done / total) * 100) : null };
    }
    case 'skill':
      return { kind: 'level', current: currentLevel(checkins), target: goal.levelTarget, max: goal.levelMax };
    default:
      return { kind: 'none' };
  }
}

/** Chegou ao alvo? Serve só para sugerir concluir: o objetivo nunca muda sozinho (Parte 15.5). */
export function looksReached(p: GoalProgress): boolean {
  if (p.kind === 'percent') return p.parts.length > 0 && p.parts.every((x) => x.percent >= 100);
  if (p.kind === 'stages') return p.total > 0 && p.done === p.total;
  if (p.kind === 'level') return p.current !== null && p.target !== null && p.current >= p.target;
  return false;
}

export function isGoalOverdue(g: Pick<Goal, 'deadline' | 'status'>, today: DateKey): boolean {
  return !!g.deadline && g.deadline < today && isOpenGoal(g);
}

/** Ordem da lista: em andamento primeiro, depois prazo mais próximo, depois prioridade. */
const STATUS_RANK: Record<GoalStatus, number> = { active: 0, planned: 1, idea: 2, paused: 3, done: 4, cancelled: 5, archived: 6 };
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
export function compareGoals(a: Goal, b: Goal): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.name.localeCompare(b.name);
}
