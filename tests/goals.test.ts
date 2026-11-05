import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { addCheckin, createGoal, goalHistory, linkGoal, setGoalStatus, toggleMilestone, updateGoal } from '@/data/goalsRepo';
import { emptyGoalInput, goalInputOf, goalProgress, indicatorPercent, isGoalOverdue, looksReached } from '@/domain/goals';

beforeEach(() => setDbForTests(new RoutigDB(`test-goals-${Math.random().toString(36).slice(2)}`)));

const books = { id: 'ind1', name: 'Livros', unit: 'livros', start: 0, target: 12 };

describe('objetivos (Parte 15)', () => {
  it('não duplica nome e mensurável precisa de indicador com começo diferente da meta', async () => {
    await createGoal({ ...emptyGoalInput(), name: 'Ler mais', type: 'measurable', indicators: [books] });
    await expect(createGoal({ ...emptyGoalInput(), name: ' ler MAIS ' })).rejects.toMatchObject({ code: 'duplicate' });
    await expect(createGoal({ ...emptyGoalInput(), name: 'Sem indicador', type: 'measurable' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createGoal({ ...emptyGoalInput(), name: 'Indicador parado', type: 'measurable', indicators: [{ ...books, target: 0 }] })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('progresso real: mensurável pelo último valor, etapas pelos marcos, qualitativo sem porcentagem', async () => {
    const g = await createGoal({ ...emptyGoalInput(), name: 'Ler 12 livros', type: 'measurable', indicators: [books] });
    await addCheckin(g.id, { date: '2026-11-01', indicatorId: 'ind1', value: 3, level: null, note: '' }, '2026-11-04');
    await addCheckin(g.id, { date: '2026-10-01', indicatorId: 'ind1', value: 1, level: null, note: '' }, '2026-11-04');
    const checkins = await getDb().goalCheckins.toArray();
    const p = goalProgress(g, checkins);
    expect(p).toMatchObject({ kind: 'percent', percent: 25 });
    expect(goalProgress({ ...g, type: 'qualitative' }, checkins)).toEqual({ kind: 'none' });
    const stages = goalProgress({ ...g, type: 'stages', milestones: [{ id: 'a', title: 'A', date: null, done: true, doneAt: null }, { id: 'b', title: 'B', date: null, done: false, doneAt: null }] }, []);
    expect(stages).toEqual({ kind: 'stages', done: 1, total: 2, percent: 50 });
  });

  it('indicador que desce também conta (90 s para 70 s)', () => {
    expect(indicatorPercent({ start: 90, target: 70 }, 80)).toBe(50);
    expect(indicatorPercent({ start: 90, target: 70 }, 95)).toBe(0);
    expect(indicatorPercent({ start: 90, target: 70 }, 60)).toBe(100);
  });

  it('chegar à meta só sugere concluir: o status não muda sozinho', async () => {
    const g = await createGoal({ ...emptyGoalInput(), name: 'Violão nível 4', type: 'skill', levelMax: 5, levelTarget: 4, status: 'active' });
    await addCheckin(g.id, { date: '2026-11-04', indicatorId: null, value: null, level: 4, note: 'consigo tocar a música toda' }, '2026-11-04');
    const p = goalProgress(g, await getDb().goalCheckins.toArray());
    expect(looksReached(p)).toBe(true);
    expect((await getDb().goals.get(g.id))?.status).toBe('active');
    await setGoalStatus(g.id, 'done');
    expect((await getDb().goals.get(g.id))?.doneAt).not.toBeNull();
  });

  it('acompanhamento: rejeita data futura, valor sem indicador e registro vazio', async () => {
    const g = await createGoal({ ...emptyGoalInput(), name: 'Ser mais organizado' });
    await expect(addCheckin(g.id, { date: '2026-11-05', indicatorId: null, value: null, level: null, note: 'oi' }, '2026-11-04')).rejects.toMatchObject({ code: 'future' });
    await expect(addCheckin(g.id, { date: '2026-11-04', indicatorId: null, value: 3, level: null, note: '' }, '2026-11-04')).rejects.toMatchObject({ code: 'invalid' });
    await expect(addCheckin(g.id, { date: '2026-11-04', indicatorId: null, value: null, level: null, note: '  ' }, '2026-11-04')).rejects.toMatchObject({ code: 'invalid' });
    await addCheckin(g.id, { date: '2026-11-04', indicatorId: null, value: null, level: null, note: 'semana boa' }, '2026-11-04');
  });

  it('histórico guarda status, prazo, metas e marcos; ligações não duplicam', async () => {
    const g = await createGoal({ ...emptyGoalInput(), name: 'Feira de ciências', type: 'stages', milestones: [{ id: 'm1', title: 'Escolher tema', date: null, done: false, doneAt: null }] });
    await updateGoal(g.id, { ...goalInputOf(g), status: 'active', deadline: '2026-12-01' });
    await toggleMilestone(g.id, 'm1');
    await linkGoal(g.id, { type: 'habit', id: 'h1' });
    await linkGoal(g.id, { type: 'habit', id: 'h1' });
    const cur = (await getDb().goals.get(g.id))!;
    expect(cur.refs).toEqual([{ type: 'habit', id: 'h1' }]);
    expect(cur.milestones[0]?.doneAt).not.toBeNull();
    const notes = (await goalHistory(g.id)).map((c) => c.note);
    expect(notes).toEqual(expect.arrayContaining(['status:active', 'deadline:2026-12-01', 'milestone:Escolher tema', 'link:habit']));
    expect(isGoalOverdue(cur, '2026-12-02')).toBe(true);
  });
});
