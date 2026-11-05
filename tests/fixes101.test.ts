import { beforeEach, describe, expect, it } from 'vitest';
import { RoutigDB, setDbForTests } from '@/data/db';
import { createHabit, setHabitLog } from '@/data/habitsRepo';
import { gatherAlertInput } from '@/data/notificationsRepo';
import { emptyHabitInput } from '@/domain/habits';

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-fix101-${Math.random().toString(36).slice(2)}`));
});

describe('V1.0.1', () => {
  it('aviso de hábitos: hábito semanal já cumprido em outro dia da semana não avisa', async () => {
    const weekly = { period: 'week' as const, times: 1, weekdays: [], intervalDays: 2, target: null };
    const done = await createHabit({ ...emptyHabitInput('2026-11-02'), name: 'Correr', frequency: weekly });
    const pending = await createHabit({ ...emptyHabitInput('2026-11-02'), name: 'Nadar', frequency: weekly });
    await setHabitLog(done.id, '2026-11-03', 1, '', '2026-11-05');
    const input = await gatherAlertInput(1, new Date(2026, 10, 5, 12));
    expect(input.habitsDue.map((h) => h.name)).toEqual(['Nadar']);
    expect(pending.id).toBeTruthy();
  });
});
