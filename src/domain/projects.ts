import { z } from 'zod';
import type { BaseEntity } from './entity';
import { addDays, diffDays, type DateKey } from './dates';
import { PRIORITIES, type Priority, type Task } from './tasks';

/* ---------- Tipos ---------- */

export const PROJECT_STATUSES = ['idea', 'planned', 'active', 'paused', 'done', 'cancelled', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_CATEGORIES = ['personal', 'school', 'creative', 'sports', 'music', 'tech', 'other'] as const;

export interface ProjectPhase {
  id: string;
  name: string;
  start: DateKey | null;
  end: DateKey | null;
  done: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  date: DateKey | null;
  done: boolean;
  doneAt: string | null;
}

export interface ProjectReference {
  id: string;
  title: string;
  url: string;
}

export interface Project extends BaseEntity {
  name: string;
  description: string;
  category: string;
  status: ProjectStatus;
  priority: Priority;
  start: DateKey | null;
  due: DateKey | null;
  color: string;
  /** Capa: imagem guardada em `files` (opcional). Sem capa, usa a cor. */
  coverFileId: string | null;
  tags: string[];
  /** Objetivos do projeto em texto (a ligação com Goals chega com o módulo Goals). */
  objectives: string[];
  /** Participantes só como informação: não ganham conta nem acesso (Parte 1.3). */
  participants: string[];
  phases: ProjectPhase[];
  milestones: Milestone[];
  references: ProjectReference[];
  /** Etapa de cada tarefa do projeto (as tarefas continuam na tabela `tasks`). */
  taskPhases: Record<string, string>;
}

export const PROJECT_COLORS = ['#7357F6', '#438BEA', '#16B8A6', '#F59E0B', '#EC6695', '#8B93B8'] as const;

/* ---------- Validação ---------- */

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const projectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(20_000),
    category: z.string().max(60),
    status: z.enum(PROJECT_STATUSES),
    priority: z.enum(PRIORITIES),
    start: dateKey.nullable(),
    due: dateKey.nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    coverFileId: z.string().nullable(),
    tags: z.array(z.string().max(40)).max(30),
    objectives: z.array(z.string().max(300)).max(50),
    participants: z.array(z.string().max(120)).max(100),
    phases: z.array(z.object({ id: z.string(), name: z.string().max(120), start: dateKey.nullable(), end: dateKey.nullable(), done: z.boolean() })).max(100),
    milestones: z.array(z.object({ id: z.string(), title: z.string().max(200), date: dateKey.nullable(), done: z.boolean(), doneAt: z.string().nullable() })).max(200),
    references: z.array(z.object({ id: z.string(), title: z.string().max(200), url: z.string().url() })).max(200),
    taskPhases: z.record(z.string(), z.string()),
  })
  .refine((p) => !p.start || !p.due || p.start <= p.due, { message: 'due_before_start', path: ['due'] })
  .refine((p) => p.phases.every((ph) => !ph.start || !ph.end || ph.start <= ph.end), { message: 'phase_range', path: ['phases'] });

export type ProjectInput = z.infer<typeof projectInputSchema>;

export function emptyProjectInput(over: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: '',
    description: '',
    category: '',
    status: 'planned',
    priority: 'none',
    start: null,
    due: null,
    color: PROJECT_COLORS[0],
    coverFileId: null,
    tags: [],
    objectives: [],
    participants: [],
    phases: [],
    milestones: [],
    references: [],
    taskPhases: {},
    ...over,
  };
}

export function isClosedProject(s: ProjectStatus): boolean {
  return s === 'done' || s === 'cancelled' || s === 'archived';
}

/* ---------- Progresso (Parte 8.2) ---------- */

export interface ProjectProgress {
  tasksDone: number;
  tasksTotal: number;
  milestonesDone: number;
  milestonesTotal: number;
  phasesDone: number;
  phasesTotal: number;
  /**
   * Porcentagem só quando há o que contar (marcos e tarefas pesam igual por item).
   * Sem itens, é null: o app não inventa porcentagem (Parte 19.5).
   */
  percent: number | null;
}

export function projectProgress(project: Pick<Project, 'milestones' | 'phases'>, tasks: Array<Pick<Task, 'statusId'>>, isDone: (statusId: string) => boolean): ProjectProgress {
  const tasksDone = tasks.filter((t) => isDone(t.statusId)).length;
  const milestonesDone = project.milestones.filter((m) => m.done).length;
  const total = tasks.length + project.milestones.length;
  return {
    tasksDone,
    tasksTotal: tasks.length,
    milestonesDone,
    milestonesTotal: project.milestones.length,
    phasesDone: project.phases.filter((p) => p.done).length,
    phasesTotal: project.phases.length,
    percent: total === 0 ? null : Math.round(((tasksDone + milestonesDone) / total) * 100),
  };
}

/* ---------- Linha do tempo ---------- */

export interface TimelineRange {
  from: DateKey;
  to: DateKey;
  days: number;
}

/** Intervalo que cobre as datas do projeto (início, prazo, etapas, marcos e tarefas). */
export function timelineRange(dates: Array<DateKey | null | undefined>, fallback: DateKey): TimelineRange {
  const valid = dates.filter((d): d is DateKey => !!d).sort();
  const from = addDays(valid[0] ?? fallback, -3);
  const to = addDays(valid[valid.length - 1] ?? addDays(fallback, 30), 3);
  return { from, to, days: diffDays(to, from) + 1 };
}

/** Posição (0–100%) de uma data dentro do intervalo. */
export function positionOf(date: DateKey, range: TimelineRange): number {
  return Math.min(100, Math.max(0, (diffDays(date, range.from) / range.days) * 100));
}

export function isOverdueProject(p: Pick<Project, 'due' | 'status'>, today: DateKey): boolean {
  return !!p.due && p.due < today && !isClosedProject(p.status);
}
