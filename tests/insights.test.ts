import { describe, expect, it } from 'vitest';
import { academyInsights, focusInsights, previousRange, rangeFor, series, sportsInsights, tasksInsights } from '@/domain/insights';

const base = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '', deletedAt: null, rev: 1 };

describe('insights (Parte 19)', () => {
  it('períodos: semana, mês, ano e o período anterior do mesmo tamanho', () => {
    expect(rangeFor('week', '2026-11-04', 1)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(rangeFor('month', '2026-02-10', 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(rangeFor('month', '2026-12-10', 1)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(rangeFor('year', '2026-06-01', 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(previousRange({ from: '2026-11-02', to: '2026-11-08' })).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('sem registros é "sem dados", diferente de zero no período', () => {
    const r = { from: '2026-11-02', to: '2026-11-08' };
    expect(focusInsights([], r)).toMatchObject({ has: false, minutes: 0 });
    const s = { ...base, id: 'f', date: '2026-10-01', startedAt: '', endedAt: '', kind: 'study' as const, mode: 'custom' as const, plannedMin: 30, actualMin: 30, breakMin: 0, cycles: 0, completed: true, taskId: null, ref: null, environment: 'minimal' as const, notes: '', manual: false };
    expect(focusInsights([s], r)).toMatchObject({ has: true, minutes: 0, sessions: 0 });
  });

  it('tarefas concluídas contam pela data de conclusão', () => {
    const r = { from: '2026-11-02', to: '2026-11-08' };
    const t = (completedAt: string | null) => ({ ...base, completedAt }) as never;
    expect(tasksInsights([t('2026-11-03T12:00:00Z'), t('2026-10-30T12:00:00Z'), t(null)], r)).toMatchObject({ completed: 1, created: 0 });
    // Recorrente: cada ocorrência feita conta, e a última de uma série encerrada não conta duas vezes.
    const rec = { ...base, completedAt: '2026-11-05T12:00:00Z', occurrences: [{ date: '2026-11-03', completedAt: '2026-11-03T12:00:00Z', kind: 'done' }, { date: '2026-11-04', completedAt: '2026-11-04T12:00:00Z', kind: 'skipped' }, { date: '2026-11-05', completedAt: '2026-11-05T12:00:00Z', kind: 'done' }] } as never;
    expect(tasksInsights([rec], r)).toMatchObject({ completed: 2 });
  });

  it('média da Academy só com avaliações com nota no período, na escala da disciplina', () => {
    const r = { from: '2026-11-01', to: '2026-11-30' };
    const subject = { ...base, id: 's', yearId: 'y', name: 'Matemática', kind: 'regular', color: '#000000', teacherId: null, model: null, notes: '' } as never;
    const year = { id: 'y', model: { scale: 10 } } as never;
    const a = (score: number | null, date: string) => ({ ...base, id: `${score}${date}`, subjectId: 's', name: 'P', date, maxScore: 20, score, weight: 1 }) as never;
    const out = academyInsights([subject], [year], [a(16, '2026-11-05'), a(10, '2026-11-20'), a(null, '2026-11-10'), a(20, '2026-10-01')], [], [], r);
    expect(out.assessments).toBe(2);
    expect(out.bySubject[0]).toMatchObject({ average: 6.5, scale: 10 });
  });

  it('esportes: frequência e campanha; série com zeros onde não houve registro', () => {
    const r = { from: '2026-11-02', to: '2026-11-08' };
    const act = (date: string, type: 'training' | 'match', outcome: 'win' | null = null) => ({ ...base, id: date + type, sportId: 'x', date, type, durationMin: 60, outcome }) as never;
    const s = sportsInsights([{ ...base, id: 'x' } as never], [act('2026-11-02', 'training'), act('2026-11-02', 'match', 'win'), act('2026-11-05', 'training')], r);
    expect(s).toMatchObject({ activities: 3, trainings: 2, games: 1, activeDays: 2, minutes: 180, record: { win: 1, loss: 0, draw: 0 } });
    const pts = series(s.points, r, 1);
    expect(pts).toHaveLength(7);
    expect(pts.map((p) => p.value)).toEqual([2, 0, 0, 1, 0, 0, 0]);
  });
});
