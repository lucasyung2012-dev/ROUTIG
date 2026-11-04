import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import {
  defaultTasksConfig,
  firstStatusOfKind,
  isClosedKind,
  nextOccurrence,
  normalizeTags,
  STATUS_KINDS,
  statusKind,
  taskInputSchema,
  wouldCreateCycle,
  type Task,
  type TaskInput,
  type TaskList,
  type TasksConfig,
  type TaskStatus,
} from '@/domain/tasks';

const CONFIG_KEY = 'tasks.config';
const ENTITY = 'task';

/** Erro de regra de negócio, com código para a interface traduzir. */
export class TaskRuleError extends Error {
  constructor(public code: 'dependency_cycle' | 'dependency_missing' | 'not_found' | 'status_in_use' | 'status_missing' | 'invalid') {
    super(code);
  }
}

/* ---------- Configuração (status e categorias) ---------- */

export async function loadTasksConfig(): Promise<TasksConfig> {
  const rec = await getDb().kv.get(CONFIG_KEY);
  return migrateTasksConfig(rec?.value);
}

export function migrateTasksConfig(raw: unknown): TasksConfig {
  const base = defaultTasksConfig();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<TasksConfig>;
  const statuses = Array.isArray(r.statuses)
    ? r.statuses.filter(
        (s): s is TaskStatus =>
          !!s && typeof s.id === 'string' && typeof s.name === 'string' && (STATUS_KINDS as readonly string[]).includes(s.kind),
      )
    : [];
  // Os status de fábrica sempre existem (podem ser renomeados, não apagados).
  for (const b of base.statuses) if (!statuses.some((s) => s.id === b.id)) statuses.push(b);
  const categories = Array.isArray(r.categories) ? [...new Set(r.categories.filter((c): c is string => typeof c === 'string' && c.trim() !== ''))] : [];
  return { statuses, categories };
}

export async function saveTasksConfig(config: TasksConfig): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.kv, db.changelog, async () => {
    const at = nowIso();
    await db.kv.put({ key: CONFIG_KEY, value: config, updatedAt: at });
    await db.changelog.add({ at, entityType: 'tasks.config', entityId: CONFIG_KEY, action: 'update' });
  });
}

export async function addStatus(name: string, kind: TaskStatus['kind']): Promise<TaskStatus> {
  const config = await loadTasksConfig();
  const status: TaskStatus = { id: newId('st'), name: name.trim().slice(0, 40), kind, builtin: false };
  if (!status.name) throw new TaskRuleError('invalid');
  await saveTasksConfig({ ...config, statuses: [...config.statuses, status] });
  return status;
}

export async function renameStatus(id: string, name: string): Promise<void> {
  const config = await loadTasksConfig();
  if (!config.statuses.some((s) => s.id === id)) throw new TaskRuleError('status_missing');
  await saveTasksConfig({ ...config, statuses: config.statuses.map((s) => (s.id === id ? { ...s, name: name.trim().slice(0, 40) } : s)) });
}

/** Só status criados pelo usuário e sem tarefas podem ser removidos. */
export async function removeStatus(id: string): Promise<void> {
  const config = await loadTasksConfig();
  const status = config.statuses.find((s) => s.id === id);
  if (!status || status.builtin) throw new TaskRuleError('status_missing');
  const used = await getDb().tasks.where('statusId').equals(id).count();
  if (used > 0) throw new TaskRuleError('status_in_use');
  await saveTasksConfig({ ...config, statuses: config.statuses.filter((s) => s.id !== id) });
}

export async function addCategory(name: string): Promise<void> {
  const config = await loadTasksConfig();
  const clean = name.trim().slice(0, 60);
  if (!clean || config.categories.includes(clean)) return;
  await saveTasksConfig({ ...config, categories: [...config.categories, clean] });
}

/* ---------- Listas ---------- */

export async function createList(name: string, color: string): Promise<TaskList> {
  const db = getDb();
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new TaskRuleError('invalid');
  const count = await db.taskLists.count();
  const list: TaskList = { id: newId('list'), name: clean, color, order: count, createdAt: nowIso() };
  await db.transaction('rw', db.taskLists, db.changelog, async () => {
    await db.taskLists.add(list);
    await log({ entityType: 'taskList', entityId: list.id, action: 'create' });
  });
  return list;
}

