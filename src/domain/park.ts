/**
 * Planta do parque (V2, Etapa 0 — prova técnica). Cinco regiões, praça central com a fonte,
 * lago entre o Oeste e o Sul. Norte = -z, Sul = +z, Leste = +x, Oeste = -x (unidades em metros de cena).
 */
import type { ModuleId } from '@/app/modules';

export const PARK_REGIONS = ['central', 'north', 'east', 'south', 'west'] as const;
export type ParkRegion = (typeof PARK_REGIONS)[number];

/** Formas do kit de peças: cada prédio é montado em código a partir de uma delas. */
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
  /** Raio aproximado ocupado no chão (para não sobrepor e para posicionar árvores). */
  radius: number;
  shape: BuildingShape;
  color: string;
}

export const REGION_HUB: Record<ParkRegion, { x: number; z: number }> = {
  central: { x: 0, z: 0 },
  north: { x: 0, z: -40 },
  east: { x: 42, z: 0 },
  south: { x: 0, z: 42 },
  west: { x: -42, z: 0 },
};

export const PLAZA_RADIUS = 9;
export const PARK_RADIUS = 66;
export const LAKE = { x: -27, z: 29, radius: 9 };

/** Onde fica cada prédio e por quê: perto do que ele mais conversa. */
export const PARK_BUILDINGS: ParkBuilding[] = [
  // Central: entrada e acompanhamento, perto da fonte.
  { id: 'inbox', region: 'central', x: -10, z: -13, radius: 5, shape: 'reception', color: '#22B8CF' },
  { id: 'dashboard', region: 'central', x: 10, z: -13, radius: 5, shape: 'tower', color: '#7C5CFC' },
  { id: 'profile', region: 'central', x: -13, z: 11, radius: 4.5, shape: 'house', color: '#A78BFA' },
  { id: 'settings', region: 'central', x: 13, z: 11, radius: 4.5, shape: 'gear', color: '#94A3B8' },
  // Norte: estudo e conhecimento.
  { id: 'academy', region: 'north', x: -15, z: -40, radius: 7, shape: 'campus', color: '#6366F1' },
  { id: 'languages', region: 'north', x: -30, z: -30, radius: 6, shape: 'pagoda', color: '#14B8A6' },
  { id: 'library', region: 'north', x: 0, z: -52, radius: 6, shape: 'library', color: '#3B82F6' },
  { id: 'notes', region: 'north', x: 15, z: -40, radius: 5.5, shape: 'stack', color: '#F59E0B' },
  { id: 'insights', region: 'north', x: 30, z: -30, radius: 5.5, shape: 'observatory', color: '#F43F5E' },
  // Leste: produtividade e organização.
  { id: 'tasks', region: 'east', x: 37, z: -13, radius: 5, shape: 'cubes', color: '#8B5CF6' },
  { id: 'calendar', region: 'east', x: 52, z: -9, radius: 5, shape: 'slab', color: '#0EA5E9' },
  { id: 'projects', region: 'east', x: 52, z: 9, radius: 5.5, shape: 'twist', color: '#F97316' },
  { id: 'finance', region: 'east', x: 37, z: 13, radius: 5, shape: 'hexTower', color: '#2563EB' },
  // Oeste: concentração, hábitos e conquistas — perto do lago e da natureza.
  { id: 'focus', region: 'west', x: -37, z: -12, radius: 5.5, shape: 'pavilion', color: '#10B981' },
  { id: 'habits', region: 'west', x: -52, z: 0, radius: 6, shape: 'greenhouse', color: '#22C55E' },
  { id: 'goals', region: 'west', x: -40, z: 13, radius: 5.5, shape: 'terraces', color: '#EAB308' },
  // Sul: arte e esporte, abertos.
  { id: 'music', region: 'south', x: -10, z: 46, radius: 7, shape: 'amphitheater', color: '#EC4899' },
  { id: 'sports', region: 'south', x: 18, z: 44, radius: 8, shape: 'stadium', color: '#EF4444' },
];

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

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

/** Posições das árvores: fora de prédios, praça, lago e caminhos principais. */
export function treePositions(count: number, seed = 7): Array<{ x: number; z: number; s: number }> {
  const rnd = seededRandom(seed);
  const out: Array<{ x: number; z: number; s: number }> = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (PARK_RADIUS - 3);
    const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    if (dist(p, { x: 0, z: 0 }) < PLAZA_RADIUS + 4) continue;
    if (dist(p, LAKE) < LAKE.radius + 2) continue;
    if (Math.abs(p.x) < 3 || Math.abs(p.z) < 3) continue; // caminhos em cruz
    if (PARK_BUILDINGS.some((b) => dist(p, b) < b.radius + 2.5)) continue;
    out.push({ ...p, s: 0.7 + rnd() * 0.7 });
  }
  return out;
}
