import Dexie, { type EntityTable } from 'dexie';
import type { ChangeEntry, Link } from '@/domain/entity';

/** Registro chave-valor (configurações, estado do onboarding, metadados). */
export interface KvRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

/**
 * Banco local do ROUTIG (IndexedDB via Dexie).
 *
 * Cada nova versão do esquema entra como um novo `this.version(n)` abaixo,
 * com o `upgrade` que converte os dados antigos. Nunca altere uma versão já
 * publicada: acrescente a próxima.
 */
export class RoutigDB extends Dexie {
  kv!: EntityTable<KvRecord, 'key'>;
  changelog!: EntityTable<ChangeEntry, 'seq'>;
  links!: EntityTable<Link, 'id'>;

  constructor(name = 'routig') {
    super(name);
    this.version(1).stores({
      kv: 'key',
      changelog: '++seq, at, entityType, entityId, [entityType+entityId]',
      links: 'id, from, to, relation, [from+to]',
    });
  }
}

export const DB_SCHEMA_VERSION = 1;

let instance: RoutigDB | null = null;

export function getDb(): RoutigDB {
  if (!instance) instance = new RoutigDB();
  return instance;
}

/** Só para testes: troca o banco por um novo, isolado. */
export function setDbForTests(db: RoutigDB | null): void {
  instance = db;
}
