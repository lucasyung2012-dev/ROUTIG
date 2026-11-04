import { z } from 'zod';
import type { BaseEntity } from './entity';
import { addDays, type DateKey } from './dates';
import { newId } from './ids';
import type { Rating, SrsState } from './srs';

/* ---------- Modelo de avaliação (Parte 9.6) ---------- */

/** Parte da nota, como PP, PU, PO e AC. `max` é quanto ela vale no total. */
export interface GradeComponent {
  id: string;
  code: string;
  name: string;
  max: number;
}

/**
 * Como a nota do período é calculada:
 * - `sum`: soma das partes (cada parte vale até o seu máximo);
 * - `weighted`: média ponderada pelos pesos das avaliações;
 * - `average`: média simples das avaliações.
 */
export const GRADE_METHODS = ['sum', 'weighted', 'average'] as const;
export type GradeMethod = (typeof GRADE_METHODS)[number];

/** Como os períodos viram a nota do ano. `none`: o app não calcula (fica pendente). */
export const YEAR_AGGREGATIONS = ['average', 'sum', 'none'] as const;
export type YearAggregation = (typeof YEAR_AGGREGATIONS)[number];

export interface GradingModel {
  method: GradeMethod;
  /** Nota máxima do período (ex.: 10). */
  scale: number;
  /** Média mínima para aprovação (ex.: 6,0). */
  passing: number;
  components: GradeComponent[];
  recovery: {
    enabled: boolean;
    /** A recuperação eleva a nota até este limite (ex.: 6,0). */
    cap: number;
  };
  bonus: {
    enabled: boolean;
    /** Bônus máximo (ex.: 0,5). */
    max: number;
    /** Só quem tem média acima deste valor recebe bônus (ex.: 6,0). */
    above: number;
  };
  yearAggregation: YearAggregation;
}

/** Modelo inicial informado (Parte 9.6): PP 2 + PU 4 + PO 2 + AC 2 = 10; média 6,0; recuperação até 6,0; bônus até 0,5 acima de 6,0. */
export function defaultGradingModel(): GradingModel {
  return {
    method: 'sum',
    scale: 10,
    passing: 6,
    components: [
      { id: 'pp', code: 'PP', name: 'Prova parcial', max: 2 },
      { id: 'pu', code: 'PU', name: 'Prova da unidade', max: 4 },
      { id: 'po', code: 'PO', name: 'Prova objetiva', max: 2 },
      { id: 'ac', code: 'AC', name: 'Atividades complementares', max: 2 },
    ],
    recovery: { enabled: true, cap: 6 },
    bonus: { enabled: true, max: 0.5, above: 6 },
    yearAggregation: 'average',
  };
}

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

export const gradingModelSchema = z.object({
  method: z.enum(GRADE_METHODS),
  scale: num(1, 1000),
  passing: num(0, 1000),
  components: z.array(z.object({ id: z.string().min(1), code: z.string().trim().min(1).max(8), name: z.string().max(60), max: num(0, 1000) })).max(20),
  recovery: z.object({ enabled: z.boolean(), cap: num(0, 1000) }),
  bonus: z.object({ enabled: z.boolean(), max: num(0, 1000), above: num(0, 1000) }),
  yearAggregation: z.enum(YEAR_AGGREGATIONS),
});

/** Problemas que impedem calcular (o app mostra "pendente de configuração"). */
export function modelProblems(m: GradingModel): Array<'noComponents' | 'componentsDontAddUp' | 'passingAboveScale'> {
  const out: Array<'noComponents' | 'componentsDontAddUp' | 'passingAboveScale'> = [];
  if (m.method === 'sum') {
    if (m.components.length === 0) out.push('noComponents');
    else if (Math.abs(m.components.reduce((a, c) => a + c.max, 0) - m.scale) > 1e-9) out.push('componentsDontAddUp');
  }
  if (m.passing > m.scale) out.push('passingAboveScale');
  return out;
}

export function newComponent(code: string, max: number, name = ''): GradeComponent {
  return { id: newId('gc'), code: code.trim().toUpperCase().slice(0, 8), name, max };
}

/* ---------- Estrutura acadêmica (Parte 9.1 e 9.12) ---------- */

export interface AcademicPeriod {
  id: string;
  name: string;
  start: DateKey | null;
  end: DateKey | null;
}

