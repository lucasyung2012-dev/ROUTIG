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
import { LOCAL_ONLY_TABLES, mergeRemote, syncable, normalizeRecoveryCode } from '@/domain/sync';
import type { BackupTables } from '@/domain/backup';
import type { StoredFile } from '@/domain/inbox';
import { newId, nowIso } from '@/domain/ids';
import { decryptText, encryptText, exportKey, importKey, newDataKey, newRecoveryCode, unwrapDataKey, wrapDataKey } from '@/services/syncCrypto';
import { deleteAppFile, getToken, listAppFiles, readAppFile, signOutGoogle, whoAmI, writeAppFile } from '@/services/google';
import { dropboxAccess, dropboxDelete, dropboxList, dropboxRead, dropboxSignOut, dropboxWhoAmI, dropboxWrite, finishDropboxLogin } from '@/services/dropbox';

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
  /** Versão de cada arquivo dos outros aparelhos já juntada aqui (não baixa de novo o que não mudou). */
  seen: Record<string, string>;
  /** Última alteração local (changelog) já enviada (não envia de novo sem mudança). */
  sentSeq: number;
}

const KEY = 'routig.sync';
const KEY_FILE = 'routig-key.json';
const deviceFile = (id: string) => `routig-device-${id}.json`;
const FILE_PREFIX = 'routig-file-';
const blobFile = (id: string) => `${FILE_PREFIX}${id}.bin`;

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
    seen: s.seen ?? {},
    sentSeq: s.sentSeq ?? 0,
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

interface RemoteFile {
  name: string;
  id?: string;
  /** Versão do arquivo na nuvem (vazia se o provedor não informar). */
  ver: string;
}

/** Operações na pasta do app, iguais para os dois provedores. */
interface Remote {
  list(): Promise<RemoteFile[]>;
  read(f: RemoteFile): Promise<string>;
  write(name: string, text: string, existing?: RemoteFile): Promise<void>;
  remove(f: RemoteFile): Promise<void>;
}

