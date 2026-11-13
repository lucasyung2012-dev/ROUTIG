import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import {
  addHistoryEntry,
  createCategory,
  createInterest,
  deleteHistoryEntry,
  interestHistory,
  interestInputOf,
  InterestRuleError,
  loadCategories,
  loadTimeline,
  purgeInterest,
  setOverride,
  softDeleteInterest,
  updateInterest,
} from '@/data/interestsRepo';
import { createProject, updateProject, projectInputOf } from '@/data/projectsRepo';
import { buildTimeline, countByWeek, emptyInterestInput, moduleEvolution, weekStart } from '@/domain/interests';
import { emptyProjectInput } from '@/domain/projects';

beforeEach(() => setDbForTests(new RoutigDB(`test-interests-${Math.random().toString(36).slice(2)}`)));

describe('interesses (Parte 21.2–21.4)', () => {
  it('cria, edita e guarda a troca de status no histórico', async () => {
    const i = await createInterest({ ...emptyInterestInput(), name: 'Robótica', categoryId: 'technology' });
    expect(i.status).toBe('exploring');
    const next = await updateInterest(i.id, { ...interestInputOf(i), status: 'developing' });
    expect(next.rev).toBe(2);
    const h = await interestHistory(i.id);
    expect(h.map((e) => e.action)).toEqual(['update', 'create']);
    expect(h[0]!.note).toBe('developing');
  });

  it('não aceita nome vazio nem repetido', async () => {
    await expect(createInterest({ ...emptyInterestInput(), name: '  ' })).rejects.toBeInstanceOf(InterestRuleError);
    await createInterest({ ...emptyInterestInput(), name: 'Violão' });
    await expect(createInterest({ ...emptyInterestInput(), name: 'violão' })).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('Lixeira e exclusão definitiva não apagam projetos ligados', async () => {
    const p = await createProject({ ...emptyProjectInput(), name: 'Feira' });
    const i = await createInterest({ ...emptyInterestInput(), name: 'Ciência', projectIds: [p.id, p.id] });
    expect(i.projectIds).toEqual([p.id]); // sem duplicar ligação
    await softDeleteInterest(i.id);
    expect((await getDb().interests.get(i.id))?.deletedAt).not.toBeNull();
    await purgeInterest(i.id);
    expect(await getDb().interests.get(i.id)).toBeUndefined();
    expect(await getDb().projects.get(p.id)).toBeDefined();
  });

  it('categoria personalizada não se repete', async () => {
    const a = await createCategory('Astronomia');
    const b = await createCategory('astronomia');
    expect(b.id).toBe(a.id);
    expect(await loadCategories()).toHaveLength(1);
  });
});

describe('Minha história (Parte 21.6)', () => {
  it('junta registros reais, permite renomear e ocultar sem mudar o original', async () => {
    const p = await createProject({ ...emptyProjectInput(), name: 'Maquete', milestones: [{ id: 'm1', title: 'Entrega', date: null, done: false, doneAt: null }] });
    await updateProject(p.id, { ...projectInputOf(p), milestones: [{ id: 'm1', title: 'Entrega', date: null, done: true, doneAt: null }] });
    await createInterest({ ...emptyInterestInput(), name: 'Tênis', startDate: '2026-03-01' });
    const e = await addHistoryEntry('2026-05-10', 'Primeira apresentação');

    let tl = await loadTimeline();
    expect(tl.map((x) => x.kind).sort()).toEqual(['interestStart', 'manual', 'milestoneDone', 'projectCreated']);

    await setOverride(`projectCreated:${p.id}`, { title: 'Começo da maquete' });
    await setOverride(`interestStart:${(await getDb().interests.toArray())[0]!.id}`, { hidden: true });
    tl = await loadTimeline();
    expect(tl.find((x) => x.kind === 'projectCreated')).toMatchObject({ title: 'Começo da maquete', edited: true });
    expect(tl.find((x) => x.kind === 'interestStart')?.hidden).toBe(true);
    expect((await getDb().projects.get(p.id))?.name).toBe('Maquete');

    await deleteHistoryEntry(e.id);
    expect((await loadTimeline()).some((x) => x.kind === 'manual')).toBe(false);
  });

  it('projeto concluído entra com a data da troca de status', () => {
    const tl = buildTimeline(
      { manual: [], interests: [], projects: [{ id: 'p', name: 'X', createdAt: '2026-01-02T10:00:00Z', deletedAt: null, status: 'done', doneAt: '2026-02-03T10:00:00Z', milestones: [] }] },
      {},
    );
    expect(tl.map((x) => [x.kind, x.date])).toEqual([
      ['projectDone', '2026-02-03'],
      ['projectCreated', '2026-01-02'],
    ]);
  });
});

describe('Minha evolução (Parte 21.5)', () => {
  it('conta por semana começando na segunda-feira', () => {
    expect(weekStart('2026-11-03')).toBe('2026-11-02'); // terça → segunda
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // domingo → segunda anterior
    const w = countByWeek(['2026-11-03', '2026-11-02', '2026-10-27', '2025-01-01'], '2026-11-03', 3);
    expect(w).toEqual([
      { start: '2026-10-19', count: 0 },
      { start: '2026-10-26', count: 1 },
      { start: '2026-11-02', count: 2 },
    ]);
  });
});

describe('Minha evolução: hábitos, Focus, Goals, Music e Sports', () => {
  const del = '2026-11-10T10:00:00.000Z';
  const empty = { habits: [], habitLogs: [], focus: [], goals: [], instruments: [], songs: [], sports: [], activities: [] };

  it('sem registros nesses módulos, nada aparece (nada inventado)', () => {
    expect(moduleEvolution(empty)).toEqual([]);
  });

  it('conta só o que está fora da Lixeira, inclusive o que é de um registro pai na Lixeira', () => {
    const out = moduleEvolution({
      habits: [{ id: 'h', deletedAt: null }, { id: 'hx', deletedAt: del }],
      habitLogs: [{ habitId: 'h', deletedAt: null }, { habitId: 'h', deletedAt: null }, { habitId: 'h', deletedAt: del }, { habitId: 'hx', deletedAt: null }],
      focus: [{ actualMin: 25, deletedAt: null }, { actualMin: 50, deletedAt: null }, { actualMin: 90, deletedAt: del }],
      goals: [{ status: 'done', deletedAt: null }, { status: 'active', deletedAt: null }, { status: 'done', deletedAt: del }],
      instruments: [{ id: 'i', deletedAt: null }, { id: 'ix', deletedAt: del }],
      songs: [
        { instrumentId: 'i', status: 'mastered', deletedAt: null },
        { instrumentId: 'i', status: 'mastered', deletedAt: del },
        { instrumentId: 'i', status: 'learning', deletedAt: null },
        { instrumentId: 'ix', status: 'mastered', deletedAt: null },
      ],
      sports: [{ id: 's', deletedAt: null }],
      activities: [{ sportId: 's', deletedAt: null }, { sportId: 's', deletedAt: del }, { sportId: 'outro', deletedAt: null }],
    });
    expect(out).toEqual([
      { module: 'habits', value: 2 },
      { module: 'focus', value: 75 },
      { module: 'goals', value: 1 },
      { module: 'music', value: 1 },
      { module: 'sports', value: 1 },
    ]);
  });

  it('módulo só com registros na Lixeira não aparece', () => {
    expect(moduleEvolution({ ...empty, sports: [{ id: 's', deletedAt: del }], activities: [{ sportId: 's', deletedAt: null }] })).toEqual([]);
  });
});
