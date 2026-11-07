/**
 * Sincronização entre aparelhos (V2, decisões D1, D2 e D10): regras puras, sem rede.
 * Cada aparelho guarda no Drive do usuário (pasta oculta do app) uma cópia criptografada dos
 * seus dados. Ao sincronizar, as cópias dos outros aparelhos são juntadas registro a registro:
 * fica a versão mais nova (rev maior; empate → updatedAt mais recente). Exclusões viajam como
 * registros marcados (`deletedAt`), então também chegam aos outros aparelhos.
 */
import type { BackupTables } from './backup';

/** Tabelas que não viajam: o log local, os arquivos binários (grandes) e o que é do aparelho. */
export const LOCAL_ONLY_TABLES = new Set(['changelog', 'files']);
/** Chaves de configuração que valem só para este aparelho (travas de tela, estado de foco etc.). */
export const LOCAL_ONLY_KV = new Set(['backup.prefs', 'focus.active', 'notifications.state', 'security', 'finance.pin', 'sync.local']);

type Row = Record<string, unknown>;

function keyOf(table: string, row: Row): string | null {
  const k = table === 'kv' ? row.key : row.id;
  return typeof k === 'string' || typeof k === 'number' ? String(k) : null;
}

function newer(a: Row, b: Row): boolean {
  const ra = typeof a.rev === 'number' ? a.rev : 0;
  const rb = typeof b.rev === 'number' ? b.rev : 0;
  if (ra !== rb) return ra > rb;
  const ua = typeof a.updatedAt === 'string' ? a.updatedAt : '';
  const ub = typeof b.updatedAt === 'string' ? b.updatedAt : '';
  return ua > ub;
}

/** Só o que deve viajar (sem tabelas e chaves locais). */
export function syncable(tables: BackupTables): BackupTables {
  const out: BackupTables = {};
  for (const [name, rows] of Object.entries(tables)) {
    if (LOCAL_ONLY_TABLES.has(name)) continue;
    out[name] = name === 'kv' ? (rows as Row[]).filter((r) => typeof r.key === 'string' && !LOCAL_ONLY_KV.has(r.key)) : rows;
  }
  return out;
}

export interface MergeResult {
  /** Registros a gravar neste aparelho, por tabela (vindos de outro aparelho e mais novos). */
  incoming: Record<string, Row[]>;
  /** Quantos registros mudaram aqui. */
  changed: number;
}

/**
 * Junta as cópias dos outros aparelhos com os dados locais. Não apaga nada: o que some de um
 * lado continua do outro; exclusões são registros com `deletedAt`.
 */
export function mergeRemote(local: BackupTables, remotes: BackupTables[]): MergeResult {
  const incoming: Record<string, Row[]> = {};
  let changed = 0;
  const best = new Map<string, Map<string, Row>>();
  for (const [name, rows] of Object.entries(syncable(local))) {
    const m = new Map<string, Row>();
    for (const r of rows as Row[]) {
      const k = keyOf(name, r);
      if (k !== null) m.set(k, r);
    }
    best.set(name, m);
  }
  const localKeys = new Map<string, Map<string, Row>>([...best].map(([n, m]) => [n, new Map(m)]));
  for (const remote of remotes)
    for (const [name, rows] of Object.entries(syncable(remote))) {
      let m = best.get(name);
      if (!m) {
        m = new Map();
        best.set(name, m);
      }
      for (const r of rows as Row[]) {
        const k = keyOf(name, r);
        if (k === null) continue;
        const cur = m.get(k);
        if (!cur || newer(r, cur)) m.set(k, r);
      }
    }
  for (const [name, m] of best) {
    const mine = localKeys.get(name) ?? new Map<string, Row>();
    const list: Row[] = [];
    for (const [k, r] of m) if (mine.get(k) !== r) list.push(r);
    if (list.length) {
      incoming[name] = list;
      changed += list.length;
    }
  }
  return { incoming, changed };
}

/** Código de recuperação: 24 letras e números (sem os que se confundem), em grupos de 4. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function formatRecoveryCode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 24; i++) s += ALPHABET[bytes[i % bytes.length]! % ALPHABET.length];
  return s.match(/.{4}/g)!.join('-');
}
export function normalizeRecoveryCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === 24 ? clean.match(/.{4}/g)!.join('-') : '';
}
