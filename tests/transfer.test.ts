import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createEvent } from '@/data/eventsRepo';
import { createTask, loadTasksConfig } from '@/data/tasksRepo';
import { buildExport, importEvents, importNotes, importTasks, previewIcsImport, previewNoteImport, previewTaskImport, type ExportLabels } from '@/data/transferRepo';
import { emptyEventInput } from '@/domain/events';
import { emptyTaskInput, isClosedKind, statusKind } from '@/domain/tasks';
import { blocksToMarkdown, eventsToIcs, parseCsv, parseDateCell, parseIcsEvents, parseNoteFile, parseTasks, toCsv } from '@/domain/transfer';
import type { CalendarEvent } from '@/domain/events';

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-transfer-${Math.random().toString(36).slice(2)}`));
});

const L: ExportLabels = {
  headers: { tasks: ['Título', 'Status', 'Prioridade', 'Prazo', 'Horário', 'Lista', 'Categoria', 'Tags', 'Projeto', 'Pai', 'Descrição', 'Checklist', 'Concluída', 'Em'], habits: ['a'], focus: ['a'], finance: ['a'] },
  statusName: (s) => s?.id ?? '—',
  priority: (p) => p,
  yes: 'Sim',
  no: 'Não',
  txType: (x) => x,
  focusKind: (k) => k,
  md: { image: 'Imagem', file: 'Arquivo', drawing: 'Desenho', untitled: 'Sem título' },
};

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({ ...emptyEventInput({ title: 'Aula', start: '2026-11-09', endDate: '2026-11-09', startTime: '14:00', durationMin: 90 }), id: 'e1', createdAt: '', updatedAt: '', deletedAt: null, rev: 1, ...over }) as CalendarEvent;

describe('CSV', () => {
  it('ida e volta com vírgula, aspas e quebra de linha; detecta ponto e vírgula', () => {
    const text = toCsv([
      ['a', 'b, c', 'diz "oi"'],
      ['linha\nnova', null, 3],
    ]);
    expect(text.startsWith('﻿')).toBe(true);
    expect(parseCsv(text)).toEqual([
      ['a', 'b, c', 'diz "oi"'],
      ['linha\nnova', '', '3'],
    ]);
    expect(parseCsv('Título;Prazo\nLer;10/11/2026')).toEqual([
      ['Título', 'Prazo'],
      ['Ler', '10/11/2026'],
    ]);
    expect([parseDateCell('10/11/2026'), parseDateCell('5/1/27'), parseDateCell('2026-12-01'), parseDateCell('32/1/2026')]).toEqual(['2026-11-10', '2027-01-05', '2026-12-01', null]);
  });
});

describe('Calendar (.ics)', () => {
  it('exporta e lê de volta: horário, dia inteiro de vários dias e repetição semanal com exceção', () => {
    const events = [
      ev({ id: 'e1', recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3], pauses: [], exceptions: ['2026-11-11'], until: '2026-12-18' } }),
      ev({ id: 'e2', title: 'Férias; praia, sol', allDay: true, startTime: null, start: '2026-12-20', endDate: '2026-12-31' }),
    ];
    const ics = eventsToIcs(events, new Date('2026-11-05T12:00:00Z'));
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261218');
    expect(ics).toContain('EXDATE:20261111T140000');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
    const back = parseIcsEvents(ics);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ title: 'Aula', start: '2026-11-09', startTime: '14:00', durationMin: 90, allDay: false, recurrenceNote: false });
    expect(back[0]!.recurrence).toMatchObject({ freq: 'weekly', weekdays: [1, 3], until: '2026-12-18' });
    expect(back[1]).toMatchObject({ title: 'Férias; praia, sol', allDay: true, start: '2026-12-20', endDate: '2026-12-31' });
  });

  it('linhas dobradas, UTC vira hora local, repetição desconhecida marcada', () => {
    const text = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Reunião com um nome bem compri', ' do', 'DTSTART:20261110T130000Z', 'DTEND:20261110T140000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2MO', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const [r] = parseIcsEvents(text);
    const local = new Date(Date.UTC(2026, 10, 10, 13, 0));
    expect(r).toMatchObject({ title: 'Reunião com um nome bem comprido', durationMin: 60, recurrenceNote: true });
    expect(r!.startTime).toBe(`${String(local.getHours()).padStart(2, '0')}:00`);
  });

  it('importar: o repetido começa marcado como duplicado; importado aparece no banco', async () => {
    await createEvent(emptyEventInput({ title: 'Dentista', start: '2026-11-12', endDate: '2026-11-12', startTime: '10:00' }));
    const ics = eventsToIcs([ev({ title: 'Dentista', start: '2026-11-12', endDate: '2026-11-12', startTime: '10:00' }), ev({ id: 'x', title: 'Novo' })], new Date());
    const rows = await previewIcsImport(ics);
    expect(rows.map((r) => [r.title, r.duplicate])).toEqual([
      ['Dentista', true],
      ['Novo', false],
    ]);
    await importEvents(rows.filter((r) => !r.duplicate), 'class');
    const all = await getDb().events.toArray();
    expect(all.map((e) => e.title).sort()).toEqual(['Dentista', 'Novo']);
    expect(all.find((e) => e.title === 'Novo')?.categoryId).toBe('class');
  });
});

describe('Tasks', () => {
  it('lista colada e CSV com cabeçalho em português', () => {
    expect(parseTasks('- [ ] Ler capítulo\n1. Lavar louça\n[x] Feita\n\n')).toMatchObject([
      { title: 'Ler capítulo', done: false },
      { title: 'Lavar louça', done: false },
      { title: 'Feita', done: true },
    ]);
    const csv = 'Título;Prazo;Horário;Tags;Concluída\nProva;10/11/2026;8:30;escola, mat;não\nResumo;;;;sim';
    expect(parseTasks(csv, 'x.csv')).toMatchObject([
      { title: 'Prova', dueDate: '2026-11-10', dueTime: '08:30', tags: ['escola', 'mat'], done: false },
      { title: 'Resumo', dueDate: null, done: true },
    ]);
  });

  it('importar marca repetidas e respeita "concluída"; exportar CSV traz cabeçalho e linhas', async () => {
    await createTask(emptyTaskInput({ title: 'Ler capítulo' }));
    const rows = await previewTaskImport('Ler capítulo\n[x] Já feita', '');
    expect(rows.map((r) => r.duplicate)).toEqual([true, false]);
    await importTasks(rows.filter((r) => !r.duplicate), null);
    const config = await loadTasksConfig();
    const done = (await getDb().tasks.toArray()).find((t) => t.title === 'Já feita')!;
    expect(isClosedKind(statusKind(config, done.statusId))).toBe(true);
    const f = await buildExport('tasks', L);
    expect(f.count).toBe(2);
    expect(parseCsv(f.text)[0]![0]).toBe('Título');
  });
});

describe('Notes (Markdown)', () => {
  it('arquivo .md vira nota com título e blocos; volta em Markdown', async () => {
    const row = parseNoteFile('# Revolução Francesa\n\n- causas\n- [x] li o capítulo\n> citação', 'qualquer.md', 'n0');
    expect(row.title).toBe('Revolução Francesa');
    expect(row.blocks.map((b) => b.type)).toEqual(['bullet', 'todo', 'quote']);
    expect(parseNoteFile('só texto', 'Ideias.txt', 'n1').title).toBe('Ideias');
    const md = blocksToMarkdown([...row.blocks, { id: 't', type: 'table', rows: [['a', 'b'], ['1', '2']] }, { id: 'd', type: 'drawing', strokes: [], height: 100 }], L.md);
    expect(md).toContain('- [x] li o capítulo');
    expect(md).toContain('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(md).toContain('*[Desenho]*');

    const prev = await previewNoteImport([{ name: 'a.md', text: '# Uma nota\ntexto' }]);
    await importNotes(prev, null);
    expect(await previewNoteImport([{ name: 'a.md', text: '# Uma nota' }])).toMatchObject([{ duplicate: true }]);
    const f = await buildExport('notes', L);
    expect(f.text).toContain('# Uma nota');
    expect(f.count).toBe(1);
  });
});
