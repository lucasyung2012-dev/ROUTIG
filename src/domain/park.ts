/**
 * Planta do campus (V2.1). Cinco regiões com identidade própria, praça monumental com a fonte,
 * lago principal orgânico entre o Oeste e o Sul, núcleos de 2 a 4 prédios com pátios,
 * espaços de convivência e residências fora da área explorável.
 * Norte = -z, Sul = +z, Leste = +x, Oeste = -x. 1 unidade = 1 metro.
 * docs/V21-AUDITORIA.md tem a planta comentada.
 */
import type { ModuleId } from '@/app/modules';

export const PARK_REGIONS = ['central', 'north', 'east', 'south', 'west'] as const;
export type ParkRegion = (typeof PARK_REGIONS)[number];

/** Formas provisórias (sem uso desde que os 18 prédios são detalhados; mantidas para um prédio novo). */
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
  /** Para onde a entrada olha: um ponto do campus (pátio do núcleo, praça, gramado). */
  faces: Point;
}

export interface Point {
  x: number;
  z: number;
}

/**
 * Escala da planta: as distâncias entre prédios, praças, lago e trilhas foram abertas 60% (cada
 * prédio com a sua área, sem lotes colados); os lotes e a praça mantêm o tamanho real.
 */
export const PARK_SCALE = 1.6;
/** Raio médio do campus; o contorno real é irregular (parkEdgeAt). */
export const PARK_RADIUS = 240 * PARK_SCALE;

/** Contorno do campus (raio por ângulo; hoje redondo). */
export function parkEdgeAt(angle: number): number {
  // Contorno redondo (o campus é grande; o realismo vem do relevo, da mata e das casas).
  void angle;
  return PARK_RADIUS;
}

/** Ponto além do contorno do campus (com folga em metros). */
export function beyondEdge(x: number, z: number, pad = 0): boolean {
  return Math.hypot(x, z) > parkEdgeAt(Math.atan2(z, x)) + pad;
}
export const PLAZA_RADIUS = 26;
/** Lago principal: centro e raio médio; a margem real é orgânica (lakeRadiusAt). */
export const LAKE = { x: -125 * PARK_SCALE, z: 95 * PARK_SCALE, radius: 36 * PARK_SCALE };
/** Lagos ornamentais menores (Sul, contemplação). */
export const PONDS: Array<Point & { radius: number }> = [
  { x: -15 * PARK_SCALE, z: 162 * PARK_SCALE, radius: 11 },
  { x: -92 * PARK_SCALE, z: 150 * PARK_SCALE, radius: 10 },
];

/** Centro de cada região (para caminhos e identidade paisagística). */
export const REGION_HUB: Record<ParkRegion, Point> = {
  central: { x: 0, z: 0 },
  north: { x: 0, z: -176 },
  east: { x: 176, z: 24 },
  south: { x: 8, z: 256 },
  west: { x: -192, z: -16 },
};

/** Pátios compartilhados dos núcleos (as entradas dos prédios do núcleo olham para eles). */
export const COURTS: Record<string, Point> = {
  learning: { x: -12.8, z: -211.2 },
  east: { x: 204.8, z: 32 },
  planning: { x: 32, z: 256 },
  growth: { x: -120, z: 240 },
};

const b = (id: ModuleId, region: ParkRegion, x: number, z: number, radius: number, shape: BuildingShape, color: string, faces: Point): ParkBuilding => ({ id, region, x, z, radius, shape, color, faces });
const PLAZA = { x: 0, z: 0 };

