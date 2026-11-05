import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { addPause, createHabit, habitHistory, pauseHabit, resumeHabit, setHabitLog, updateHabit } from '@/data/habitsRepo';
import { consistency, dayState, emptyHabitInput, habitBuckets, habitInputOf, habitPeriods, scheduleAt, todayStatus, type HabitLog } from '@/domain/habits';

beforeEach(() => setDbForTests(new RoutigDB(`test-habits-${Math.random().toString(36).slice(2)}`)));

const logsMap = (logs: HabitLog[]) => new Map(logs.map((l) => [l.date, l]));

// 2026-11-02 é segunda-feira.
describe('hábitos (Parte 14)', () => {
  it('não duplica nome, guarda a frequência e trava o tipo depois de ter registros', async () => {
    const h = await createHabit({ ...emptyHabitInput('2026-11-02'), name: 'Estudar alemão' });
    await expect(createHabit({ ...emptyHabitInput('2026-11-02'), name: ' estudar ALEMÃO ' })).rejects.toMatchObject({ code: 'duplicate' });
    expect(h.schedule).toHaveLength(1);
    await setHabitLog(h.id, '2026-11-02', 1, '', '2026-11-04');
    await expect(updateHabit(h.id, { ...habitInputOf(h), method: 'scale' }, '2026-11-04')).rejects.toMatchObject({ code: 'method_locked' });
  });

  it('um registro por dia, sem dia futuro e com valor validado pelo tipo', async () => {
    const h = await createHabit({ ...emptyHabitInput('2026-11-01'), name: 'Ler', method: 'quantity', unit: 'páginas', frequency: { period: 'day', times: 1, weekdays: [], intervalDays: 2, target: 20 } });
    await setHabitLog(h.id, '2026-11-03', 10, 'pouco', '2026-11-04');
    await setHabitLog(h.id, '2026-11-03', 25, '', '2026-11-04');
    const logs = await getDb().habitLogs.where('habitId').equals(h.id).toArray();
    expect(logs.map((l) => l.value)).toEqual([25]);
    await expect(setHabitLog(h.id, '2026-11-05', 5, '', '2026-11-04')).rejects.toMatchObject({ code: 'future' });
    await expect(setHabitLog(h.id, '2026-11-02', -3, '', '2026-11-04')).rejects.toMatchObject({ code: 'invalid' });
    const s = await createHabit({ ...emptyHabitInput('2026-11-01'), name: 'Foco', method: 'scale', scaleMax: 5 });
    await expect(setHabitLog(s.id, '2026-11-02', 6, '', '2026-11-04')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('mudar a frequência vale a partir de hoje e não reescreve o passado', async () => {
    const h = await createHabit({ ...emptyHabitInput('2026-10-01'), name: 'Violão' });
    const next = await updateHabit(h.id, { ...habitInputOf(h), frequency: { period: 'week', times: 3, weekdays: [], intervalDays: 2, target: null } }, '2026-11-04');
    expect(next.schedule.map((s) => [s.from, s.period])).toEqual([
      ['2026-10-01', 'day'],
      ['2026-11-04', 'week'],
    ]);
    expect(scheduleAt(next, '2026-10-20')?.period).toBe('day');
    expect(scheduleAt(next, '2026-11-10')?.period).toBe('week');
    expect((await habitHistory(h.id)).some((c) => c.note === 'frequency:week/3')).toBe(true);
  });

  it('dias da semana: só os dias escolhidos são esperados', async () => {
    const h = await createHabit({ ...emptyHabitInput('2026-11-02'), name: 'Tênis', frequency: { period: 'day', times: 1, weekdays: [1, 3], intervalDays: 2, target: null } });
    await setHabitLog(h.id, '2026-11-02', 1, '', '2026-11-08');
    const logs = logsMap(await getDb().habitLogs.toArray());
    const periods = habitPeriods(h, logs, '2026-11-02', '2026-11-08', '2026-11-08', 1);
    expect(periods.map((p) => [p.start, p.met])).toEqual([
      ['2026-11-02', true],
      ['2026-11-04', false],
    ]);
    expect(dayState(h, undefined, '2026-11-03', '2026-11-08')).toBe('off');
    expect(dayState(h, undefined, '2026-11-04', '2026-11-08')).toBe('empty');
  });

  it('por semana: conta os dias cumpridos e o período aberto só entra se já foi cumprido', async () => {
    const h = await createHabit({ ...emptyHabitInput('2026-11-02'), name: 'Correr', frequency: { period: 'week', times: 2, weekdays: [], intervalDays: 2, target: null } });
    for (const d of ['2026-11-03', '2026-11-05', '2026-11-10']) await setHabitLog(h.id, d, 1, '', '2026-11-11');
    const logs = logsMap(await getDb().habitLogs.toArray());
    const periods = habitPeriods(h, logs, '2026-11-02', '2026-11-11', '2026-11-11', 1);
    expect(periods.map((p) => [p.start, p.achieved, p.met, p.current])).toEqual([
      ['2026-11-02', 2, true, false],
      ['2026-11-09', 1, false, true],
    ]);
    expect(consistency(periods)).toEqual({ met: 1, total: 1 });
    expect(todayStatus(h, logs, '2026-11-11', 1)).toMatchObject({ due: true, achieved: 1, expected: 2 });
  });

  it('pausas não contam contra e retomar fecha a pausa', async () => {
    const h = await createHabit({ ...emptyHabitInput('2026-11-01'), name: 'Meditar' });
    await addPause(h.id, '2026-11-03', '2026-11-05', 'viagem');
    await pauseHabit(h.id, '', '2026-11-08');
    await resumeHabit(h.id, '2026-11-10');
    const cur = (await getDb().habits.get(h.id))!;
    expect(cur.pauses).toEqual([
      { from: '2026-11-03', to: '2026-11-05', label: 'viagem' },
      { from: '2026-11-08', to: '2026-11-09', label: '' },
    ]);
    await setHabitLog(h.id, '2026-11-01', 1, '', '2026-11-10');
    const periods = habitPeriods(cur, logsMap(await getDb().habitLogs.toArray()), '2026-11-01', '2026-11-10', '2026-11-10', 1);
    // 10 dias: 1 cumprido, 5 pausados (3, 4, 5, 8, 9), hoje em aberto; contam 1 cumprido + 3 sem registro.
    expect(consistency(periods)).toEqual({ met: 1, total: 4 });
    expect(todayStatus(cur, new Map(), '2026-11-09', 1).due).toBe(false);
  });

  it('gráficos agrupam por semana: soma, contagem ou média', () => {
    const logs = [
      { date: '2026-11-02', value: 3 },
      { date: '2026-11-04', value: 5 },
      { date: '2026-10-28', value: 4 },
    ];
    const sum = habitBuckets('duration', logs, 'week', 2, '2026-11-04', 1);
    expect(sum.map((b) => [b.start, b.value])).toEqual([
      ['2026-10-26', 4],
      ['2026-11-02', 8],
    ]);
    expect(habitBuckets('scale', logs, 'week', 1, '2026-11-04', 1)[0]!.value).toBe(4);
    expect(habitBuckets('check', logs, 'week', 1, '2026-11-04', 1)[0]!.value).toBe(2);
  });
});
