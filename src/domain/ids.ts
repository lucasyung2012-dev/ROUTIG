/** Identificador único e ordenável no tempo: prefixo + carimbo + aleatório. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36).padStart(9, '0');
  return `${prefix}_${time}${randomPart(12)}`;
}

function randomPart(length: number): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const b of bytes) out += alphabet.charAt(b % alphabet.length);
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}