/** Os 18 prédios, em núcleos por função (V2.1, seção 7). */
export const PARK_BUILDINGS: ParkBuilding[] = [
  // Centro: núcleo principal em volta da praça monumental.
  b('dashboard', 'central', 0, -96, 30, 'tower', '#7C5CFC', PLAZA),
  b('profile', 'central', -88, 56, 26, 'house', '#A78BFA', PLAZA),
  b('inbox', 'central', 88, 56, 27, 'reception', '#22B8CF', PLAZA),
  // Norte: aprendizagem na mata tropical (Academy e Library dividem o pátio de estudos).
  b('academy', 'north', -72, -240, 33, 'campus', '#6366F1', COURTS.learning!),
  b('library', 'north', 48, -240, 30, 'library', '#3B82F6', COURTS.learning!),
  b('notes', 'north', 152, -200, 28, 'stack', '#F59E0B', { x: 96, z: -160 }),
  b('focus', 'north', -184, -184, 28, 'pavilion', '#10B981', { x: -128, z: -152 }),
  // Leste: criação e comunicação em gramados abertos.
  b('languages', 'east', 224, -72, 28, 'pagoda', '#14B8A6', COURTS.east!),
  b('projects', 'east', 264, 40, 28, 'twist', '#F97316', COURTS.east!),
  b('music', 'east', 200, 152, 31, 'amphitheater', '#EC4899', { x: 152, z: 96 }),
  // Oeste: esporte nas colinas.
  b('sports', 'west', -264, 0, 40, 'stadium', '#EF4444', { x: -176, z: 0 }),
  // Sul: organização e desenvolvimento, perto do lago e dos lagos ornamentais.
  b('habits', 'south', -72, 184, 28, 'greenhouse', '#22C55E', COURTS.growth!),
  b('goals', 'south', -96, 288, 28, 'terraces', '#EAB308', COURTS.growth!),
  b('calendar', 'south', 24, 188.8, 27, 'slab', '#0EA5E9', COURTS.planning!),
  b('tasks', 'south', 112, 224, 28, 'cubes', '#8B5CF6', COURTS.planning!),
  b('insights', 'south', 8, 307.2, 24, 'observatory', '#F43F5E', COURTS.planning!),
  b('finance', 'south', 115.2, 320, 24, 'hexTower', '#2563EB', COURTS.planning!),
  b('settings', 'south', -184, 291.2, 24, 'gear', '#94A3B8', COURTS.growth!),
];

export const dist = (a: Point, c: Point) => Math.hypot(a.x - c.x, a.z - c.z);

export function buildingById(id: ModuleId): ParkBuilding | undefined {
  return PARK_BUILDINGS.find((x) => x.id === id);
}

/** Para onde a frente do prédio olha. Ângulo em y (0 = +z). */
export function facingOf(p: ParkBuilding): number {
  return Math.atan2(p.faces.x - p.x, p.faces.z - p.z);
}

/** Ponto do caminho diante da entrada principal. */
export function entranceOf(p: ParkBuilding): Point {
  const a = facingOf(p);
  const r = p.radius * 0.82;
  return { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r };
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Margem orgânica do lago: enseadas e penínsulas (raio por ângulo). */
export function lakeRadiusAt(angle: number): number {
  const k = PARK_SCALE;
  return LAKE.radius + (Math.sin(angle * 3 + 0.6) * 6 + Math.sin(angle * 5 + 2.1) * 3.5 + Math.cos(angle * 2 - 0.4) * 4 + Math.sin(angle * 7 + 1.3) * 1.8) * k;
}

/** Ponto dentro d'água (lago principal ou lagos ornamentais), com folga em metros. */
export function inWater(x: number, z: number, pad = 0): boolean {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  if (Math.hypot(dx, dz) < lakeRadiusAt(Math.atan2(dz, dx)) + pad) return true;
  return PONDS.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + pad);
}

/** Relevo bruto por região: Oeste com colinas, Norte ondulado, Leste suave, Sul quase plano, Centro plano. */
function rawHeight(xm: number, zm: number): number {
  // O relevo foi desenhado na planta original: calcula nela e estica junto com o campus.
  const x = xm / PARK_SCALE;
  const z = zm / PARK_SCALE;
  const r = Math.hypot(x, z);
  const edgeR = parkEdgeAt(Math.atan2(z, x)) / PARK_SCALE;
  const west = smooth(-60, -150, x) * (1 - smooth(120, 220, Math.abs(z)));
  const north = smooth(-60, -140, z);
  const east = smooth(60, 140, x);
  const hills = west * (6 + Math.sin(x * 0.045) * Math.cos(z * 0.04) * 6 + Math.sin(z * 0.08) * 2.5) + north * (2.2 + Math.sin(x * 0.06 + 1) * Math.cos(z * 0.05) * 2.2) + east * (1 + Math.sin(x * 0.03) * Math.sin(z * 0.035) * 1.6);
  const core = smooth(45, 80, r);
  const edge = smooth(edgeR - 5, edgeR + 70, r);
  const outer = edge * (10 + Math.sin(x * 0.03) * Math.cos(z * 0.025) * 9 + Math.sin((x + z) * 0.012) * 6);
  return Math.max(0, hills * core) + outer;
}

