import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { captureDropboxReturn, dropboxAccess, finishDropboxLogin, takeDropboxReturn } from '@/services/dropbox';
import { loadSyncState, syncReady } from '@/data/syncRepo';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const pending = (state: string, redirectUri = 'http://localhost:3000/') =>
  localStorage.setItem('routig.dbx.pending', JSON.stringify({ verifier: 'verif-123', state, mode: 'redirect', redirectUri }));

describe('sincronização: provedor e prontidão', () => {
  beforeEach(() => localStorage.clear());

  it('aparelho novo começa no Dropbox; quem já tinha ligado pelo Google continua no Google', () => {
    expect(loadSyncState().provider).toBe('dropbox');
    localStorage.setItem('routig.sync', JSON.stringify({ clientId: 'x.apps.googleusercontent.com', key: 'k', email: 'a@b' }));
    expect(loadSyncState().provider).toBe('google');
  });

  it('só sincroniza sozinho com a chave dos dados e o acesso do provedor', () => {
    const base = loadSyncState();
    expect(syncReady({ ...base, provider: 'dropbox', dbxKey: 'app', dbxRefresh: '', key: 'k' })).toBe(false);
    expect(syncReady({ ...base, provider: 'dropbox', dbxKey: 'app', dbxRefresh: 'r', key: '' })).toBe(false);
    expect(syncReady({ ...base, provider: 'dropbox', dbxKey: 'app', dbxRefresh: 'r', key: 'k' })).toBe(true);
    expect(syncReady({ ...base, provider: 'google', clientId: 'c', key: 'k' })).toBe(true);
  });
});

describe('Dropbox: volta do login', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => history.replaceState(null, '', '/'));

  it('guarda o código, limpa o endereço e abre Conta e sincronização', () => {
    pending('st-1');
    history.replaceState(null, '', '/?code=CODE-9&state=st-1');
    captureDropboxReturn();
    expect(location.search).toBe('');
    expect(location.hash).toBe('#/settings/account');
    expect(takeDropboxReturn()).toEqual({ code: 'CODE-9' });
    expect(takeDropboxReturn()).toBeNull();
  });

  it('ignora a volta com outro "state" (não foi este app que pediu)', () => {
    pending('st-1');
    history.replaceState(null, '', '/?code=CODE-9&state=outro');
    captureDropboxReturn();
    expect(takeDropboxReturn()).toBeNull();
    expect(location.search).toContain('code=CODE-9');
  });
});

describe('Dropbox: tokens', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('troca o código pelo token de renovação (PKCE, com o endereço de volta) e renova sem janela', async () => {
    pending('st-2', 'https://exemplo.test/app/');
    const calls: URLSearchParams[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
        calls.push(new URLSearchParams(init.body));
        return new Response(JSON.stringify({ access_token: `acc-${calls.length}`, expires_in: 14400, refresh_token: 'refresh-1' }), { status: 200 });
      }),
    );
    const refresh = await finishDropboxLogin('appkey', 'CODE-1');
    expect(refresh).toBe('refresh-1');
    expect(calls[0]?.get('grant_type')).toBe('authorization_code');
    expect(calls[0]?.get('code_verifier')).toBe('verif-123');
    expect(calls[0]?.get('redirect_uri')).toBe('https://exemplo.test/app/');
    expect(localStorage.getItem('routig.dbx.pending')).toBeNull();
    // Token ainda válido: não chama de novo.
    expect(await dropboxAccess('appkey', 'refresh-1')).toBe('acc-1');
    expect(calls).toHaveLength(1);
    // Outro token de renovação: renova pelo refresh_token.
    expect(await dropboxAccess('appkey', 'refresh-2')).toBe('acc-2');
    expect(calls[1]?.get('grant_type')).toBe('refresh_token');
    expect(calls[1]?.get('refresh_token')).toBe('refresh-2');
  });

  it('acesso desfeito no Dropbox vira um erro claro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })));
    await expect(dropboxAccess('appkey', 'revogado')).rejects.toThrow('dbx-expired');
  });
});
