import { z } from 'zod';
import type { DateKey } from './dates';
import type { BaseEntity, EntityRef } from './entity';

/* ---------- Focus (Parte 13) ---------- */

/** Tipos de sessão (Parte 13.3). */
export const FOCUS_KINDS = ['study', 'reading', 'project', 'work', 'music', 'languages', 'free'] as const;
export type FocusKind = (typeof FOCUS_KINDS)[number];

/** Pomodoro, duração escolhida ou contínua (sem fim marcado) (Parte 13.2). */
export const FOCUS_MODES = ['pomodoro', 'custom', 'continuous'] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];

/** Modo minimalista e ambientes imersivos (Parte 13.1). */
export const FOCUS_ENVIRONMENTS = ['minimal', 'library', 'office', 'nature', 'study'] as const;
export type FocusEnvironment = (typeof FOCUS_ENVIRONMENTS)[number];

/** Sons gerados no próprio aparelho, sem serviço pago nem internet (Parte 13.5). */
export const FOCUS_SOUNDS = ['none', 'white', 'pink', 'brown', 'rain', 'waves'] as const;
export type FocusSound = (typeof FOCUS_SOUNDS)[number];

export const ENVIRONMENT_SOUND: Record<FocusEnvironment, FocusSound> = { minimal: 'none', library: 'brown', office: 'pink', nature: 'rain', study: 'waves' };

export type FocusPhase = 'focus' | 'shortBreak' | 'longBreak';

export interface FocusConfig {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  /** Pausa longa a cada N focos. */
  cyclesBeforeLong: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  volume: number;
}

export const DEFAULT_FOCUS_CONFIG: FocusConfig = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4, autoStartBreaks: true, autoStartFocus: false, volume: 0.4 };

export const focusConfigSchema = z.object({
  focusMin: z.number().int().min(1).max(240),
  shortBreakMin: z.number().int().min(1).max(60),
  longBreakMin: z.number().int().min(1).max(120),
  cyclesBeforeLong: z.number().int().min(2).max(12),
  autoStartBreaks: z.boolean(),
  autoStartFocus: z.boolean(),
  volume: z.number().min(0).max(1),
});

export function migrateFocusConfig(raw: unknown): FocusConfig {
  const parsed = focusConfigSchema.safeParse({ ...DEFAULT_FOCUS_CONFIG, ...(raw && typeof raw === 'object' ? raw : {}) });
  return parsed.success ? parsed.data : { ...DEFAULT_FOCUS_CONFIG };
}

/** O timer em andamento. Guardado no aparelho, sobrevive a trocar de tela ou recarregar. */
export interface FocusTimer {
  mode: FocusMode;
  kind: FocusKind;
  taskId: string | null;
  ref: EntityRef | null;
  environment: FocusEnvironment;
  sound: FocusSound;
  /** Duração planejada da sessão em minutos (null na contínua). */
  plannedMin: number | null;
  phase: FocusPhase;
  /** Focos completos nesta sessão. */
  cycles: number;
  /** Duração da fase atual em ms (null na contínua). */
  phaseMs: number | null;
  /** Quando a fase voltou a correr (epoch ms); null = pausado. */
  runningSince: number | null;
  /** Tempo já corrido na fase antes de `runningSince`. */
  phaseElapsedMs: number;
  /** Foco e pausa de fases já terminadas. */
  doneFocusMs: number;
  doneBreakMs: number;
  /** A fase acabou e espera o usuário começar a próxima. */
  waiting: boolean;
  startedAt: string;
  date: DateKey;
}

export function startTimer(opts: Pick<FocusTimer, 'mode' | 'kind' | 'taskId' | 'ref' | 'environment' | 'sound'> & { customMin?: number }, cfg: FocusConfig, now: number, date: DateKey): FocusTimer {
  const plannedMin = opts.mode === 'pomodoro' ? cfg.focusMin : opts.mode === 'custom' ? Math.max(1, Math.round(opts.customMin ?? cfg.focusMin)) : null;
  return {
    ...opts,
    plannedMin,
    phase: 'focus',
    cycles: 0,
    phaseMs: plannedMin === null ? null : plannedMin * 60_000,
    runningSince: now,
    phaseElapsedMs: 0,
    doneFocusMs: 0,
    doneBreakMs: 0,
    waiting: false,
    startedAt: new Date(now).toISOString(),
    date,
  };
}

export function phaseElapsed(t: FocusTimer, now: number): number {
  return t.phaseElapsedMs + (t.runningSince === null ? 0 : Math.max(0, now - t.runningSince));
}

/** Quanto falta na fase (ms). Na contínua, null. */
export function phaseRemaining(t: FocusTimer, now: number): number | null {
  return t.phaseMs === null ? null : Math.max(0, t.phaseMs - phaseElapsed(t, now));
}

export function isPhaseOver(t: FocusTimer, now: number): boolean {
  return !t.waiting && t.phaseMs !== null && phaseElapsed(t, now) >= t.phaseMs;
}

export function pauseTimer(t: FocusTimer, now: number): FocusTimer {
  if (t.runningSince === null) return t;
  return { ...t, phaseElapsedMs: phaseElapsed(t, now), runningSince: null };
}

export function resumeTimer(t: FocusTimer, now: number): FocusTimer {
  if (t.runningSince !== null) return t;
  return { ...t, runningSince: now };
}

/** Tempo de foco real até agora: fases terminadas + a fase de foco atual. */
export function totalFocusMs(t: FocusTimer, now: number): number {
  return t.doneFocusMs + (t.phase === 'focus' && !t.waiting ? Math.min(phaseElapsed(t, now), t.phaseMs ?? Infinity) : 0);
}

