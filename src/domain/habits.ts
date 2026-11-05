import { z } from 'zod';
import { addDays, diffDays, startOfMonth, startOfWeek, weekday, type DateKey } from './dates';
import type { BaseEntity } from './entity';

/* ---------- Hábitos (Parte 14) ---------- */

/** Como o hábito é acompanhado (Parte 14.2). */
export const HABIT_METHODS = ['check', 'quantity', 'duration', 'scale'] as const;
export type HabitMethod = (typeof HABIT_METHODS)[number];

/** Frequência (Parte 14.1): por dia (todos ou alguns dias da semana), semana, mês, ano ou a cada N dias. */
export const HABIT_PERIODS = ['day', 'week', 'month', 'year', 'interval'] as const;
export type HabitPeriod = (typeof HABIT_PERIODS)[number];

export interface HabitFrequency {
  period: HabitPeriod;
  /** Quantos dias cumpridos por período (semana, mês, ano). Em "dia" e "intervalo" é sempre 1. */
  times: number;
  /** Só em "dia": os dias da semana (0 = domingo). Vazio = todos os dias. */
  weekdays: number[];
  /** Só em "intervalo": a cada quantos dias. */
  intervalDays: number;
  /** Quantidade ou minutos que contam como cumprido. null = qualquer registro conta. */
  target: number | null;
}

/** Uma frequência vale a partir de uma data: mudar a frequência não reescreve o passado. */
export interface HabitSchedule extends HabitFrequency {
  from: DateKey;
}

/** Pausa: férias, doença, um período sem registro. `to` null = pausado até retomar. */
export interface HabitPause {
  from: DateKey;
  to: DateKey | null;
  label: string;
}

export interface Habit extends BaseEntity {
  name: string;
  description: string;
  color: string;
  category: string;
  method: HabitMethod;
  /** Unidade da quantidade (páginas, exercícios…). */
  unit: string;
  /** Maior nota da escala (a menor é 1). */
  scaleMax: number;
  /** Em ordem de data; a última é a frequência atual. */
  schedule: HabitSchedule[];
  startDate: DateKey;
  pauses: HabitPause[];
  archived: boolean;
  /** Mostrar no Calendar nos dias em que o hábito é esperado (lido daqui, sem cópia). */
  showInCalendar: boolean;
  time: string | null;
  notes: string;
  order: number;
}

/** Um registro por hábito e por dia. */
export interface HabitLog extends BaseEntity {
  habitId: string;
  date: DateKey;
  /** Conclusão: 1. Quantidade: o número. Duração: minutos. Escala: a nota. */
  value: number;
  note: string;
}

export type HabitInput = Pick<Habit, 'name' | 'description' | 'color' | 'category' | 'method' | 'unit' | 'scaleMax' | 'startDate' | 'showInCalendar' | 'time' | 'notes'> & {
  frequency: HabitFrequency;
};

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const habitFrequencySchema = z
  .object({
    period: z.enum(HABIT_PERIODS),
    times: z.number().int().min(1).max(366),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    intervalDays: z.number().int().min(2).max(365),
    target: z.number().positive().max(100_000).nullable(),
  })
  .refine((f) => (f.period === 'week' ? f.times <= 7 : f.period === 'month' ? f.times <= 31 : true), 'times_range');

export const habitInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  category: z.string().trim().max(60),
  method: z.enum(HABIT_METHODS),
  unit: z.string().trim().max(30),
  scaleMax: z.number().int().min(3).max(10),
  startDate: dateKey,
  showInCalendar: z.boolean(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  notes: z.string().max(20_000),
  frequency: habitFrequencySchema,
});

export function defaultFrequency(): HabitFrequency {
  return { period: 'day', times: 1, weekdays: [], intervalDays: 2, target: null };
}

export function emptyHabitInput(today: DateKey, over: Partial<HabitInput> = {}): HabitInput {
  return { name: '', description: '', color: '#7C5CFC', category: '', method: 'check', unit: '', scaleMax: 5, startDate: today, showInCalendar: false, time: null, notes: '', frequency: defaultFrequency(), ...over };
}

export function currentFrequency(h: Pick<Habit, 'schedule'>): HabitFrequency {
  const s = h.schedule[h.schedule.length - 1];
  if (!s) return defaultFrequency();
  const { period, times, weekdays, intervalDays, target } = s;
  return { period, times, weekdays, intervalDays, target };
}

export function habitInputOf(h: Habit): HabitInput {
  const { name, description, color, category, method, unit, scaleMax, startDate, showInCalendar, time, notes } = h;
  return { name, description, color, category, method, unit, scaleMax, startDate, showInCalendar, time, notes, frequency: currentFrequency(h) };
}

