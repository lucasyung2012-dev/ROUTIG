/**
 * Formato do backup do ROUTIG (Parte 25).
 *
 * Um arquivo JSON com todas as tabelas do banco local. Arquivos (imagens,
 * áudios, PDFs) vão em base64. O `checksum` é o SHA-256 do JSON das tabelas:
 * se um byte mudar, a restauração recusa o arquivo.
 */

export const BACKUP_FORMAT = 'routig-backup';
export const BACKUP_FORMAT_VERSION = 1;

export type BackupTables = Record<string, unknown[]>;

export interface BackupHeader {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  checksum: string;
  counts: Record<string, number>;
}

export interface BackupFile extends BackupHeader {
  tables: BackupTables;
}

/** Tabelas que aparecem com nome na prévia; o resto entra em "outros registros". */
export const MAIN_TABLES = ['tasks', 'events', 'notes', 'projects', 'inbox', 'interests', 'historyEntries', 'files'] as const;
export type MainTable = (typeof MAIN_TABLES)[number];

/** Tabelas que não contam como "dados do usuário" para decidir se há algo a proteger. */
const META_TABLES = new Set(['kv', 'changelog', 'noteVersions', 'noteTemplates']);

export function countRows(tables: BackupTables): Record<string, number> {
  return Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
}

/** Há algo do usuário para guardar? (configurações e histórico sozinhos não contam) */
export function hasUserData(counts: Record<string, number>): boolean {
  return Object.entries(counts).some(([k, n]) => !META_TABLES.has(k) && n > 0);
}

/** SHA-256 em hexadecimal de um texto. */
export async function sha256Text(text: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) throw new Error('crypto indisponível');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Monta o arquivo de backup como texto. As tabelas entram no fim, já com o checksum calculado. */
export async function serializeBackup(tables: BackupTables, meta: { appVersion: string; schemaVersion: number; createdAt: string }): Promise<{ text: string; header: BackupHeader }> {
  const tablesJson = JSON.stringify(tables);
  const header: BackupHeader = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: meta.appVersion,
    schemaVersion: meta.schemaVersion,
    createdAt: meta.createdAt,
    checksum: await sha256Text(tablesJson),
    counts: countRows(tables),
  };
  const headJson = JSON.stringify(header);
  return { text: `${headJson.slice(0, -1)},"tables":${tablesJson}}`, header };
}

export type BackupProblem = 'not_json' | 'not_routig' | 'newer_format' | 'newer_schema' | 'bad_tables' | 'checksum';

export type ParsedBackup = { ok: true; backup: BackupFile; ignoredTables: string[] } | { ok: false; problem: BackupProblem };

/**
 * Lê e confere um arquivo de backup: formato, versão e integridade.
 * `knownTables` são as tabelas do banco atual; as desconhecidas são ignoradas (e listadas).
 */
export async function parseBackup(text: string, knownTables: readonly string[], currentSchema: number): Promise<ParsedBackup> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'not_json' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, problem: 'not_routig' };
  const b = raw as Partial<BackupFile>;
  if (b.format !== BACKUP_FORMAT) return { ok: false, problem: 'not_routig' };
  if (typeof b.formatVersion !== 'number' || b.formatVersion > BACKUP_FORMAT_VERSION) return { ok: false, problem: 'newer_format' };
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > currentSchema) return { ok: false, problem: 'newer_schema' };
  if (!b.tables || typeof b.tables !== 'object' || Array.isArray(b.tables)) return { ok: false, problem: 'bad_tables' };
  for (const rows of Object.values(b.tables)) if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object')) return { ok: false, problem: 'bad_tables' };
  if (typeof b.checksum !== 'string' || (await sha256Text(JSON.stringify(b.tables))) !== b.checksum) return { ok: false, problem: 'checksum' };
  const ignoredTables = Object.keys(b.tables).filter((k) => !knownTables.includes(k));
  const tables = Object.fromEntries(Object.entries(b.tables).filter(([k]) => knownTables.includes(k)));
  return {
    ok: true,
    ignoredTables,
    backup: {
      format: BACKUP_FORMAT,
      formatVersion: b.formatVersion,
      appVersion: typeof b.appVersion === 'string' ? b.appVersion : '?',
      schemaVersion: b.schemaVersion,
      createdAt: typeof b.createdAt === 'string' ? b.createdAt : '',
      checksum: b.checksum,
      counts: countRows(tables),
      tables,
    },
  };
}

/* ---------- Recuperar sem substituir ---------- */

/** Tabelas de cada módulo, para recuperar só uma parte de um backup. */
export const RECOVER_GROUPS = {
  tasks: ['tasks', 'taskLists'],
  calendar: ['events'],
  notes: ['notes', 'noteVersions', 'notebooks', 'noteCollections', 'noteTemplates'],
  projects: ['projects'],
  inbox: ['inbox'],
  profile: ['interests', 'historyEntries'],
  academy: ['academicYears', 'subjects', 'teachers', 'assessments', 'periodResults', 'contents', 'lessons', 'doubts', 'decks', 'cards', 'cardReviews', 'studySessions', 'examPreps'],
  languages: ['languages', 'languageSessions', 'vocab', 'grammarRules'],
  habits: ['habits', 'habitLogs'],
  goals: ['goals', 'goalCheckins'],
  focus: ['focusSessions'],
  music: ['instruments', 'musicItems', 'songs', 'practiceSessions'],
  sports: ['sports', 'sportActivities', 'sportItems'],
  finance: ['finAssets', 'finTransactions', 'finQuotes', 'finLearning', 'finTerms', 'marketEntries', 'finJournal', 'budgetCategories', 'budgetEntries'],
  library: ['libraryItems', 'libraryCollections'],
} as const satisfies Record<string, readonly string[]>;
export type RecoverGroup = keyof typeof RECOVER_GROUPS;
export const RECOVER_GROUP_IDS = Object.keys(RECOVER_GROUPS) as RecoverGroup[];

