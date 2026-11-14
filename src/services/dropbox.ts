/**
 * Dropbox no navegador, sem servidor: login OAuth com PKCE e "acesso offline", que devolve um
 * token de renovação de longa duração. Assim a sincronização automática continua no iPhone e no
 * iPad sem pedir para entrar de novo (o login do Google expira em ~1 hora e a renovação
 * silenciosa costuma ser bloqueada pelo Safari).
 *
 * O app é registrado pelo dono no Dropbox com acesso "App folder": só enxerga a pasta
 * Aplicativos/ROUTIG, nunca o resto do Dropbox (passo a passo em docs/DROPBOX.md).
 * A chave do app (app key) não é segredo: no PKCE não existe chave secreta.
 */

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';
const PENDING = 'routig.dbx.pending';
const RETURNED = 'routig.dbx.returned';

export type DropboxLoginMode = 'redirect' | 'code';

interface Pending {
  verifier: string;
  state: string;
  mode: DropboxLoginMode;
  redirectUri: string;
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function randomString(n: number): string {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

async function challengeOf(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
}

/** Endereço para onde o Dropbox devolve depois do login (precisa estar cadastrado no app do Dropbox). */
export function dropboxRedirectUri(): string {
  return `${location.origin}${location.pathname}`;
}

function readPending(): Pending | null {
  try {
    return JSON.parse(localStorage.getItem(PENDING) ?? 'null') as Pending | null;
  } catch {
    return null;
  }
}

/**
 * Abre o login do Dropbox. "redirect" sai do app e volta sozinho com o código; "code" abre o
 * Dropbox em outra aba, que mostra um código para colar no app (para quando a volta falhar).
 */
export async function startDropboxLogin(appKey: string, mode: DropboxLoginMode): Promise<void> {
  const verifier = randomString(48);
  const state = randomString(16);
  const redirectUri = mode === 'redirect' ? dropboxRedirectUri() : '';
  const p: Pending = { verifier, state, mode, redirectUri };
  localStorage.setItem(PENDING, JSON.stringify(p));
  const q = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: await challengeOf(verifier),
    code_challenge_method: 'S256',
    token_access_type: 'offline',
  });
  if (mode === 'redirect') {
    q.set('redirect_uri', redirectUri);
    q.set('state', state);
    location.assign(`${AUTH_URL}?${q}`);
  } else {
    window.open(`${AUTH_URL}?${q}`, '_blank', 'noopener');
  }
}

/**
 * Chamado ao abrir o app, antes do roteador: se a página voltou do Dropbox com `?code=…`, guarda o
 * código para a tela de sincronização terminar o login, limpa o endereço e abre essa tela.
 */
export function captureDropboxReturn(): void {
  try {
    const q = new URLSearchParams(location.search);
    const code = q.get('code');
    const state = q.get('state');
    const error = q.get('error');
    if (!code && !error) return;
    const p = readPending();
    if (!p || p.mode !== 'redirect' || state !== p.state) return;
    sessionStorage.setItem(RETURNED, JSON.stringify(code ? { code } : { error }));
    history.replaceState(null, '', `${location.pathname}#/settings/account`);
  } catch {
    /* sem armazenamento: o login só não termina sozinho */
  }
}

/** Código devolvido pelo Dropbox na volta do login (lido uma vez). */
export function takeDropboxReturn(): { code?: string; error?: string } | null {
  try {
    const v = sessionStorage.getItem(RETURNED);
    if (!v) return null;
    sessionStorage.removeItem(RETURNED);
    return JSON.parse(v) as { code?: string; error?: string };
  } catch {
    return null;
  }
}

let access: { value: string; until: number; refresh: string } | null = null;

interface TokenReply {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
}

async function tokenCall(body: URLSearchParams): Promise<TokenReply> {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = (await r.json().catch(() => ({}))) as TokenReply;
  if (!r.ok || !j.access_token) throw new Error(j.error === 'invalid_grant' ? 'dbx-expired' : `dbx-token ${r.status}`);
  return j;
}

/** Troca o código do login pelo token de renovação (guardado neste aparelho). */
export async function finishDropboxLogin(appKey: string, code: string): Promise<string> {
  const p = readPending();
  if (!p) throw new Error('dbx-state');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: code.trim(), code_verifier: p.verifier, client_id: appKey });
  if (p.redirectUri) body.set('redirect_uri', p.redirectUri);
  const j = await tokenCall(body);
  localStorage.removeItem(PENDING);
  if (!j.refresh_token) throw new Error('dbx-token');
  access = { value: j.access_token!, until: Date.now() + (j.expires_in ?? 14400) * 1000, refresh: j.refresh_token };
  return j.refresh_token;
}

/** Token de acesso válido, renovado em silêncio com o token de renovação (sem janela). */
export async function dropboxAccess(appKey: string, refresh: string): Promise<string> {
  if (access && access.refresh === refresh && Date.now() < access.until - 60_000) return access.value;
  const j = await tokenCall(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: appKey }));
  access = { value: j.access_token!, until: Date.now() + (j.expires_in ?? 14400) * 1000, refresh };
  return j.access_token!;
}

async function api<T>(token: string, path: string, args: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`dbx ${path} ${r.status}`);
  return (await r.json()) as T;
}

export async function dropboxWhoAmI(token: string): Promise<{ email: string; name: string }> {
  const j = await api<{ email?: string; name?: { display_name?: string } }>(token, '/users/get_current_account', null);
  return { email: j.email ?? '', name: j.name?.display_name ?? '' };
}

export interface DropboxFile {
  name: string;
  /** Versão do arquivo no Dropbox (muda a cada gravação). */
  ver: string;
}

/** Arquivos da pasta do app (Aplicativos/ROUTIG). */
export async function dropboxList(token: string): Promise<DropboxFile[]> {
  type Page = { entries: Array<{ '.tag': string; name: string; rev?: string }>; cursor: string; has_more: boolean };
  const files = (p: Page) => p.entries.filter((e) => e['.tag'] === 'file').map((e) => ({ name: e.name, ver: e.rev ?? '' }));
  let page = await api<Page>(token, '/files/list_folder', { path: '', limit: 2000 });
  const out = files(page);
  while (page.has_more) {
    page = await api<Page>(token, '/files/list_folder/continue', { cursor: page.cursor });
    out.push(...files(page));
  }
  return out;
}

export async function dropboxRead(token: string, name: string): Promise<string> {
  const r = await fetch(`${CONTENT}/files/download`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: `/${name}` }) } });
  if (!r.ok) throw new Error(`dbx read ${r.status}`);
  return r.text();
}

/** Cria ou substitui um arquivo de texto na pasta do app. */
export async function dropboxWrite(token: string, name: string, text: string): Promise<void> {
  const r = await fetch(`${CONTENT}/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: `/${name}`, mode: 'overwrite', mute: true }) },
    body: text,
  });
  if (!r.ok) throw new Error(`dbx write ${r.status}`);
}

/** Sai do Dropbox neste aparelho (invalida o token no Dropbox; os arquivos ficam). */
export async function dropboxSignOut(appKey: string, refresh: string): Promise<void> {
  try {
    const t = await dropboxAccess(appKey, refresh);
    await fetch(`${API}/auth/token/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
  } catch {
    /* sem internet ou já inválido: só esquece neste aparelho */
  }
  access = null;
}