/** Normaliza a frequência: campos que não valem para o período voltam ao padrão. */
export function normalizeFrequency(f: HabitFrequency, method: HabitMethod): HabitFrequency {
  const single = f.period === 'day' || f.period === 'interval';
  return {
    period: f.period,
    times: single ? 1 : f.times,
    weekdays: f.period === 'day' ? [...new Set(f.weekdays)].sort((a, b) => a - b) : [],
    intervalDays: f.period === 'interval' ? f.intervalDays : 2,
    target: method === 'quantity' || method === 'duration' ? f.target : null,
  };
}

export function sameFrequency(a: HabitFrequency, b: HabitFrequency): boolean {
  return a.period === b.period && a.times === b.times && a.intervalDays === b.intervalDays && a.target === b.target && a.weekdays.join(',') === b.weekdays.join(',');
}

/** Texto curto da frequência para o histórico (ex.: "week/3", "day/1,3,5"). */
export function frequencyNote(f: HabitFrequency): string {
  const base = f.period === 'day' ? `day/${f.weekdays.join(',') || '*'}` : f.period === 'interval' ? `interval/${f.intervalDays}` : `${f.period}/${f.times}`;
  return f.target === null ? base : `${base}>=${f.target}`;
}

/* ---------- Regras de calendário ---------- */

/** A frequência que valia num dia. */
export function scheduleAt(h: Pick<Habit, 'schedule'>, date: DateKey): HabitSchedule | undefined {
  let found = h.schedule[0];
  for (const s of h.schedule) if (s.from <= date) found = s;
  return found;
}

export function isPausedOn(h: Pick<Habit, 'pauses'>, date: DateKey): boolean {
  return h.pauses.some((p) => p.from <= date && (p.to === null || date <= p.to));
}

export function openPause(h: Pick<Habit, 'pauses'>): HabitPause | undefined {
  return h.pauses.find((p) => p.to === null);
}

/** Em "dia" e "intervalo" o hábito é esperado em dias certos; nos outros, qualquer dia do período serve. */
export function isExpectedDay(s: HabitSchedule, date: DateKey): boolean {
  if (s.period === 'day') return s.weekdays.length === 0 || s.weekdays.includes(weekday(date));
  if (s.period === 'interval') return diffDays(date, s.from) >= 0 && diffDays(date, s.from) % s.intervalDays === 0;
  return true;
}

/** O registro conta como cumprido? Escala e conclusão: qualquer registro. Quantidade e duração: alcançar a meta, se houver. */
export function logMeets(method: HabitMethod, s: HabitFrequency | undefined, value: number): boolean {
  if (value <= 0) return false;
  if ((method === 'quantity' || method === 'duration') && s?.target) return value >= s.target;
  return true;
}

export function periodBounds(s: Pick<HabitSchedule, 'period'>, date: DateKey, weekStartsOn: 0 | 1): { start: DateKey; end: DateKey } {
  switch (s.period) {
    case 'week': {
      const start = startOfWeek(date, weekStartsOn);
      return { start, end: addDays(start, 6) };
    }
    case 'month': {
      const start = startOfMonth(date);
      const next = `${start.slice(0, 5)}${String(Number(start.slice(5, 7)) + 1).padStart(2, '0')}-01`;
      const end = start.slice(5, 7) === '12' ? `${start.slice(0, 4)}-12-31` : addDays(next, -1);
      return { start, end };
    }
    case 'year':
      return { start: `${date.slice(0, 4)}-01-01`, end: `${date.slice(0, 4)}-12-31` };
    default:
      return { start: date, end: date };
  }
}

export type DayState = 'met' | 'partial' | 'empty' | 'off' | 'paused' | 'future' | 'before';

/** Como pintar um dia: cumprido, parcial, sem registro, fora da frequência, pausado, futuro ou antes do início. */
export function dayState(h: Pick<Habit, 'schedule' | 'pauses' | 'startDate' | 'method'>, log: Pick<HabitLog, 'value'> | undefined, date: DateKey, today: DateKey): DayState {
  if (date < h.startDate) return 'before';
  const s = scheduleAt(h, date);
  if (log && log.value > 0) return logMeets(h.method, s, log.value) ? 'met' : 'partial';
  if (date > today) return 'future';
  if (isPausedOn(h, date)) return 'paused';
  if (s && !isExpectedDay(s, date)) return 'off';
  return 'empty';
}

export interface HabitPeriodResult {
  start: DateKey;
  end: DateKey;
  expected: number;
  achieved: number;
  met: boolean;
  /** Período com pausa: não conta contra, mas conta a favor se cumprido. */
  paused: boolean;
  /** O período de hoje (ainda em aberto). */
  current: boolean;
}

/**
 * Os períodos do hábito entre `from` e `to` (até hoje), com o que era esperado e o que foi cumprido.
 * Cada período usa a frequência que valia no começo dele.
 */
