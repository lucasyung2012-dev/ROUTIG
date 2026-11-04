import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createAssessment, createSubject, createYear, gradeHistory, periodInUse, purgeSubject, setPeriodResult, updateAssessment } from '@/data/academyRepo';
import { defaultGradingModel, emptyAssessmentInput, modelProblems, periodGrade, yearGrade, type GradingModel } from '@/domain/academy';

beforeEach(() => setDbForTests(new RoutigDB(`test-academy-${Math.random().toString(36).slice(2)}`)));

const model = defaultGradingModel();
const [pp, pu, po, ac] = model.components.map((c) => c.id) as [string, string, string, string];
const a = (componentId: string, score: number | null, maxScore = 10, name = componentId) => ({ name, componentId, maxScore, score, weight: 1 });

/** Notas que somam `total`: PP, PU, PO e AC com o mesmo aproveitamento. */
const allAt = (ratio: number) => [a(pp, ratio * 10), a(pu, ratio * 10), a(po, ratio * 10), a(ac, ratio * 10)];

describe('modelo inicial (Parte 9.6): PP 2 + PU 4 + PO 2 + AC 2', () => {
  it('soma as partes pelo aproveitamento de cada avaliação', () => {
    const g = periodGrade(model, [a(pp, 7.5), a(pu, 8), a(po, 5), a(ac, 10)]);
    // 1,5 + 3,2 + 1,0 + 2,0 = 7,7
    expect(g).toMatchObject({ status: 'ok', value: 7.7, original: 7.7, passing: true });
  });

  it('duas avaliações na mesma parte: média do aproveitamento', () => {
    const g = periodGrade(model, [a(pp, 6), a(pp, 10), a(pu, 10), a(po, 10), a(ac, 10)]);
    expect(g.status === 'ok' && g.value).toBe(9.6); // PP = 0,8 × 2 = 1,6
  });

  it('não inventa: sem nota de alguma parte, fica pendente e diz qual falta', () => {
    expect(periodGrade(model, [a(pp, 8), a(pu, 8)])).toMatchObject({ status: 'pending', reason: 'missingComponents', missing: ['PO', 'AC'] });
    expect(periodGrade(model, [a(pp, null)])).toMatchObject({ status: 'pending', reason: 'noScores' });
  });

  it('modelo que não soma a nota máxima fica pendente de configuração', () => {
    const broken: GradingModel = { ...model, components: model.components.slice(0, 3) };
    expect(modelProblems(broken)).toEqual(['componentsDontAddUp']);
    expect(periodGrade(broken, allAt(1))).toMatchObject({ status: 'pending', reason: 'model' });
  });
});

describe('recuperação: a maior entre a original e a recuperação limitada a 6,0', () => {
  it('eleva até 6,0, nunca acima', () => {
    expect(periodGrade(model, allAt(0.45), { recoveryScore: 8, bonus: null })).toMatchObject({ status: 'ok', original: 4.5, value: 6 });
    expect(periodGrade(model, allAt(0.45), { recoveryScore: 5.2, bonus: null })).toMatchObject({ value: 5.2 });
  });

  it('recuperação menor que a original não derruba a nota', () => {
    expect(periodGrade(model, allAt(0.55), { recoveryScore: 4, bonus: null })).toMatchObject({ value: 5.5 });
  });
});

