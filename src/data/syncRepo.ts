/**
 * Sincronização pelo Google Drive (V2, Etapa 3): cada aparelho envia uma cópia criptografada
 * dos seus dados para a pasta oculta do app e junta as cópias dos outros, registro a registro.
 * O app continua funcionando sem internet; a sincronização é um passo a mais, nunca um requisito.
 */
import { getDb, DB_SCHEMA_VERSION } from './db';
import { collectTables } from './backupRepo';
import { mergeRemote, syncable, normalizeRecoveryCode } from '@/domain/sync';
import type { BackupTables } from '@/domain/backup';
import { newId, nowIso } from '@/domain/ids';
import { decryptText, encryptText, exportKey, importKey, newDataKey, newRecoveryCode, unwrapDataKey, wrapDataKey } from '@/services/syncCrypto';
import { getToken, listAppFiles, readAppFile, signOutGoogle, whoAmI, writeAppFile } from '@/services/google';

export interface SyncState {
  clientId: string;
  deviceId: string;
  deviceName: string;
  email: string;
  name: string;
  /** Chave dos dados (só neste aparelho; no Drive ela fica embrulhada pelo código). */
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
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID ?? '';
  return { clientId: s.clientId || env, deviceId: s.deviceId || newId(), deviceName: s.deviceName || guessDeviceName(), email: s.email ?? '', name: s.name ?? '', key: s.key ?? '', lastSync: s.lastSync ?? '', lastChanged: s.lastChanged ?? 0, auto: s.auto ?? true };
}

export function saveSyncState(s: SyncState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento */
  }
}

/** Entra com o Google (abre a janela; chamar a partir de um toque) e diz se a conta já tem chave. */
export async function connectGoogle(s: SyncState): Promise<{ state: SyncState; hasKey: boolean }> {
  if (!s.clientId) throw new Error('no-client-id');
  const access = await getToken(s.clientId, true);
  const me = await whoAmI(access);
  const files = await listAppFiles(access);
  const state = { ...s, email: me.email, name: me.name };
  saveSyncState(state);
  return { state, hasKey: files.some((f) => f.name === KEY_FILE) };
}

/** Primeiro aparelho: cria a chave e devolve o código de recuperação (mostrar uma vez). */
export async function createSyncKey(s: SyncState): Promise<{ state: SyncState; code: string }> {
  const access = await getToken(s.clientId, false);
  const files = await listAppFiles(access);
  if (files.some((f) => f.name === KEY_FILE)) throw new Error('key-exists');
  const key = await newDataKey();
  const code = newRecoveryCode();
  await writeAppFile(access, KEY_FILE, await wrapDataKey(key, code));
  const state = { ...s, key: await exportKey(key) };
  saveSyncState(state);
  return { state, code };
}

/** Outro aparelho: libera a chave com o código de recuperação. */
export async function joinWithCode(s: SyncState, input: string): Promise<SyncState> {
  const code = normalizeRecoveryCode(input);
  if (!code) throw new Error('bad-code');
  const access = await getToken(s.clientId, false);
  const file = (await listAppFiles(access)).find((f) => f.name === KEY_FILE);
  if (!file) throw new Error('no-key');
  let key: CryptoKey;
  try {
    key = await unwrapDataKey(await readAppFile(access, file.id), code);
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
  if (!s.clientId || !s.key) throw new Error('not-ready');
  const access = await getToken(s.clientId, interactive);
  const key = await importKey(s.key);
  const files = await listAppFiles(access);
  const mine = files.find((f) => f.name === deviceFile(s.deviceId));
  const others = files.filter((f) => f.name.startsWith('routig-device-') && f !== mine);
  const remotes: BackupTables[] = [];
  for (const f of others) {
    try {
      const payload = JSON.parse(await decryptText(await readAppFile(access, f.id), key)) as { schema: number; tables: BackupTables };
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
  await writeAppFile(access, deviceFile(s.deviceId), await encryptText(text, key), mine?.id);
  const state = { ...s, lastSync: nowIso(), lastChanged: changed };
  saveSyncState(state);
  return { changed, devices: others.length + 1, state };
}

/** Desliga a sincronização neste aparelho (os dados locais ficam; a cópia no Drive também). */
export function disconnect(s: SyncState): SyncState {
  signOutGoogle();
  const state = { ...s, email: '', name: '', key: '', lastSync: '' };
  saveSyncState(state);
  return state;
}
