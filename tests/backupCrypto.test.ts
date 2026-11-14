import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  BACKUP_KDF_ITERATIONS,
  checkBackupPassword,
  decryptBackupText,
  encryptBackupText,
  ENCRYPTED_BACKUP_FORMAT,
  isEncryptedBackup,
  parseBackup,
  serializeBackup,
} from '@/domain/backup';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
if (!globalThis.crypto?.getRandomValues) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const meta = { appVersion: '0.9.0', schemaVersion: 7, createdAt: '2026-11-13T12:00:00.000Z' };
const tables = { tasks: [{ id: 't1', title: 'Pagar o aluguel' }], finAssets: [{ id: 'a1', name: 'Reserva', amount: 1234.5 }] };

describe('backup exportado protegido por senha', () => {
  it('cifra e abre de volta com a senha certa; o backup aberto passa no checksum', async () => {
    const { text } = await serializeBackup(tables, meta);
    const box = await encryptBackupText(text, 'senha forte ção', { subtle });
    expect(box).not.toContain('Pagar o aluguel');
    expect(box).not.toContain('Reserva');
    const env = JSON.parse(box) as { format: string; v: number; kdf: { name: string; hash: string; iterations: number }; cipher: string; salt: string; iv: string };
    expect(env.format).toBe(ENCRYPTED_BACKUP_FORMAT);
    expect(env.v).toBe(1);
    expect(env.kdf).toEqual({ name: 'PBKDF2', hash: 'SHA-256', iterations: BACKUP_KDF_ITERATIONS });
    expect(env.cipher).toBe('AES-GCM');
    const r = await decryptBackupText(box, 'senha forte ção', subtle);
    expect(r).toEqual({ ok: true, text });
    const parsed = await parseBackup(r.ok ? r.text : '', ['tasks', 'finAssets'], 7);
    expect(parsed.ok && parsed.backup.tables).toEqual(tables);
  }, 30000);

  it('senha errada é recusada e nada é devolvido', async () => {
    const box = await encryptBackupText('{"format":"routig-backup"}', 'senha-correta', { subtle });
    expect(await decryptBackupText(box, 'senha-errada', subtle)).toEqual({ ok: false, problem: 'wrong_password' });
    expect(await decryptBackupText(box, '', subtle)).toEqual({ ok: false, problem: 'wrong_password' });
  }, 30000);

  it('sal e iv são sorteados: a mesma senha gera arquivos diferentes', async () => {
    const a = JSON.parse(await encryptBackupText('x', 'mesma-senha', { subtle })) as { salt: string; iv: string; data: string };
    const b = JSON.parse(await encryptBackupText('x', 'mesma-senha', { subtle })) as { salt: string; iv: string; data: string };
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  }, 30000);

  it('arquivo protegido alterado não abre', async () => {
    const box = JSON.parse(await encryptBackupText('conteúdo', 'senha-correta', { subtle, iterations: 1000 })) as { data: string };
    const bytes = Uint8Array.from(atob(box.data), (c) => c.charCodeAt(0));
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    const tampered = JSON.stringify({ ...box, data: btoa(String.fromCharCode(...bytes)) });
    expect(await decryptBackupText(tampered, 'senha-correta', subtle)).toEqual({ ok: false, problem: 'wrong_password' });
  });

  it('envelope inválido ou de versão mais nova é recusado sem tentar abrir', async () => {
    const box = JSON.parse(await encryptBackupText('x', 'senha-correta', { subtle, iterations: 1000 })) as Record<string, unknown>;
    expect(await decryptBackupText('não é json', 'senha', subtle)).toEqual({ ok: false, problem: 'bad_envelope' });
    expect(await decryptBackupText(JSON.stringify({ ...box, v: 2 }), 'senha-correta', subtle)).toEqual({ ok: false, problem: 'newer_format' });
    expect(await decryptBackupText(JSON.stringify({ ...box, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1e12 } }), 'senha-correta', subtle)).toEqual({ ok: false, problem: 'bad_envelope' });
    expect(await decryptBackupText(JSON.stringify({ ...box, salt: undefined }), 'senha-correta', subtle)).toEqual({ ok: false, problem: 'bad_envelope' });
  });

  it('distingue backup protegido de backup aberto (os antigos continuam abrindo como antes)', async () => {
    const { text } = await serializeBackup(tables, meta);
    expect(isEncryptedBackup(text)).toBe(false);
    expect(isEncryptedBackup(await encryptBackupText(text, 'senha-correta', { subtle, iterations: 1000 }))).toBe(true);
    expect(isEncryptedBackup('{\n  "format": "routig-backup-encrypted",\n  "v": 1\n}')).toBe(true);
    expect(isEncryptedBackup('não é json')).toBe(false);
    expect((await parseBackup(text, ['tasks', 'finAssets'], 7)).ok).toBe(true);
  });

  it('senha nova: mínimo de 8 caracteres e confirmação igual', () => {
    expect(checkBackupPassword('curta', 'curta')).toBe('too_short');
    expect(checkBackupPassword('senha-longa', 'senha-outra')).toBe('mismatch');
    expect(checkBackupPassword('senha-longa', 'senha-longa')).toBeNull();
  });
});