export function totalBreakMs(t: FocusTimer, now: number): number {
  return t.doneBreakMs + (t.phase !== 'focus' && !t.waiting ? Math.min(phaseElapsed(t, now), t.phaseMs ?? Infinity) : 0);
}

/**
 * Fecha a fase atual e prepara a próxima. Pomodoro: foco → pausa curta (ou longa a cada N) → foco.
 * Tempo definido: o foco termina e a sessão acaba (`finished`). Contínua: só termina pelo usuário.
 * `skip` encerra a fase antes do fim (conta só o tempo corrido).
 */
export function nextPhase(t: FocusTimer, cfg: FocusConfig, now: number, skip = false): { timer: FocusTimer; finished: boolean } {
  const ran = Math.min(phaseElapsed(t, now), t.phaseMs ?? Infinity);
  const wasFocus = t.phase === 'focus';
  const base: FocusTimer = {
    ...t,
    doneFocusMs: t.doneFocusMs + (wasFocus && !t.waiting ? ran : 0),
    doneBreakMs: t.doneBreakMs + (!wasFocus && !t.waiting ? ran : 0),
    cycles: wasFocus && !t.waiting && !skip ? t.cycles + 1 : t.cycles,
    phaseElapsedMs: 0,
  };
  if (t.mode !== 'pomodoro') return { timer: { ...base, runningSince: null, waiting: true }, finished: true };
  if (wasFocus) {
    const long = base.cycles > 0 && base.cycles % cfg.cyclesBeforeLong === 0;
    const phase: FocusPhase = long ? 'longBreak' : 'shortBreak';
    const min = long ? cfg.longBreakMin : cfg.shortBreakMin;
    return { timer: { ...base, phase, phaseMs: min * 60_000, runningSince: cfg.autoStartBreaks ? now : null, waiting: !cfg.autoStartBreaks }, finished: false };
  }
  return { timer: { ...base, phase: 'focus', phaseMs: cfg.focusMin * 60_000, runningSince: cfg.autoStartFocus ? now : null, waiting: !cfg.autoStartFocus }, finished: false };
}

/** Começa a fase que estava esperando. */
export function startWaitingPhase(t: FocusTimer, now: number): FocusTimer {
  return t.waiting ? { ...t, waiting: false, runningSince: now, phaseElapsedMs: 0 } : t;
}

/* ---------- Sessões registradas (Parte 13.4) ---------- */

export interface FocusSession extends BaseEntity {
  date: DateKey;
  startedAt: string;
  endedAt: string;
  kind: FocusKind;
  mode: FocusMode;
  plannedMin: number | null;
  /** Minutos de foco de verdade (sem as pausas). */
  actualMin: number;
  breakMin: number;
  cycles: number;
  /** Terminou como planejado ou foi encerrada antes. */
  completed: boolean;
  /** A tarefa original (Parte 13.6): ligação, nunca cópia. */
  taskId: string | null;
  /** Módulo relacionado: disciplina, idioma, projeto, hábito ou objetivo. */
  ref: EntityRef | null;
  environment: FocusEnvironment;
  notes: string;
  /** Registrada à mão, sem o timer. */
  manual: boolean;
}

export type FocusSessionInput = Pick<FocusSession, 'date' | 'startedAt' | 'endedAt' | 'kind' | 'mode' | 'plannedMin' | 'actualMin' | 'breakMin' | 'cycles' | 'completed' | 'taskId' | 'ref' | 'environment' | 'notes' | 'manual'>;

export const focusSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1),
  kind: z.enum(FOCUS_KINDS),
  mode: z.enum(FOCUS_MODES),
  plannedMin: z.number().int().min(1).max(1440).nullable(),
  actualMin: z.number().int().min(0).max(1440),
  breakMin: z.number().int().min(0).max(1440),
  cycles: z.number().int().min(0).max(200),
  completed: z.boolean(),
  taskId: z.string().nullable(),
  ref: z.object({ type: z.string().min(1), id: z.string().min(1) }).nullable(),
  environment: z.enum(FOCUS_ENVIRONMENTS),
  notes: z.string().max(4000),
  manual: z.boolean(),
});

/** Transforma o timer numa sessão para salvar. Planejado alcançado = concluída. */
export function sessionFromTimer(t: FocusTimer, now: number, notes: string): FocusSessionInput {
  const focus = totalFocusMs(t, now);
  const actualMin = Math.round(focus / 60_000);
  const completed = t.mode === 'continuous' ? true : t.mode === 'pomodoro' ? t.cycles >= 1 : t.plannedMin !== null && focus >= t.plannedMin * 60_000 - 1000;
  return {
    date: t.date,
    startedAt: t.startedAt,
    endedAt: new Date(now).toISOString(),
    kind: t.kind,
    mode: t.mode,
    plannedMin: t.mode === 'pomodoro' ? (t.plannedMin ?? 0) * Math.max(1, t.cycles) : t.plannedMin,
    actualMin,
    breakMin: Math.round(totalBreakMs(t, now) / 60_000),
    cycles: t.cycles,
    completed,
    taskId: t.taskId,
    ref: t.ref,
    environment: t.environment,
    notes,
    manual: false,
  };
}

/** Minutos por tipo num conjunto de sessões. */
export function minutesByKind(sessions: Array<Pick<FocusSession, 'kind' | 'actualMin'>>): Record<FocusKind, number> {
  const out = Object.fromEntries(FOCUS_KINDS.map((k) => [k, 0])) as Record<FocusKind, number>;
  for (const s of sessions) out[s.kind] += s.actualMin;
  return out;
}

/** "25:00", "1:05:09". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
