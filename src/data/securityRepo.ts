import { getDb } from './db';
import { getBackupDb } from './backupRepo';
import { nowIso } from '@/domain/ids';
import { isValidPin, migrateSecurity, secondsBlocked, waitAfterFailures, type LockAfter, type PinHash, type SecurityConfig } from '@/domain/security';

const KEY = 'security';
const ITERATIONS = 150_000;

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** PBKDF2 com sal aleatório: o PIN nunca é guardado, e cada palpite custa caro (Parte 26.3). */
async function derive(pin: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations }, key, 256);
  return hex(new Uint8Array(bits));
}

export async function loadSecurity(): Promise<SecurityConfig> {
  return migrateSecurity((await getDb().kv.get(KEY))?.value);
}

async function saveSecurity(cfg: SecurityConfig): Promise<void> {
  await getDb().kv.put({ key: KEY, value: cfg, updatedAt: nowIso() });
}

export async function hasAppPin(): Promise<boolean> {
  return (await loadSecurity()).pin !== null;
}

export class PinError extends Error {
  constructor(public code: 'invalid' | 'wrong') {
    super(code);
  }
}

/** Define ou troca o PIN. Para trocar, o PIN atual tem que estar certo. */
export async function setAppPin(pin: string, current?: string): Promise<void> {
  if (!isValidPin(pin)) throw new PinError('invalid');
  const cfg = await loadSecurity();
  if (cfg.pin && !(current !== undefined && (await matches(cfg.pin, current)))) throw new PinError('wrong');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const next: PinHash = { salt, hash: await derive(pin, salt, ITERATIONS), iterations: ITERATIONS };
  await saveSecurity({ ...cfg, pin: next, failed: 0, blockedUntil: null });
}

export async function removeAppPin(current: string): Promise<void> {
  const cfg = await loadSecurity();
  if (cfg.pin && !(await matches(cfg.pin, current))) throw new PinError('wrong');
  await saveSecurity({ ...cfg, pin: null, failed: 0, blockedUntil: null });
}

export async function setLockAfter(lockAfterMin: LockAfter): Promise<void> {
  await saveSecurity({ ...(await loadSecurity()), lockAfterMin });
}

async function matches(pin: PinHash, attempt: string): Promise<boolean> {
  return (await derive(attempt, pin.salt, pin.iterations)) === pin.hash;
}

export type UnlockResult = { ok: true } | { ok: false; waitSec: number };

/** Confere o PIN na tela de bloqueio. Erros seguidos fazem esperar cada vez mais. */
export async function tryUnlock(attempt: string, now = new Date()): Promise<UnlockResult> {
  const cfg = await loadSecurity();
  if (!cfg.pin) return { ok: true };
  const blocked = secondsBlocked(cfg, now);
  if (blocked > 0) return { ok: false, waitSec: blocked };
  if (await matches(cfg.pin, attempt)) {
    if (cfg.failed || cfg.blockedUntil) await saveSecurity({ ...cfg, failed: 0, blockedUntil: null });
    return { ok: true };
  }
  const failed = cfg.failed + 1;
  const wait = waitAfterFailures(failed);
  await saveSecurity({ ...cfg, failed, blockedUntil: wait ? new Date(now.getTime() + wait * 1000).toISOString() : null });
  return { ok: false, waitSec: wait };
}

/**
 * Apaga todos os dados do ROUTIG deste aparelho (Parte 26): o banco, as cópias
 * internas de backup e as preferências de tela. Não tem volta. Os arquivos de
 * backup exportados para Arquivos não são tocados.
 */
export async function eraseAllData(): Promise<void> {
  await getDb().delete();
  await getBackupDb().delete();
  for (const store of [localStorage, sessionStorage]) {
    try {
      Object.keys(store)
        .filter((k) => k.startsWith('routig.'))
        .forEach((k) => store.removeItem(k));
    } catch {
      /* armazenamento indisponível: nada a apagar */
    }
  }
}