/**
 * Altura do terreno: o relevo bruto, com cada lote nivelado numa plataforma (o prédio assenta
 * no chão) e a praça plana. Margens do lago descem até a água (no desenho do terreno).
 */
export function heightAt(x: number, z: number): number {
  let h = rawHeight(x, z);
  for (const p of PARK_BUILDINGS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.radius + 18) {
      const k = 1 - smooth(p.radius * 0.95, p.radius + 18, d);
      h = h * (1 - k) + lotHeight(p) * k;
    }
  }
  return h;
}

const lotCache = new Map<string, number>();
/** Altura da plataforma do lote: o relevo no centro do lote. */
export function lotHeight(p: ParkBuilding): number {
  let v = lotCache.get(p.id);
  if (v === undefined) {
    v = rawHeight(p.x, p.z);
    lotCache.set(p.id, v);
  }
  return v;
}

/** Tipos de caminho (V2.1, seção 8). */
export type PathKind = 'main' | 'secondary' | 'trail';
export interface ParkPath {
  kind: PathKind;
  points: Point[];
}

export const PATH_WIDTH: Record<PathKind, number> = { main: 5.5, secondary: 3, trail: 1.6 };

const edgeOfPlaza = (p: Point, r = PLAZA_RADIUS): Point => {
  const l = Math.hypot(p.x, p.z) || 1;
  return { x: (p.x / l) * r, z: (p.z / l) * r };
};
const mid = (a: Point, c: Point, bend: number): Point => ({ x: (a.x + c.x) / 2 + (c.z - a.z) * bend, z: (a.z + c.z) / 2 - (c.x - a.x) * bend });

