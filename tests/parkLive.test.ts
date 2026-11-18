import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '@/domain/habits';
import { defaultTasksConfig, type Task } from '@/domain/tasks';
import { dayLayout, habitBeds, taskBoard, type DayItem } from '@/features/park/live';
import { liftHint } from '@/features/park/stairs';

/* "3D de verdade" (seção 28): as partes puras dos objetos de ação do Campus. */

// 2026-11-02 é segunda-feira; "hoje" nos testes é quarta, 2026-11-04.
const TODAY = '2026-11-04';

function habit(id: string, over: Partial<Habit> = {}): Habit {
  return {
    id,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    deletedAt: null,
    rev: 1,
    name: `Hábito ${id}`,
    description: '',
    color: '#7C5CFC',
    category: '',
    method: 'check',
    unit: '',
    scaleMax: 5,
    schedule: [{ from: '2026-10-01', period: 'day', times: 1, weekdays: [], intervalDays: 2, target: null }],
    startDate: '2026-10-01',
    pauses: [],
    archived: false,
    showInCalendar: false,
    time: null,
    notes: '',
    order: 0,
    ...over,
  };
}

const logsFrom = (entries: Array<[habitId: string, date: string, value: number]>) => {
  const by = new Map<string, Map<string, Pick<HabitLog, 'value'>>>();
  for (const [h, d, value] of entries) {
    const m = by.get(h) ?? new Map<string, Pick<HabitLog, 'value'>>();
    m.set(d, { value });
    by.set(h, m);
  }
  return (id: string) => by.get(id) ?? new Map<string, Pick<HabitLog, 'value'>>();
};

describe('canteiros da Estufa: um por hábito de hoje', () => {
  it('mapeia para fazer, feito e fora (não esperado hoje, pausado, arquivado, ainda não começou)', () => {
    const habits = [
      habit('a'),
      habit('b'),
      habit('c', { method: 'quantity', unit: 'páginas', schedule: [{ from: '2026-10-01', period: 'day', times: 1, weekdays: [], intervalDays: 2, target: 10 }] }),
      // Uma vez por semana, já cumprido na segunda: hoje não pede nada.
      habit('d', { schedule: [{ from: '2026-10-01', period: 'week', times: 1, weekdays: [], intervalDays: 2, target: null }] }),
      habit('e', { pauses: [{ from: '2026-11-03', to: null, label: '' }] }),
      habit('f', { archived: true }),
      habit('g', { startDate: '2026-11-10' }),
    ];
    const logs = logsFrom([
      ['b', TODAY, 1],
      ['c', TODAY, 5],
      ['d', '2026-11-02', 1],
    ]);
    const r = habitBeds(habits, logs, TODAY, 1);
    expect(r.more).toBe(0);
    expect(r.beds.map((b) => [b.habitId, b.done, b.needsValue])).toEqual([
      ['a', false, false],
      ['b', true, false],
      // Quantidade abaixo da meta: segue para fazer, e pede um valor.
      ['c', false, true],
    ]);
  });

  it('feito hoje continua no canteiro (para poder desfazer); sem hábito, nenhum canteiro', () => {
    const r = habitBeds([habit('a')], logsFrom([['a', TODAY, 1]]), TODAY, 1);
    expect(r.beds).toHaveLength(1);
    expect(r.beds[0]!.done).toBe(true);
    expect(habitBeds([], logsFrom([]), TODAY, 1)).toEqual({ beds: [], more: 0 });
  });

  it('mais hábitos que canteiros: o último vira "+N"', () => {
    const many = Array.from({ length: 10 }, (_, i) => habit(`h${i}`, { order: i }));
    const r = habitBeds(many, logsFrom([]), TODAY, 1, 8);
    expect(r.beds).toHaveLength(7);
    expect(r.more).toBe(3);
    expect(habitBeds(many.slice(0, 8), logsFrom([]), TODAY, 1, 8)).toMatchObject({ more: 0 });
  });
});

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    deletedAt: null,
    rev: 1,
    title: `Tarefa ${id}`,
    description: '',
    notes: '',
    statusId: 'todo',
    priority: 'none',
    dueDate: null,
    dueTime: null,
    listId: null,
    category: '',
    tags: [],
    parentId: null,
    checklist: [],
    attachments: [],
    projectId: null,
    goalId: null,
    originModule: 'tasks',
    recurrence: null,
    occurrences: [],
    dependsOn: [],
    completedAt: null,
    order: 0,
    ...over,
  };
}

const dayOf = (iso: string) => iso.slice(0, 10);

