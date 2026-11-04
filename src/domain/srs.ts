/**
 * Repetição espaçada adaptativa (Parte 9.9 e 10.7).
 *
 * Inspirada no SM-2: cada cartão tem uma "facilidade" (ease) que cai quando você
 * erra ou acha difícil e sobe quando acha fácil. O intervalo até a próxima revisão
 * cresce com a facilidade. Cartões esquecidos voltam logo e ganham prioridade.
 * O mesmo motor serve para a Academy (flashcards) e para Idiomas (vocabulário).
 */

import { addDays, type DateKey } from './dates';

export const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type Rating = (typeof RATINGS)[number];

export interface SrsState {
  /** Próxima revisão (dia). null = cartão novo, nunca revisado. */
  due: DateKey | null;
  /** Intervalo atual em dias. */
  interval: number;
  /** Facilidade: 1,3 (difícil) a 3,0 (fácil). Começa em 2,5. */
  ease: number;
  /** Revisões seguidas sem errar. */
  streak: number;
  reps: number;
  lapses: number;
  lastReview: string | null;
}

export const MIN_EASE = 1.3;
export const MAX_EASE = 3;
export const MAX_INTERVAL = 365;

export function newSrsState(): SrsState {
  return { due: null, interval: 0, ease: 2.5, streak: 0, reps: 0, lapses: 0, lastReview: null };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Próximo estado depois de uma resposta.
 * - again: errou → volta amanhã, facilidade −0,2, conta como lapso;
 * - hard: lembrou com esforço → intervalo cresce pouco (×1,2), facilidade −0,15;
 * - good: lembrou → 1 dia, depois 3, depois intervalo × facilidade;
 * - easy: fácil → 3 dias, depois 5, depois intervalo × facilidade × 1,3; facilidade +0,15.
 */
export function review(state: SrsState, rating: Rating, today: DateKey, at: string): SrsState {
  let { interval, ease, streak, lapses } = state;
  switch (rating) {
    case 'again':
      ease = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
      interval = 1;
      streak = 0;
      lapses += 1;
      break;
    case 'hard':
      ease = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
      interval = streak === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
      streak += 1;
      break;
    case 'good':
      interval = streak === 0 ? 1 : streak === 1 ? 3 : Math.max(interval + 1, Math.round(interval * ease));
      streak += 1;
      break;
    case 'easy':
      ease = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
      interval = streak === 0 ? 3 : streak === 1 ? 5 : Math.max(interval + 2, Math.round(interval * ease * 1.3));
      streak += 1;
      break;
  }
  interval = clamp(interval, 1, MAX_INTERVAL);
  return { due: addDays(today, interval), interval, ease: round2(ease), streak, reps: state.reps + 1, lapses, lastReview: at };
}

/** Prévia do intervalo de cada botão (para mostrar "1 d", "3 d"… antes de responder). */
export function previewIntervals(state: SrsState, today: DateKey): Record<Rating, number> {
  return Object.fromEntries(RATINGS.map((r) => [r, review(state, r, today, '').interval])) as Record<Rating, number>;
}

export function isDue(state: SrsState, today: DateKey): boolean {
  return state.due === null || state.due <= today;
}

/** Fase do cartão: novo, aprendendo, revisando ou maduro (intervalo de 21 dias ou mais). */
export type CardStage = 'new' | 'learning' | 'young' | 'mature';
export function cardStage(state: SrsState): CardStage {
  if (state.reps === 0) return 'new';
  if (state.streak < 2) return 'learning';
  return state.interval >= 21 ? 'mature' : 'young';
}

/**
 * Domínio estimado de 0 a 100, a partir da facilidade, do intervalo e dos lapsos.
 * É uma estimativa do próprio app, não uma nota.
 */
export function masteryScore(state: SrsState): number {
  if (state.reps === 0) return 0;
  const byInterval = Math.min(1, Math.log(1 + state.interval) / Math.log(1 + 60));
  const byEase = (state.ease - MIN_EASE) / (MAX_EASE - MIN_EASE);
  const penalty = Math.min(0.5, state.lapses * 0.08);
  return Math.round(clamp((byInterval * 0.7 + byEase * 0.3 - penalty) * 100, 0, 100));
}

/**
 * Ordem da sessão: primeiro os que estão atrasados há mais tempo, depois os
 * difíceis (menor facilidade, mais lapsos), e por último os novos (limitados).
 */
export function sessionQueue<T extends { srs: SrsState }>(cards: T[], today: DateKey, opts: { newLimit: number; reviewLimit: number }): T[] {
  const dueOld = cards.filter((c) => c.srs.due !== null && c.srs.due <= today);
  dueOld.sort((a, b) => a.srs.due!.localeCompare(b.srs.due!) || a.srs.ease - b.srs.ease || b.srs.lapses - a.srs.lapses);
  const fresh = cards.filter((c) => c.srs.due === null).slice(0, opts.newLimit);
  return [...dueOld.slice(0, opts.reviewLimit), ...fresh];
}
