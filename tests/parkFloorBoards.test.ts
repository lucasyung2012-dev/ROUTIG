import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@/app/modules';
import { translate } from '@/i18n';
import { pt } from '@/i18n/pt';
import { en } from '@/i18n/en';
import { FLOOR_PLANS, WALL_BOARDS } from '@/features/park/interiors/floors';
import {
  academyBoards,
  calendarBoards,
  canCompare,
  distribute,
  FINANCE_ROOMS,
  financeBoards,
  focusBoards,
  goalsBoards,
  inboxBoards,
  insightsBoards,
  languagesBoards,
  libraryBoards,
  musicBoards,
  notesBoards,
  projectsBoards,
  seriesOf,
  sportsBoards,
  tasksBoards,
  type BoardCtx,
  type FinanceFloorInput,
  type FloorBoards,
  type InsightMetric,
} from '@/features/park/interiors/boards';

const c: BoardCtx = { t: (k, v) => translate('pt-BR', k, v), locale: 'pt-BR', today: '2026-11-17' };
const cEn: BoardCtx = { t: (k, v) => translate('en', k, v), locale: 'en', today: '2026-11-17' };

const noAcademy = { period: null, subjects: [], sessions: [], decks: [], exams: [] };
const noFinance: FinanceFloorInput = { locked: false, hidden: false, currency: 'BRL', budgetEnabled: false, months: [], top: [], categories: 0, invest: [], assets: [] };

/** Os quadros de cada prédio com andares, sem nenhum dado. */
const EMPTY: Partial<Record<ModuleId, FloorBoards>> = {
  academy: academyBoards(noAcademy, c),
  languages: languagesBoards({ langs: [], grammar: null, speakingMin: 0, pronunciation: 0 }, c),
  notes: notesBoards({ notebooks: [], loose: 0, drawings: 0, drawingTitles: [], versions: 0, versionTitles: [] }, c),
  library: libraryBoards({ kinds: [], total: 0, favorites: 0, reading: [], statuses: { want: 0, reading: 0, read: 0 }, files: [] }, c),
  inbox: inboxBoards({ open: 0, openTitles: [], oldest: [], snoozed: 0, tags: [], flow: [], archived: 0 }, c),
  calendar: calendarBoards({ today: [], week: [], month: [], upcoming: [], past: [], year: 2026, months: Array.from({ length: 12 }, () => 0), deadlines: [] }, c),
  tasks: tasksBoards({ columns: [], dueToday: [], priority: [], overdue: [], doneWeek: [], lists: [], recurring: [] }, c),
  projects: projectsBoards({ active: [], done: [] }, c),
  goals: goalsBoards({ active: [], achieved: [], checkinsWeek: 0, recent: [] }, c),
  insights: insightsBoards([], c),
  music: musicBoards({ instruments: [], repertoire: [], weekMin: 0, weekSessions: 0 }, c),
  sports: sportsBoards({ sports: [] }, c),
  finance: financeBoards(noFinance, c),
  focus: focusBoards({ sessions: [] }, c),
};