export interface RecoveryPlan {
  /** Linhas a acrescentar, por tabela (só as que não existem mais neste aparelho). */
  add: Record<string, unknown[]>;
  /** Quantos registros cada módulo recupera (sem contar arquivos). */
  perGroup: Record<RecoverGroup, number>;
  /** Arquivos que voltam junto, porque algum registro recuperado usa. */
  files: number;
}

const idOf = (r: unknown) => (r && typeof r === 'object' ? (r as { id?: unknown }).id : undefined);

/**
 * Plano de "recuperar o que falta": de cada módulo escolhido, só os registros
 * cujo id não existe agora. Nada que existe é alterado (nem os da lixeira).
 * Os arquivos voltam só se um registro recuperado aponta para eles.
 */
export function planRecovery(backup: BackupTables, currentIds: Record<string, ReadonlySet<string>>, groups: readonly RecoverGroup[]): RecoveryPlan {
  const add: Record<string, unknown[]> = {};
  const perGroup = Object.fromEntries(RECOVER_GROUP_IDS.map((g) => [g, 0])) as Record<RecoverGroup, number>;
  for (const g of groups) {
    for (const table of RECOVER_GROUPS[g]) {
      const have = currentIds[table] ?? new Set<string>();
      const rows = (backup[table] ?? []).filter((r) => {
        const id = idOf(r);
        return typeof id === 'string' && !have.has(id);
      });
      if (rows.length) {
        add[table] = rows;
        perGroup[g] += rows.length;
      }
    }
  }
  const haveFiles = currentIds.files ?? new Set<string>();
  const missingFiles = (backup.files ?? []).filter((f) => {
    const id = idOf(f);
    return typeof id === 'string' && !haveFiles.has(id);
  });
  if (missingFiles.length && Object.keys(add).length) {
    const text = JSON.stringify(add);
    const used = missingFiles.filter((f) => text.includes(`"${idOf(f) as string}"`));
    if (used.length) add.files = used;
  }
  return { add, perGroup, files: add.files?.length ?? 0 };
}

/* ---------- Cópias internas antigas ---------- */

export const KEEP_AUTO_OPTIONS = [7, 14, 30] as const;
export type KeepAuto = (typeof KEEP_AUTO_OPTIONS)[number];

/** Cópias automáticas além das `keep` mais novas. Manuais e "antes de restaurar" nunca entram. */
export function oldAutoCopies<T extends { id: string; kind: string; createdAt: string }>(snaps: readonly T[], keep: number): T[] {
  return snaps
    .filter((s) => s.kind === 'auto')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(keep);
}

/* ---------- Arquivos binários ---------- */

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/* ---------- Avisos ---------- */

export const REMINDER_OPTIONS = [0, 3, 7, 14, 30] as const;
export type ReminderDays = (typeof REMINDER_OPTIONS)[number];

export interface BackupPrefs {
  /** Cópia interna automática, no máximo uma por dia. */
  autoDaily: boolean;
  /** Avisar quando o último backup exportado tiver mais que N dias (0 = não avisar). */
  reminderDays: ReminderDays;
  /** Aviso adiado até este instante (ISO). */
  snoozedUntil: string | null;
  /** Quantas cópias automáticas manter (0 = todas). Só apaga as mais antigas se o usuário escolher um número. */
  keepAuto: 0 | KeepAuto;
}

export const DEFAULT_BACKUP_PREFS: BackupPrefs = { autoDaily: true, reminderDays: 7, snoozedUntil: null, keepAuto: 0 };

export function migrateBackupPrefs(raw: unknown): BackupPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Partial<BackupPrefs>) : {};
  return {
    autoDaily: typeof r.autoDaily === 'boolean' ? r.autoDaily : DEFAULT_BACKUP_PREFS.autoDaily,
    reminderDays: (REMINDER_OPTIONS as readonly number[]).includes(r.reminderDays as number) ? (r.reminderDays as ReminderDays) : DEFAULT_BACKUP_PREFS.reminderDays,
    snoozedUntil: typeof r.snoozedUntil === 'string' ? r.snoozedUntil : null,
    keepAuto: ([7, 14, 30] as number[]).includes(r.keepAuto as number) ? (r.keepAuto as KeepAuto) : 0,
  };
}

/** Dias inteiros desde um instante (null = nunca). */
export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/** O aviso aparece se há dados, o lembrete está ligado e o último backup exportado é antigo (ou nunca houve). */
export function isBackupStale(lastExportAt: string | null, prefs: BackupPrefs, hasData: boolean, now: Date): boolean {
  if (!hasData || prefs.reminderDays === 0) return false;
  if (prefs.snoozedUntil && new Date(prefs.snoozedUntil) > now) return false;
  const d = daysSince(lastExportAt, now);
  return d === null || d >= prefs.reminderDays;
}

/** A cópia automática roda se está ligada e a última foi há mais de 20 horas. */
export function autoBackupDue(lastAutoAt: string | null, prefs: BackupPrefs, now: Date): boolean {
  if (!prefs.autoDaily) return false;
  return !lastAutoAt || now.getTime() - new Date(lastAutoAt).getTime() > 20 * 3_600_000;
}

export function backupFileName(createdAt: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `routig-backup-${createdAt.getFullYear()}-${p(createdAt.getMonth() + 1)}-${p(createdAt.getDate())}-${p(createdAt.getHours())}${p(createdAt.getMinutes())}.json`;
}
