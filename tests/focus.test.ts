import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { loadActiveTimer, saveActiveTimer, saveFocusSession, updateFocusSession } from '@/data/focusRepo';
import { DEFAULT_FOCUS_CONFIG, formatClock, isPhaseOver, migrateFocusConfig, nextPhase, pauseTimer, phaseRemaining, resumeTimer, sessionFromTimer, startTimer, startWaitingPhase, totalFocusMs } from '@/domain/focus';

beforeEach(() => setDbForTests(new RoutigDB(`test-focus-${Math.random().toString(36).slice(2)}`)));

const MIN = 60_000;
const base = { kind: 'study' as const, taskId: 't1', ref: null, environment: 'minimal' as const, sound: 'none' as const };
const cfg = { ...DEFAULT_FOCUS_CONFIG, cyclesBeforeLong: 2 };

describe('timer do Focus (Parte 13.2)', () => {
  it('conta pelo horário e pausa sem perder tempo', () => {
    let t = startTimer({ ...base, mode: 'pomodoro' as const }, cfg, 0, '2026-11-04');
    expect(phaseRemaining(t, 10 * MIN)).toBe(15 * MIN);
    t = pauseTimer(t, 10 * MIN);
    expect(phaseRemaining(t, 60 * MIN)).toBe(15 * MIN);
    t = resumeTimer(t, 60 * MIN);
    expect(phaseRemaining(t, 65 * MIN)).toBe(10 * MIN);
    expect(isPhaseOver(t, 75 * MIN)).toBe(true);
  });

  it('Pomodoro: foco → pausa curta → foco → pausa longa a cada N', () => {
    let t = startTimer({ ...base, mode: 'pomodoro' as const }, cfg, 0, '2026-11-04');
    let r = nextPhase(t, cfg, 25 * MIN);
    expect([r.timer.phase, r.timer.cycles, r.timer.waiting, r.finished]).toEqual(['shortBreak', 1, false, false]);
    r = nextPhase(r.timer, cfg, 30 * MIN);
    expect([r.timer.phase, r.timer.waiting]).toEqual(['focus', true]);
    t = startWaitingPhase(r.timer, 31 * MIN);
    r = nextPhase(t, cfg, 56 * MIN);
    expect([r.timer.phase, r.timer.cycles]).toEqual(['longBreak', 2]);
    expect(totalFocusMs(r.timer, 56 * MIN)).toBe(50 * MIN);
  });

  it('pular a pausa não conta foco a mais; tempo definido termina a sessão', () => {
    const t = startTimer({ ...base, mode: 'custom' as const, customMin: 40 }, cfg, 0, '2026-11-04');
    const r = nextPhase(t, cfg, 40 * MIN);
    expect(r.finished).toBe(true);
    const s = sessionFromTimer(r.timer, 41 * MIN, ' ok ');
    expect([s.actualMin, s.plannedMin, s.completed, s.taskId]).toEqual([40, 40, true, 't1']);
    const early = sessionFromTimer(t, 12 * MIN, '');
    expect([early.actualMin, early.completed]).toEqual([12, false]);
  });

  it('contínua não tem fim marcado', () => {
    const t = startTimer({ ...base, mode: 'continuous' as const }, cfg, 0, '2026-11-04');
    expect(phaseRemaining(t, 300 * MIN)).toBeNull();
    expect(isPhaseOver(t, 300 * MIN)).toBe(false);
    expect(formatClock(65 * MIN + 9000)).toBe('1:05:09');
    expect(formatClock(25 * MIN)).toBe('25:00');
  });

  it('configuração inválida volta ao padrão', () => {
    expect(migrateFocusConfig({ focusMin: -3 })).toEqual(DEFAULT_FOCUS_CONFIG);
    expect(migrateFocusConfig({ focusMin: 50 }).focusMin).toBe(50);
  });
});

describe('sessões do Focus (Parte 13.4 e 13.6)', () => {
  it('guarda o timer em andamento e salva a sessão ligada à tarefa', async () => {
    const t = startTimer({ ...base, mode: 'custom' as const, customMin: 30 }, cfg, 0, '2026-11-04');
    await saveActiveTimer(t);
    expect((await loadActiveTimer())?.taskId).toBe('t1');
    await saveActiveTimer(null);
    expect(await loadActiveTimer()).toBeNull();
    const s = await saveFocusSession(sessionFromTimer(t, 30 * MIN, ''));
    expect((await getDb().focusSessions.where('taskId').equals('t1').toArray()).map((x) => x.actualMin)).toEqual([30]);
    // Minutos medidos pelo timer não mudam na edição.
    await updateFocusSession(s.id, { notes: 'revisão', actualMin: 99 });
    expect((await getDb().focusSessions.get(s.id))?.actualMin).toBe(30);
  });
});