describe('bônus: até 0,5, só para média acima de 6,0, nota final no máximo 10', () => {
  it('soma o bônus a quem está acima da média', () => {
    expect(periodGrade(model, allAt(0.7), { recoveryScore: null, bonus: 0.5 })).toMatchObject({ value: 7.5 });
  });

  it('bônus maior que 0,5 é limitado', () => {
    const g = periodGrade(model, allAt(0.7), { recoveryScore: null, bonus: 0.8 });
    expect(g).toMatchObject({ value: 7.5 });
    expect(g.steps.some((s) => s.kind === 'bonusCapped')).toBe(true);
  });

  it('média exatamente 6,0 (não acima) não recebe bônus', () => {
    const g = periodGrade(model, allAt(0.6), { recoveryScore: null, bonus: 0.5 });
    expect(g).toMatchObject({ value: 6 });
    expect(g.steps.some((s) => s.kind === 'bonusNotEligible')).toBe(true);
  });

  it('nota final nunca passa de 10', () => {
    expect(periodGrade(model, allAt(0.98), { recoveryScore: null, bonus: 0.5 })).toMatchObject({ value: 10 });
  });

  it('quem foi para a recuperação não ganha bônus (a original não está acima de 6,0)', () => {
    expect(periodGrade(model, allAt(0.4), { recoveryScore: 9, bonus: 0.5 })).toMatchObject({ value: 6 });
  });
});

describe('outros sistemas de cálculo', () => {
  it('média ponderada usa os pesos', () => {
    const weighted: GradingModel = { ...model, method: 'weighted' };
    const g = periodGrade(weighted, [
      { name: 'P1', componentId: null, maxScore: 10, score: 8, weight: 2 },
      { name: 'T1', componentId: null, maxScore: 5, score: 2.5, weight: 1 },
    ]);
    expect(g).toMatchObject({ status: 'ok', value: 7 }); // (8×2 + 5×1) / 3
  });

  it('nota do ano: média dos períodos; pendente se algum período estiver pendente', () => {
    const p1 = periodGrade(model, allAt(0.8));
    const p2 = periodGrade(model, allAt(0.5));
    expect(yearGrade(model, [p1, p2])).toEqual({ status: 'ok', value: 6.5, passing: true });
    expect(yearGrade(model, [p1, periodGrade(model, [])])).toEqual({ status: 'pending' });
    expect(yearGrade({ ...model, yearAggregation: 'none' }, [p1])).toEqual({ status: 'pending' });
  });
});

