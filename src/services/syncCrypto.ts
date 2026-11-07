/**
 * Criptografia do que sai do aparelho (V2, decisão D2): AES-256-GCM com Web Crypto.
 * A chave dos dados é sorteada no primeiro aparelho e nunca vai aberta para o Drive: lá fica
 * só "embrulhada" por uma chave derivada do código de recuperação (PBKDF2, 310 mil voltas).
 * O Google transporta e identifica; não tem como abrir os dados (decisão D1).
 */
import { formatRecoveryCode } from '@/domain/sync';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const toB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function newDataKey(subtle: SubtleCrypto = crypto.subtle): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportKey(k: CryptoKey, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  return toB64(new Uint8Array(await subtle.exportKey('raw', k)));
}
export function importKey(raw: string, subtle: SubtleCrypto = crypto.subtle): Promise<CryptoKey> {
  return subtle.importKey('raw', fromB64(raw), 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export async function encryptText(text: string, key: CryptoKey, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  return JSON.stringify({ v: 1, iv: toB64(iv), data: toB64(data) });
}

export async function decryptText(payload: string, key: CryptoKey, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const p = JSON.parse(payload) as { iv: string; data: string };
  const out = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(p.iv) }, key, fromB64(p.data));
  return dec.decode(out);
}

export function newRecoveryCode(): string {
  return formatRecoveryCode(crypto.getRandomValues(new Uint8Array(24)));
}

async function wrapKeyFrom(code: string, salt: Uint8Array, subtle: SubtleCrypto): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Embrulha a chave dos dados com o código de recuperação (para guardar no Drive). */
export async function wrapDataKey(key: CryptoKey, code: string, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wk = await wrapKeyFrom(code, salt, subtle);
  const raw = await exportKey(key, subtle);
  const box = await encryptText(raw, wk, subtle);
  return JSON.stringify({ v: 1, salt: toB64(salt), box });
}

/** Desembrulha com o código; erro se o código estiver errado. */
export async function unwrapDataKey(wrapped: string, code: string, subtle: SubtleCrypto = crypto.subtle): Promise<CryptoKey> {
  const w = JSON.parse(wrapped) as { salt: string; box: string };
  const wk = await wrapKeyFrom(code, fromB64(w.salt), subtle);
  const raw = await decryptText(w.box, wk, subtle);
  return importKey(raw, subtle);
}
