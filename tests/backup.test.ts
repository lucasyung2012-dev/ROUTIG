import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { BackupDB, buildBackupText, listSnapshots, readBackup, restoreBackup, runAutoBackupIfDue, saveBackupPrefs, setBackupDbForTests } from '@/data/backupRepo';
import { createTask } from '@/data/tasksRepo';
import {
  autoBackupDue,
  base64ToBytes,
  bytesToBase64,
  DEFAULT_BACKUP_PREFS,
  hasUserData,
  isBackupStale,
  migrateBackupPrefs,
  parseBackup,
  serializeBackup,
} from '@/domain/backup';
import { emptyTaskInput } from '@/domain/tasks';

beforeEach(() => {
  const id = Math.random().toString(36).slice(2);
  setDbForTests(new RoutigDB(`test-backup-${id}`));
  setBackupDbForTests(new BackupDB(`test-backups-${id}`));
});

const meta = { appVersion: '0.8.0', schemaVersion: 7, createdAt: '2026-11-03T12:00:00.000Z' };

describe('formato e integridade (Parte 25.5)', () => {
  it('ida e volta mantém tudo e confere o checksum', async () => {
    const tables = { tasks: [{ id: 't1', title: 'Ação' }], kv: [{ key: 'settings', value: { theme: 'dark' } }] };
    const { text, header } = await serializeBackup(tables, meta);
    expect(header.counts).toEqual({ tasks: 1, kv: 1 });
    const r = await parseBackup(text, ['tasks', 'kv'], 7);
    expect(r.ok && r.backup.tables).toEqual(tables);
  });

  it('recusa arquivo alterado, de versão mais nova ou que não é do ROUTIG', async () => {
    const { text } = await serializeBackup({ tasks: [{ id: 't1', title: 'A' }] }, meta);
    expect(await parseBackup(text.replace('"A"', '"B"'), ['tasks'], 7)).toEqual({ ok: false, problem: 'checksum' });
    expect(await parseBackup(text, ['tasks'], 6)).toEqual({ ok: false, problem: 'newer_schema' });
    expect(await parseBackup('{"oi":1}', ['tasks'], 7)).toEqual({ ok: false, problem: 'not_routig' });
    expect(await parseBackup('não é json', ['tasks'], 7)).toEqual({ ok: false, problem: 'not_json' });
  });

  it('ignora tabelas que esta versão não conhece e avisa', async () => {
    const { text } = await serializeBackup({ tasks: [], futuro: [{ id: 'x' }] }, meta);
    const r = await parseBackup(text, ['tasks'], 7);
    expect(r.ok && r.ignoredTables).toEqual(['futuro']);
    expect(r.ok && Object.keys(r.backup.tables)).toEqual(['tasks']);
  });

  it('base64 de arquivos binários volta igual', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe('avisos e cópia automática (Parte 25.2 e 25.7)', () => {
  const now = new Date('2026-11-10T12:00:00Z');

  it('avisa só com dados, lembrete ligado e backup antigo', () => {
    expect(isBackupStale(null, DEFAULT_BACKUP_PREFS, true, now)).toBe(true);
    expect(isBackupStale(null, DEFAULT_BACKUP_PREFS, false, now)).toBe(false);
    expect(isBackupStale('2026-11-08T12:00:00Z', DEFAULT_BACKUP_PREFS, true, now)).toBe(false);
    expect(isBackupStale('2026-11-01T12:00:00Z', DEFAULT_BACKUP_PREFS, true, now)).toBe(true);
    expect(isBackupStale(null, { ...DEFAULT_BACKUP_PREFS, reminderDays: 0 }, true, now)).toBe(false);
    expect(isBackupStale(null, { ...DEFAULT_BACKUP_PREFS, snoozedUntil: '2026-11-11T00:00:00Z' }, true, now)).toBe(false);
  });

  it('cópia automática no máximo a cada 20 horas', () => {
    expect(autoBackupDue(null, DEFAULT_BACKUP_PREFS, now)).toBe(true);
    expect(autoBackupDue('2026-11-10T00:00:00Z', DEFAULT_BACKUP_PREFS, now)).toBe(false);
    expect(autoBackupDue('2026-11-09T12:00:00Z', DEFAULT_BACKUP_PREFS, now)).toBe(true);
    expect(autoBackupDue(null, { ...DEFAULT_BACKUP_PREFS, autoDaily: false }, now)).toBe(false);
  });

  it('configurações e histórico sozinhos não contam como dados', () => {
    expect(hasUserData({ kv: 3, changelog: 10, tasks: 0 })).toBe(false);
    expect(hasUserData({ kv: 3, notes: 1 })).toBe(true);
    expect(migrateBackupPrefs({ reminderDays: 5 })).toEqual(DEFAULT_BACKUP_PREFS);
  });
});

describe('cópias e restauração (Parte 25.4)', () => {
  it('não faz cópia automática sem dados; faz quando há', async () => {
    expect(await runAutoBackupIfDue()).toBeNull();
    await createTask({ ...emptyTaskInput(), title: 'Estudar' });
    expect((await runAutoBackupIfDue())?.kind).toBe('auto');
    expect(await runAutoBackupIfDue()).toBeNull(); // já fez hoje
  });

  it('restaura o backup e guarda antes uma cópia do estado atual', async () => {
    await createTask({ ...emptyTaskInput(), title: 'Do backup' });
    await saveBackupPrefs({ ...DEFAULT_BACKUP_PREFS, reminderDays: 14 });
    const { text } = await buildBackupText();

    await createTask({ ...emptyTaskInput(), title: 'Criada depois' });
    const parsed = await readBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await restoreBackup(parsed.backup);

    expect((await getDb().tasks.toArray()).map((x) => x.title)).toEqual(['Do backup']);
    const snaps = await listSnapshots();
    expect(snaps.map((s) => s.kind)).toEqual(['beforeRestore']);
    expect(snaps[0]!.counts.tasks).toBe(2); // o estado anterior ficou guardado
  });
});
