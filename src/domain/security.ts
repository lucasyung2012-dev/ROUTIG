/**
 * Bloqueio do app (Parte 26.2). É uma trava de tela: impede que alguém abra o
 * ROUTIG no seu aparelho, mas não criptografa os dados guardados (Parte 26.3).
 */

/** Depois de quantos minutos fora do app ele pede o PIN de novo (0 = sempre que sair). */
export const LOCK_AFTER = [0, 1, 5, 15, 60] as const;
export type LockAfter = (typeof LOCK_AFTER)[number];

export interface PinHash {
  salt: string;
  hash: string;
  iterations: number;
}

export interface SecurityConfig {
  /** Só o resultado do hash com sal; o PIN nunca é guardado. */
  pin: PinHash | null;
  lockAfterMin: LockAfter;
  /** Tentativas erradas seguidas. */
  failed: number;
  /** Até quando esperar antes da próxima tentativa (ISO). */
  blockedUntil: string | null;
}

export const DEFAULT_SECURITY: SecurityConfig = { pin: null, lockAfterMin: 5, failed: 0, blockedUntil: null };

export function migrateSecurity(raw: unknown): SecurityConfig {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const p = r.pin && typeof r.pin === 'object' ? (r.pin as Record<string, unknown>) : null;
  const pin = p && typeof p.salt === 'string' && typeof p.hash === 'string' && typeof p.iterations === 'number' ? { salt: p.salt, hash: p.hash, iterations: p.iterations } : null;
  const after = (LOCK_AFTER as readonly number[]).includes(r.lockAfterMin as number) ? (r.lockAfterMin as LockAfter) : DEFAULT_SECURITY.lockAfterMin;
  const failed = typeof r.failed === 'number' && r.failed >= 0 ? Math.floor(r.failed) : 0;
  const blockedUntil = typeof r.blockedUntil === 'string' && !Number.isNaN(Date.parse(r.blockedUntil)) ? r.blockedUntil : null;
  return { pin, lockAfterMin: after, failed, blockedUntil };
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

/** As 4 primeiras tentativas erradas são livres; depois a espera dobra (30 s, 1 min, 2 min...), até 15 min. */
export function waitAfterFailures(failed: number): number {
  if (failed < 5) return 0;
  return Math.min(30 * 2 ** (failed - 5), 15 * 60);
}

/** Segundos que ainda faltam para poder tentar de novo. */
export function secondsBlocked(cfg: Pick<SecurityConfig, 'blockedUntil'>, now: Date): number {
  if (!cfg.blockedUntil) return 0;
  return Math.max(0, Math.ceil((Date.parse(cfg.blockedUntil) - now.getTime()) / 1000));
}

/** Ao voltar para o app: pede o PIN de novo se ficou fora pelo tempo escolhido. */
export function shouldRelock(hiddenAt: number | null, now: number, lockAfterMin: LockAfter): boolean {
  if (hiddenAt === null) return false;
  return now - hiddenAt >= lockAfterMin * 60_000;
}
