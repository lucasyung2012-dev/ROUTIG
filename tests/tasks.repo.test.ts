import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import {
  addStatus,
  createList,
  createTask,
  deleteList,
  loadTasksConfig,
  purgeTask,
  removeStatus,
  restoreTask,
  skipOccurrence,
  softDeleteTask,
  taskHistory,
  TaskRuleError,
  toggleDone,
  updateTask,
} from '@/data/tasksRepo';
import { emptyTaskInput } from '@/domain/tasks';

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-tasks-${Math.random().toString(36).slice(2)}`));
});

const make = (title: string, over = {}) => createTask(emptyTaskInput({ title, ...over }));

describe('tarefas: criar, editar e histórico', () => {
  it('cria com id único, data de criação e registro no histórico', async () => {
    const a = await make('Estudar alemão');
    const b = await make('Estudar alemão');
    expect(a.id).not.toBe(b.id);
    expect(a.createdAt).toBeTruthy();
    expect((await taskHistory(a.id)).map((e) => e.action)).toEqual(['create']);
  });

  it('recusa título vazio', async () => {
    await expect(make('   ')).rejects.toBeInstanceOf(TaskRuleError);
  });

  it('editar registra só os campos que mudaram', async () => {
    const a = await make('A');
    await updateTask(a.id, { title: 'A2', priority: 'high' });
    const [last] = await taskHistory(a.id);
    expect(last?.action).toBe('update');
    expect(last?.fields?.sort()).toEqual(['priority', 'title']);
  });

  it('concluir marca a data e reabrir limpa', async () => {
    const a = await make('A');
    const done = await toggleDone(a.id);
    expect(done.task.statusId).toBe('done');
    expect(done.task.completedAt).not.toBeNull();
    const reopened = await toggleDone(a.id);
    expect(reopened.task.completedAt).toBeNull();
  });
});

describe('recorrência: concluir avança o prazo, sem criar cópias (Parte 1.2)', () => {
  it('ocorrência concluída fica no histórico e a mesma tarefa vai para a próxima data', async () => {
    const a = await make('Treino de tênis', {
      dueDate: '2026-11-02',
      recurrence: { freq: 'weekly', interval: 1, weekdays: [], pauses: [{ from: '2026-11-08', to: '2026-11-15', label: 'viagem' }], exceptions: [], until: null },
    });
    const r = await toggleDone(a.id);
    expect(r.completedOccurrence).toEqual({ date: '2026-11-02', next: '2026-11-16' });
    expect(r.task.dueDate).toBe('2026-11-16');
    expect(r.task.statusId).toBe('todo');
    expect(r.task.occurrences).toHaveLength(1);
    expect(await getDb().tasks.count()).toBe(1);
  });

  it('pular ocorrência vira exceção da série', async () => {
    const a = await make('Leitura', { dueDate: '2026-11-02', recurrence: { freq: 'daily', interval: 1, weekdays: [], pauses: [], exceptions: [], until: null } });
    const r = await skipOccurrence(a.id);
    expect(r.task.dueDate).toBe('2026-11-03');
    expect(r.task.recurrence?.exceptions).toEqual(['2026-11-02']);
  });

  it('última ocorrência da série encerra a tarefa', async () => {
    const a = await make('Única', { dueDate: '2026-11-02', recurrence: { freq: 'daily', interval: 1, weekdays: [], pauses: [], exceptions: [], until: '2026-11-02' } });
    const r = await toggleDone(a.id);
    expect(r.completedOccurrence?.next).toBeNull();
    expect(r.task.statusId).toBe('done');
  });
});

describe('dependências', () => {
  it('impede ciclos', async () => {
    const a = await make('A');
    const b = await make('B', { dependsOn: [a.id] });
    await expect(updateTask(a.id, { dependsOn: [b.id] })).rejects.toMatchObject({ code: 'dependency_cycle' });
  });

  it('concluir uma tarefa não conclui as outras (Parte 7.5)', async () => {
    const a = await make('A');
    const b = await make('B', { dependsOn: [a.id] });
    await toggleDone(a.id);
    expect((await getDb().tasks.get(b.id))?.statusId).toBe('todo');
  });
});

describe('Lixeira: nada some sem confirmação (Parte 34, regra 13)', () => {
  it('excluir manda para a Lixeira junto com as subtarefas e restaurar traz de volta', async () => {
    const mother = await make('Trabalho de ciências');
    const child = await make('Pesquisar', { parentId: mother.id });
    expect(await softDeleteTask(mother.id)).toBe(2);
    expect((await getDb().tasks.get(child.id))?.deletedAt).not.toBeNull();
    await restoreTask(mother.id);
    expect((await getDb().tasks.get(child.id))?.deletedAt).toBeNull();
  });

  it('excluir de vez apaga e tira das dependências das outras', async () => {
    const a = await make('A');
    const b = await make('B', { dependsOn: [a.id] });
    await softDeleteTask(a.id);
    await purgeTask(a.id);
    expect(await getDb().tasks.get(a.id)).toBeUndefined();
    expect((await getDb().tasks.get(b.id))?.dependsOn).toEqual([]);
  });
});

describe('listas e status configuráveis (Parte 7.2)', () => {
  it('excluir lista mantém as tarefas, sem lista', async () => {
    const list = await createList('Escola', '#7357F6');
    const a = await make('A', { listId: list.id });
    expect(await deleteList(list.id)).toBe(1);
    expect((await getDb().tasks.get(a.id))?.listId).toBeNull();
  });

  it('status novo pode ser removido só se ninguém usa; os de fábrica ficam', async () => {
    const s = await addStatus('Revisando', 'active');
    const a = await make('A', { statusId: s.id });
    await expect(removeStatus(s.id)).rejects.toMatchObject({ code: 'status_in_use' });
    await updateTask(a.id, { statusId: 'todo' });
    await removeStatus(s.id);
    const cfg = await loadTasksConfig();
    expect(cfg.statuses.map((x) => x.id)).toEqual(['todo', 'doing', 'waiting', 'done', 'cancelled', 'archived']);
    await expect(removeStatus('done')).rejects.toBeInstanceOf(TaskRuleError);
  });
});
