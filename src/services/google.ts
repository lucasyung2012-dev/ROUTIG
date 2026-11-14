/**
 * Conta Google no navegador, sem servidor (V2, decisões D10 e D11): Google Identity Services
 * dá um token de acesso de ~1 hora; o app usa só a pasta oculta do próprio app no Drive do
 * usuário (escopo `drive.appdata`): não enxerga nenhum outro arquivo do Drive.
 * O ID do cliente OAuth é criado pelo dono no Google Cloud (docs/GOOGLE-CLOUD.md).
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const SCOPES = 'https://www.googleapis.com/auth/drive.appdata openid email profile';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void;
}
interface GoogleNs {
  accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }) => TokenClient; revoke: (t: string, cb?: () => void) => void } };
}

let loading: Promise<GoogleNs> | null = null;
function loadGis(): Promise<GoogleNs> {
  const w = window as unknown as { google?: GoogleNs };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error('gis')));
    s.onerror = () => {
      loading = null;
      reject(new Error('gis'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

let token: { value: string; until: number } | null = null;

/**
 * Pede um token. `interactive` abre a janela do Google (precisa vir de um toque);
 * sem ele, tenta renovar em silêncio (funciona se a sessão do Google estiver ativa).
 */
export async function getToken(clientId: string, interactive: boolean): Promise<string> {
  if (token && Date.now() < token.until - 60_000) return token.value;
  const g = await loadGis();
  return new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error ?? 'token'));
        token = { value: r.access_token, until: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type)),
    });
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

export function signOutGoogle() {
  const g = (window as unknown as { google?: GoogleNs }).google;
  if (token && g) g.accounts.oauth2.revoke(token.value);
  token = null;
}

export async function whoAmI(access: string): Promise<{ email: string; name: string }> {
  const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Error(`userinfo ${r.status}`);
  const j = (await r.json()) as { email?: string; name?: string };
  return { email: j.email ?? '', name: j.name ?? '' };
}

/* ---------- Drive: pasta oculta do app ---------- */

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export async function listAppFiles(access: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let page = '';
  do {
    const q = new URLSearchParams({ spaces: 'appDataFolder', fields: 'nextPageToken, files(id, name, modifiedTime)', pageSize: '100' });
    if (page) q.set('pageToken', page);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?${q}`, { headers: { Authorization: `Bearer ${access}` } });
    if (!r.ok) throw new Error(`list ${r.status}`);
    const j = (await r.json()) as { files: DriveFile[]; nextPageToken?: string };
    out.push(...j.files);
    page = j.nextPageToken ?? '';
  } while (page);
  return out;
}

export async function readAppFile(access: string, id: string): Promise<string> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Error(`read ${r.status}`);
  return r.text();
}

/** Apaga um arquivo da pasta oculta do app. */
export async function deleteAppFile(access: string, id: string): Promise<void> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${access}` } });
  if (!r.ok && r.status !== 404) throw new Error(`delete ${r.status}`);
}

/** Cria ou atualiza um arquivo de texto na pasta oculta do app. */
export async function writeAppFile(access: string, name: string, text: string, existingId?: string): Promise<string> {
  const meta = existingId ? {} : { name, parents: ['appDataFolder'] };
  const boundary = `routig${Math.random().toString(36).slice(2)}`;
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
  const url = existingId ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const r = await fetch(url, { method: existingId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  if (!r.ok) throw new Error(`write ${r.status}`);
  return ((await r.json()) as { id: string }).id;
}