describe('Campus: quadros dos andares com os dados reais', () => {
  it('cada sala (e cada mural) dos prédios do Campus tem quadro: pela chave ou pela série', () => {
    for (const [id, fb] of Object.entries(EMPTY) as Array<[ModuleId, FloorBoards]>) {
      const keys = [...FLOOR_PLANS[id].flat().map(([k]) => k), ...Object.values(WALL_BOARDS[id] ?? {}).flatMap((l) => l.map(([k]) => k))];
      for (const k of keys) {
        const s = seriesOf(k);
        expect(s ? fb.series[s.name] : fb.rooms[k], `${id}.${k}`).toBeTruthy();
      }
    }
  });

  it('os murais de parede têm nome nos dois idiomas', () => {
    const P = pt.park.floorRooms as Record<string, Record<string, string>>;
    const E = en.park.floorRooms as Record<string, Record<string, string>>;
    for (const [id, levels] of Object.entries(WALL_BOARDS))
      for (const list of Object.values(levels ?? {}))
        for (const [k] of list) {
          expect(P[id]?.[k], `${id}.${k}`).toBeTruthy();
          expect(E[id]?.[k], `${id}.${k}`).toBeTruthy();
        }
  });

  it('sem dados, nenhum quadro inventa número: todos os quadros vazios dizem que não há nada', () => {
    const a = EMPTY.academy!;
    expect(a.rooms.cabins).toEqual({ title: 'Sessões de estudo de hoje', lines: ['Nenhuma sessão planejada para hoje'], empty: true });
    expect(a.rooms.practice!.empty).toBe(true);
    expect(a.rooms.exams!.lines).toEqual(['Nenhuma avaliação neste período']);
    expect(EMPTY.goals!.rooms.planning!.lines).toEqual(['Nenhum objetivo ativo']);
    expect(EMPTY.calendar!.rooms.timeline!.bars).toBeUndefined();
    for (const fb of Object.values(EMPTY))
      for (const b of Object.values(fb!.rooms)) {
        // Sem dados: o que aparece é o estado vazio (ou contagem zero dita por extenso), nunca uma barra.
        expect(b.bars, b.title).toBeUndefined();
      }
  });

  it('revisão da Academy: "N cartões para hoje" por baralho, com o singular', () => {
    const fb = academyBoards({ ...noAcademy, decks: [{ name: 'Matemática', due: 3 }, { name: 'Inglês', due: 1 }, { name: 'História', due: 0 }] }, c);
    expect(fb.rooms.practice!.lines).toEqual(['Matemática: 3 cartões para hoje', 'Inglês: 1 cartão para hoje', 'História: 0 cartões para hoje']);
    expect(academyBoards({ ...noAcademy, decks: [{ name: 'Math', due: 2 }] }, cEn).rooms.practice!.lines).toEqual(['Math: 2 cards due today']);
  });

  it('salas de aula: uma disciplina por sala, com a nota do período e a próxima avaliação', () => {
    const fb = academyBoards({ ...noAcademy, period: '4º bimestre', subjects: [{ name: 'Física', color: '#123456', grade: '8,5', next: { name: 'Prova 2', date: '2026-11-17' } }, { name: 'Química', color: '#654321', grade: null, next: null }] }, c);
    const [a, b, free] = distribute(fb.series.class!, 3);
    expect(a).toEqual({ title: 'Física', color: '#123456', lines: ['4º bimestre · Nota: 8,5', 'Próxima: Prova 2 · Hoje'] });
    expect(b!.lines).toEqual(['4º bimestre · Nota: pendente', 'Sem avaliação marcada']);
    expect(free).toEqual({ title: 'Sala livre', lines: ['Nenhuma disciplina para esta sala'], empty: true });
  });

  it('mais itens que salas: a última sala junta o resto pelo nome', () => {
    const s = { items: ['A', 'B', 'C', 'D'].map((title) => ({ title, lines: [] })), free: { title: 'livre', lines: [] }, more: 'Mais' };
    expect(distribute(s, 3).map((b) => b.title)).toEqual(['A', 'B', 'Mais']);
    expect(distribute(s, 3)[2]!.lines).toEqual(['C', 'D']);
    expect(distribute(s, 4).map((b) => b.title)).toEqual(['A', 'B', 'C', 'D']);
    expect(distribute(s, 0)).toEqual([]);
    expect(seriesOf('class2')).toEqual({ name: 'class', n: 2 });
    expect(seriesOf('practice')).toBeNull();
  });

  it('Insights: só compara com dados nas duas semanas; sem isso, o quadro diz que ainda não dá', () => {
    const m = (now: number, before: number, extra: Partial<InsightMetric> = {}): InsightMetric => ({ mod: 'focus', label: 'minutos de foco', now, before, has: true, ...extra });
    expect(canCompare(m(30, 0))).toBe(false);
    expect(canCompare(m(0, 30))).toBe(false);
    expect(canCompare(m(30, 20))).toBe(true);
    expect(canCompare(m(30, 20, { locked: true }))).toBe(false);
    const only = insightsBoards([m(30, 0)], c);
    expect(only.rooms.comparisons).toEqual({ title: 'Esta semana × a anterior', lines: ['Ainda não dá para comparar: faltam duas semanas com dados'], empty: true });
    const both = insightsBoards([m(30, 20), { ...m(5, 0), mod: 'tasks', label: 'tarefas concluídas' }], c);
    expect(both.rooms.comparisons!.lines).toEqual(['Focus: 30 minutos de foco (semana passada: 20)']);
    expect(both.rooms.deep!.lines).toEqual(['Ainda não dá para comparar: faltam duas semanas com dados']);
    expect(both.rooms.charts!.lines).toEqual(['Tasks: 5 tarefas concluídas']);
  });

  it('Finanças trancado pelo PIN: todos os quadros escuros, sem valor nenhum (nem no Insights)', () => {
    const open: FinanceFloorInput = {
      locked: false,
      hidden: false,
      currency: 'BRL',
      budgetEnabled: true,
      months: [{ label: 'Novembro', income: { planned: 5000, actual: 4200 }, expense: { planned: 3000, actual: 2750.5 } }],
      top: [{ name: 'Mercado', planned: 900, actual: 812 }],
      categories: 3,
      invest: [{ currency: 'BRL', invested: 12345, assets: 2 }],
      assets: [{ name: 'Tesouro', currency: 'BRL' }],
    };
    const shut = financeBoards({ ...open, locked: true }, c);
    for (const k of FINANCE_ROOMS) {
      expect(shut.rooms[k]!.locked, k).toBe(true);
      expect(shut.rooms[k]!.lines, k).toEqual([]);
    }
    const text = JSON.stringify(shut);
    expect(text).not.toMatch(/\d/);
    expect(text).not.toContain('Tesouro');
    expect(text).not.toContain('Mercado');
    // Aberto: os valores aparecem; com "ocultar valores", trocados por •••••.
    const shown = financeBoards(open, c);
    expect(shown.rooms.budget!.lines[0]).toMatch(/4\.200,00/);
    const hidden = financeBoards({ ...open, hidden: true }, c);
    expect(JSON.stringify(hidden.rooms)).not.toMatch(/\d{3}/);
    expect(hidden.rooms.charts!.lines[0]).toContain('•••••');
    const ins = insightsBoards([{ mod: 'finance', label: 'lançamentos', now: 0, before: 0, has: false, locked: true }], c);
    expect(ins.rooms.indicators!.lines).toEqual(['Finanças: trancado pelo PIN']);
  });

  it('pilares dos objetivos: altura do progresso real; qualitativo sem altura, com o aviso', () => {
    const fb = goalsBoards({ active: [{ name: 'Correr 10 km', progress: 0.4, deadline: '2026-12-01' }, { name: 'Ser mais paciente', progress: null, deadline: null }], achieved: [], checkinsWeek: 0, recent: [] }, c);
    expect(fb.rooms.planning!.bars).toEqual([
      { label: 'Correr 10 km', value: 0.4 },
      { label: 'Ser mais paciente', value: null },
    ]);
    expect(fb.rooms.planning!.nullLabel).toBe('qualitativo');
    expect(fb.rooms.links!.lines).toEqual(['1 de dez. · Correr 10 km']);
  });

  it('tarefas atrasadas, kanban e semana do Música com os dados que chegam', () => {
    const tk = tasksBoards({ columns: [{ name: 'A fazer', count: 2, top: ['Ler', 'Escrever'] }], dueToday: ['Ler'], priority: [], overdue: [{ title: 'Pagar conta', due: '2026-11-10' }], doneWeek: [], lists: [], recurring: [] }, c);
    expect(tk.rooms.organize!.lines).toEqual(['A fazer: 2', '   Ler', '   Escrever']);
    expect(tk.rooms.late!.title).toBe('Atrasadas: 1');
    expect(tk.rooms.late!.lines).toEqual(['10 de nov. · Pagar conta']);
    const mu = musicBoards({ instruments: [{ name: 'Violão', color: '#A0522D', weekMin: 45, songs: ['Asa Branca · 60%'] }], repertoire: [{ name: 'Asa Branca', instrument: 'Violão', progress: 60 }], weekMin: 45, weekSessions: 1 }, c);
    expect(mu.rooms.practiceTime!.title).toBe('Prática nesta semana: 45 min em 1 sessão');
    expect(mu.rooms.repertoire!.lines).toEqual(['Asa Branca · Violão · 60%']);
    expect(distribute(mu.series.practice!, 2)[0]!.lines).toEqual(['45 min nesta semana', 'Asa Branca · 60%']);
  });
});
