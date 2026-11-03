import { beforeEach, describe, expect, it } from 'vitest';
import { RoutigDB, setDbForTests, getDb } from '@/data/db';
import { changedFields, loadSettings, saveSettings } from '@/data/settingsRepo';
import { defaultSettings } from '@/domain/settings';
import { newId } from '@/domain/ids';

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-${Math.random().toString(36).slice(2)}`));
});

describe('persistência local (IndexedDB)', () => {
  it('grava e lê as configurações', async () => {
    const s = defaultSettings();
    s.theme = 'dark';
    s.profile.displayName = 'Lu';
    await saveSettings(s);
    const loaded = await loadSettings();
    expect(loaded.theme).toBe('dark');
    expect(loaded.profile.displayName).toBe('Lu');
  });

  it('sobrevive a uma nova conexão com o mesmo banco (simula fechar e abrir o app)', async () => {
    const name = `test-reopen-${Math.random().toString(36).slice(2)}`;
    setDbForTests(new RoutigDB(name));
    const s = defaultSettings();
    s.locale = 'en';
    await saveSettings(s);
    getDb().close();
    setDbForTests(new RoutigDB(name));
    expect((await loadSettings()).locale).toBe('en');
  });

  it('registra no histórico só os campos que mudaram', async () => {
    const s = defaultSettings();
    await saveSettings(s);
    await saveSettings({ ...s, theme: 'light' });
    await saveSettings({ ...s, theme: 'light' }); // sem mudança: não registra
    const log = await getDb().changelog.orderBy('seq').toArray();
    expect(log.map((e) => e.action)).toEqual(['create', 'update']);
    expect(log[1]?.fields).toEqual(['theme']);
  });

  it('recusa configurações inválidas sem gravar nada', async () => {
    const bad = { ...defaultSettings(), theme: 'rainbow' } as unknown as ReturnType<typeof defaultSettings>;
    await expect(saveSettings(bad)).rejects.toThrow();
    expect(await getDb().kv.count()).toBe(0);
  });

  it('changedFields compara por valor', () => {
    expect(changedFields({ a: [1], b: 2 }, { a: [1], b: 3 })).toEqual(['b']);
    expect(changedFields(undefined, { a: 1 })).toEqual(['a']);
  });

  it('identificadores são únicos e levam o prefixo do tipo', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId('task')));
    expect(ids.size).toBe(2000);
    expect([...ids][0]).toMatch(/^task_[0-9a-z]{21}$/);
  });
});
