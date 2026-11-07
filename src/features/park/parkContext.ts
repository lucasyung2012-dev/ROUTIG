/**
 * Contexto do parque (V2.1, seção 4): ao abrir a interface 2D de um módulo, o parque guarda onde a
 * pessoa estava (posição, direção, modo de câmera e prédio); ao voltar, retoma dali.
 * Também guarda favoritos e recentes da Central de Módulos. Fica só neste aparelho.
 */
import type { ModuleId } from '@/app/modules';
import type { CamMode } from './camera';

export interface ParkSnapshot {
  cam: [number, number, number];
  target: [number, number, number];
  mode: CamMode;
  body: { x: number; z: number; yaw: number };
  inside: ModuleId | null;
}

const CTX_KEY = 'routig.park.context';
const FAV_KEY = 'routig.park.favorites';
const REC_KEY = 'routig.park.recents';
/** Depois de 6 h fora, o parque recomeça pela praça. */
const MAX_AGE = 6 * 3600 * 1000;

function get<T>(store: Storage | undefined, key: string): T | null {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function put(store: Storage | undefined, key: string, value: unknown) {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

export function saveParkContext(s: ParkSnapshot) {
  put(session(), CTX_KEY, { ...s, at: Date.now() });
}

/** O contexto guardado (se for recente). */
export function readParkContext(): ParkSnapshot | null {
  const v = get<ParkSnapshot & { at: number }>(session(), CTX_KEY);
  if (!v || Date.now() - v.at > MAX_AGE) return null;
  return v;
}

export function clearParkContext() {
  put(session(), CTX_KEY, null);
}

export function readFavorites(): ModuleId[] {
  return get<ModuleId[]>(local(), FAV_KEY) ?? [];
}
export function writeFavorites(ids: ModuleId[]) {
  put(local(), FAV_KEY, ids);
}
export function readRecents(): ModuleId[] {
  return get<ModuleId[]>(local(), REC_KEY) ?? [];
}
/** Põe o módulo no topo dos recentes (no máximo 6). */
export function pushRecent(id: ModuleId): ModuleId[] {
  const next = [id, ...readRecents().filter((x) => x !== id)].slice(0, 6);
  put(local(), REC_KEY, next);
  return next;
}
