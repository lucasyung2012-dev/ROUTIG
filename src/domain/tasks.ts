import { z } from 'zod';
import type { BaseEntity } from './entity';
import { addDays, addMonths, addYears, diffDays, isBetween, parseDateKey, startOfWeek, weekday, type DateKey } from './dates';

/* ---------- Tipos ---------- */

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };

/** Natureza do status: decide se a tarefa conta como aberta, feita ou fechada. */
export const STATUS_KINDS = ['open', 'active', 'waiting', 'done', 'cancelled', 'archived'] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export interface TaskStatus {
  id: string;
  /** Vazio nos status de fábrica: o nome vem da tradução. */
  name: string;
  kind: StatusKind;
  builtin: boolean;
}

export interface TaskList {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskLinkAttachment {
  id: string;
  name: string;
  url: string;
}

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  /** Só para semanal: dias da semana (0 = domingo). Vazio = o mesmo dia do prazo. */
  weekdays: number[];
  /** Períodos sem ocorrências (férias, feriados, recesso). */
  pauses: Array<{ from: DateKey; to: DateKey; label: string }>;
  /** Ocorrências puladas uma a uma. */
  exceptions: DateKey[];
  /** Fim da série (inclusive). null = sem fim. */
  until: DateKey | null;
}

export interface Occurrence {
  date: DateKey;
  completedAt: string;
  kind: 'done' | 'skipped';
}

export interface Task extends BaseEntity {
  title: string;
  description: string;
  notes: string;
  statusId: string;
  priority: Priority;
  dueDate: DateKey | null;
  dueTime: string | null;
  listId: string | null;
  category: string;
  tags: string[];
  /** Subtarefa: aponta para a tarefa mãe (a subtarefa é uma tarefa completa). */
  parentId: string | null;
  checklist: ChecklistItem[];
  attachments: TaskLinkAttachment[];
  projectId: string | null;
  goalId: string | null;
  /** Disciplina da Academy (atividade escolar), quando houver. */
  subjectId?: string | null;
  /** Módulo em que a tarefa nasceu (tasks, projects, academy…). */
  originModule: string;
  recurrence: Recurrence | null;
  occurrences: Occurrence[];
  dependsOn: string[];
  completedAt: string | null;
  order: number;
}

export const DEFAULT_STATUSES: TaskStatus[] = [
  { id: 'todo', name: '', kind: 'open', builtin: true },
  { id: 'doing', name: '', kind: 'active', builtin: true },
  { id: 'waiting', name: '', kind: 'waiting', builtin: true },
  { id: 'done', name: '', kind: 'done', builtin: true },
  { id: 'cancelled', name: '', kind: 'cancelled', builtin: true },
  { id: 'archived', name: '', kind: 'archived', builtin: true },
];

export interface TasksConfig {
  statuses: TaskStatus[];
  categories: string[];
}

export function defaultTasksConfig(): TasksConfig {
  return { statuses: DEFAULT_STATUSES.map((s) => ({ ...s })), categories: [] };
}

/* ---------- Validação ---------- */

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const recurrenceSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365),
  weekdays: z.array(z.number().int().min(0).max(6)),
  pauses: z.array(z.object({ from: dateKey, to: dateKey, label: z.string().max(80) })).refine((ps) => ps.every((p) => p.from <= p.to), 'pause_range'),
  exceptions: z.array(dateKey),
  until: dateKey.nullable(),
});

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, 'title_required').max(300),
  description: z.string().max(20_000),
  notes: z.string().max(20_000),
  statusId: z.string().min(1),
  priority: z.enum(PRIORITIES),
  dueDate: dateKey.nullable(),
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  listId: z.string().nullable(),
  category: z.string().max(60),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
  parentId: z.string().nullable(),
  checklist: z.array(z.object({ id: z.string(), text: z.string().max(500), done: z.boolean() })).max(200),
  attachments: z.array(z.object({ id: z.string(), name: z.string().max(200), url: z.string().url() })).max(50),
  projectId: z.string().nullable(),
  goalId: z.string().nullable(),
  subjectId: z.string().nullable().optional(),
  originModule: z.string(),
  recurrence: recurrenceSchema.nullable(),
  dependsOn: z.array(z.string()),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export function emptyTaskInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    title: '',
    description: '',
    notes: '',
    statusId: 'todo',
    priority: 'none',
    dueDate: null,
    dueTime: null,
    listId: null,
    category: '',
    tags: [],
    parentId: null,
    checklist: [],
    attachments: [],
    projectId: null,
    goalId: null,
    originModule: 'tasks',
    recurrence: null,
    dependsOn: [],
    ...overrides,
  };
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

/* ---------- Status ---------- */

export function statusKind(config: TasksConfig, statusId: string): StatusKind {
  return config.statuses.find((s) => s.id === statusId)?.kind ?? 'open';
}

/** Feita, cancelada ou arquivada: sai das listas de pendências. */
/** Cada conclusão da tarefa (ISO): a atual e as ocorrências feitas de uma recorrente, sem contar a mesma duas vezes. */
export function completionTimes(task: Pick<Task, 'completedAt' | 'occurrences'>): string[] {
  const times = new Set((task.occurrences ?? []).filter((o) => o.kind === 'done').map((o) => o.completedAt));
  if (task.completedAt) times.add(task.completedAt);
  return [...times];
}

export function isClosedKind(kind: StatusKind): boolean {
  return kind === 'done' || kind === 'cancelled' || kind === 'archived';
}

export function firstStatusOfKind(config: TasksConfig, kind: StatusKind): string {
  return config.statuses.find((s) => s.kind === kind)?.id ?? (kind === 'done' ? 'done' : 'todo');
}

/* ---------- Recorrência ---------- */