/** Rede de caminhos: avenidas (principais), ligações entre prédios (secundários) e trilhas contemplativas. */
export function parkPaths(): ParkPath[] {
  const out: ParkPath[] = [];
  // Avenidas: praça → núcleo de cada região. A do Norte contorna o Observatório Central pelo
  // oeste e a do Sul passa entre a Estufa de Hábitos e o Observatório Temporal (nada cruza lote).
  const P = (x: number, z: number): Point => ({ x: x * PARK_SCALE, z: z * PARK_SCALE });
  out.push({ kind: 'main', points: [edgeOfPlaza(P(-0.55, -1)), P(-36, -62), P(-28, -95), REGION_HUB.north] });
  out.push({ kind: 'main', points: [edgeOfPlaza(REGION_HUB.east), mid(edgeOfPlaza(REGION_HUB.east), REGION_HUB.east, 0.08), REGION_HUB.east] });
  out.push({ kind: 'main', points: [edgeOfPlaza(P(0, 1)), P(-12, 70), P(-18, 100), P(-12, 140), REGION_HUB.south] });
  out.push({ kind: 'main', points: [edgeOfPlaza(REGION_HUB.west), mid(edgeOfPlaza(REGION_HUB.west), REGION_HUB.west, 0.08), REGION_HUB.west] });

  // Prédios centrais: praça → entrada.
  for (const p of PARK_BUILDINGS.filter((x) => x.region === 'central')) {
    const e = entranceOf(p);
    const s = edgeOfPlaza(e);
    out.push({ kind: 'main', points: [s, e] });
  }
  // Núcleos: hub da região → pátio → entrada de cada prédio.
  const seen = new Set<string>();
  for (const p of PARK_BUILDINGS.filter((x) => x.region !== 'central')) {
    const e = entranceOf(p);
    const court = p.faces;
    const key = `${court.x},${court.z}`;
    if (!seen.has(key)) {
      seen.add(key);
      const hub = REGION_HUB[p.region];
      // Ao pátio do crescimento, contornando o lago ornamental.
      if (court === COURTS.growth) out.push({ kind: 'secondary', points: [hub, P(-20, 142), P(-55, 140), court] });
      else if (dist(hub, court) > 8) out.push({ kind: 'secondary', points: [hub, mid(hub, court, 0.1), court] });
    }
    out.push({ kind: 'secondary', points: [court, mid(court, e, 0.12), e] });
  }
  // Circuitos de exploração entre regiões vizinhas (sem voltar à praça), desviando dos lotes e da água.
  const H = REGION_HUB;
  out.push({ kind: 'secondary', points: [H.north, { x: (H.north.x + H.east.x) * 0.72, z: (H.north.z + H.east.z) * 0.72 }, H.east] });
  out.push({ kind: 'secondary', points: [H.east, P(95, 110), P(95, 175), P(40, 185), H.south] });
  out.push({ kind: 'secondary', points: [H.south, P(-20, 142), P(-15, 95), P(-65, 70), P(-105, 30), H.west] });
  out.push({ kind: 'secondary', points: [H.west, { x: (H.west.x + H.north.x) * 0.72, z: (H.west.z + H.north.z) * 0.72 }, H.north] });

  // Trilha contemplativa em volta do lago (acompanha a margem, com folga).
  const loop: Point[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = lakeRadiusAt(a) + 7;
    loop.push({ x: LAKE.x + Math.cos(a) * r, z: LAKE.z + Math.sin(a) * r });
  }
  out.push({ kind: 'trail', points: loop });
  // Trilhas das colinas do Oeste e da mata do Norte.
  out.push({ kind: 'trail', points: [P(-120, -10), P(-170, -60), P(-205, -40), P(-200, 40), P(-150, 60)] });
  out.push({ kind: 'trail', points: [P(-80, -95), P(-88, -150), P(-60, -200), P(10, -215), P(55, -170), P(60, -100)] });
  // Trilha dos lagos ornamentais.
  out.push({ kind: 'trail', points: [P(-75, 150), P(-92, 165), P(-35, 150), P(-30, 176), P(-15, 180), P(5, 172), P(20, 160)] });
  return out;
}

/** Espaços de convivência (V2.1, seção 9): pontos que aparecem naturalmente na exploração. */
export type PoiKind = 'cafe' | 'kiosk' | 'pergola' | 'viewpoint' | 'reading' | 'plaza' | 'stage';
export interface Poi extends Point {
  id: string;
  kind: PoiKind;
  /** Ângulo para onde o ponto "olha" (mirantes: a vista). */
  view: number;
}

export const POIS: Poi[] = [
  { id: 'cafe-praca', kind: 'cafe', x: 60.8, z: -28.8, view: 0 },
  { id: 'leitura-norte', kind: 'reading', x: -12.8, z: -204.8, view: Math.PI },
  { id: 'pergola-sul', kind: 'pergola', x: -48, z: 240, view: 0 },
  { id: 'mirante-colina', kind: 'viewpoint', x: -328, z: -64, view: Math.PI / 2 },
  { id: 'mirante-lago', kind: 'viewpoint', x: -124.8, z: 112, view: -Math.PI * 0.75 },
  { id: 'quiosque-leste', kind: 'kiosk', x: 152, z: -12.8, view: 0 },
  { id: 'praca-leste', kind: 'plaza', x: 204.8, z: 32, view: 0 },
  { id: 'palco-musica', kind: 'stage', x: 147.2, z: 92.8, view: 0.7 },
  { id: 'cafe-sul', kind: 'cafe', x: 64, z: 280, view: 0 },
];

