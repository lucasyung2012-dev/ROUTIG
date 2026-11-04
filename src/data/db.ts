import Dexie, { type EntityTable } from 'dexie';
import type { ChangeEntry, Link } from '@/domain/entity';
import type { Task, TaskList } from '@/domain/tasks';
import type { CalendarEvent } from '@/domain/events';
import type { InboxItem, StoredFile } from '@/domain/inbox';
import type { Note, NoteCollection, Notebook, NoteTemplate, NoteVersion } from '@/domain/notes';
import type { Project } from '@/domain/projects';
import type { HistoryEntry, Interest } from '@/domain/interests';

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
  events!: EntityTable<CalendarEvent, 'id'>;
  inbox!: EntityTable<InboxItem, 'id'>;
  files!: EntityTable<StoredFile, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  noteVersions!: EntityTable<NoteVersion, 'id'>;
  notebooks!: EntityTable<Notebook, 'id'>;
  noteCollections!: EntityTable<NoteCollection, 'id'>;
  noteTemplates!: EntityTable<NoteTemplate, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  interests!: EntityTable<Interest, 'id'>;
  historyEntries!: EntityTable<HistoryEntry, 'id'>;

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
    // Etapa 1: Calendar.
    this.version(3).stores({
      events: 'id, start, endDate, categoryId, seriesOf, updatedAt',
    });
    // Etapa 1: Inbox. Arquivos ficam numa tabela própria, separados dos dados (Parte 24.1).
    this.version(4).stores({
      inbox: 'id, status, snoozedUntil, createdAt',
      files: 'id, hash, createdAt',
    });
    // Etapa 1: Notes.
    this.version(5).stores({
      notes: 'id, notebookId, updatedAt, favorite, *tags, *collectionIds',
      noteVersions: 'id, noteId, at',
      notebooks: 'id, order',
      noteCollections: 'id',
      noteTemplates: 'id',
    });
    // Etapa 1: Projects.
    this.version(6).stores({
      projects: 'id, status, due, updatedAt',
    });
    // Etapa 1: Profile (interesses e Minha história).
    this.version(7).stores({
      interests: 'id, status, categoryId, updatedAt',
      historyEntries: 'id, date',
    });
  }
}

export const DB_SCHEMA_VERSION = 7;

let instance: RoutigDB | null = null;

export function getDb(): RoutigDB {
  if (!instance) instance = new RoutigDB();
  return instance;
}

/** Só para testes: troca o banco por um novo, isolado. */
export function setDbForTests(db: RoutigDB | null): void {
  instance = db;
}