export async function updateList(id: string, patch: Partial<Pick<TaskList, 'name' | 'color'>>): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.taskLists, db.changelog, async () => {
    await db.taskLists.update(id, { ...patch, ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 60) } : {}) });
    await log({ entityType: 'taskList', entityId: id, action: 'update', fields: Object.keys(patch) });
  });
}

/** Remove a lista; as tarefas dela continuam existindo, sem lista. */
export async function deleteList(id: string): Promise<number> {
  const db = getDb();
  return db.transaction('rw', db.taskLists, db.tasks, db.changelog, async () => {
    const affected = await db.tasks.where('listId').equals(id).modify({ listId: null, updatedAt: nowIso() });
    await db.taskLists.delete(id);
    await log({ entityType: 'taskList', entityId: id, action: 'purge', note: String(affected) });
    return affected;
  });
}

/* ---------- Tarefas ---------- */

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

function clean(input: TaskInput): TaskInput {
  const parsed = taskInputSchema.safeParse({ ...input, tags: normalizeTags(input.tags) });
  if (!parsed.success) throw new TaskRuleError('invalid');
  return parsed.data;
}

async function checkDependencies(taskId: string, dependsOn: string[]): Promise<void> {
  if (dependsOn.length === 0) return;
  const all = await getDb().tasks.toArray();
  const byId = new Map(all.map((t) => [t.id, t]));
  for (const dep of dependsOn) {
    if (!byId.has(dep)) throw new TaskRuleError('dependency_missing');
    if (wouldCreateCycle(taskId, dep, byId)) throw new TaskRuleError('dependency_cycle');
  }
}

export async function createTask(input: TaskInput): Promise<Task> {
  const db = getDb();
  const data = clean(input);
  const id = newId('task');
  await checkDependencies(id, data.dependsOn);
  const at = nowIso();
  const config = await loadTasksConfig();
  const task: Task = {
    ...data,
    id,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    rev: 1,
    occurrences: [],
    completedAt: isClosedKind(statusKind(config, data.statusId)) ? at : null,
    order: Date.now(),
  };
  await db.transaction('rw', db.tasks, db.changelog, async () => {
    await db.tasks.add(task);
    await log({ entityType: ENTITY, entityId: id, action: 'create' });
  });
  return task;
}

export interface UpdateResult {
  task: Task;
  /** Preenchido quando uma ocorrência de tarefa recorrente foi concluída. */
  completedOccurrence?: { date: string; next: string | null };
}

/**
 * Altera uma tarefa. Se ela for recorrente e for marcada como concluída,
 * registra a ocorrência e avança o prazo para a próxima data da série.
 */
export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<UpdateResult> {
  const db = getDb();
  const config = await loadTasksConfig();
  return db.transaction('rw', db.tasks, db.changelog, async () => {
    const current = await db.tasks.get(id);
    if (!current) throw new TaskRuleError('not_found');
    const data = clean({ ...pickInput(current), ...patch });
    if (patch.dependsOn) await checkDependencies(id, data.dependsOn);

    const wasClosed = isClosedKind(statusKind(config, current.statusId));
    const nowKind = statusKind(config, data.statusId);
    const at = nowIso();
    let next: Task = { ...current, ...data, updatedAt: at, rev: current.rev + 1 };
    let completedOccurrence: UpdateResult['completedOccurrence'];

    if (nowKind === 'done' && !wasClosed && next.recurrence && next.dueDate) {
      const date = next.dueDate;
      const following = nextOccurrence(date, next.recurrence, date);
      next.occurrences = [...current.occurrences, { date, completedAt: at, kind: 'done' as const }].slice(-200);
      if (following) {
        next = { ...next, dueDate: following, statusId: firstStatusOfKind(config, 'open'), completedAt: null };
      } else {
        next.completedAt = at;
      }
      completedOccurrence = { date, next: following };
      await log({ entityType: ENTITY, entityId: id, action: 'complete', note: date });
    } else if (isClosedKind(nowKind) && !wasClosed) {
      next.completedAt = at;
    } else if (!isClosedKind(nowKind) && wasClosed) {
      next.completedAt = null;
    }

    const fields = (Object.keys(data) as (keyof TaskInput)[]).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(data[k]));
    await db.tasks.put(next);
    if (fields.length && !completedOccurrence) await log({ entityType: ENTITY, entityId: id, action: 'update', fields });
    return { task: next, completedOccurrence };
  });
}

