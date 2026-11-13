import { getDb, touch } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { normalizeTags } from '@/domain/tasks';
import { projectInputSchema, type Project, type ProjectInput } from '@/domain/projects';

const ENTITY = 'project';

export class ProjectRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found') {
    super(code);
  }
}

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

function clean(input: ProjectInput): ProjectInput {
  const parsed = projectInputSchema.safeParse({
    ...input,
    tags: normalizeTags(input.tags),
    objectives: input.objectives.map((o) => o.trim()).filter(Boolean),
    criteria: (input.criteria ?? []).map((c) => c.trim()).filter(Boolean),
    participants: input.participants.map((p) => p.trim()).filter(Boolean),
  });
  if (!parsed.success) throw new ProjectRuleError('invalid');
  return parsed.data;
}

export function projectInputOf(p: Project): ProjectInput {
  const { name, description, category, status, priority, start, due, color, coverFileId, tags, objectives, participants, phases, milestones, references, taskPhases } = p;
  return { name, description, category, status, priority, start, due, color, coverFileId, tags, objectives, participants, phases, milestones, references, taskPhases, subjectId: p.subjectId ?? null, instructions: p.instructions ?? '', criteria: p.criteria ?? [] };
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const data = clean(input);
  const at = nowIso();
  const project: Project = { ...data, id: newId('prj'), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
  const db = getDb();
  await db.transaction('rw', db.projects, db.changelog, async () => {
    await db.projects.add(project);
    await log({ entityType: ENTITY, entityId: project.id, action: 'create' });
  });
  return project;
}

/**
 * Salva o projeto. Concluir um marco ou uma etapa não muda o status do projeto
 * sozinho (Parte 7.5): quem decide é o usuário.
 */
export async function updateProject(id: string, input: ProjectInput): Promise<Project> {
  const db = getDb();
  return db.transaction('rw', db.projects, db.changelog, async () => {
    const current = await db.projects.get(id);
    if (!current) throw new ProjectRuleError('not_found');
    const data = clean(input);
    const at = nowIso();
    // Registra quando um marco foi concluído.
    data.milestones = data.milestones.map((m) => {
      const before = current.milestones.find((x) => x.id === m.id);
      if (m.done && !before?.done) return { ...m, doneAt: at };
      if (!m.done) return { ...m, doneAt: null };
      return { ...m, doneAt: before?.doneAt ?? m.doneAt };
    });
    const before = projectInputOf(current);
    const fields = (Object.keys(data) as (keyof ProjectInput)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(data[k]));
    const next: Project = { ...current, ...data, updatedAt: at, rev: current.rev + 1 };
    await db.projects.put(next);
    if (fields.length) await log({ entityType: ENTITY, entityId: id, action: 'update', fields });
    const newlyDone = data.milestones.filter((m) => m.done && !current.milestones.find((x) => x.id === m.id)?.done);
    for (const m of newlyDone) await log({ entityType: ENTITY, entityId: id, action: 'complete', note: m.title });
    return next;
  });
}

/** Manda o projeto para a Lixeira. As tarefas dele continuam em Tasks (o vínculo fica guardado). */
export async function softDeleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.projects, db.changelog, async () => {
    const p = await db.projects.get(id);
    if (!p) return;
    await db.projects.put({ ...p, deletedAt: nowIso(), updatedAt: nowIso(), rev: p.rev + 1 });
    await log({ entityType: ENTITY, entityId: id, action: 'delete' });
  });
}

export async function restoreProject(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.projects, db.changelog, async () => {
    const p = await db.projects.get(id);
    if (!p) return;
    await db.projects.put({ ...p, deletedAt: null, updatedAt: nowIso(), rev: p.rev + 1 });
    await log({ entityType: ENTITY, entityId: id, action: 'restore' });
  });
}

/**
 * Exclusão definitiva. As tarefas não são apagadas: só deixam de apontar para o
 * projeto. Notas ligadas perdem só a ligação.
 */
export async function purgeProject(id: string): Promise<number> {
  const db = getDb();
  return db.transaction('rw', [db.projects, db.tasks, db.notes, db.changelog], async () => {
    const at = nowIso();
    const freed = await db.tasks
      .where('projectId')
      .equals(id)
      .modify((t) => {
        t.projectId = null;
        touch(t, at);
      });
    await db.notes.filter((n) => n.links.some((l) => l.type === 'project' && l.id === id)).modify((n) => {
      n.links = n.links.filter((l) => !(l.type === 'project' && l.id === id));
      touch(n, at);
    });
    await db.projects.delete(id);
    await log({ entityType: ENTITY, entityId: id, action: 'purge', note: String(freed) });
    return freed;
  });
}

export async function projectHistory(id: string): Promise<ChangeEntry[]> {
  return getDb().changelog.where('[entityType+entityId]').equals([ENTITY, id]).reverse().sortBy('seq');
}
