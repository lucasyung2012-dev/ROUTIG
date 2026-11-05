import Dexie, { type EntityTable } from 'dexie';
import { APP_VERSION } from '@/app/version';
import { DB_SCHEMA_VERSION, getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import {
  autoBackupDue,
  base64ToBytes,
  bytesToBase64,
  hasUserData,
  migrateBackupPrefs,
  oldAutoCopies,
  parseBackup,
  planRecovery,
  serializeBackup,
  type BackupFile,
  type BackupPrefs,
  type BackupTables,
  type ParsedBackup,
  type RecoverGroup,
  type RecoveryPlan,
} from '@/domain/backup';

const PREFS_KEY = 'backup.prefs';

export type SnapshotKind = 'auto' | 'manual' | 'beforeRestore';

/** Cópia interna completa, guardada fora do banco principal. */
export interface Snapshot {
  id: string;
  createdAt: string;
  kind: SnapshotKind;
  appVersion: string;
  schemaVersion: number;
  checksum: string;
  counts: Record<string, number>;
  size: number;
  /** O arquivo de backup inteiro, como texto. */
  text: string;
}

export type SnapshotInfo = Omit<Snapshot, 'text'>;

function infoOf({ text, ...info }: Snapshot): SnapshotInfo {
  void text;
  return info;
}

/** Registro de cada exportação (o arquivo em si fica onde o usuário salvou). */
export interface ExportRecord {
  id: string;
  at: string;
  fileName: string;
  size: number;
  checksum: string;
}

/**
 * Banco separado para as cópias: restaurar ou apagar o banco principal não
 * apaga as cópias. Nada aqui é excluído sem o usuário pedir (Parte 25).
 */
export class BackupDB extends Dexie {
  snapshots!: EntityTable<Snapshot, 'id'>;
  exports!: EntityTable<ExportRecord, 'id'>;

  constructor(name = 'routig-backups') {
    super(name);
    this.version(1).stores({ snapshots: 'id, createdAt, kind', exports: 'id, at' });
  }
}

let backupDb: BackupDB | null = null;
export function getBackupDb(): BackupDB {
  if (!backupDb) backupDb = new BackupDB();
  return backupDb;
}
/** Só para testes. */
export function setBackupDbForTests(db: BackupDB | null): void {
  backupDb = db;
}

/* ---------- Preferências ---------- */

export async function loadBackupPrefs(): Promise<BackupPrefs> {
  return migrateBackupPrefs((await getDb().kv.get(PREFS_KEY))?.value);
}

export async function saveBackupPrefs(prefs: BackupPrefs): Promise<void> {
  await getDb().kv.put({ key: PREFS_KEY, value: migrateBackupPrefs(prefs), updatedAt: nowIso() });
}

/* ---------- Ler e montar ---------- */

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

/** Todas as tabelas do banco principal; arquivos binários viram base64. */
export async function collectTables(): Promise<BackupTables> {
  const db = getDb();
  const out: BackupTables = {};
  for (const table of db.tables) {
    const rows = await table.toArray();
    if (table.name === 'files') {
      out.files = await Promise.all(
        rows.map(async (r) => {
          const { blob, ...rest } = r as { blob: Blob } & Record<string, unknown>;
          return { ...rest, data: await blobToBase64(blob) };
        }),
      );
    } else out[table.name] = rows;
  }
  return out;
}

export async function currentCounts(): Promise<Record<string, number>> {
  const db = getDb();
  const entries = await Promise.all(db.tables.map(async (t) => [t.name, await t.count()] as const));
  return Object.fromEntries(entries);
}

export async function buildBackupText(): Promise<{ text: string; checksum: string; counts: Record<string, number>; createdAt: string }> {
  const createdAt = nowIso();
  const { text, header } = await serializeBackup(await collectTables(), { appVersion: APP_VERSION, schemaVersion: DB_SCHEMA_VERSION, createdAt });
  return { text, checksum: header.checksum, counts: header.counts, createdAt };
}

/* ---------- Cópias internas ---------- */

export async function saveSnapshot(kind: SnapshotKind): Promise<SnapshotInfo> {
  const b = await buildBackupText();
  const snap: Snapshot = { id: newId('snap'), createdAt: b.createdAt, kind, appVersion: APP_VERSION, schemaVersion: DB_SCHEMA_VERSION, checksum: b.checksum, counts: b.counts, size: b.text.length, text: b.text };
  await getBackupDb().snapshots.add(snap);
  return infoOf(snap);
}

/** Lista sem carregar o conteúdo (que pode ser grande). */
export async function listSnapshots(): Promise<SnapshotInfo[]> {
  const out: SnapshotInfo[] = [];
  await getBackupDb()
    .snapshots.orderBy('createdAt')
    .reverse()
    .each((s) => {
      out.push(infoOf(s));
    });
  return out;
}

export async function snapshotText(id: string): Promise<string | null> {
  return (await getBackupDb().snapshots.get(id))?.text ?? null;
}

/** Só com confirmação do usuário na tela. */
export async function deleteSnapshot(id: string): Promise<void> {
  await getBackupDb().snapshots.delete(id);
}

/** Cópia automática diária: só se ligada, se há dados e se a última tem mais de 20 h. */
export async function runAutoBackupIfDue(now = new Date()): Promise<SnapshotInfo | null> {
  const prefs = await loadBackupPrefs();
  const last = await getBackupDb().snapshots.where('kind').equals('auto').reverse().sortBy('createdAt');
  if (!autoBackupDue(last[0]?.createdAt ?? null, prefs, now)) return null;
  if (!hasUserData(await currentCounts())) return null;
  const snap = await saveSnapshot('auto');
  // Limite escolhido pelo usuário em Settings → Backup (0 = guarda todas).
  if (prefs.keepAuto > 0) await deleteOldAutoCopies(prefs.keepAuto);
  return snap;
}

/* ---------- Exportação ---------- */

export async function recordExport(fileName: string, size: number, checksum: string): Promise<void> {
  await getBackupDb().exports.add({ id: newId('exp'), at: nowIso(), fileName, size, checksum });
}

export async function listExports(): Promise<ExportRecord[]> {
  return getBackupDb().exports.orderBy('at').reverse().toArray();
}

/* ---------- Restauração ---------- */

export async function readBackup(text: string): Promise<ParsedBackup> {
  return parseBackup(
    text,
    getDb().tables.map((t) => t.name),
    DB_SCHEMA_VERSION,
  );
}

/**
 * Substitui todos os dados deste aparelho pelos do backup. Antes, guarda uma
 * cópia interna do estado atual ("antes de restaurar"), para dar para voltar.
 */
export async function restoreBackup(backup: BackupFile): Promise<SnapshotInfo> {
  const safety = await saveSnapshot('beforeRestore');
  const db = getDb();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = backup.tables[table.name];
      if (!rows?.length) continue;
      await table.bulkAdd(table.name === 'files' ? rows.map(fileFromBackup) : rows);
    }
  });
  return safety;
}

