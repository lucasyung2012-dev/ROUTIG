import Dexie, { type EntityTable } from 'dexie';
import type { ChangeEntry, Link } from '@/domain/entity';
import type { Task, TaskList } from '@/domain/tasks';

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
  tasks!: EntityTable<Task, 'id'>;
  taskLists!: EntityTable<TaskList, 'id'>;

  constructor(name = 'routig') {
    super(name);
    this.version(1).stores({
      kv: 'key',
      changelog: '++seq, at, entityType, entityId, [entityType+entityId]',
      links: 'id, from, to, relation, [from+to]',
    });
    // Etapa 1: Tasks. Só acrescenta tabelas; nada da versão 1 muda.
    this.version(2).stores({
      tasks: 'id, statusId, listId, dueDate, parentId, projectId, goalId, updatedAt, *tags',
      taskLists: 'id, order',
    });
  }
}

export const DB_SCHEMA_VERSION = 2;

let instance: RoutigDB | null = null;

export function getDb(): RoutigDB {
  if (!instance) instance = new RoutigDB();
  return instance;
}

/** Só para testes: troca o banco por um novo, isolado. */
export function setDbForTests(db: RoutigDB | null): void {
  instance = db;
}
