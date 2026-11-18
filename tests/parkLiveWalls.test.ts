import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/domain/academy';
import type { FocusTimer } from '@/domain/focus';
import type { Goal, GoalCheckin } from '@/domain/goals';
import type { InboxItem } from '@/domain/inbox';
import type { Language, LanguageSession } from '@/domain/languages';
import type { LibraryItem } from '@/domain/library';
import type { Instrument, PracticeSession } from '@/domain/music';
import type { Note } from '@/domain/notes';
import type { Project } from '@/domain/projects';
import type { Sport, SportActivity } from '@/domain/sports';
import { backWall, FLOOR_PLANS } from '@/features/park/interiors/floors';
import { roomType } from '@/features/park/interiors/furnish';
import {
  capList,
  focusFace,
  focusTap,
  goalShare,
  goalWall,
  inboxTray,
  languagesWall,
  LIVE_WALL_ROOMS,
  musicWall,
  nextMilestone,
  projectWall,
  recentLibrary,
  recentNotes,
  sportsToday,
  studyToday,
  WALL_KIND,
  wallBuilding,
} from '@/features/park/live';
import type { ModuleId } from '@/app/modules';

/* "3D de verdade" nos outros prédios (seção 28): as partes puras das paredes de ação. */

const TODAY = '2026-11-04';
const WEEK = '2026-11-02';
const base = { createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', deletedAt: null as string | null, rev: 1 };

function goal(id: string, over: Partial<Goal> = {}): Goal {
  return {
    ...base,
    id,
    name: `Objetivo ${id}`,
    description: '',
    area: 'personal',
    horizon: null,
    type: 'qualitative',
    status: 'active',
    priority: 'none',
    deadline: null,
    indicators: [],
    levelMax: 5,
    levelTarget: null,
    milestones: [],
    refs: [],
    notes: '',
    doneAt: null,
    ...over,
  };
}

describe('sala de cada parede', () => {
  it('cada prédio com parede tem a sala no programa, o setor certo e superfície para a parede', () => {
    for (const [id, room] of Object.entries(LIVE_WALL_ROOMS) as Array<[ModuleId, { key: string; sector: string }]>) {
      const rooms = (FLOOR_PLANS[id] ?? []).flat();
      const found = rooms.find(([key]) => key === room.key);
      expect(found, `${id}:${room.key}`).toBeDefined();
      expect(found![1]).toBe(room.sector);
      const type = roomType(room.key, id);
      // Sala de dados (parede de telas) ou fundo livre (quadro, espelho, ripas).
      expect(type === 'dataviz' || backWall(type, 6, 6) !== undefined, `${id}:${room.key} (${type})`).toBe(true);
    }
  });

  it('Finanças e Habits não têm parede (o cofre e os canteiros já são o 3D deles)', () => {
    expect(LIVE_WALL_ROOMS.finance).toBeUndefined();
    expect(LIVE_WALL_ROOMS.habits).toBeUndefined();
  });

  it('o fundo ocupado (estantes, sofá, espuma) não recebe parede', () => {
    expect(backWall('archive', 6, 6)).toBeUndefined();
    expect(backWall('lounge', 6, 6)).toBeUndefined();
    expect(backWall('booth', 6, 6)).toBeUndefined();
    const w = backWall('office', 6, 6)!;
    // Na frente do quadro (fundo da sala = -3 m), abaixo dos quadros decorativos (1,9 m).
    expect(w.z).toBeGreaterThan(-3);
    expect(w.y + w.h / 2).toBeLessThanOrEqual(2.1);
  });

  it('cada prefixo de ação é de um prédio só e volta para ele', () => {
    const kinds = Object.values(WALL_KIND);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const [id, k] of Object.entries(WALL_KIND) as Array<[ModuleId, string]>) {
      expect(wallBuilding(k)).toBe(id);
      expect(LIVE_WALL_ROOMS[id]).toBeDefined();
    }
    // Os prefixos do piloto não são de parede.
    for (const k of ['bed', 'card', 'more', 'ev']) expect(wallBuilding(k)).toBeNull();
  });
});

describe('corte das listas', () => {
  it('até o limite mostra tudo; passando, o limite menos um e o "+N"', () => {
    expect(capList([1, 2, 3], 5)).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(capList([1, 2, 3, 4, 5], 5)).toEqual({ shown: [1, 2, 3, 4, 5], more: 0 });
    expect(capList([1, 2, 3, 4, 5, 6], 5)).toEqual({ shown: [1, 2, 3, 4], more: 2 });
    expect(capList([], 5)).toEqual({ shown: [], more: 0 });
  });
});

