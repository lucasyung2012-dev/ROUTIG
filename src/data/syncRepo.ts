/**
 * Sincronização entre aparelhos: cada aparelho envia uma cópia criptografada dos seus dados para a
 * pasta do app na nuvem e junta as cópias dos outros, registro a registro. O app continua
 * funcionando sem internet; a sincronização é um passo a mais, nunca um requisito.
 *
 * Provedor principal: Dropbox (pasta Aplicativos/ROUTIG), porque o login fica válido e a
 * sincronização automática continua no iPhone e no iPad. Alternativa: Google Drive (pasta oculta
 * do app). Chave, criptografia, código de recuperação e a regra de juntar são os mesmos nos dois.
 */
import { getDb, DB_SCHEMA_VERSION } from './db';
import { collectTables } from './backupRepo';
import { mergeRemote, syncable, normalizeRecoveryCode } from '@/domain/sync';
import type { BackupTables } from '@/domain/backup';
import { newId, nowIso } from '@/domain/ids';
import { decryptText, encryptText, exportKey, importKey, newDataKey, newRecoveryCode, unwrapDataKey, wrapDataKey } from '@/services/syncCrypto';
import { getToken, listAppFiles, readAppFile, signOutGoogle, whoAmI, writeAppFile } from '@/services/google';
import { dropboxAccess, dropboxList, dropboxRead, dropboxSignOut, dropboxWhoAmI, dropboxWrite, finishDropboxLogin } from '@/services/dropbox';

export type SyncProvider = 'dropbox' | 'google';

export interface SyncState {
  provider: SyncProvider;
  /** ID do cliente OAuth do Google (provedor Google). */
  clientId: string;
  /** Chave do app no Dropbox (provedor Dropbox; não é segredo). */
  dbxKey: string;
  /** Token de renovação do Dropbox (só neste aparelho). */
  dbxRefresh: string;
  deviceId: string;
  deviceName: string;
  email: string;
  name: string;
  /** Chave dos dados (só neste aparelho; na nuvem ela fica embrulhada pelo código). */
  key: string;
  lastSync: string;
  lastChanged: number;
  auto: boolean;
}

const KEY = 'routig.sync';
const KEY_FILE = 'routig-key.json';
const deviceFile = (id: string) => `routig-device-${id}.json`;

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad|Macintosh.*Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Computador (Windows)';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Aparelho';
}

export function loadSyncState(): SyncState {
  let s: Partial<SyncState> = {};
  try {
    s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SyncState>;
  } catch {
    /* começa do zero */
  }
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  // Quem já tinha ligado pelo Google continua no Google; o resto começa no Dropbox.
  const provider: SyncProvider = s.provider ?? (s.key && s.clientId ? 'google' : 'dropbox');
  return {
    provider,
    clientId: s.clientId || (env.VITE_GOOGLE_CLIENT_ID ?? ''),
    dbxKey: s.dbxKey || (env.VITE_DROPBOX_APP_KEY ?? ''),
    dbxRefresh: s.dbxRefresh ?? '',
    deviceId: s.deviceId || newId('dev'),
    deviceName: s.deviceName || guessDeviceName(),
    email: s.email ?? '',
    name: s.name ?? '',
    key: s.key ?? '',
    lastSync: s.lastSync ?? '',
    lastChanged: s.lastChanged ?? 0,
    auto: s.auto ?? true,
  };
}

export function saveSyncState(s: SyncState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento */
  }
}

/** Pronto para sincronizar sozinho, sem janela de login: conectado e com a chave dos dados. */
export function syncReady(s: SyncState): boolean {
  if (!s.key) return false;
  return s.provider === 'google' ? !!s.clientId : !!s.dbxKey && !!s.dbxRefresh;
}

/** Operações na pasta do app, iguais para os dois provedores. */
interface Remote {
  list(): Promise<Array<{ name: string; id?: string }>>;
  read(f: { name: string; id?: string }): Promise<string>;
  write(name: string, text: string, existing?: { name: string; id?: string }): Promise<void>;
}

async function remote(s: SyncState, interactive: boolean): Promise<Remote> {
  if (s.provider === 'google') {
    if (!s.clientId) throw new Error('no-client-id');
    const access = await getToken(s.clientId, interactive);
    return {
      list: () => listAppFiles(access),
      read: (f) => readAppFile(access, f.id ?? ''),
      write: async (name, text, existing) => {
        await writeAppFile(access, name, text, existing?.id);
      },
    };
  }
  if (!s.dbxKey) throw new Error('no-app-key');
  if (!s.dbxRefresh) throw new Error('not-ready');
  const access = await dropboxAccess(s.dbxKey, s.dbxRefresh);
  return {
    list: () => dropboxList(access),
    read: (f) => dropboxRead(access, f.name),
    write: (name, text) => dropboxWrite(access, name, text),
  };
}

