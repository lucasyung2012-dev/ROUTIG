import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { DB_SCHEMA_VERSION, getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createTask } from '@/data/tasksRepo';
import { emptyTaskInput } from '@/domain/tasks';
import { listDevices, loadSyncState, removeDevice, syncNow, type SyncState } from '@/data/syncRepo';
import { encryptText, exportKey, newDataKey } from '@/services/syncCrypto';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

/** Dropbox de mentira: guarda os arquivos na memória e conta downloads e envios. */
function fakeDropbox() {
  const store = new Map<string, { text: string; rev: number }>();
  const count = { download: 0, upload: 0 };
  const fetchMock = vi.fn(async (url: string, init: { headers?: Record<string, string>; body?: unknown }) => {
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
    if (url.endsWith('/oauth2/token')) return json({ access_token: 'acc', expires_in: 14400 });
    if (url.endsWith('/files/delete_v2')) {
      store.delete((JSON.parse(String(init.body)) as { path: string }).path);
      return json({});
    }
    if (url.endsWith('/files/list_folder')) return json({ entries: [...store].map(([name, f]) => ({ '.tag': 'file', name: name.slice(1), rev: `r${f.rev}` })), cursor: '', has_more: false });
    const arg = JSON.parse(init.headers?.['Dropbox-API-Arg'] ?? '{}') as { path: string };
    if (url.endsWith('/files/download')) {
      count.download++;
      return new Response(store.get(arg.path)!.text, { status: 200 });
    }
    if (url.endsWith('/files/upload')) {
      count.upload++;
      store.set(arg.path, { text: String(init.body), rev: (store.get(arg.path)?.rev ?? 0) + 1 });
      return json({});
    }
    return new Response('', { status: 404 });
  });
  return { store, count, fetchMock };
}

describe('sincronização: só baixa e envia o que mudou', () => {
  beforeEach(() => {
    localStorage.clear();
    setDbForTests(new RoutigDB(`test-syncflow-${Math.random().toString(36).slice(2)}`));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('junta o outro aparelho uma vez; sem mudança não baixa nem envia de novo; mudança local envia', async () => {
    const dbx = fakeDropbox();
    vi.stubGlobal('fetch', dbx.fetchMock);
    const key = await newDataKey();
    const mine = await createTask({ ...emptyTaskInput(), title: 'Tarefa A' });
    // Outro aparelho já enviou uma tarefa.
    const other = { ...mine, id: 'task_outro', title: 'Tarefa B' };
    const payload = JSON.stringify({ deviceId: 'devB', deviceName: 'iPad', at: new Date().toISOString(), schema: DB_SCHEMA_VERSION, tables: { tasks: [other] } });
    dbx.store.set('/routig-device-devB.json', { text: await encryptText(payload, key), rev: 1 });

    let s: SyncState = { ...loadSyncState(), provider: 'dropbox', dbxKey: 'appkey', dbxRefresh: 'refresh-flow', deviceId: 'devA', key: await exportKey(key) };

    s = (await syncNow(s)).state;
    expect((await getDb().tasks.get('task_outro'))?.title).toBe('Tarefa B');
    expect(dbx.count).toEqual({ download: 1, upload: 1 });

    // Nada mudou em lugar nenhum: não baixa nem envia.
    s = (await syncNow(s)).state;
    expect(dbx.count).toEqual({ download: 1, upload: 1 });

    // Mudança neste aparelho: envia, sem baixar de novo o que não mudou.
    await createTask({ ...emptyTaskInput(), title: 'Tarefa C' });
    s = (await syncNow(s)).state;
    expect(dbx.count).toEqual({ download: 1, upload: 2 });

    // O outro aparelho mudou o arquivo: baixa só ele.
    dbx.store.set('/routig-device-devB.json', { text: await encryptText(payload, key), rev: 2 });
    await syncNow(s);
    expect(dbx.count.download).toBe(2);
  });

  it('arquivos viajam criptografados: envia o que falta na nuvem e baixa só o que algum registro usa', async () => {
    const dbx = fakeDropbox();
    vi.stubGlobal('fetch', dbx.fetchMock);
    const key = await newDataKey();
    const db = getDb();
    const base = { mime: 'text/plain', size: 3, hash: 'h', createdAt: new Date().toISOString(), origin: 'library' };
    await db.files.put({ ...base, id: 'file_local', name: 'aqui.txt', blob: new Blob(['abc'], { type: 'text/plain' }) });

    // Na nuvem: um arquivo usado por uma tarefa do outro aparelho e um que ninguém usa.
    const t = await createTask({ ...emptyTaskInput(), title: 'Base' });
    const other = { ...t, id: 'task_outro', title: 'Ver anexo file_usado' };
    const payload = JSON.stringify({ deviceId: 'devB', deviceName: 'iPad', at: new Date().toISOString(), schema: DB_SCHEMA_VERSION, tables: { tasks: [other] } });
    dbx.store.set('/routig-device-devB.json', { text: await encryptText(payload, key), rev: 1 });
    const fileText = (id: string) => JSON.stringify({ ...base, id, name: `${id}.txt`, data: btoa('xyz') });
    dbx.store.set('/routig-file-file_usado.bin', { text: await encryptText(fileText('file_usado'), key), rev: 1 });
    dbx.store.set('/routig-file-file_solto.bin', { text: await encryptText(fileText('file_solto'), key), rev: 1 });

    const s: SyncState = { ...loadSyncState(), provider: 'dropbox', dbxKey: 'appkey', dbxRefresh: 'refresh-files', deviceId: 'devA', key: await exportKey(key) };
    await syncNow(s);

    expect(dbx.store.has('/routig-file-file_local.bin')).toBe(true);
    expect(dbx.store.get('/routig-file-file_local.bin')!.text).not.toContain('abc');
    const got = await db.files.get('file_usado');
    expect(got?.name).toBe('file_usado.txt');
    expect(got?.mime).toBe('text/plain');
    // (O banco de teste em memória não guarda o conteúdo do Blob; no aparelho, o IndexedDB guarda.)
    expect(await db.files.get('file_solto')).toBeUndefined();
  });

  it('lista os aparelhos da conta e remove a cópia de um aparelho que não existe mais', async () => {
    const dbx = fakeDropbox();
    vi.stubGlobal('fetch', dbx.fetchMock);
    const key = await newDataKey();
    const copy = (id: string, name: string, at: string) => encryptText(JSON.stringify({ deviceId: id, deviceName: name, at, schema: DB_SCHEMA_VERSION, tables: {} }), key);
    dbx.store.set('/routig-device-velho.json', { text: await copy('velho', 'iPhone', '2026-11-10T10:00:00.000Z'), rev: 1 });
    dbx.store.set('/routig-device-ipad.json', { text: await copy('ipad', 'iPad', '2026-11-13T10:00:00.000Z'), rev: 1 });
    let s: SyncState = { ...loadSyncState(), provider: 'dropbox', dbxKey: 'appkey', dbxRefresh: 'refresh-dev', deviceId: 'novo', deviceName: 'iPhone', key: await exportKey(key) };
    s = (await syncNow(s)).state;

    const list = await listDevices(s);
    expect(list.map((d) => `${d.id}:${d.name}:${d.current}`)).toEqual(['novo:iPhone:true', 'ipad:iPad:false', 'velho:iPhone:false']);

    s = await removeDevice(s, 'velho');
    expect(dbx.store.has('/routig-device-velho.json')).toBe(false);
    expect((await listDevices(s)).map((d) => d.id)).toEqual(['novo', 'ipad']);
    await expect(removeDevice(s, 'novo')).rejects.toThrow('is-current');
  });
});
