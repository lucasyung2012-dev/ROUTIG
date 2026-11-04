import { z } from 'zod';
import type { BaseEntity } from './entity';
import type { DateKey } from './dates';
import { newId } from './ids';

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
  /** Conteúdo cobrado (texto; a ligação com o conteúdo programático vem na parte 2). */
  topics: string;
  noteIds: string[];
}

export type AssessmentInput = Pick<Assessment, 'subjectId' | 'periodId' | 'componentId' | 'name' | 'type' | 'date' | 'time' | 'maxScore' | 'score' | 'weight' | 'notes' | 'topics' | 'noteIds'>;

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