describe('Goals: progresso real', () => {
  it('fração só do que dá para medir', () => {
    expect(goalShare({ kind: 'percent', percent: 40, parts: [] })).toBeCloseTo(0.4);
    expect(goalShare({ kind: 'stages', done: 1, total: 4, percent: 25 })).toBeCloseTo(0.25);
    expect(goalShare({ kind: 'stages', done: 0, total: 0, percent: null })).toBeNull();
    expect(goalShare({ kind: 'level', current: 3, target: 4, max: 5 })).toBeCloseTo(0.75);
    expect(goalShare({ kind: 'level', current: null, target: 4, max: 5 })).toBeNull();
    expect(goalShare({ kind: 'none' })).toBeNull();
  });

  it('só os abertos, na ordem do módulo, com prazo vencido marcado', () => {
    const goals = [
      goal('a', { status: 'paused' }),
      goal('b', { type: 'stages', milestones: [{ id: 'm1', title: 'x', date: null, done: true, doneAt: null }, { id: 'm2', title: 'y', date: null, done: false, doneAt: null }] }),
      goal('c', { status: 'done' }),
      goal('d', { deadline: '2026-11-01' }),
      goal('e', { deletedAt: '2026-11-01T00:00:00Z' }),
    ];
    const w = goalWall(goals, () => [] as GoalCheckin[], TODAY);
    expect(w.shown.map((g) => g.id)).toEqual(['d', 'b', 'a']);
    expect(w.shown.find((g) => g.id === 'b')!.share).toBeCloseTo(0.5);
    expect(w.shown.find((g) => g.id === 'd')!.overdue).toBe(true);
    expect(w.shown.find((g) => g.id === 'a')!.share).toBeNull();
  });
});

describe('Projects: ativos e próximo marco', () => {
  const ms = (id: string, date: string | null, done = false) => ({ id, title: `Marco ${id}`, date, done, doneAt: null });
  it('o próximo marco é o em aberto de data mais próxima (sem data por último)', () => {
    expect(nextMilestone({ milestones: [ms('a', null), ms('b', '2026-12-01'), ms('c', '2026-11-20', true), ms('d', '2026-11-25')] })?.id).toBe('d');
    expect(nextMilestone({ milestones: [ms('a', null)] })?.id).toBe('a');
    expect(nextMilestone({ milestones: [ms('a', '2026-11-20', true)] })).toBeNull();
  });

  it('só os não encerrados, com a porcentagem do módulo (null quando não há o que contar)', () => {
    const p = (id: string, status: Project['status'], milestones = [ms('x', null)]) => ({ ...base, id, name: id, color: '#000', status, milestones }) as unknown as Project;
    const w = projectWall([p('a', 'active'), p('b', 'done'), p('c', 'paused', []), p('d', 'cancelled')], (x) => ({ percent: x.milestones.length ? 0 : null }));
    expect(w.shown.map((x) => x.id)).toEqual(['a', 'c']);
    expect(w.shown[0]!.next?.id).toBe('x');
    expect(w.shown[1]!.percent).toBeNull();
    expect(w.shown[1]!.next).toBeNull();
  });
});

