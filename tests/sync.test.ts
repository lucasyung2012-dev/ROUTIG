import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { LOCAL_ONLY_KV, formatRecoveryCode, mergeRemote, normalizeRecoveryCode, syncable } from '@/domain/sync';
import { decryptText, encryptText, newDataKey, unwrapDataKey, wrapDataKey } from '@/services/syncCrypto';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
if (!globalThis.crypto?.getRandomValues) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('sincronização entre aparelhos: junção registro a registro', () => {
  const t = (id: string, rev: number, updatedAt: string, extra: Record<string, unknown> = {}) => ({ id, rev, updatedAt, title: `${id}-${rev}`, ...extra });

  it('fica a versão mais nova de cada registro; nada some', () => {
    const local = { tasks: [t('a', 2, '2026-11-07T10:00:00Z'), t('b', 1, '2026-11-07T09:00:00Z')] };
    const remote = { tasks: [t('a', 1, '2026-11-07T11:00:00Z'), t('b', 3, '2026-11-07T08:00:00Z'), t('c', 1, '2026-11-07T07:00:00Z')] };
    const r = mergeRemote(local, [remote]);
    expect(r.incoming.tasks?.map((x) => `${x.id}-${x.rev}`).sort()).toEqual(['b-3', 'c-1']);
    expect(r.changed).toBe(2);
  });

  it('empate de rev: vale o updatedAt mais recente; exclusões viajam como registros marcados', () => {
    const local = { notes: [t('n', 4, '2026-11-07T10:00:00Z')] };
    const remote = { notes: [t('n', 4, '2026-11-07T12:00:00Z', { deletedAt: '2026-11-07T12:00:00Z' })] };
    const r = mergeRemote(local, [remote]);
    expect(r.incoming.notes?.[0]?.deletedAt).toBe('2026-11-07T12:00:00Z');
  });

  it('não viajam: log local, arquivos binários e configurações do próprio aparelho', () => {
    const s = syncable({ changelog: [{ seq: 1 }], files: [{ id: 'f' }], kv: [{ key: 'settings', value: 1 }, { key: 'security', value: 2 }, { key: 'focus.active', value: 3 }] });
    expect(Object.keys(s)).toEqual(['kv']);
    expect(s.kv).toEqual([{ key: 'settings', value: 1 }]);
    expect(LOCAL_ONLY_KV.has('finance.pin')).toBe(true);
  });

  it('código de recuperação: 24 caracteres em grupos de 4, aceita digitado sem traços', () => {
    const c = formatRecoveryCode(new Uint8Array(Array.from({ length: 24 }, (_, i) => i * 11)));
    expect(c).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);
    expect(normalizeRecoveryCode(c.replace(/-/g, '').toLowerCase())).toBe(c);
    expect(normalizeRecoveryCode('curto')).toBe('');
  });
});

describe('sincronização: criptografia', () => {
  it('cifra e decifra; com o código certo a chave volta, com o errado não', async () => {
    const key = await newDataKey(subtle);
    const box = await encryptText('dados do ROUTIG', key, subtle);
    expect(box).not.toContain('ROUTIG');
    expect(await decryptText(box, key, subtle)).toBe('dados do ROUTIG');
    const wrapped = await wrapDataKey(key, 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF', subtle);
    const back = await unwrapDataKey(wrapped, 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF', subtle);
    expect(await decryptText(box, back, subtle)).toBe('dados do ROUTIG');
    await expect(unwrapDataKey(wrapped, 'ZZZZ-BBBB-CCCC-DDDD-EEEE-FFFF', subtle)).rejects.toThrow();
  }, 20000);
});
