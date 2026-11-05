import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { BackupDB, buildBackupText, deleteOldAutoCopies, listSnapshots, readBackup, recoverFromBackup, saveSnapshot, setBackupDbForTests } from '@/data/backupRepo';
import { oldAutoCopies, planRecovery } from '@/domain/backup';

beforeEach(() => {
  const id = Math.random().toString(36).slice(2);
  setDbForTests(new RoutigDB(`test-rec-${id}`));
  setBackupDbForTests(new BackupDB(`test-rec-b-${id}`));
});

describe('recuperar o que falta (Parte 25)', () => {
  it('plano: só ids que não existem, só nos módulos escolhidos; arquivo volta só se usado', () => {
    const backup = {
      tasks: [{ id: 't1' }, { id: 't2' }],
      notes: [{ id: 'n1', blocks: [{ fileId: 'f1' }] }],
      events: [{ id: 'e1' }],
      files: [{ id: 'f1', data: '' }, { id: 'f2', data: '' }],
    };
    const now = { tasks: new Set(['t1']), notes: new Set<string>(), events: new Set<string>(), files: new Set<string>() };
    const p = planRecovery(backup, now, ['tasks', 'notes']);
    expect(p.add.tasks).toEqual([{ id: 't2' }]);
    expect(p.add.events).toBeUndefined();
    expect(p.perGroup).toMatchObject({ tasks: 1, notes: 1, calendar: 0 });
    expect(p.add.files).toEqual([{ id: 'f1', data: '' }]);
    expect(planRecovery(backup, now, ['tasks']).files).toBe(0);
  });

  it('recupera o que foi apagado de vez sem mexer no que existe, e guarda uma cópia antes', async () => {
    const db = getDb();
    await db.tasks.bulkAdd([{ id: 't1', title: 'Fica' } as never, { id: 't2', title: 'Some' } as never]);
    const parsed = await readBackup((await buildBackupText()).text);
    if (!parsed.ok) throw new Error('backup inválido');

    await db.tasks.delete('t2');
    await db.tasks.update('t1', { title: 'Mudou depois' } as never);
    const r = await recoverFromBackup(parsed.backup, ['tasks']);
    expect(r.plan.perGroup.tasks).toBe(1);
    expect(r.safety?.kind).toBe('beforeRestore');
    expect((await db.tasks.get('t1')) as unknown).toMatchObject({ title: 'Mudou depois' });
    expect((await db.tasks.get('t2')) as unknown).toMatchObject({ title: 'Some' });
    // Nada mais a recuperar: segunda vez não faz nada nem cria cópia.
    expect((await recoverFromBackup(parsed.backup, ['tasks'])).safety).toBeNull();
  });
});

describe('cópias automáticas antigas', () => {
  it('só as automáticas além das mais novas; manuais e "antes de restaurar" ficam', async () => {
    const snaps = [
      { id: 'a1', kind: 'auto', createdAt: '2026-11-01' },
      { id: 'a3', kind: 'auto', createdAt: '2026-11-03' },
      { id: 'm', kind: 'manual', createdAt: '2026-10-01' },
      { id: 'a2', kind: 'auto', createdAt: '2026-11-02' },
      { id: 'b', kind: 'beforeRestore', createdAt: '2026-09-01' },
    ];
    expect(oldAutoCopies(snaps, 1).map((s) => s.id)).toEqual(['a2', 'a1']);
    expect(oldAutoCopies(snaps, 7)).toEqual([]);

    await getDb().tasks.add({ id: 't', title: 'x' } as never);
    await saveSnapshot('manual');
    for (let i = 0; i < 3; i++) await saveSnapshot('auto');
    expect(await deleteOldAutoCopies(1)).toBe(2);
    const left = await listSnapshots();
    expect(left.map((s) => s.kind).sort()).toEqual(['auto', 'manual']);
  });
});