/** Um ano letivo numa instituição. O app não fica preso a uma série: cada ano é um registro. */
export interface AcademicYear extends BaseEntity {
  label: string;
  institution: string;
  /** Série ou ano escolar (texto livre: "9º ano", "1ª série do EM"…). */
  grade: string;
  periods: AcademicPeriod[];
  model: GradingModel;
  /** Ano que o app abre por padrão. */
  current: boolean;
  /** Escala de domínio dos conteúdos (vazia = padrão). */
  masteryLevels?: string[];
}

/** Disciplina comum, itinerário formativo ou ênfase (Parte 9.12: estruturas configuráveis, não disciplinas comuns). */
export const SUBJECT_KINDS = ['subject', 'itinerary', 'emphasis'] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export interface Subject extends BaseEntity {
  yearId: string;
  name: string;
  kind: SubjectKind;
  color: string;
  teacherId: string | null;
  /** Modelo próprio da disciplina; null = usa o do ano (Parte 9.6: editável por ano e disciplina). */
  model: GradingModel | null;
  notes: string;
}

export interface Teacher extends BaseEntity {
  name: string;
  /** Contato institucional, só quando necessário (Parte 9.13). */
  contact: string;
  notes: string;
}

export const ASSESSMENT_TYPES = ['test', 'quiz', 'assignment', 'presentation', 'activity', 'other'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export interface Assessment extends BaseEntity {
  subjectId: string;
  periodId: string | null;
  /** Parte da nota (PP, PU…) no método "soma". */
  componentId: string | null;
  name: string;
  type: AssessmentType;
  date: DateKey | null;
  time: string | null;
  maxScore: number;
  score: number | null;
  weight: number;
  notes: string;
  /** Conteúdo cobrado, em texto livre. */
  topics: string;
  /** Conteúdo cobrado, ligado ao conteúdo programático. */
  contentIds?: string[];
  noteIds: string[];
}

export type AssessmentInput = Pick<Assessment, 'subjectId' | 'periodId' | 'componentId' | 'name' | 'type' | 'date' | 'time' | 'maxScore' | 'score' | 'weight' | 'notes' | 'topics' | 'contentIds' | 'noteIds'>;

export const assessmentInputSchema = z
  .object({
    subjectId: z.string().min(1),
    periodId: z.string().nullable(),
    componentId: z.string().nullable(),
    name: z.string().trim().min(1).max(120),
    type: z.enum(ASSESSMENT_TYPES),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    maxScore: num(0.01, 1000),
    score: num(0, 1000).nullable(),
    weight: num(0, 100),
    notes: z.string().max(4000),
    topics: z.string().max(4000),
    contentIds: z.array(z.string()).max(100).optional(),
    noteIds: z.array(z.string()).max(50),
  })
  .refine((a) => a.score === null || a.score <= a.maxScore, { path: ['score'] });

export function emptyAssessmentInput(subjectId: string, periodId: string | null): AssessmentInput {
  return { subjectId, periodId, componentId: null, name: '', type: 'test', date: null, time: null, maxScore: 10, score: null, weight: 1, notes: '', topics: '', noteIds: [] };
}

/** Recuperação e bônus de uma disciplina num período (id = `subjectId:periodId`). */
export interface PeriodResult {
  id: string;
  subjectId: string;
  periodId: string;
  recoveryScore: number | null;
  bonus: number | null;
  updatedAt: string;
}

/* ---------- Cálculo da nota (Parte 9.6) ---------- */

export type CalcStep =
  | { kind: 'component'; code: string; points: number; max: number; count: number }
  | { kind: 'componentMissing'; code: string }
  | { kind: 'assessment'; name: string; normalized: number; weight: number }
  | { kind: 'original'; value: number }
  | { kind: 'recovery'; score: number; cap: number; result: number }
  | { kind: 'recoveryNotNeeded'; score: number }
  | { kind: 'bonus'; bonus: number; result: number }
  | { kind: 'bonusNotEligible'; above: number }
  | { kind: 'bonusCapped'; requested: number; max: number };

export type GradeResult =
  | { status: 'ok'; value: number; original: number; passing: boolean; steps: CalcStep[] }
  | { status: 'pending'; reason: 'model' | 'noScores' | 'missingComponents'; missing: string[]; steps: CalcStep[] };

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Nota de uma disciplina num período. Nunca inventa: sem notas ou com o modelo
 * incompleto, o resultado é "pendente" e diz o que falta.
 */
export function periodGrade(model: GradingModel, assessments: Pick<Assessment, 'name' | 'componentId' | 'maxScore' | 'score' | 'weight'>[], extra: Pick<PeriodResult, 'recoveryScore' | 'bonus'> | null = null): GradeResult {
  if (modelProblems(model).length) return { status: 'pending', reason: 'model', missing: [], steps: [] };
  const scored = assessments.filter((a) => a.score !== null && a.maxScore > 0);
  const steps: CalcStep[] = [];
  let original: number;

  if (model.method === 'sum') {
    const missing: string[] = [];
    let total = 0;
    for (const c of model.components) {
      const mine = scored.filter((a) => a.componentId === c.id);
      if (mine.length === 0) {
        missing.push(c.code);
        steps.push({ kind: 'componentMissing', code: c.code });
        continue;
      }
      // Mais de uma avaliação na mesma parte: média (ponderada pelos pesos) do aproveitamento.
      const wsum = mine.reduce((a, x) => a + (x.weight || 0), 0);
      const ratio = wsum > 0 ? mine.reduce((a, x) => a + (x.score! / x.maxScore) * (x.weight || 0), 0) / wsum : mine.reduce((a, x) => a + x.score! / x.maxScore, 0) / mine.length;
      const points = round2(ratio * c.max);
      total += points;
      steps.push({ kind: 'component', code: c.code, points, max: c.max, count: mine.length });
    }
    if (missing.length) return { status: 'pending', reason: scored.length ? 'missingComponents' : 'noScores', missing, steps };
    original = round2(total);
  } else {
    if (scored.length === 0) return { status: 'pending', reason: 'noScores', missing: [], steps };
    const useWeight = model.method === 'weighted';
    const wsum = scored.reduce((a, x) => a + (useWeight ? x.weight : 1), 0);
    if (wsum <= 0) return { status: 'pending', reason: 'noScores', missing: [], steps };
    let acc = 0;
    for (const a of scored) {
      const normalized = round2((a.score! / a.maxScore) * model.scale);
      const w = useWeight ? a.weight : 1;
      acc += normalized * w;
      steps.push({ kind: 'assessment', name: a.name, normalized, weight: w });
    }
    original = round2(acc / wsum);
  }

  steps.push({ kind: 'original', value: original });
  let value = original;

  // Recuperação: a maior entre a original e a recuperação limitada ao teto (decisão de 2026-11-02).
  const rec = extra?.recoveryScore ?? null;
  if (model.recovery.enabled && rec !== null) {
    const capped = Math.min(rec, model.recovery.cap);
    if (capped > value) {
      value = round2(capped);
      steps.push({ kind: 'recovery', score: rec, cap: model.recovery.cap, result: value });
    } else steps.push({ kind: 'recoveryNotNeeded', score: rec });
  }

  // Bônus: só para média original acima do limite; final nunca passa da nota máxima.
  const bonus = extra?.bonus ?? null;
  if (model.bonus.enabled && bonus !== null && bonus > 0) {
    if (original > model.bonus.above) {
      const b = Math.min(bonus, model.bonus.max);
      if (b < bonus) steps.push({ kind: 'bonusCapped', requested: bonus, max: model.bonus.max });
      value = round2(Math.min(model.scale, value + b));
      steps.push({ kind: 'bonus', bonus: b, result: value });
    } else steps.push({ kind: 'bonusNotEligible', above: model.bonus.above });
  }

  return { status: 'ok', value, original, passing: value >= model.passing, steps };
}

/** Nota do ano a partir dos períodos. Se algum período estiver pendente, o ano também fica. */
export function yearGrade(model: GradingModel, periods: GradeResult[]): { status: 'ok'; value: number; passing: boolean } | { status: 'pending' } {
  if (model.yearAggregation === 'none' || periods.length === 0) return { status: 'pending' };
  const values: number[] = [];
  for (const p of periods) {
    if (p.status !== 'ok') return { status: 'pending' };
    values.push(p.value);
  }
  const value = round2(model.yearAggregation === 'sum' ? values.reduce((a, v) => a + v, 0) : values.reduce((a, v) => a + v, 0) / values.length);
  const passing = model.yearAggregation === 'sum' ? value >= model.passing * values.length : value >= model.passing;
  return { status: 'ok', value, passing };
}

export const periodResultId = (subjectId: string, periodId: string) => `${subjectId}:${periodId}`;

export function defaultPeriods(): AcademicPeriod[] {
  return [1, 2, 3].map((n) => ({ id: newId('per'), name: `${n}º trimestre`, start: null, end: null }));
}

/** Período em que uma data cai (pelas datas de início e fim, quando existem). */
export function periodForDate(periods: AcademicPeriod[], date: DateKey | null): string | null {
  if (!date) return null;
  return periods.find((p) => p.start && p.end && date >= p.start && date <= p.end)?.id ?? null;
}

/* ---------- Conteúdo programático (Parte 9.4) ---------- */

export const CONTENT_KINDS = ['unit', 'chapter', 'topic', 'subtopic', 'lesson'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** Andamento do estudo. É diferente do domínio: concluir uma aula não quer dizer dominar o conteúdo. */
export const CONTENT_STATUSES = ['notStarted', 'inProgress', 'studied', 'reviewed', 'mastered'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export interface Content extends BaseEntity {
  subjectId: string;
  parentId: string | null;
  kind: ContentKind;
  title: string;
  status: ContentStatus;
  /** Nível de domínio (índice na escala do ano letivo); null = ainda não avaliado. */
  mastery: number | null;
  notes: string;
  order: number;
}

/** Escala de domínio padrão; cada ano letivo pode ter a sua (Parte 9.4: domínio configurável). */
export const DEFAULT_MASTERY_LEVELS = ['Não sei ainda', 'Inseguro', 'Razoável', 'Bom', 'Domino'];

export function masteryLevelsOf(year: Pick<AcademicYear, 'masteryLevels'> | null): string[] {
  return year?.masteryLevels?.length ? year.masteryLevels : DEFAULT_MASTERY_LEVELS;
}

/** Filho natural de cada nível (ao criar um item "dentro" de outro). */
export function childKind(kind: ContentKind): ContentKind {
  const i = CONTENT_KINDS.indexOf(kind);
  return CONTENT_KINDS[Math.min(i + 1, CONTENT_KINDS.length - 1)]!;
}

export interface ContentNode {
  content: Content;
  depth: number;
  children: ContentNode[];
}

/** Monta a árvore (ordenada) a partir da lista plana. Itens com pai inexistente sobem para a raiz. */
export function contentTree(list: Content[]): ContentNode[] {
  const ids = new Set(list.map((c) => c.id));
  const byParent = new Map<string | null, Content[]>();
  for (const c of list) {
    const p = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    byParent.set(p, [...(byParent.get(p) ?? []), c]);
  }
  const build = (parent: string | null, depth: number, seen: Set<string>): ContentNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      .filter((c) => !seen.has(c.id))
      .map((c) => ({ content: c, depth, children: build(c.id, depth + 1, new Set([...seen, c.id])) }));
  return build(null, 0, new Set());
}

/** Lista na ordem da árvore (para mostrar com recuo). */
export function flattenTree(nodes: ContentNode[]): ContentNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

/** Resumo do andamento e do domínio de uma lista de conteúdos. */
export function contentProgress(list: Pick<Content, 'status' | 'mastery'>[], levels: number) {
  const total = list.length;
  const studied = list.filter((c) => c.status === 'studied' || c.status === 'reviewed' || c.status === 'mastered').length;
  const rated = list.filter((c) => c.mastery !== null);
  const top = levels - 1;
  const masteredByLevel = rated.filter((c) => c.mastery === top).length;
  return { total, studied, rated: rated.length, mastered: masteredByLevel, weak: rated.filter((c) => (c.mastery ?? 0) <= 1).length };
}

/* ---------- Registro de aulas (Parte 9.5) ---------- */

export interface Lesson extends BaseEntity {
  subjectId: string;
  date: DateKey;
  teacherId: string | null;
  contentIds: string[];
  /** O que foi estudado, quando não há item do conteúdo programático. */
  topic: string;
  notes: string;
  difficulties: string;
  activities: string;
  observations: string;
  noteIds: string[];
}

export type LessonInput = Pick<Lesson, 'subjectId' | 'date' | 'teacherId' | 'contentIds' | 'topic' | 'notes' | 'difficulties' | 'activities' | 'observations' | 'noteIds'>;

export const lessonInputSchema = z.object({
  subjectId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teacherId: z.string().nullable(),
  contentIds: z.array(z.string()).max(100),
  topic: z.string().max(300),
  notes: z.string().max(20_000),
  difficulties: z.string().max(4000),
  activities: z.string().max(4000),
  observations: z.string().max(4000),
  noteIds: z.array(z.string()).max(50),
});

/* ---------- Dúvidas (Parte 9.2 e 9.3) ---------- */

export interface Doubt extends BaseEntity {
  subjectId: string;
  contentId: string | null;
  question: string;
  answer: string;
  status: 'open' | 'resolved';
  resolvedAt: string | null;
}

/* ---------- Flashcards (Parte 9.9) ---------- */

export interface Deck extends BaseEntity {
  name: string;
  /** Disciplina da Academy (opcional: dá para ter baralhos livres). */
  subjectId: string | null;
  color: string;
  category: string;
  tags: string[];
}

export interface Card extends BaseEntity {
  deckId: string;
  front: string;
  back: string;
  category: string;
  tags: string[];
  /** Conteúdo programático ligado (opcional). */
  contentId: string | null;
  srs: SrsState;
}

/** Uma resposta numa revisão. `manual`: treino livre, que não muda o agendamento. */
export interface CardReview {
  id: string;
  cardId: string;
  at: string;
  rating: Rating;
  intervalBefore: number;
  intervalAfter: number;
  manual: boolean;
}

/* ---------- Planejamento de estudos (Parte 9.8) ---------- */

export const SESSION_STATUSES = ['planned', 'done', 'skipped'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface StudySession extends BaseEntity {
  subjectId: string;
  contentIds: string[];
  /** Prova a que a sessão se refere (para revisar antes dela). */
  assessmentId: string | null;
  kind: 'study' | 'review';
  date: DateKey;
  time: string | null;
  durationMin: number;
  priority: 'none' | 'low' | 'medium' | 'high' | 'urgent';
  status: SessionStatus;
  /** Tempo de fato estudado (ao concluir). */
  actualMin: number | null;
  difficulties: string;
  notes: string;
  completedAt: string | null;
}

export type StudySessionInput = Pick<StudySession, 'subjectId' | 'contentIds' | 'assessmentId' | 'kind' | 'date' | 'time' | 'durationMin' | 'priority' | 'notes'>;

export const studySessionInputSchema = z.object({
  subjectId: z.string().min(1),
  contentIds: z.array(z.string()).max(100),
  assessmentId: z.string().nullable(),
  kind: z.enum(['study', 'review']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  durationMin: z.number().int().min(5).max(600),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
  notes: z.string().max(4000),
});

/** Revisões antes da prova: 7, 3 e 1 dia antes (mais 14, se der tempo). Só datas a partir de hoje. */
export const REVIEW_OFFSETS = [14, 7, 3, 1] as const;

export function reviewDatesBefore(examDate: DateKey, today: DateKey, offsets: readonly number[] = REVIEW_OFFSETS): DateKey[] {
  const out: DateKey[] = [];
  for (const d of offsets) {
    const day = addDays(examDate, -d);
    if (day >= today && day < examDate && !out.includes(day)) out.push(day);
  }
  // Prova muito perto (amanhã ou hoje): pelo menos uma revisão hoje.
  if (out.length === 0 && examDate >= today) out.push(today);
  return out.sort();
}

/** Minutos planejados e feitos (para acompanhar a execução). */
export function sessionTotals(list: Pick<StudySession, 'status' | 'durationMin' | 'actualMin'>[]) {
  const planned = list.filter((s) => s.status !== 'skipped').reduce((a, s) => a + s.durationMin, 0);
  const done = list.filter((s) => s.status === 'done').reduce((a, s) => a + (s.actualMin ?? s.durationMin), 0);
  return { planned, done, sessions: list.length, completed: list.filter((s) => s.status === 'done').length, skipped: list.filter((s) => s.status === 'skipped').length };
}