describe('registros da Academy', () => {
  it('não duplica ano, disciplina nem avaliação', async () => {
    const y = await createYear({ label: '2026', institution: 'Escola', grade: '9º ano' });
    expect(y.current).toBe(true);
    await expect(createYear({ label: '2026', institution: 'escola', grade: '' })).rejects.toMatchObject({ code: 'duplicate' });
    const s = await createSubject({ yearId: y.id, name: 'Matemática', kind: 'subject', color: '#438BEA', teacherId: null });
    await expect(createSubject({ yearId: y.id, name: 'matemática', kind: 'subject', color: '#438BEA', teacherId: null })).rejects.toMatchObject({ code: 'duplicate' });
    const input = { ...emptyAssessmentInput(s.id, y.periods[0]!.id), name: 'PU', date: '2026-11-10' };
    await createAssessment(input);
    await expect(createAssessment(input)).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('nota acima da máxima é recusada', async () => {
    const y = await createYear({ label: '2026', institution: '', grade: '' });
    const s = await createSubject({ yearId: y.id, name: 'História', kind: 'subject', color: '#438BEA', teacherId: null });
    await expect(createAssessment({ ...emptyAssessmentInput(s.id, null), name: 'P1', score: 11, maxScore: 10 })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('guarda nota, recuperação e bônus no histórico', async () => {
    const y = await createYear({ label: '2026', institution: '', grade: '' });
    const s = await createSubject({ yearId: y.id, name: 'Inglês', kind: 'subject', color: '#438BEA', teacherId: null });
    const asm = await createAssessment({ ...emptyAssessmentInput(s.id, y.periods[0]!.id), name: 'PP' });
    await updateAssessment(asm.id, { ...asm, score: 7 });
    await setPeriodResult(s.id, y.periods[0]!.id, { recoveryScore: 6 });
    const h = await gradeHistory(s.id);
    expect(h.map((e) => e.note).filter(Boolean)).toEqual(['rec:6 bonus:—', 'score:7']);
  });

  it('período com avaliação não pode ser removido; excluir disciplina de vez leva as avaliações junto', async () => {
    const y = await createYear({ label: '2026', institution: '', grade: '' });
    const s = await createSubject({ yearId: y.id, name: 'Geografia', kind: 'subject', color: '#438BEA', teacherId: null });
    await createAssessment({ ...emptyAssessmentInput(s.id, y.periods[1]!.id), name: 'Trabalho' });
    expect(await periodInUse(y.periods[1]!.id)).toBe(true);
    expect(await periodInUse(y.periods[2]!.id)).toBe(false);
    expect(await purgeSubject(s.id)).toBe(1);
    expect(await getDb().assessments.count()).toBe(0);
  });
});

describe('Academy parte 2: conteúdo programático, aulas e dúvidas', () => {
  const setup = async () => {
    const y = await createYear({ label: '2026', institution: '', grade: '' });
    const s = await createSubject({ yearId: y.id, name: 'Matemática', kind: 'subject', color: '#438BEA', teacherId: null });
    return { y, s };
  };

  it('monta a árvore em ordem e não deixa um item virar filho de si mesmo', async () => {
    const { createContent, reparentContent } = await import('@/data/academyContentRepo');
    const { contentTree, flattenTree } = await import('@/domain/academy');
    const { s } = await setup();
    const u1 = await createContent(s.id, null, 'unit', 'Unidade 1');
    const c1 = await createContent(s.id, u1.id, 'chapter', 'Frações');
    await createContent(s.id, null, 'unit', 'Unidade 2');
    const all = await getDb().contents.toArray();
    expect(flattenTree(contentTree(all)).map((n) => [n.content.title, n.depth])).toEqual([
      ['Unidade 1', 0],
      ['Frações', 1],
      ['Unidade 2', 0],
    ]);
    await expect(reparentContent(u1.id, c1.id)).rejects.toMatchObject({ code: 'invalid' });
    await expect(createContent(s.id, u1.id, 'chapter', 'frações')).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('domínio é separado do andamento; Lixeira leva os filhos junto e Desfazer devolve', async () => {
    const { createContent, softDeleteContent, restoreContents, updateContent } = await import('@/data/academyContentRepo');
    const { contentProgress } = await import('@/domain/academy');
    const { s } = await setup();
    const u = await createContent(s.id, null, 'unit', 'Unidade 1');
    const c = await createContent(s.id, u.id, 'chapter', 'Frações');
    await updateContent(c.id, { status: 'studied' });
    let list = await getDb().contents.toArray();
    expect(contentProgress(list, 5)).toMatchObject({ total: 2, studied: 1, mastered: 0, rated: 0 });
    await updateContent(c.id, { mastery: 4 });
    list = await getDb().contents.toArray();
    expect(contentProgress(list, 5)).toMatchObject({ mastered: 1, rated: 1 });
    const ids = await softDeleteContent(u.id);
    expect(ids.sort()).toEqual([u.id, c.id].sort());
    expect((await getDb().contents.toArray()).every((x) => x.deletedAt)).toBe(true);
    await restoreContents(ids);
    expect((await getDb().contents.toArray()).every((x) => !x.deletedAt)).toBe(true);
  });

  it('aula precisa de data válida; dúvida não duplica e guarda quando foi resolvida', async () => {
    const { saveLesson, createDoubt, updateDoubt } = await import('@/data/academyContentRepo');
    const { s } = await setup();
    const base = { subjectId: s.id, teacherId: null, contentIds: [], topic: 'Frações', notes: '', difficulties: '', activities: '', observations: '', noteIds: [] };
    await expect(saveLesson(null, { ...base, date: 'ontem' })).rejects.toMatchObject({ code: 'invalid' });
    const l = await saveLesson(null, { ...base, date: '2026-11-03' });
    expect((await saveLesson(l.id, { ...base, date: '2026-11-03', difficulties: 'MMC' })).difficulties).toBe('MMC');
    const d = await createDoubt(s.id, 'Como achar o MMC?');
    await expect(createDoubt(s.id, 'como achar o mmc?')).rejects.toMatchObject({ code: 'duplicate' });
    await updateDoubt(d.id, { status: 'resolved', answer: 'Fatorando.' });
    expect(await getDb().doubts.get(d.id)).toMatchObject({ status: 'resolved', answer: 'Fatorando.' });
    expect((await getDb().doubts.get(d.id))?.resolvedAt).not.toBeNull();
  });

  it('atividade é tarefa e trabalho é projeto, ligados à disciplina sem cópia', async () => {
    const { createTask, updateTask } = await import('@/data/tasksRepo');
    const { createProject, updateProject, projectInputOf } = await import('@/data/projectsRepo');
    const { emptyTaskInput } = await import('@/domain/tasks');
    const { emptyProjectInput } = await import('@/domain/projects');
    const { s } = await setup();
    const task = await createTask(emptyTaskInput({ title: 'Exercícios p. 42', subjectId: s.id, originModule: 'academy' }));
    expect(task.subjectId).toBe(s.id);
    const after = await updateTask(task.id, { title: 'Exercícios p. 42 e 43' });
    expect(after.task.subjectId).toBe(s.id);
    const p = await createProject(emptyProjectInput({ name: 'Maquete', subjectId: s.id, criteria: [' Criatividade ', ''] }));
    expect(p).toMatchObject({ subjectId: s.id, criteria: ['Criatividade'] });
    const p2 = await updateProject(p.id, { ...projectInputOf(p), instructions: 'Em dupla' });
    expect(p2).toMatchObject({ subjectId: s.id, instructions: 'Em dupla' });
  });
});

describe('planejamento de estudos (Parte 9.8)', () => {
  it('revisões 14, 7, 3 e 1 dia antes; só as que ainda dão tempo', async () => {
    const { reviewDatesBefore } = await import('@/domain/academy');
    expect(reviewDatesBefore('2026-11-30', '2026-11-03')).toEqual(['2026-11-16', '2026-11-23', '2026-11-27', '2026-11-29']);
    expect(reviewDatesBefore('2026-11-08', '2026-11-03')).toEqual(['2026-11-05', '2026-11-07']);
    expect(reviewDatesBefore('2026-11-03', '2026-11-03')).toEqual(['2026-11-03']); // prova hoje: revisa hoje
    expect(reviewDatesBefore('2026-11-01', '2026-11-03')).toEqual([]); // prova já passou
  });

  it('cria sem duplicar, acompanha a execução e soma os minutos', async () => {
    const { createSession, createSessions, setSessionStatus } = await import('@/data/studyPlanRepo');
    const { sessionTotals } = await import('@/domain/academy');
    const y = await createYear({ label: '2026', institution: '', grade: '' });
    const s = await createSubject({ yearId: y.id, name: 'Física', kind: 'subject', color: '#438BEA', teacherId: null });
    const input = { subjectId: s.id, contentIds: [], assessmentId: null, kind: 'review' as const, date: '2026-11-05', time: null, durationMin: 40, priority: 'high' as const, notes: '' };
    const a = await createSession(input);
    await expect(createSession(input)).rejects.toMatchObject({ code: 'duplicate' });
    expect(await createSessions([input, { ...input, date: '2026-11-06' }])).toBe(1); // a repetida é pulada
    await setSessionStatus(a.id, 'done', { actualMin: 55, difficulties: 'Vetores' });
    const all = await getDb().studySessions.toArray();
    expect(sessionTotals(all)).toMatchObject({ planned: 80, done: 55, completed: 1, sessions: 2 });
    await expect(setSessionStatus(a.id, 'done', { actualMin: -3 })).rejects.toMatchObject({ code: 'invalid' });
  });
});