/** Residências (fora da área explorável): as pessoas do campus saem e voltam para elas. */
export function residences(): Array<Point & { id: string; floors: 1 | 2; rot: number; style: number }> {
  const rnd = seededRandom(404);
  const out: Array<Point & { id: string; floors: 1 | 2; rot: number; style: number }> = [];
  for (let i = 0; i < 52; i++) {
    const a = (i / 52) * Math.PI * 2 + (rnd() - 0.5) * 0.06;
    const r = parkEdgeAt(a) + 30 + rnd() * 18;
    out.push({ id: `casa-${i}`, x: Math.cos(a) * r, z: Math.sin(a) * r, floors: rnd() > 0.5 ? 2 : 1, rot: Math.atan2(-Math.cos(a), -Math.sin(a)), style: Math.floor(rnd() * 4) });
  }
  return out;
}

/** Problemas de planta (vazio = ok): sobreposição, prédio na água, na praça ou fora do campus. */
export function layoutProblems(buildings: ParkBuilding[] = PARK_BUILDINGS): string[] {
  const out: string[] = [];
  buildings.forEach((p, i) => {
    if (dist(p, { x: 0, z: 0 }) + p.radius > parkEdgeAt(Math.atan2(p.z, p.x))) out.push(`${p.id}: fora do parque`);
    if (dist(p, { x: 0, z: 0 }) < PLAZA_RADIUS + p.radius) out.push(`${p.id}: na praça`);
    if (dist(p, LAKE) < LAKE.radius + 14 + p.radius) out.push(`${p.id}: no lago`);
    if (PONDS.some((q) => dist(p, q) < q.radius + p.radius)) out.push(`${p.id}: num lago ornamental`);
    buildings.slice(i + 1).forEach((c) => {
      if (dist(p, c) < p.radius + c.radius + 2) out.push(`${p.id} e ${c.id}: muito perto`);
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

/** Pontos ao longo de uma linha de caminho (para afastar árvores e para os passeios das pessoas). */
export function samplePath(path: Point[], step = 4): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const c = path[i + 1]!;
    const n = Math.max(1, Math.ceil(dist(a, c) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((c.x - a.x) * k) / n, z: a.z + ((c.z - a.z) * k) / n });
  }
  out.push(path[path.length - 1]!);
  return out;
}

/** Densidade de árvores por região: Norte e Oeste densos, Leste espaçado, Sul ornamental. */
export function treeDensity(x: number, z: number): number {
  const a = Math.atan2(x, -z);
  const r = Math.hypot(x, z);
  if (r < 60 * PARK_SCALE) return 0.35;
  if (Math.abs(a) < Math.PI / 4) return 1; // norte
  if (a > 0 && a < (3 * Math.PI) / 4) return 0.35; // leste
  if (a < 0 && a > (-3 * Math.PI) / 4) return 0.9; // oeste
  return 0.55; // sul
}

/** Posições das árvores: fora de lotes, praça, água, convivência e caminhos; densidade por região. */
export function treePositions(count: number, seed = 7): Array<{ x: number; z: number; s: number }> {
  const rnd = seededRandom(seed);
  const pathPts = parkPaths().flatMap((p) => samplePath(p.points, 4));
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
  while (out.length < count && guard++ < count * 80) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (PARK_RADIUS * 1.2 + 60);
    const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    if (rnd() > treeDensity(p.x, p.z)) continue;
    if (dist(p, { x: 0, z: 0 }) < PLAZA_RADIUS + 8) continue;
    if (inWater(p.x, p.z, 6)) continue;
    if (PARK_BUILDINGS.some((q) => dist(p, q) < q.radius * 0.85)) continue;
    if (POIS.some((q) => dist(p, q) < 9)) continue;
    if (Object.values(COURTS).some((q) => dist(p, q) < 10)) continue;
    const edge = parkEdgeAt(a);
    if (r > edge + 18 && r < edge + 56) continue; // faixa das residências
    if (near(pathGrid, p, 4.5) || near(grid, p, 4.2)) continue;
    const k = key(p.x, p.z);
    grid.set(k, [...(grid.get(k) ?? []), p]);
    out.push({ ...p, s: 0.75 + rnd() * 0.6 });
  }
  return out;
}