/** Entra com o Google (abre a janela; chamar a partir de um toque) e diz se a conta já tem chave. */
export async function connectGoogle(s: SyncState): Promise<{ state: SyncState; hasKey: boolean }> {
  if (!s.clientId) throw new Error('no-client-id');
  const access = await getToken(s.clientId, true);
  const me = await whoAmI(access);
  const files = await listAppFiles(access);
  const state: SyncState = { ...s, provider: 'google', email: me.email, name: me.name };
  saveSyncState(state);
  return { state, hasKey: files.some((f) => f.name === KEY_FILE) };
}

/** Termina o login do Dropbox com o código devolvido e diz se a conta já tem chave. */
export async function connectDropbox(s: SyncState, code: string): Promise<{ state: SyncState; hasKey: boolean }> {
  if (!s.dbxKey) throw new Error('no-app-key');
  const refresh = await finishDropboxLogin(s.dbxKey, code);
  const access = await dropboxAccess(s.dbxKey, refresh);
  const me = await dropboxWhoAmI(access);
  const files = await dropboxList(access);
  const state: SyncState = { ...s, provider: 'dropbox', dbxRefresh: refresh, email: me.email, name: me.name };
  saveSyncState(state);
  return { state, hasKey: files.some((f) => f.name === KEY_FILE) };
}

/** Diz se a conta conectada já tem chave (outro aparelho criou). */
export async function cloudHasKey(s: SyncState): Promise<boolean> {
  const r = await remote(s, false);
  return (await r.list()).some((f) => f.name === KEY_FILE);
}

/** Primeiro aparelho: cria a chave e devolve o código de recuperação (mostrar uma vez). */
export async function createSyncKey(s: SyncState): Promise<{ state: SyncState; code: string }> {
  const r = await remote(s, false);
  if ((await r.list()).some((f) => f.name === KEY_FILE)) throw new Error('key-exists');
  const key = await newDataKey();
  const code = newRecoveryCode();
  await r.write(KEY_FILE, await wrapDataKey(key, code));
  const state = { ...s, key: await exportKey(key) };
  saveSyncState(state);
  return { state, code };
}

/** Outro aparelho: libera a chave com o código de recuperação. */
export async function joinWithCode(s: SyncState, input: string): Promise<SyncState> {
  const code = normalizeRecoveryCode(input);
  if (!code) throw new Error('bad-code');
  const r = await remote(s, false);
  const file = (await r.list()).find((f) => f.name === KEY_FILE);
  if (!file) throw new Error('no-key');
  let key: CryptoKey;
  try {
    key = await unwrapDataKey(await r.read(file), code);
  } catch {
    throw new Error('wrong-code');
  }
  const state = { ...s, key: await exportKey(key) };
  saveSyncState(state);
  return state;
}

async function applyIncoming(incoming: Record<string, Array<Record<string, unknown>>>) {
  const db = getDb();
  const names = Object.keys(incoming).filter((n) => db.tables.some((t) => t.name === n));
  if (!names.length) return;
  await db.transaction('rw', names.map((n) => db.table(n)), async () => {
    for (const n of names) await db.table(n).bulkPut(incoming[n]!);
  });
}

export interface SyncResult {
  changed: number;
  devices: number;
  state: SyncState;
}

/** Sincroniza agora: junta os outros aparelhos aqui e envia a cópia deste. */
export async function syncNow(s: SyncState, interactive = false): Promise<SyncResult> {
  if (!syncReady(s)) throw new Error('not-ready');
  const r = await remote(s, interactive);
  const key = await importKey(s.key);
  const files = await r.list();
  const mine = files.find((f) => f.name === deviceFile(s.deviceId));
  const others = files.filter((f) => f.name.startsWith('routig-device-') && f !== mine);
  const remotes: BackupTables[] = [];
  for (const f of others) {
    try {
      const payload = JSON.parse(await decryptText(await r.read(f), key)) as { schema: number; tables: BackupTables };
      // Cópia de uma versão mais nova do app: espera este aparelho atualizar antes de juntar.
      if (payload.schema > DB_SCHEMA_VERSION) continue;
      remotes.push(payload.tables);
    } catch {
      /* cópia ilegível (chave antiga ou arquivo corrompido): ignora esta */
    }
  }
  const local = await collectTables();
  const { incoming, changed } = mergeRemote(local, remotes);
  await applyIncoming(incoming);
  const tables = changed ? syncable(await collectTables()) : syncable(local);
  const text = JSON.stringify({ deviceId: s.deviceId, deviceName: s.deviceName, at: nowIso(), schema: DB_SCHEMA_VERSION, tables });
  await r.write(deviceFile(s.deviceId), await encryptText(text, key), mine);
  const state = { ...s, lastSync: nowIso(), lastChanged: changed };
  saveSyncState(state);
  return { changed, devices: others.length + 1, state };
}

/** Desliga a sincronização neste aparelho (os dados locais ficam; a cópia na nuvem também). */
export async function disconnect(s: SyncState): Promise<SyncState> {
  if (s.provider === 'google') signOutGoogle();
  else if (s.dbxKey && s.dbxRefresh) await dropboxSignOut(s.dbxKey, s.dbxRefresh);
  const state: SyncState = { ...s, email: '', name: '', key: '', lastSync: '', dbxRefresh: '' };
  saveSyncState(state);
  return state;
}