describe('cartões do quadro de tarefas', () => {
  it('separa atrasadas, hoje e feitas hoje (e deixa de fora o resto)', () => {
    const cfg = defaultTasksConfig();
    const tasks = [
      task('late', { dueDate: '2026-11-01' }),
      task('today', { dueDate: TODAY }),
      task('doneToday', { dueDate: TODAY, statusId: 'done', completedAt: `${TODAY}T10:00:00Z` }),
      task('doneNoDue', { statusId: 'done', completedAt: `${TODAY}T08:00:00Z` }),
      task('doneYesterday', { dueDate: '2026-11-03', statusId: 'done', completedAt: '2026-11-03T10:00:00Z' }),
      task('cancelled', { dueDate: TODAY, statusId: 'cancelled', completedAt: `${TODAY}T09:00:00Z` }),
      task('future', { dueDate: '2026-11-05' }),
      task('noDue'),
      task('deleted', { dueDate: TODAY, deletedAt: `${TODAY}T07:00:00Z` }),
    ];
    const b = taskBoard(tasks, cfg, TODAY, dayOf);
    expect(b.cols.late.map((c) => c.id)).toEqual(['late']);
    expect(b.cols.today.map((c) => c.id)).toEqual(['today']);
    // Concluídas hoje, a mais recente primeiro.
    expect(b.cols.done.map((c) => c.id)).toEqual(['doneToday', 'doneNoDue']);
    expect(b.more).toEqual({ late: 0, today: 0, done: 0 });
    expect(b.empty).toBe(false);
    expect(b.cols.today[0]).toEqual({ id: 'today', title: 'Tarefa today', col: 'today' });
  });

  it('limita cada coluna e conta o resto no "+N"; sem nada, estado vazio', () => {
    const cfg = defaultTasksConfig();
    const tasks = Array.from({ length: 6 }, (_, i) => task(`t${i}`, { dueDate: TODAY, order: i }));
    const b = taskBoard(tasks, cfg, TODAY, dayOf, 4);
    expect(b.cols.today.map((c) => c.id)).toEqual(['t0', 't1', 't2']);
    expect(b.more.today).toBe(3);
    // Exatamente no limite: todos cabem, sem "+N".
    expect(taskBoard(tasks.slice(0, 4), cfg, TODAY, dayOf, 4).more.today).toBe(0);
    const none = taskBoard([task('x', { dueDate: '2026-12-01' })], cfg, TODAY, dayOf);
    expect(none.empty).toBe(true);
    expect(none.cols).toEqual({ late: [], today: [], done: [] });
  });
});

const item = (key: string, start: number | null, end: number | null, over: Partial<DayItem> = {}): DayItem => ({ key, title: key, start, end, allDay: start === null, color: '#60A5FA', done: false, open: true, ...over });

describe('parede do dia do Calendar', () => {
  it('posiciona pela hora na janela 7h–22h, divide os sobrepostos e marca agora', () => {
    const L = dayLayout([item('a', 540, 600), item('b', 570, 630), item('c', 840, null), item('all', null, null)], 720);
    expect([L.from, L.to]).toEqual([420, 1320]);
    const by = Object.fromEntries(L.blocks.map((b) => [b.item.key, b]));
    expect(by.a).toMatchObject({ col: 0, cols: 2 });
    expect(by.b).toMatchObject({ col: 1, cols: 2 });
    expect(by.a!.y0).toBeCloseTo(120 / 900);
    expect(by.a!.y1).toBeCloseTo(180 / 900);
    // Sem fim: 30 minutos; sozinho na hora dele, largura inteira.
    expect(by.c).toMatchObject({ start: 840, end: 870, col: 0, cols: 1 });
    expect(L.allDay.map((i) => i.key)).toEqual(['all']);
    expect(L.now).toBeCloseTo(300 / 900);
    expect(L.empty).toBe(false);
  });

  it('a janela cresce para o item cedo e para agora; sem hora, sem linha', () => {
    const early = dayLayout([item('cedo', 375, 420)], null);
    expect(early.from).toBe(360);
    expect(early.now).toBeNull();
    const late = dayLayout([], 23 * 60 + 30);
    expect(late.to).toBe(1440);
    expect(late.now).toBeCloseTo((1410 - 420) / (1440 - 420));
    expect(late.empty).toBe(true);
  });

  it('mais sobrepostos que colunas: o resto conta como escondido; muitos de dia inteiro viram "+N"', () => {
    const L = dayLayout([item('1', 600, 660), item('2', 600, 660), item('3', 600, 660), item('4', 600, 660)], null, { maxCols: 3 });
    expect(L.blocks).toHaveLength(3);
    expect(L.hidden).toBe(1);
    const A = dayLayout(['x', 'y', 'z', 'w'].map((k) => item(k, null, null)), null, { maxAllDay: 3 });
    expect(A.allDay).toHaveLength(2);
    expect(A.allDayMore).toBe(2);
  });
});

describe('dica do elevador (sobe / desce / não para aqui)', () => {
  it('o que desce não para no térreo; o que sobe não para no último nível', () => {
    expect(liftHint('down', 0, 4)).toEqual({ dir: 'down', off: true });
    expect(liftHint('down', 1, 4)).toEqual({ dir: 'down', off: false });
    expect(liftHint('down', 3, 4)).toEqual({ dir: 'down', off: false });
    expect(liftHint('up', 0, 4)).toEqual({ dir: 'up', off: false });
    expect(liftHint('up', 3, 4)).toEqual({ dir: 'up', off: true });
    expect(liftHint('both', 0, 4)).toEqual({ dir: 'both', off: false });
    expect(liftHint('both', 3, 4)).toEqual({ dir: 'both', off: false });
  });
});