export function habitPeriods(
  h: Pick<Habit, 'schedule' | 'pauses' | 'startDate' | 'method'>,
  logs: ReadonlyMap<DateKey, Pick<HabitLog, 'value'>>,
  from: DateKey,
  to: DateKey,
  today: DateKey,
  weekStartsOn: 0 | 1,
): HabitPeriodResult[] {
  const out: HabitPeriodResult[] = [];
  const last = to < today ? to : today;
  let d = from < h.startDate ? h.startDate : from;
  for (let guard = 0; d <= last && guard < 4000; guard++) {
    const s = scheduleAt(h, d);
    if (!s) break;
    if (s.period === 'day' || s.period === 'interval') {
      if (isExpectedDay(s, d)) {
        const log = logs.get(d);
        const met = !!log && logMeets(h.method, s, log.value);
        out.push({ start: d, end: d, expected: 1, achieved: met ? 1 : 0, met, paused: isPausedOn(h, d), current: d === today });
      }
      d = addDays(d, 1);
      continue;
    }
    const { start, end } = periodBounds(s, d, weekStartsOn);
    let achieved = 0;
    let paused = false;
    for (let x = start; x <= end; x = addDays(x, 1)) {
      if (x < h.startDate) continue;
      if (isPausedOn(h, x) && x <= today) paused = true;
      const log = logs.get(x);
      if (log && logMeets(h.method, s, log.value)) achieved++;
    }
    out.push({ start, end, expected: s.times, achieved, met: achieved >= s.times, paused, current: start <= today && today <= end });
    d = addDays(end, 1);
  }
  return out;
}

/**
 * Consistência sem pressão (Parte 14.5): quantos períodos foram cumpridos entre os que contam.
 * Pausas não contam contra, e o período em aberto só entra se já foi cumprido.
 */
export function consistency(periods: HabitPeriodResult[]): { met: number; total: number } {
  const counted = periods.filter((p) => p.met || (!p.paused && !p.current));
  return { met: counted.filter((p) => p.met).length, total: counted.length };
}

/** O que falta hoje: hábitos esperados hoje (ou com o período ainda em aberto) e o progresso do período. */
export function todayStatus(
  h: Habit,
  logs: ReadonlyMap<DateKey, Pick<HabitLog, 'value'>>,
  today: DateKey,
  weekStartsOn: 0 | 1,
): { due: boolean; achieved: number; expected: number; loggedToday: boolean } {
  const s = scheduleAt(h, today);
  const loggedToday = (logs.get(today)?.value ?? 0) > 0;
  if (!s || h.archived || today < h.startDate || isPausedOn(h, today)) return { due: false, achieved: 0, expected: 0, loggedToday };
  const period = habitPeriods(h, logs, periodBounds(s, today, weekStartsOn).start, today, today, weekStartsOn).find((p) => p.current);
  if (!period) return { due: false, achieved: 0, expected: 0, loggedToday };
  return { due: !period.met || loggedToday, achieved: period.achieved, expected: period.expected, loggedToday };
}

/* ---------- Gráficos ---------- */

export interface HabitBucket {
  start: DateKey;
  end: DateKey;
  /** Conclusão: dias cumpridos. Quantidade e duração: soma. Escala: média (null sem registro). */
  value: number | null;
  count: number;
}

/** Agrupa os registros em semanas ou meses para os gráficos. */
export function habitBuckets(method: HabitMethod, logs: Array<Pick<HabitLog, 'date' | 'value'>>, unit: 'week' | 'month', count: number, today: DateKey, weekStartsOn: 0 | 1): HabitBucket[] {
  const buckets: HabitBucket[] = [];
  let cur = periodBounds({ period: unit }, today, weekStartsOn);
  for (let i = 0; i < count; i++) {
    buckets.unshift({ start: cur.start, end: cur.end, value: null, count: 0 });
    cur = periodBounds({ period: unit }, addDays(cur.start, -1), weekStartsOn);
  }
  for (const b of buckets) {
    const inside = logs.filter((l) => l.date >= b.start && l.date <= b.end && l.value > 0);
    b.count = inside.length;
    if (!inside.length) {
      b.value = method === 'scale' ? null : 0;
      continue;
    }
    const sum = inside.reduce((a, l) => a + l.value, 0);
    b.value = method === 'check' ? inside.length : method === 'scale' ? Math.round((sum / inside.length) * 10) / 10 : sum;
  }
  return buckets;
}

/** Valor do registro validado pelo método (conclusão vira 1; escala precisa ser inteira dentro da escala). */
export function normalizeLogValue(method: HabitMethod, scaleMax: number, value: number): number | null {
  if (!Number.isFinite(value)) return null;
  switch (method) {
    case 'check':
      return 1;
    case 'scale':
      return Number.isInteger(value) && value >= 1 && value <= scaleMax ? value : null;
    default:
      return value > 0 && value <= 100_000 ? Math.round(value * 100) / 100 : null;
  }
}