/** Marca como concluída (ou reabre, se já estiver fechada). */
export async function toggleDone(id: string): Promise<UpdateResult> {
  const config = await loadTasksConfig();
  const task = await getDb().tasks.get(id);
  if (!task) throw new TaskRuleError('not_found');
  const closed = isClosedKind(statusKind(config, task.statusId));
  return updateTask(id, { statusId: firstStatusOfKind(config, closed ? 'open' : 'done') });
}

/** Pula a ocorrência atual de uma tarefa recorrente (vira exceção da série). */
export async function skipOccurrence(id: string): Promise<UpdateResult> {
  const db = getDb();
  return db.transaction('rw', db.tasks, db.changelog, async () => {
    const task = await db.tasks.get(id);
    if (!task?.recurrence || !task.dueDate) throw new TaskRuleError('invalid');
    const date = task.dueDate;
    const recurrence = { ...task.recurrence, exceptions: [...new Set([...task.recurrence.exceptions, date])] };
    const following = nextOccurrence(date, recurrence, date);
    const at = nowIso();
    const next: Task = {
      ...task,
      recurrence,
      dueDate: following ?? date,
      occurrences: [...task.occurrences, { date, completedAt: at, kind: 'skipped' as const }].slice(-200),
      updatedAt: at,
      rev: task.rev + 1,
    };
    await db.tasks.put(next);
    await log({ entityType: ENTITY, entityId: id, action: 'skip', note: date });
    return { task: next, completedOccurrence: { date, next: following } };
  });
}

/** Manda para a Lixeira (junto com as subtarefas). Nada é apagado de verdade aqui. */
export async function softDeleteTask(id: string): Promise<number> {
  const db = getDb();
  return db.transaction('rw', db.tasks, db.changelog, async () => {
    const at = nowIso();
    const ids = await withDescendants(id);
    for (const tid of ids) {
      await db.tasks.update(tid, { deletedAt: at, updatedAt: at });
      await log({ entityType: ENTITY, entityId: tid, action: 'delete' });
    }
    return ids.length;
  });
}

/** Restaura da Lixeira a tarefa e as subtarefas que saíram junto com ela. */
export async function restoreTask(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.tasks, db.changelog, async () => {
    const task = await db.tasks.get(id);
    if (!task?.deletedAt) return;
    const stamp = task.deletedAt;
    const at = nowIso();
    for (const tid of await withDescendants(id)) {
      const t = await db.tasks.get(tid);
      if (t?.deletedAt === stamp) {
        await db.tasks.update(tid, { deletedAt: null, updatedAt: at });
        await log({ entityType: ENTITY, entityId: tid, action: 'restore' });
      }
    }
    // Se a mãe continua na Lixeira, a subtarefa restaurada vira tarefa solta.
    if (task.parentId) {
      const parent = await db.tasks.get(task.parentId);
      if (!parent || parent.deletedAt) await db.tasks.update(id, { parentId: null });
    }
  });
}

/** Exclusão definitiva (só pela Lixeira, com confirmação). Remove também das dependências. */
export async function purgeTask(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.tasks, db.changelog, async () => {
    const ids = await withDescendants(id);
    const gone = new Set(ids);
    await db.tasks.bulkDelete(ids);
    const dependents = await db.tasks.filter((t) => t.dependsOn.some((d) => gone.has(d))).toArray();
    for (const t of dependents) await db.tasks.update(t.id, { dependsOn: t.dependsOn.filter((d) => !gone.has(d)) });
    for (const tid of ids) await log({ entityType: ENTITY, entityId: tid, action: 'purge' });
  });
}

export async function taskHistory(id: string): Promise<ChangeEntry[]> {
  return getDb().changelog.where('[entityType+entityId]').equals([ENTITY, id]).reverse().sortBy('seq');
}

async function withDescendants(id: string): Promise<string[]> {
  const db = getDb();
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    const children = await db.tasks.where('parentId').equals(out[i]!).primaryKeys();
    for (const c of children) if (!out.includes(c)) out.push(c);
  }
  return out;
}

function pickInput(t: Task): TaskInput {
  return {
    title: t.title,
    description: t.description,
    notes: t.notes,
    statusId: t.statusId,
    priority: t.priority,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    listId: t.listId,
    category: t.category,
    tags: t.tags,
    parentId: t.parentId,
    checklist: t.checklist,
    attachments: t.attachments,
    projectId: t.projectId,
    goalId: t.goalId,
    subjectId: t.subjectId ?? null,
    originModule: t.originModule,
    recurrence: t.recurrence,
    dependsOn: t.dependsOn,
  };
}
