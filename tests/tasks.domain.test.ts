import { describe, expect, it } from 'vitest';
import { addMonths, monthGrid, startOfWeek, weekday } from '@/domain/dates';
import {
  defaultTasksConfig,
  dueBucket,
  EMPTY_FILTER,
  matchesFilter,
  nextOccurrence,
  normalizeTags,
  upcomingOccurrences,
  wouldCreateCycle,
  type Recurrence,
  type Task,
} from '@/domain/tasks';

const rec = (over: Partial<Recurrence>): Recurrence => ({ freq: 'daily', interval: 1, weekdays: [], pauses: [], exceptions: [], until: null, ...over });

function task(over: Partial<Task>): Task {
  return {
    id: 't',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    deletedAt: null,
    rev: 1,
    title: 'x',
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

describe('datas', () => {
  it('soma meses preservando o dia e usando o último dia quando falta', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('semana começa no dia configurado e a grade do mês tem 42 dias', () => {
    expect(startOfWeek('2026-11-04', 1)).toBe('2026-11-02');
    expect(startOfWeek('2026-11-04', 0)).toBe('2026-11-01');
    const grid = monthGrid('2026-11-15', 1);
    expect(grid).toHaveLength(42);
    expect(weekday(grid[0]!)).toBe(1);
  });
});

describe('recorrência (Parte 7.4)', () => {
  it('diária, semanal, mensal e anual', () => {
    expect(nextOccurrence('2026-11-02', rec({ freq: 'daily', interval: 2 }))).toBe('2026-11-04');
    expect(nextOccurrence('2026-11-02', rec({ freq: 'weekly' }))).toBe('2026-11-09');
    expect(nextOccurrence('2026-01-31', rec({ freq: 'monthly' }))).toBe('2026-02-28');
    expect(nextOccurrence('2026-11-02', rec({ freq: 'yearly' }))).toBe('2027-11-02');
  });

  it('mensal volta ao dia original depois de um mês curto', () => {
    const r = rec({ freq: 'monthly' });
    const feb = nextOccurrence('2026-01-31', r, '2026-01-31')!;
    expect(nextOccurrence(feb, r, '2026-01-31')).toBe('2026-03-31');
  });

  it('semanal em dias escolhidos (segunda e quarta)', () => {
    const r = rec({ freq: 'weekly', weekdays: [1, 3] });
    expect(nextOccurrence('2026-11-02', r)).toBe('2026-11-04');
    expect(nextOccurrence('2026-11-04', r, '2026-11-02')).toBe('2026-11-09');
  });

  it('a cada 2 semanas', () => {
    const r = rec({ freq: 'weekly', interval: 2 });
    expect(nextOccurrence('2026-11-02', r)).toBe('2026-11-16');
  });

  it('pula exceções e pausas de férias', () => {
    const r = rec({ freq: 'daily', exceptions: ['2026-11-03'], pauses: [{ from: '2026-11-05', to: '2026-11-10', label: 'férias' }] });
    expect(upcomingOccurrences({ dueDate: '2026-11-02', recurrence: r }, 4)).toEqual(['2026-11-02', '2026-11-04', '2026-11-11', '2026-11-12']);
  });

  it('termina na data final', () => {
    expect(nextOccurrence('2026-11-02', rec({ until: '2026-11-02' }))).toBeNull();
  });
});

describe('dependências (Parte 7.5)', () => {
  it('detecta ciclos diretos e indiretos', () => {
    const a = task({ id: 'a', dependsOn: ['b'] });
    const b = task({ id: 'b', dependsOn: ['c'] });
    const c = task({ id: 'c' });
    const byId = new Map([a, b, c].map((x) => [x.id, x]));
    expect(wouldCreateCycle('c', 'a', byId)).toBe(true);
    expect(wouldCreateCycle('a', 'a', byId)).toBe(true);
    expect(wouldCreateCycle('a', 'c', byId)).toBe(false);
  });
});

describe('agrupamento e filtros', () => {
  it('classifica o prazo', () => {
    expect(dueBucket('2026-11-01', '2026-11-02')).toBe('overdue');
    expect(dueBucket('2026-11-02', '2026-11-02')).toBe('today');
    expect(dueBucket('2026-11-03', '2026-11-02')).toBe('tomorrow');
    expect(dueBucket('2026-11-08', '2026-11-02')).toBe('week');
    expect(dueBucket('2026-12-01', '2026-11-02')).toBe('later');
    expect(dueBucket(null, '2026-11-02')).toBe('none');
  });

  it('esconde concluídas por padrão e busca sem acento em título, tags e checklist', () => {
    const cfg = defaultTasksConfig();
    const open = task({ id: 'o', title: 'Revisar Matemática', tags: ['prova'], checklist: [{ id: 'c', text: 'equações', done: false }] });
    const done = task({ id: 'd', title: 'Feita', statusId: 'done' });
    expect(matchesFilter(open, EMPTY_FILTER, cfg)).toBe(true);
    expect(matchesFilter(done, EMPTY_FILTER, cfg)).toBe(false);
    expect(matchesFilter(done, { ...EMPTY_FILTER, showClosed: true }, cfg)).toBe(true);
    expect(matchesFilter(open, { ...EMPTY_FILTER, text: 'matematica' }, cfg)).toBe(true);
    expect(matchesFilter(open, { ...EMPTY_FILTER, text: 'equacoes' }, cfg)).toBe(true);
    expect(matchesFilter(open, { ...EMPTY_FILTER, tag: 'prova' }, cfg)).toBe(true);
    expect(matchesFilter(open, { ...EMPTY_FILTER, text: 'história' }, cfg)).toBe(false);
  });

  it('normaliza tags', () => {
    expect(normalizeTags([' #Prova ', 'prova', 'ensino médio'])).toEqual(['prova', 'ensino-médio']);
  });
});
