import { getDb } from './db';
import { createEvent } from './eventsRepo';
import { createNote, emptyNoteInput } from './notesRepo';
import { createTask, loadTasksConfig } from './tasksRepo';
import { emptyEventInput } from '@/domain/events';
import { emptyTaskInput, firstStatusOfKind, isClosedKind, statusKind, type Task, type TaskStatus } from '@/domain/tasks';
import { blocksToMarkdown, eventsToIcs, fold, parseIcsEvents, parseNoteFile, parseTasks, toCsv, type IcsEventRow, type NoteImportRow, type TaskImportRow } from '@/domain/transfer';

/* ---------- Exportar ---------- */

export const EXPORT_KINDS = ['tasks', 'events', 'notes', 'habits', 'focus', 'finance'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportFile {
  name: string;
  mime: string;
  text: string;
  count: number;
}

export interface ExportLabels {
  /** Cabeçalhos das colunas, já traduzidos, por tipo. */
  headers: Record<'tasks' | 'habits' | 'focus' | 'finance', string[]>;
  statusName: (s: TaskStatus | undefined) => string;
  priority: (p: Task['priority']) => string;
  yes: string;
  no: string;
  txType: (t: string) => string;
  focusKind: (k: string) => string;
  md: { image: string; file: string; drawing: string; untitled: string };
}

/** Quantos registros cada exportação levaria (sem os da lixeira). */
export async function exportCounts(): Promise<Record<ExportKind, number>> {
  const db = getDb();
  const live = <T extends { deletedAt?: string | null }>(r: T) => !r.deletedAt;
  return {
    tasks: await db.tasks.filter(live).count(),
    events: await db.events.filter(live).count(),
    notes: await db.notes.filter(live).count(),
    habits: await db.habitLogs.filter(live).count(),
    focus: await db.focusSessions.filter(live).count(),
    finance: await db.finTransactions.filter(live).count(),
  };
}

const localTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export async function buildExport(kind: ExportKind, L: ExportLabels, now = new Date()): Promise<ExportFile> {
  const db = getDb();
  const day = stamp(now);
  const live = <T extends { deletedAt?: string | null }>(r: T) => !r.deletedAt;
  switch (kind) {
    case 'tasks': {
      const [tasks, config, lists, projects] = await Promise.all([db.tasks.filter(live).toArray(), loadTasksConfig(), db.taskLists.toArray(), db.projects.toArray()]);
      const listName = new Map(lists.map((l) => [l.id, l.name]));
      const projName = new Map(projects.map((p) => [p.id, p.name]));
      const parentTitle = new Map(tasks.map((t) => [t.id, t.title]));
      tasks.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.title.localeCompare(b.title));
      const rows = tasks.map((t) => [
        t.title,
        L.statusName(config.statuses.find((s) => s.id === t.statusId)),
        L.priority(t.priority),
        t.dueDate,
        t.dueTime,
        t.listId ? listName.get(t.listId) : '',
        t.category,
        t.tags.join(', '),
        t.projectId ? projName.get(t.projectId) : '',
        t.parentId ? parentTitle.get(t.parentId) : '',
        t.description,
        t.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join(' | '),
        isClosedKind(statusKind(config, t.statusId)) ? L.yes : L.no,
        t.completedAt?.slice(0, 10),
      ]);
      return { name: `routig-tarefas-${day}.csv`, mime: 'text/csv', text: toCsv([L.headers.tasks, ...rows]), count: rows.length };
    }
    case 'events': {
      const events = await db.events.filter(live).toArray();
      return { name: `routig-calendario-${day}.ics`, mime: 'text/calendar', text: eventsToIcs(events, now), count: events.length };
    }
    case 'notes': {
      const [notes, notebooks] = await Promise.all([db.notes.filter(live).toArray(), db.notebooks.toArray()]);
      const nb = new Map(notebooks.map((n) => [n.id, n.name]));
      notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const text = notes
        .map((n) => {
          const meta = [n.notebookId ? nb.get(n.notebookId) : '', n.tags.map((x) => `#${x}`).join(' '), n.updatedAt.slice(0, 10)].filter(Boolean).join(' · ');
          return `# ${n.title || L.md.untitled}\n\n*${meta}*\n\n${blocksToMarkdown(n.blocks, L.md)}`;
        })
        .join('\n\n---\n\n');
      return { name: `routig-notas-${day}.md`, mime: 'text/markdown', text: `${text}\n`, count: notes.length };
    }
    case 'habits': {
      const [logs, habits] = await Promise.all([db.habitLogs.filter(live).toArray(), db.habits.toArray()]);
      const name = new Map(habits.map((h) => [h.id, h]));
      logs.sort((a, b) => a.date.localeCompare(b.date));
      const rows = logs.map((l) => [l.date, name.get(l.habitId)?.name ?? '', l.value, name.get(l.habitId)?.unit ?? '', l.note]);
      return { name: `routig-habitos-${day}.csv`, mime: 'text/csv', text: toCsv([L.headers.habits, ...rows]), count: rows.length };
    }
    case 'focus': {
      const [sessions, tasks] = await Promise.all([db.focusSessions.filter(live).toArray(), db.tasks.toArray()]);
      const title = new Map(tasks.map((t) => [t.id, t.title]));
      sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const rows = sessions.map((s) => [s.date, localTime(s.startedAt), L.focusKind(s.kind), s.actualMin, s.breakMin, s.cycles, s.completed ? L.yes : L.no, s.taskId ? title.get(s.taskId) : '', s.notes]);
      return { name: `routig-focus-${day}.csv`, mime: 'text/csv', text: toCsv([L.headers.focus, ...rows]), count: rows.length };
    }
    case 'finance': {
      const [txs, assets] = await Promise.all([db.finTransactions.filter(live).toArray(), db.finAssets.toArray()]);
      const asset = new Map(assets.map((a) => [a.id, a]));
      txs.sort((a, b) => a.date.localeCompare(b.date));
      const rows = txs.map((x) => {
        const a = asset.get(x.assetId);
        return [x.date, a?.name ?? '', a?.ticker ?? '', L.txType(x.type), x.quantity, x.price, x.fees, x.amount, a?.currency ?? '', x.source, x.note];
      });
      return { name: `routig-financas-${day}.csv`, mime: 'text/csv', text: toCsv([L.headers.finance, ...rows]), count: rows.length };
    }
  }
}