/** Arquivo do backup (base64) de volta para Blob. */
function fileFromBackup(r: unknown) {
  const { data, ...rest } = r as { data: string; mime?: string } & Record<string, unknown>;
  return { ...rest, blob: new Blob([base64ToBytes(data)], { type: rest.mime ?? '' }) };
}

/* ---------- Recuperar sem substituir ---------- */

/** Ids que existem agora em cada tabela (inclusive os da lixeira). */
export async function currentIds(): Promise<Record<string, Set<string>>> {
  const db = getDb();
  const out: Record<string, Set<string>> = {};
  for (const table of db.tables) out[table.name] = new Set((await table.toCollection().primaryKeys()).filter((k): k is string => typeof k === 'string'));
  return out;
}

export async function previewRecovery(backup: BackupFile, groups: readonly RecoverGroup[]): Promise<RecoveryPlan> {
  return planRecovery(backup.tables, await currentIds(), groups);
}

/**
 * Recupera do backup só o que falta neste aparelho, nos módulos escolhidos
 * (Parte 25). Nada que existe é alterado. Antes, guarda uma cópia "antes de
 * restaurar", para dar para voltar.
 */
export async function recoverFromBackup(backup: BackupFile, groups: readonly RecoverGroup[]): Promise<{ plan: RecoveryPlan; safety: SnapshotInfo | null }> {
  const plan = await previewRecovery(backup, groups);
  if (!Object.keys(plan.add).length) return { plan, safety: null };
  const safety = await saveSnapshot('beforeRestore');
  const db = getDb();
  const tables = Object.keys(plan.add).map((name) => db.table(name));
  await db.transaction('rw', tables, async () => {
    for (const table of tables) {
      const rows = plan.add[table.name] ?? [];
      await table.bulkAdd(table.name === 'files' ? rows.map(fileFromBackup) : rows);
    }
  });
  return { plan, safety };
}

/* ---------- Cópias automáticas antigas ---------- */

/** Apaga as cópias automáticas além das `keep` mais novas. Só quando o usuário pede, com confirmação na tela. */
export async function deleteOldAutoCopies(keep: number): Promise<number> {
  const old = oldAutoCopies(await listSnapshots(), keep);
  await getBackupDb().snapshots.bulkDelete(old.map((s) => s.id));
  return old.length;
}
