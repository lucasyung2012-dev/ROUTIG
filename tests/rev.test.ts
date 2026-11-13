import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createHabit, moveHabit, restoreHabit, setHabitLog, softDeleteHabit, softDeleteHabitLog, restoreHabitLog } from '@/data/habitsRepo';
import { createTask, restoreTask, softDeleteTask } from '@/data/tasksRepo';
import { createNote, createNotebook, deleteNotebook, emptyNoteInput, restoreNote, softDeleteNote } from '@/data/notesRepo';
import { createAsset, restoreAsset, setAssetArchived, softDeleteAsset } from '@/data/financeRepo';
import { emptyHabitInput } from '@/domain/habits';
import { emptyTaskInput } from '@/domain/tasks';
import { emptyAssetInput } from '@/domain/finance';

beforeEach(() => setDbForTests(new RoutigDB(`test-rev-${Math.random().toString(36).slice(2)}`)));

// A sincronização fica com o registro de rev maior: excluir e restaurar precisam somar rev.
describe('rev sobe em toda alteração (exclusão, restauração, cascata)', () => {
  it('hábitos e registros: excluir, restaurar e reordenar', async () => {
    const db = getDb();
    const h = await createHabit({ ...emptyHabitInput('2026-11-02'), name: 'Ler' });
    const other = await createHabit({ ...emptyHabitInput('2026-11-02'), name: 'Correr' });
    expect(h.rev).toBe(1);
    await softDeleteHabit(h.id);
    const deleted = await db.habits.get(h.id);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.rev).toBe(2);
    await restoreHabit(h.id);
    const restored = await db.habits.get(h.id);
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.rev).toBe(3);
    expect(restored!.updatedAt >= deleted!.updatedAt).toBe(true);

    await moveHabit(other.id, -1);
    expect((await db.habits.get(other.id))?.rev).toBe(2);
    expect((await db.habits.get(h.id))?.rev).toBe(4);

    const log = await setHabitLog(h.id, '2026-11-03', 1, '', '2026-11-04');
    await softDeleteHabitLog(log.id);
    expect((await db.habitLogs.get(log.id))?.rev).toBe(log.rev + 1);
    await restoreHabitLog(log.id);
    expect((await db.habitLogs.get(log.id))?.rev).toBe(log.rev + 2);
  });

  it('tarefas: a subtarefa que sai e volta junto com a mãe também sobe rev', async () => {
    const db = getDb();
    const mother = await createTask(emptyTaskInput({ title: 'Projeto' }));
    const child = await createTask(emptyTaskInput({ title: 'Pesquisar', parentId: mother.id }));
    expect(await softDeleteTask(mother.id)).toBe(2);
    expect((await db.tasks.get(mother.id))?.rev).toBe(mother.rev + 1);
    expect((await db.tasks.get(child.id))?.rev).toBe(child.rev + 1);
    await restoreTask(mother.id);
    const [m, c] = await Promise.all([db.tasks.get(mother.id), db.tasks.get(child.id)]);
    expect(m?.deletedAt).toBeNull();
    expect(c?.deletedAt).toBeNull();
    expect(m?.rev).toBe(mother.rev + 2);
    expect(c?.rev).toBe(child.rev + 2);
  });

  it('notas: excluir, restaurar e perder o caderno', async () => {
    const db = getDb();
    const nb = await createNotebook('Escola', '#123456');
    const n = await createNote(emptyNoteInput({ title: 'Resumo', notebookId: nb.id }));
    await softDeleteNote(n.id);
    expect((await db.notes.get(n.id))?.rev).toBe(n.rev + 1);
    await restoreNote(n.id);
    expect((await db.notes.get(n.id))?.rev).toBe(n.rev + 2);
    await deleteNotebook(nb.id);
    const after = await db.notes.get(n.id);
    expect(after?.notebookId).toBeNull();
    expect(after?.rev).toBe(n.rev + 3);
  });

  it('finanças: excluir, restaurar e arquivar o ativo', async () => {
    const db = getDb();
    const a = await createAsset({ ...emptyAssetInput(), name: 'Petrobras', ticker: 'petr4' });
    await softDeleteAsset(a.id);
    expect((await db.finAssets.get(a.id))?.rev).toBe(a.rev + 1);
    await restoreAsset(a.id);
    const restored = await db.finAssets.get(a.id);
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.rev).toBe(a.rev + 2);
    await setAssetArchived(a.id, true);
    expect((await db.finAssets.get(a.id))?.rev).toBe(a.rev + 3);
  });
});