/* ---------- Importar: Calendar ---------- */

export async function previewIcsImport(text: string): Promise<IcsEventRow[]> {
  const rows = parseIcsEvents(text);
  const existing = await getDb().events.filter((e) => !e.deletedAt).toArray();
  const keys = new Set(existing.map((e) => `${fold(e.title)}|${e.start}|${e.startTime ?? ''}`));
  return rows.map((r) => ({ ...r, duplicate: keys.has(`${fold(r.title)}|${r.start}|${r.startTime ?? ''}`) }));
}

export async function importEvents(rows: IcsEventRow[], categoryId: string): Promise<number> {
  for (const r of rows) {
    await createEvent(
      emptyEventInput({
        title: r.title,
        description: r.description,
        location: r.location,
        categoryId,
        allDay: r.allDay,
        start: r.start,
        endDate: r.endDate,
        startTime: r.allDay ? null : r.startTime,
        durationMin: r.durationMin,
        recurrence: r.recurrence,
      }),
    );
  }
  return rows.length;
}

/* ---------- Importar: Tasks ---------- */

export async function previewTaskImport(text: string, fileName: string): Promise<TaskImportRow[]> {
  const [rows, config, tasks] = await Promise.all([Promise.resolve(parseTasks(text, fileName)), loadTasksConfig(), getDb().tasks.filter((t) => !t.deletedAt).toArray()]);
  const open = new Set(tasks.filter((t) => !isClosedKind(statusKind(config, t.statusId))).map((t) => fold(t.title)));
  return rows.map((r) => ({ ...r, duplicate: open.has(fold(r.title)) }));
}

export async function importTasks(rows: TaskImportRow[], listId: string | null): Promise<number> {
  const config = await loadTasksConfig();
  for (const r of rows) {
    await createTask(
      emptyTaskInput({
        title: r.title,
        notes: r.notes,
        dueDate: r.dueDate,
        dueTime: r.dueDate ? r.dueTime : null,
        tags: r.tags,
        listId,
        statusId: r.done ? firstStatusOfKind(config, 'done') : firstStatusOfKind(config, 'open'),
        originModule: 'import',
      }),
    );
  }
  return rows.length;
}

/* ---------- Importar: Notes ---------- */

export async function previewNoteImport(files: Array<{ name: string; text: string }>): Promise<NoteImportRow[]> {
  const titles = new Set((await getDb().notes.filter((n) => !n.deletedAt).toArray()).map((n) => fold(n.title)));
  return files.map((f, i) => {
    const row = parseNoteFile(f.text, f.name, `n${i}`);
    return { ...row, duplicate: titles.has(fold(row.title)) };
  });
}

export async function importNotes(rows: NoteImportRow[], notebookId: string | null): Promise<number> {
  for (const r of rows) await createNote(emptyNoteInput({ title: r.title, blocks: r.blocks, notebookId }));
  return rows.length;
}
