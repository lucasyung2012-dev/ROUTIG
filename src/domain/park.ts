/**
 * Planta do parque (V2). Cinco regiões, praça central com a fonte, lago entre o Oeste e o Sul.
 * Norte = -z, Sul = +z, Leste = +x, Oeste = -x. 1 unidade = 1 metro.
 * Cada módulo tem um lote próprio; a frente do prédio olha para o caminho que vem da praça
 * (docs/V2-PARQUE-PLANO.md, seção 2).
 */
import type { ModuleId } from '@/app/modules';

export const PARK_REGIONS = ['central', 'north', 'east', 'south', 'west'] as const;
export type ParkRegion = (typeof PARK_REGIONS)[number];

/** Formas provisórias (prédios ainda não detalhados) — cada prédio detalhado tem o próprio construtor. */
export type BuildingShape =
  | 'reception'
  | 'tower'
  | 'house'
  | 'gear'
  | 'campus'
  | 'pagoda'
  | 'library'
  | 'stack'
  | 'observatory'
  | 'cubes'
  | 'slab'
  | 'twist'
  | 'hexTower'
  | 'pavilion'
  | 'greenhouse'
  | 'terraces'
  | 'amphitheater'
  | 'stadium';

export interface ParkBuilding {
  id: ModuleId;
  region: ParkRegion;
  x: number;
  z: number;
  /** Raio do lote (terreno próprio do prédio, com jardim e pátio). */
  radius: number;
  shape: BuildingShape;
  color: string;
}

export interface Point {
  x: number;
  z: number;
}

export const PARK_RADIUS = 230;
export const PLAZA_RADIUS = 24;
export const LAKE = { x: -90, z: 100, radius: 34 };
/** Colina do Insights (observatório no alto). */
export const HILL = { x: 20, z: -190, radius: 30, height: 6 };

export const REGION_HUB: Record<ParkRegion, Point> = {
  central: { x: 0, z: 0 },
  north: { x: 5, z: -92 },
  east: { x: 92, z: -5 },
  south: { x: 5, z: 100 },
  west: { x: -95, z: 10 },
};

/** Onde fica cada prédio e por quê: perto do que ele mais conversa. */
export const PARK_BUILDINGS: ParkBuilding[] = [
  // Central: chegada. Inbox e Dashboard frente a frente na praça.
  { id: 'inbox', region: 'central', x: 0, z: -55, radius: 27, shape: 'reception', color: '#22B8CF' },
  { id: 'dashboard', region: 'central', x: 0, z: 58, radius: 30, shape: 'tower', color: '#7C5CFC' },
  { id: 'profile', region: 'central', x: -56, z: 0, radius: 26, shape: 'house', color: '#A78BFA' },
  { id: 'settings', region: 'central', x: 55, z: 0, radius: 24, shape: 'gear', color: '#94A3B8' },
  // Norte: conhecimento. Library no meio (dona dos arquivos de Notes e Academy).
  { id: 'academy', region: 'north', x: -55, z: -125, radius: 33, shape: 'campus', color: '#6366F1' },
  { id: 'languages', region: 'north', x: -120, z: -110, radius: 30, shape: 'pagoda', color: '#14B8A6' },
  { id: 'library', region: 'north', x: 10, z: -130, radius: 30, shape: 'library', color: '#3B82F6' },
  { id: 'notes', region: 'north', x: 75, z: -115, radius: 30, shape: 'stack', color: '#F59E0B' },
  { id: 'insights', region: 'north', x: HILL.x, z: HILL.z, radius: 24, shape: 'observatory', color: '#F43F5E' },
  // Leste: tempo e execução. Calendar encostado no Tasks (agendamento compartilhado).
  { id: 'calendar', region: 'east', x: 125, z: -75, radius: 30, shape: 'slab', color: '#0EA5E9' },
  { id: 'tasks', region: 'east', x: 125, z: -5, radius: 31, shape: 'cubes', color: '#8B5CF6' },
  { id: 'projects', region: 'east', x: 112, z: 62, radius: 29, shape: 'twist', color: '#F97316' },
  { id: 'finance', region: 'east', x: 180, z: 30, radius: 24, shape: 'hexTower', color: '#2563EB' },
  // Oeste: bem-estar. Focus na margem do lago.
  { id: 'goals', region: 'west', x: -120, z: -40, radius: 30, shape: 'terraces', color: '#EAB308' },
  { id: 'habits', region: 'west', x: -155, z: 25, radius: 31, shape: 'greenhouse', color: '#22C55E' },
  { id: 'focus', region: 'west', x: -160, z: 90, radius: 30, shape: 'pavilion', color: '#10B981' },
  // Sul: movimento e arte. Music voltado ao lago; Sports com espaço aberto.
  { id: 'music', region: 'south', x: -40, z: 150, radius: 33, shape: 'amphitheater', color: '#EC4899' },
  { id: 'sports', region: 'south', x: 50, z: 140, radius: 38, shape: 'stadium', color: '#EF4444' },
];

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

export function buildingById(id: ModuleId): ParkBuilding | undefined {
  return PARK_BUILDINGS.find((b) => b.id === id);
}

/** Para onde a frente do prédio olha: a praça (central), o lago (Music) ou o hub da região. Ângulo em y (0 = +z). */
export function facingOf(b: ParkBuilding): number {
  const hub = b.region === 'central' ? REGION_HUB.central : b.id === 'music' ? LAKE : REGION_HUB[b.region];
  return Math.atan2(hub.x - b.x, hub.z - b.z);
}