export function isPaused(date: DateKey, r: Recurrence): boolean {
  return r.pauses.some((p) => isBetween(date, p.from, p.to));
}

/**
 * Próxima data da série depois de `from`, pulando exceções e pausas.
 * Retorna null quando a série termina (`until`) ou não há próxima data.
 */
export function nextOccurrence(from: DateKey, r: Recurrence, anchor: DateKey = from): DateKey | null {
  const interval = Math.max(1, r.interval);
  const anchorDate = parseDateKey(anchor);
  let candidate = from;

  for (let guard = 0; guard < 2000; guard++) {
    candidate = step(candidate);
    if (r.until && candidate > r.until) return null;
    if (r.exceptions.includes(candidate) || isPaused(candidate, r)) continue;
    return candidate;
  }
  return null;

  function step(d: DateKey): DateKey {
    switch (r.freq) {
      case 'daily':
        return addDays(d, interval);
      case 'weekly': {
        const days = r.weekdays.length ? [...r.weekdays].sort((a, b) => a - b) : [weekday(anchor)];
        let next = addDays(d, 1);
        for (let i = 0; i < 7 * interval + 7; i++) {
          const weeks = Math.floor(diffDays(startOfWeek(next, 0), startOfWeek(anchor, 0)) / 7);
          if (days.includes(weekday(next)) && weeks % interval === 0) return next;
          next = addDays(next, 1);
        }
        return next;
      }
      case 'monthly':
        return addMonths(d, interval, anchorDate.getDate());
      case 'yearly':
        return addYears(d, interval, { month: anchorDate.getMonth(), day: anchorDate.getDate() });
    }
  }
}

/** As próximas `count` datas da série a partir do prazo atual (inclusive). */
export function upcomingOccurrences(task: Pick<Task, 'dueDate' | 'recurrence'>, count: number): DateKey[] {
  if (!task.dueDate || !task.recurrence) return task.dueDate ? [task.dueDate] : [];
  const out: DateKey[] = [task.dueDate];
  let cur: DateKey | null = task.dueDate;
  while (out.length < count && cur) {
    cur = nextOccurrence(cur, task.recurrence, task.dueDate);
    if (cur) out.push(cur);
  }
  return out;
}

/* ---------- Dependências ---------- */

/** Tarefas das quais esta depende e que ainda não terminaram. */
export function blockers(task: Task, byId: Map<string, Task>, config: TasksConfig): Task[] {
  return task.dependsOn
    .map((id) => byId.get(id))
    .filter((t): t is Task => !!t && !t.deletedAt && !isClosedKind(statusKind(config, t.statusId)));
}

/** Ligar `taskId` → `dependencyId` criaria um ciclo (A depende de B que depende de A)? */
export function wouldCreateCycle(taskId: string, dependencyId: string, byId: Map<string, Task>): boolean {
  if (taskId === dependencyId) return true;
  const stack = [dependencyId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) stack.push(dep);
  }
  return false;
}

/* ---------- Agrupamentos ---------- */

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';
export const DUE_BUCKETS: DueBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none'];

export function dueBucket(due: DateKey | null, today: DateKey): DueBucket {
  if (!due) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due === addDays(today, 1)) return 'tomorrow';
  if (due <= addDays(today, 7)) return 'week';
  return 'later';
}

export function isOverdue(task: Task, today: DateKey, config: TasksConfig): boolean {
  return !!task.dueDate && task.dueDate < today && !isClosedKind(statusKind(config, task.statusId));
}

/** Ordem padrão: abertas primeiro, depois prazo, prioridade e ordem manual. */
export function compareTasks(config: TasksConfig) {
  return (a: Task, b: Task): number => {
    const ca = isClosedKind(statusKind(config, a.statusId)) ? 1 : 0;
    const cb = isClosedKind(statusKind(config, b.statusId)) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const da = a.dueDate ? `${a.dueDate}T${a.dueTime ?? '99:99'}` : '9999';
    const db = b.dueDate ? `${b.dueDate}T${b.dueTime ?? '99:99'}` : '9999';
    if (da !== db) return da < db ? -1 : 1;
    const pr = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (pr !== 0) return pr;
    return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
  };
}

/* ---------- Filtros ---------- */

export interface TaskFilter {
  text: string;
  statusIds: string[];
  priorities: Priority[];
  listId: string | 'none' | null;
  tag: string | null;
  category: string | null;
  showClosed: boolean;
}

export const EMPTY_FILTER: TaskFilter = { text: '', statusIds: [], priorities: [], listId: null, tag: null, category: null, showClosed: false };

export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function taskSearchText(t: Task): string {
  return normalizeSearch([t.title, t.description, t.notes, t.category, ...t.tags, ...t.checklist.map((c) => c.text)].join(' '));
}

export function matchesFilter(t: Task, f: TaskFilter, config: TasksConfig): boolean {
  if (t.deletedAt) return false;
  if (!f.showClosed && f.statusIds.length === 0 && isClosedKind(statusKind(config, t.statusId))) return false;
  if (f.statusIds.length && !f.statusIds.includes(t.statusId)) return false;
  if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
  if (f.listId === 'none' && t.listId) return false;
  if (f.listId && f.listId !== 'none' && t.listId !== f.listId) return false;
  if (f.tag && !t.tags.includes(f.tag)) return false;
  if (f.category && t.category !== f.category) return false;
  if (f.text.trim()) {
    const words = normalizeSearch(f.text.trim()).split(/\s+/);
    const hay = taskSearchText(t);
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** Progresso do checklist e das subtarefas. Sem itens, não há porcentagem (Parte 19.5). */
export function checklistProgress(t: Task): { done: number; total: number } | null {
  if (t.checklist.length === 0) return null;
  return { done: t.checklist.filter((c) => c.done).length, total: t.checklist.length };
}