describe('Notes, Library e Inbox: o mais recente primeiro', () => {
  it('notas pela última edição, sem a lixeira', () => {
    const n = (id: string, updatedAt: string, deletedAt: string | null = null) => ({ ...base, id, title: id, updatedAt, deletedAt }) as unknown as Note;
    const w = recentNotes([n('a', '2026-11-01T10:00:00Z'), n('b', '2026-11-03T10:00:00Z'), n('c', '2026-11-04T10:00:00Z', '2026-11-04T11:00:00Z')]);
    expect(w.shown.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('materiais pela data em que foram adicionados', () => {
    const i = (id: string, createdAt: string) => ({ ...base, id, title: id, kind: 'book', favorite: false, createdAt }) as unknown as LibraryItem;
    expect(recentLibrary([i('a', '2026-10-01T00:00:00Z'), i('b', '2026-11-01T00:00:00Z')]).shown.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('só as chegadas em aberto e não adiadas para depois de hoje', () => {
    const it0 = (id: string, over: Partial<InboxItem>) => ({ ...base, id, text: id, url: null, fileName: null, status: 'open', snoozedUntil: null, ...over }) as unknown as InboxItem;
    const w = inboxTray(
      [
        it0('a', { createdAt: '2026-11-01T00:00:00Z' }),
        it0('b', { createdAt: '2026-11-03T00:00:00Z' }),
        it0('c', { status: 'archived' }),
        it0('d', { snoozedUntil: '2026-11-10' }),
        it0('e', { snoozedUntil: TODAY, createdAt: '2026-10-20T00:00:00Z' }),
        it0('f', { text: '', fileName: 'foto.png', createdAt: '2026-11-04T00:00:00Z' }),
      ],
      TODAY,
    );
    expect(w.shown.map((x) => x.id)).toEqual(['f', 'b', 'a', 'e']);
    expect(w.shown[0]!.title).toBe('foto.png');
  });
});

describe('Academy: sessões de hoje', () => {
  it('planejadas e feitas de hoje, pela hora; puladas e de outros dias fora', () => {
    const s = (id: string, over: Partial<StudySession>) => ({ ...base, id, subjectId: 'm', date: TODAY, time: null, durationMin: 30, status: 'planned', actualMin: null, ...over }) as unknown as StudySession;
    const w = studyToday([s('a', { time: '14:00' }), s('b', { time: '08:00', status: 'done', actualMin: 45 }), s('c', {}), s('d', { status: 'skipped' }), s('e', { date: '2026-11-05' })], TODAY);
    expect(w.shown.map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(w.shown[0]).toMatchObject({ done: true, min: 45 });
    expect(w.shown[1]).toMatchObject({ done: false, min: 30 });
  });
});

describe('Focus: o relógio compartilhado', () => {
  const timer = (over: Partial<FocusTimer>): FocusTimer => ({
    mode: 'pomodoro',
    kind: 'study',
    taskId: null,
    ref: null,
    environment: 'nature',
    sound: 'none',
    plannedMin: 25,
    phase: 'focus',
    cycles: 0,
    phaseMs: 25 * 60_000,
    runningSince: 1_000_000,
    phaseElapsedMs: 0,
    doneFocusMs: 0,
    doneBreakMs: 0,
    waiting: false,
    startedAt: '2026-11-04T10:00:00Z',
    date: TODAY,
    ...over,
  });

  it('o toque faz o que o botão da estação faria', () => {
    expect(focusTap(null, false)).toBe('open');
    expect(focusTap(timer({}), false)).toBe('pause');
    expect(focusTap(timer({ runningSince: null }), false)).toBe('resume');
    expect(focusTap(timer({ waiting: true, runningSince: null }), false)).toBe('next');
    // Terminada, esperando ser salva: a estação.
    expect(focusTap(timer({}), true)).toBe('open');
  });

  it('o mostrador: o que falta na fase, pausado parado, contínua contando', () => {
    expect(focusFace(null, 0)).toEqual({ state: 'idle', ms: 0, progress: null });
    const run = focusFace(timer({}), 1_000_000 + 5 * 60_000);
    expect(run.state).toBe('running');
    expect(run.ms).toBe(20 * 60_000);
    expect(run.progress).toBeCloseTo(0.2);
    const paused = focusFace(timer({ runningSince: null, phaseElapsedMs: 10 * 60_000 }), 9_999_999);
    expect(paused).toMatchObject({ state: 'paused', ms: 15 * 60_000 });
    const cont = focusFace(timer({ mode: 'continuous', phaseMs: null }), 1_000_000 + 90_000);
    expect(cont).toEqual({ state: 'running', ms: 90_000, progress: null });
    expect(focusFace(timer({ waiting: true, runningSince: null, phaseMs: 5 * 60_000 }), 0)).toEqual({ state: 'waiting', ms: 5 * 60_000, progress: null });
  });
});

describe('Idiomas, Música e Esportes: só o que foi registrado', () => {
  it('idiomas estudados com a semana e as palavras vencidas; o nativo fica fora', () => {
    const l = (id: string, native = false) => ({ ...base, id, name: id, color: '#123', native }) as unknown as Language;
    const s = (languageId: string, date: string, durationMin: number) => ({ ...base, id: `${languageId}${date}`, languageId, date, durationMin, activity: 'reading' }) as unknown as LanguageSession;
    const w = languagesWall([l('pt', true), l('de'), l('en')], [s('de', '2026-11-02', 20), s('de', '2026-11-03', 15), s('de', '2026-10-30', 50), s('en', '2026-11-05', 10)], (id) => (id === 'de' ? 7 : 0), WEEK, TODAY);
    expect(w.shown.map((x) => x.id)).toEqual(['de', 'en']);
    expect(w.shown[0]).toMatchObject({ due: 7, weekMin: 35, days: 2 });
    expect(w.shown[1]).toMatchObject({ due: 0, weekMin: 0, days: 0 });
  });

  it('instrumentos com a prática da semana e o último dia (sem prática: null)', () => {
    const i = (id: string) => ({ ...base, id, name: id, color: '#456' }) as unknown as Instrument;
    const p = (date: string, durationMin: number) => ({ ...base, id: date, instrumentId: 'v', date, durationMin }) as unknown as PracticeSession;
    const w = musicWall([i('v'), i('p')], (id) => (id === 'v' ? [p('2026-10-28', 30), p('2026-11-03', 20), p('2026-11-04', 25)] : []), WEEK, TODAY);
    expect(w.shown[0]).toMatchObject({ weekMin: 45, last: '2026-11-04' });
    expect(w.shown[1]).toMatchObject({ weekMin: 0, last: null });
  });

  it('atividades de hoje de todas as modalidades', () => {
    const sp = (id: string) => ({ ...base, id, name: id, color: '#789' }) as unknown as Sport;
    const a = (id: string, date: string) => ({ ...base, id, sportId: 'x', date, title: '', type: 'training', durationMin: 60, outcome: null }) as unknown as SportActivity;
    const w = sportsToday([sp('tenis'), sp('futebol')], (id) => (id === 'tenis' ? [a('t1', TODAY), a('t0', '2026-11-03')] : [a('f1', TODAY)]), TODAY);
    expect(w.shown.map((x) => `${x.sport}:${x.id}`)).toEqual(['tenis:t1', 'futebol:f1']);
    expect(sportsToday([sp('tenis')], () => [], TODAY).shown).toEqual([]);
  });
});