/** Ponto do caminho diante da entrada principal. */
export function entranceOf(b: ParkBuilding): Point {
  const a = facingOf(b);
  const r = b.radius * 0.82;
  return { x: b.x + Math.sin(a) * r, z: b.z + Math.cos(a) * r };
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Altura do terreno: plano no parque, colina do Insights, morros além da borda. */
export function heightAt(x: number, z: number): number {
  const d = Math.hypot(x - HILL.x, z - HILL.z);
  const hill = HILL.height * (1 - smooth(HILL.radius + 2, HILL.radius + 34, d));
  const r = Math.hypot(x, z);
  const edge = smooth(PARK_RADIUS - 5, PARK_RADIUS + 70, r);
  const hills = edge * (10 + Math.sin(x * 0.03) * Math.cos(z * 0.025) * 9 + Math.sin((x + z) * 0.012) * 6);
  return hill + hills;
}

/**
 * Rede de caminhos (linhas de controle de curvas suaves): praça → hubs das regiões →
 * entrada de cada prédio, mais a volta do lago. Gerada da planta: muda junto com ela.
 */
export function parkPaths(): Point[][] {
  const out: Point[][] = [];
  const edge = (p: Point, r: number): Point => {
    const l = Math.hypot(p.x, p.z) || 1;
    return { x: (p.x / l) * r, z: (p.z / l) * r };
  };
  // Avenidas: borda da praça → hub de cada região, com uma curva leve.
  for (const r of ['north', 'east', 'south', 'west'] as const) {
    const hub = REGION_HUB[r];
    const start = edge(hub, PLAZA_RADIUS);
    const mid = { x: (start.x + hub.x) / 2 + hub.z * 0.08, z: (start.z + hub.z) / 2 - hub.x * 0.08 };
    out.push([start, mid, hub]);
  }
  // Ramais: hub (ou praça) → entrada de cada prédio.
  for (const b of PARK_BUILDINGS) {
    const e = entranceOf(b);
    const from = b.region === 'central' ? edge(e, PLAZA_RADIUS) : REGION_HUB[b.region];
    const mid = { x: (from.x + e.x) / 2 + (e.z - from.z) * 0.12, z: (from.z + e.z) / 2 - (e.x - from.x) * 0.12 };
    out.push([from, mid, e]);
  }
  // Volta do lago.
  const loop: Point[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    loop.push({ x: LAKE.x + Math.sin(a) * (LAKE.radius + 7), z: LAKE.z + Math.cos(a) * (LAKE.radius + 7) });
  }
  out.push(loop);
  // Ligações entre regiões vizinhas (anel de passeio).
  const ring = ['north', 'east', 'south', 'west'] as const;
  ring.forEach((r, i) => {
    const a = REGION_HUB[r];
    const b = REGION_HUB[ring[(i + 1) % 4]!];
    const mid = { x: (a.x + b.x) * 0.75, z: (a.z + b.z) * 0.75 };
    out.push([a, mid, b]);
  });
  return out;
}

/** Problemas de planta (vazio = ok): sobreposição, prédio no lago, na praça ou fora do parque. */
export function layoutProblems(buildings: ParkBuilding[] = PARK_BUILDINGS): string[] {
  const out: string[] = [];
  buildings.forEach((b, i) => {
    if (dist(b, { x: 0, z: 0 }) + b.radius > PARK_RADIUS) out.push(`${b.id}: fora do parque`);
    if (dist(b, { x: 0, z: 0 }) < PLAZA_RADIUS + b.radius) out.push(`${b.id}: na praça`);
    if (dist(b, LAKE) < LAKE.radius + b.radius) out.push(`${b.id}: no lago`);
    buildings.slice(i + 1).forEach((c) => {
      if (dist(b, c) < b.radius + c.radius + 2) out.push(`${b.id} e ${c.id}: muito perto`);
    });
  });
  return out;
}

/** Gerador pseudoaleatório com semente: o parque é sempre o mesmo em todo aparelho. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Pontos ao longo de uma linha de caminho (para afastar árvores e para colisão). */
export function samplePath(path: Point[], step = 4): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  out.push(path[path.length - 1]!);
  return out;
}

/** Posições das árvores: fora de lotes, praça, lago e caminhos. */
export function treePositions(count: number, seed = 7): Array<{ x: number; z: number; s: number }> {
  const rnd = seededRandom(seed);
  const pathPts = parkPaths().flatMap((p) => samplePath(p, 4));
  const cell = 8;
  const grid = new Map<string, Point[]>();
  const pathGrid = new Map<string, Point[]>();
  const key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  for (const q of pathPts) pathGrid.set(key(q.x, q.z), [...(pathGrid.get(key(q.x, q.z)) ?? []), q]);
  const near = (g: Map<string, Point[]>, p: Point, d: number) => {
    const gx = Math.floor(p.x / cell);
    const gz = Math.floor(p.z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if ((g.get(`${gx + i},${gz + j}`) ?? []).some((q) => dist(p, q) < d)) return true;
    return false;
  };
  const out: Array<{ x: number; z: number; s: number }> = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 60) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (PARK_RADIUS + 40);
    const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    if (dist(p, { x: 0, z: 0 }) < PLAZA_RADIUS + 6) continue;
    if (dist(p, LAKE) < LAKE.radius + 10) continue;
    if (PARK_BUILDINGS.some((b) => dist(p, b) < b.radius * 0.85)) continue;
    if (near(pathGrid, p, 4.5) || near(grid, p, 4)) continue;
    const k = key(p.x, p.z);
    grid.set(k, [...(grid.get(k) ?? []), p]);
    out.push({ ...p, s: 0.75 + rnd() * 0.6 });
  }
  return out;
}