async function remote(s: SyncState, interactive: boolean): Promise<Remote> {
  if (s.provider === 'google') {
    if (!s.clientId) throw new Error('no-client-id');
    const access = await getToken(s.clientId, interactive);
    return {
      list: async () => (await listAppFiles(access)).map((f) => ({ name: f.name, id: f.id, ver: f.modifiedTime ?? '' })),
      read: (f) => readAppFile(access, f.id ?? ''),
      write: async (name, text, existing) => {
        await writeAppFile(access, name, text, existing?.id);
      },
      remove: (f) => deleteAppFile(access, f.id ?? ''),
    };
  }
  if (!s.dbxKey) throw new Error('no-app-key');
  if (!s.dbxRefresh) throw new Error('not-ready');
  const access = await dropboxAccess(s.dbxKey, s.dbxRefresh);
  return {
    list: () => dropboxList(access),
    read: (f) => dropboxRead(access, f.name),
    write: (name, text) => dropboxWrite(access, name, text),
    remove: (f) => dropboxDelete(access, f.name),
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
  const state = { ...s, key: await exportKey(key), seen: {}, sentSeq: 0 };
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
  const state = { ...s, key: await exportKey(key), seen: {}, sentSeq: 0 };
  saveSyncState(state);
  return state;
}

/** Número da última alteração local registrada (o changelog só recebe o que foi feito neste aparelho). */
export async function lastLocalSeq(): Promise<number> {
  return (await getDb().changelog.orderBy('seq').last())?.seq ?? 0;
}

/** Só o que viaja, sem ler os arquivos binários (que vão separados, em syncFiles). */
async function collectSyncTables(): Promise<BackupTables> {
  const db = getDb();
  const out: BackupTables = {};
  for (const t of db.tables) if (!LOCAL_ONLY_TABLES.has(t.name)) out[t.name] = (await t.toArray()) as Array<Record<string, unknown>>;
  return syncable(out);
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface FilePayload extends Omit<StoredFile, 'blob'> {
  data: string;
}

/**
 * Arquivos binários viajam separados dos dados, um arquivo criptografado por anexo, com o mesmo id
 * em todos os aparelhos (os registros apontam para ele). Envia o que a nuvem ainda não tem; baixa
 * só o que algum registro deste aparelho usa e ainda falta aqui. Um arquivo com problema não
 * interrompe os outros nem a sincronização dos dados.
 */
async function syncFiles(r: Remote, key: CryptoKey, remoteFiles: RemoteFile[]): Promise<void> {
  const db = getDb();
  const inCloud = new Map(remoteFiles.filter((f) => f.name.startsWith(FILE_PREFIX)).map((f) => [f.name, f]));
  const localIds = new Set((await db.files.toCollection().primaryKeys()) as string[]);

  for (const id of localIds) {
    if (inCloud.has(blobFile(id))) continue;
    try {
      const f = await db.files.get(id);
      if (!f) continue;
      const { blob, ...meta } = f;
      const data = toBase64(new Uint8Array(await new Response(blob).arrayBuffer()));
      await r.write(blobFile(id), await encryptText(JSON.stringify({ ...meta, data } satisfies FilePayload), key));
    } catch {
      /* tenta de novo na próxima sincronização */
    }
  }

  const missing = [...inCloud.keys()].map((n) => n.slice(FILE_PREFIX.length, -'.bin'.length)).filter((id) => id && !localIds.has(id));
  if (!missing.length) return;
  // Ids são longos e aleatórios: aparecer no texto dos dados é estar em uso.
  const used = JSON.stringify(await collectSyncTables());
  for (const id of missing) {
    if (!used.includes(id)) continue;
    try {
      const p = JSON.parse(await decryptText(await r.read(inCloud.get(blobFile(id))!), key)) as FilePayload;
      const { data, ...meta } = p;
      await db.files.put({ ...meta, id, blob: new Blob([fromBase64(data)], { type: meta.mime }) });
    } catch {
      /* tenta de novo na próxima sincronização */
    }
  }
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
  const seen: Record<string, string> = {};
  for (const f of others) {
    // Arquivo que não mudou desde a última junção: os dados dele já estão aqui.
    if (f.ver && s.seen[f.name] === f.ver) {
      seen[f.name] = f.ver;
      continue;
    }
    try {
      const payload = JSON.parse(await decryptText(await r.read(f), key)) as { schema: number; tables: BackupTables };
      // Cópia de uma versão mais nova do app: espera este aparelho atualizar antes de juntar.
      if (payload.schema > DB_SCHEMA_VERSION) continue;
      remotes.push(payload.tables);
      if (f.ver) seen[f.name] = f.ver;
    } catch {
      /* cópia ilegível (chave antiga ou arquivo corrompido): ignora esta */
    }
  }
  const local = await collectSyncTables();
  const { incoming, changed } = mergeRemote(local, remotes);
  await applyIncoming(incoming);
  // Arquivos (PDFs, imagens, anexos) antes da cópia dos dados: quem ler a cópia já encontra os arquivos.
  await syncFiles(r, key, files);
  // Envia a cópia deste aparelho só se algo mudou aqui (alteração local ou dados recebidos agora).
  const seq = await lastLocalSeq();
  if (interactive || !mine || changed || seq !== s.sentSeq) {
    const tables = changed ? await collectSyncTables() : local;
    const text = JSON.stringify({ deviceId: s.deviceId, deviceName: s.deviceName, at: nowIso(), schema: DB_SCHEMA_VERSION, tables });
    await r.write(deviceFile(s.deviceId), await encryptText(text, key), mine);
  }
  const state = { ...s, lastSync: nowIso(), lastChanged: changed, seen, sentSeq: seq };
  saveSyncState(state);
  return { changed, devices: others.length + 1, state };
}

export interface SyncDevice {
  id: string;
  name: string;
  /** Última vez que esse aparelho enviou a cópia dele (vazio se não deu para ler). */
  at: string;
  current: boolean;
  /** A cópia não abre com a chave deste aparelho (de outra chave ou corrompida). */
  unreadable: boolean;
}

/** Aparelhos ligados nesta conta: um arquivo de cópia por aparelho na nuvem. */
export async function listDevices(s: SyncState): Promise<SyncDevice[]> {
  if (!syncReady(s)) throw new Error('not-ready');
  const r = await remote(s, false);
  const key = await importKey(s.key);
  const out: SyncDevice[] = [];
  for (const f of (await r.list()).filter((x) => x.name.startsWith('routig-device-') && x.name.endsWith('.json'))) {
    const id = f.name.slice('routig-device-'.length, -'.json'.length);
    const current = id === s.deviceId;
    try {
      const p = JSON.parse(await decryptText(await r.read(f), key)) as { deviceName?: string; at?: string };
      out.push({ id, name: current ? s.deviceName : (p.deviceName ?? ''), at: p.at ?? '', current, unreadable: false });
    } catch {
      out.push({ id, name: current ? s.deviceName : '', at: '', current, unreadable: true });
    }
  }
  return out.sort((a, b) => Number(b.current) - Number(a.current) || b.at.localeCompare(a.at));
}

/**
 * Tira um aparelho da conta: apaga a cópia dele na nuvem. Os dados que ele já enviou continuam nos
 * aparelhos que sincronizaram depois. Se esse aparelho ainda estiver em uso, ele volta a aparecer
 * na próxima sincronização dele (para cortar de vez, use "Desligar neste aparelho" nele).
 */
export async function removeDevice(s: SyncState, deviceId: string): Promise<SyncState> {
  if (deviceId === s.deviceId) throw new Error('is-current');
  const r = await remote(s, false);
  const f = (await r.list()).find((x) => x.name === deviceFile(deviceId));
  if (f) await r.remove(f);
  const seen = { ...s.seen };
  delete seen[deviceFile(deviceId)];
  const next = { ...s, seen };
  saveSyncState(next);
  return next;
}

/** Desliga a sincronização neste aparelho (os dados locais ficam; a cópia na nuvem também). */
export async function disconnect(s: SyncState): Promise<SyncState> {
  if (s.provider === 'google') signOutGoogle();
  else if (s.dbxKey && s.dbxRefresh) await dropboxSignOut(s.dbxKey, s.dbxRefresh);
  const state: SyncState = { ...s, email: '', name: '', key: '', lastSync: '', dbxRefresh: '', seen: {}, sentSeq: 0 };
  saveSyncState(state);
  return state;
}
