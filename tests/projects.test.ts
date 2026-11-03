import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createProject, projectHistory, projectInputOf, purgeProject, restoreProject, softDeleteProject, updateProject } from '@/data/projectsRepo';
import { createTask, toggleDone } from '@/data/tasksRepo';
import { createNote, emptyNoteInput } from '@/data/notesRepo';
import { emptyProjectInput, positionOf, projectProgress, timelineRange } from '@/domain/projects';
import { emptyTaskInput } from '@/domain/tasks';

beforeEach(() => setDbForTests(new RoutigDB(`test-projects-${Math.random().toString(36).slice(2)}`)));

describe('progresso real (Parte 8.2 e 19.5)', () => {
  it('sem tarefas nem marcos, não inventa porcentagem', () => {
    expect(projectProgress({ milestones: [], phases: [] }, [], () => false).percent).toBeNull();
  });

  it('conta tarefas e marcos concluídos', () => {
    const p = projectProgress(
      { milestones: [{ id: 'm', title: 'Entrega', date: null, done: true, doneAt: null }], phases: [] },
      [{ statusId: 'done' }, { statusId: 'todo' }, { statusId: 'todo' }],
      (s) => s === 'done',
    );
    expect(p).toMatchObject({ tasksDone: 1, tasksTotal: 3, milestonesDone: 1, milestonesTotal: 1, percent: 50 });
  });
});

describe('linha do tempo', () => {
  it('cobre todas as datas com folga e posiciona dentro de 0–100%', () => {
    const r = timelineRange(['2026-11-10', null, '2026-12-10'], '2026-11-03');
    expect(r.from).toBe('2026-11-07');
    expect(r.to).toBe('2026-12-13');
    expect(positionOf(r.from, r)).toBe(0);
    expect(positionOf('2027-01-01', r)).toBe(100);
  });
});

describe('projetos: salvar, marcos e integração', () => {
  it('recusa prazo antes do início', async () => {
    await expect(createProject(emptyProjectInput({ name: 'X', start: '2026-12-01', due: '2026-11-01' }))).rejects.toMatchObject({ code: 'invalid' });
  });

  it('concluir marco registra a data e o histórico, sem concluir o projeto sozinho', async () => {
    const p = await createProject(emptyProjectInput({ name: 'Feira de ciências', milestones: [{ id: 'm1', title: 'Maquete pronta', date: '2026-11-20', done: false, doneAt: null }] }));
    const next = await updateProject(p.id, { ...projectInputOf(p), milestones: [{ id: 'm1', title: 'Maquete pronta', date: '2026-11-20', done: true, doneAt: null }] });
    expect(next.milestones[0]?.doneAt).not.toBeNull();
    expect(next.status).toBe('planned');
    expect((await projectHistory(p.id)).some((e) => e.action === 'complete' && e.note === 'Maquete pronta')).toBe(true);
  });

  it('tarefas do projeto são as mesmas do Tasks; concluir todas não conclui o projeto (Parte 7.5)', async () => {
    const p = await createProject(emptyProjectInput({ name: 'Projeto' }));
    const task = await createTask(emptyTaskInput({ title: 'Pesquisar', projectId: p.id }));
    await toggleDone(task.id);
    expect(await getDb().tasks.where('projectId').equals(p.id).count()).toBe(1);
    expect((await getDb().projects.get(p.id))?.status).toBe('planned');
  });

  it('Lixeira e exclusão definitiva: tarefas e notas continuam, só perdem a ligação', async () => {
    const p = await createProject(emptyProjectInput({ name: 'Projeto' }));
    const task = await createTask(emptyTaskInput({ title: 'Pesquisar', projectId: p.id }));
    const note = await createNote(emptyNoteInput({ title: 'Ideias', links: [{ type: 'project', id: p.id }] }));
    await softDeleteProject(p.id);
    await restoreProject(p.id);
    expect((await getDb().projects.get(p.id))?.deletedAt).toBeNull();
    expect(await purgeProject(p.id)).toBe(1);
    expect((await getDb().tasks.get(task.id))?.projectId).toBeNull();
    expect((await getDb().notes.get(note.id))?.links).toEqual([]);
    expect(await getDb().projects.get(p.id)).toBeUndefined();
  });
});
