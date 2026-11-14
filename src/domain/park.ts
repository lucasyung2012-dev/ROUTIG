/**
 * Planta do campus (V2.1). Cinco regiões com identidade própria, praça monumental com a fonte,
 * lago principal orgânico entre o Oeste e o Sul, núcleos de 2 a 4 prédios com pátios,
 * espaços de convivência e residências fora da área explorável.
 * Norte = -z, Sul = +z, Leste = +x, Oeste = -x. 1 unidade = 1 metro.
 * docs/V21-AUDITORIA.md tem a planta comentada.
 */
import type { ModuleId } from '@/app/modules';

/**
 * Áreas temáticas do Campus (14/11/2026): o parque se organiza por tema, não por ponto cardeal.
 * Centro: Observatório Central, Perfil e Configurações em volta da praça. Conhecimento ao Norte
 * (mata e pátios de estudo), Planejamento a Leste (jardins geométricos), Desenvolvimento pessoal ao
 * Sul (jardins floridos, lagos ornamentais), Atividades a Oeste (colinas, quadras, palco) e
 * Finanças a Sudeste (praça moderna e reservada).
 */
export const PARK_REGIONS = ['central', 'knowledge', 'planning', 'growth', 'activity', 'finance'] as const;
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

/** Rua que contorna o campus (com calçadas), entre o parque e o bairro. */
export const ROAD_RADIUS = 240 * 1.6 + 22;

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
  knowledge: { x: 0, z: -176 },
  planning: { x: 176, z: 24 },
  growth: { x: 8, z: 256 },
  activity: { x: -192, z: -16 },
  finance: { x: 128, z: 232 },
};

/** Pátios compartilhados dos núcleos (as entradas dos prédios do núcleo olham para eles). */
export const COURTS: Record<string, Point> = {
  learning: { x: -12.8, z: -211.2 },
  study: { x: 96, z: -160 },
  planning: { x: 204.8, z: 32 },
  growth: { x: -56, z: 218 },
  activity: { x: -176, z: -100 },
  finance: { x: 128, z: 232 },
};

const b = (id: ModuleId, region: ParkRegion, x: number, z: number, radius: number, shape: BuildingShape, color: string, faces: Point): ParkBuilding => ({ id, region, x, z, radius, shape, color, faces });
const PLAZA = { x: 0, z: 0 };

/** Os 18 prédios, agrupados por área temática (14/11/2026). */
export const PARK_BUILDINGS: ParkBuilding[] = [
  // Centro: núcleo principal em volta da praça monumental.
  b('dashboard', 'central', 0, -96, 30, 'tower', '#7C5CFC', PLAZA),
  b('profile', 'central', -88, 56, 26, 'house', '#A78BFA', PLAZA),
  b('settings', 'central', 88, 56, 24, 'gear', '#94A3B8', PLAZA),
  // Conhecimento e aprendizagem (Norte, mata): Academy e Library no pátio de estudos; Notes e
  // Idiomas no pátio de leitura.
  b('academy', 'knowledge', -72, -240, 33, 'campus', '#6366F1', COURTS.learning!),
  b('library', 'knowledge', 48, -240, 30, 'library', '#3B82F6', COURTS.learning!),
  b('notes', 'knowledge', 152, -200, 28, 'stack', '#F59E0B', COURTS.study!),
  b('languages', 'knowledge', 90, -124, 28, 'pagoda', '#14B8A6', COURTS.study!),
  // Planejamento e organização (Leste, jardins geométricos), em volta da praça do Leste.
  b('inbox', 'planning', 124, -36, 27, 'reception', '#22B8CF', COURTS.planning!),
  b('calendar', 'planning', 224, -72, 27, 'slab', '#0EA5E9', COURTS.planning!),
  b('projects', 'planning', 264, 40, 28, 'twist', '#F97316', COURTS.planning!),
  b('tasks', 'planning', 200, 152, 28, 'cubes', '#8B5CF6', COURTS.planning!),
  // Gestão financeira (Sudeste): praça própria, reservada.
  b('finance', 'finance', 176, 264, 24, 'hexTower', '#2563EB', COURTS.finance!),
  // Desenvolvimento pessoal (Sul, jardins e lagos ornamentais), em volta da pérgola.
  b('habits', 'growth', -72, 184, 28, 'greenhouse', '#22C55E', COURTS.growth!),
  b('goals', 'growth', -96, 288, 28, 'terraces', '#EAB308', COURTS.growth!),
  b('insights', 'growth', 8, 307.2, 24, 'observatory', '#F43F5E', REGION_HUB.growth),
  // Atividades e concentração (Oeste, colinas): esporte, Focus e Música com o palco.
  b('sports', 'activity', -264, 0, 40, 'stadium', '#EF4444', { x: -176, z: 0 }),
  b('focus', 'activity', -150, -56, 28, 'pavilion', '#10B981', COURTS.activity!),
  b('music', 'activity', -184, -184, 31, 'amphitheater', '#EC4899', COURTS.activity!),
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

/** Elevação arredondada (morro ou, com altura negativa, depressão) de raio `r` na planta original. */
function bump(x: number, z: number, cx: number, cz: number, r: number, h: number): number {
  const d = Math.hypot(x - cx, z - cz) / r;
  if (d >= 1) return 0;
  const k = 1 - d * d;
  return h * k * k;
}

/**
 * Relevo natural (v2.2, 14/11/2026): ondulações suaves em todo o parque; colinas maiores nas
 * Atividades (Oeste), com o Morro do Mirante; colinas de mata no Conhecimento (Norte); planaltos
 * suaves no Planejamento (Leste); vale ajardinado no Desenvolvimento pessoal (Sul), descendo até o
 * lago. A praça e o entorno ficam planos; as inclinações ficam abaixo de cerca de 30° (caminháveis).
 */
function rawHeight(xm: number, zm: number): number {
  // O relevo foi desenhado na planta original: calcula nela e estica junto com o campus.
  const x = xm / PARK_SCALE;
  const z = zm / PARK_SCALE;
  const r = Math.hypot(x, z);
  const edgeR = parkEdgeAt(Math.atan2(z, x)) / PARK_SCALE;
  const west = smooth(-50, -140, x) * (1 - smooth(130, 230, Math.abs(z)));
  const north = smooth(-50, -130, z);
  const east = smooth(50, 130, x);
  const south = smooth(60, 150, z);
  // Ondulações pequenas (o chão nunca é uma mesa).
  const roll = Math.sin(x * 0.021 + 0.7) * Math.cos(z * 0.018 - 0.4) * 1.8 + Math.sin((x - z) * 0.037) * 0.8 + Math.cos(x * 0.061 + z * 0.047) * 0.4;
  const hills =
    west * (7 + Math.sin(x * 0.045) * Math.cos(z * 0.04) * 6 + Math.sin(z * 0.08) * 2.2) +
    north * (3.5 + Math.sin(x * 0.06 + 1) * Math.cos(z * 0.05) * 3.2) +
    east * (1.6 + Math.sin(x * 0.03) * Math.sin(z * 0.035) * 2.2) +
    south * (Math.sin(x * 0.05 + 0.3) * 1.1 - 0.6);
  // Morros e depressões pontuais.
  const features =
    bump(x, z, -205, -40, 48, 11) + // Morro do Mirante (Oeste)
    bump(x, z, -150, 95, 40, 6) + // colina do lago (Oeste)
    bump(x, z, -170, -150, 38, 7) + // colina da mata (Noroeste)
    bump(x, z, 30, -205, 34, 5) + // colina da leitura (Norte)
    bump(x, z, 150, -160, 36, 6) + // colina do Leste
    bump(x, z, 195, 95, 30, 4) + // planalto do Leste
    bump(x, z, 105, 185, 28, 3.5) + // colina das finanças
    bump(x, z, -60, -150, 22, -2.2) + // vale da mata
    bump(x, z, 60, 130, 24, -1.8) + // depressão do Sul
    bump(x, z, -40, 110, 20, -1.4); // baixada dos jardins
  const core = smooth(45, 85, r);
  const edge = smooth(edgeR - 5, edgeR + 70, r);
  const outer = edge * (10 + Math.sin(x * 0.03) * Math.cos(z * 0.025) * 9 + Math.sin((x + z) * 0.012) * 6);
  return (hills + features + roll) * core + outer;
}

/**
 * Altura do terreno: o relevo bruto, com cada lote nivelado numa plataforma (o prédio assenta
 * no chão) e a praça plana. Margens do lago descem até a água (no desenho do terreno).
 */
/**
 * Instalações esportivas externas do Complexo Esportivo (V2.1, 10.13 e 11.13): quadra de tênis
 * e campo de futebol, em terreno nivelado. `w` na direção x, `d` na direção z (metros).
 */
export const SPORT_FIELDS = {
  tennis: { x: -215, z: -92, w: 36, d: 18 },
  football: { x: -262, z: -152, w: 70, d: 46 },
} as const;

/** Dentro de um campo/quadra (com folga). */
export function inField(x: number, z: number, pad = 0): boolean {
  return Object.values(SPORT_FIELDS).some((f) => Math.abs(x - f.x) < f.w / 2 + pad && Math.abs(z - f.z) < f.d / 2 + pad);
}

/** Centro do palco ao ar livre (o mesmo do ponto "palco-musica" em POIS). */
const STAGE_AT = { x: -140, z: -170 };

function naturalHeight(x: number, z: number): number {
  let h = rawHeight(x, z);
  // Lago e lagos ornamentais em terreno baixo: o relevo em volta desce até a margem
  // (sem morro cobrindo metade da água).
  {
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    const lr = lakeRadiusAt(Math.atan2(z - LAKE.z, x - LAKE.x));
    if (dl < lr + 40) h *= smooth(lr + 4, lr + 40, dl);
    for (const p of PONDS) {
      const dp = Math.hypot(x - p.x, z - p.z);
      if (dp < p.radius + 22) h *= smooth(p.radius + 2, p.radius + 22, dp);
    }
  }
  // Campo e quadra nivelados, com taludes suaves em volta.
  for (const f of Object.values(SPORT_FIELDS)) {
    const dx = Math.max(0, Math.abs(x - f.x) - f.w / 2);
    const dz = Math.max(0, Math.abs(z - f.z) - f.d / 2);
    const d = Math.hypot(dx, dz);
    if (d < 14) {
      const k = 1 - smooth(0, 14, d);
      h = h * (1 - k) + rawHeight(f.x, f.z) * k;
    }
  }
  for (const p of PARK_BUILDINGS) {
    const d = Math.hypot(x - p.x, z - p.z);
    // Rampa de 28 m em volta do lote: em encosta, o caminho até a entrada continua suave.
    if (d < p.radius + 28) {
      const k = 1 - smooth(p.radius * 0.95, p.radius + 28, d);
      h = h * (1 - k) + lotHeight(p) * k;
    }
  }
  // Anfiteatro do palco da música: chão plano num raio de 15 m, voltando ao relevo até 30 m
  // (o palco e a arquibancada ficam no chão, sem afundar, e dá para andar entre eles).
  const dS = Math.hypot(x - STAGE_AT.x, z - STAGE_AT.z);
  if (dS < 30) {
    const k = 1 - smooth(15, 30, dS);
    h = h * (1 - k) + rawHeight(STAGE_AT.x, STAGE_AT.z) * k;
  }
  return h;
}

/**
 * Malha do terreno: a mesma grade de pontos serve para desenhar o chão (world.ts) e para pisar nele
 * (heightAt). Assim o chão desenhado e o chão do corpo, das pessoas, das árvores e dos caminhos são
 * exatamente o mesmo — antes, entre os pontos da malha, o desenho ficava acima ou abaixo do cálculo
 * e os pés entravam no morro.
 */
export const TERRAIN = { size: Math.round(PARK_RADIUS * 2 + 420), seg: 288 } as const;
let grid: Float32Array | null = null;
function terrainGrid(): Float32Array {
  if (grid) return grid;
  const n = TERRAIN.seg + 1;
  const step = TERRAIN.size / TERRAIN.seg;
  const half = TERRAIN.size / 2;
  grid = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) grid[j * n + i] = naturalHeight(-half + i * step, -half + j * step);
  return grid;
}

/** Altura do terreno num vértice da malha (i ao longo de x, j ao longo de z). */
export function terrainVertex(i: number, j: number): number {
  return terrainGrid()[j * (TERRAIN.seg + 1) + i]!;
}

/**
 * Altura do chão em (x, z): interpolada nos triângulos da malha do terreno (cada quadrado da grade
 * é cortado pela diagonal de (x0, z1) a (x1, z0), igual ao desenho). Fora da malha, o relevo direto.
 */
export function heightAt(x: number, z: number): number {
  const step = TERRAIN.size / TERRAIN.seg;
  const half = TERRAIN.size / 2;
  const fx = (x + half) / step;
  const fz = (z + half) / step;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= TERRAIN.seg || j >= TERRAIN.seg) return naturalHeight(x, z);
  const g = terrainGrid();
  const n = TERRAIN.seg + 1;
  const u = fx - i;
  const v = fz - j;
  const h00 = g[j * n + i]!;
  const h10 = g[j * n + i + 1]!;
  const h01 = g[(j + 1) * n + i]!;
  const h11 = g[(j + 1) * n + i + 1]!;
  return u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
}

/** Inclinação do chão (subida por metro) na direção (dx, dz) normalizada. */
export function slopeAt(x: number, z: number, dx: number, dz: number, d = 0.6): number {
  return (heightAt(x + dx * d, z + dz * d) - heightAt(x - dx * d, z - dz * d)) / (2 * d);
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
  // Avenidas: praça → centro de cada área temática. A do Norte contorna o Observatório Central
  // pelo oeste e a do Sul passa entre os jardins (nada cruza lote).
  const P = (x: number, z: number): Point => ({ x: x * PARK_SCALE, z: z * PARK_SCALE });
  out.push({ kind: 'main', points: [edgeOfPlaza(P(-0.55, -1)), P(-36, -62), P(-28, -95), REGION_HUB.knowledge] });
  out.push({ kind: 'main', points: [edgeOfPlaza(REGION_HUB.planning), mid(edgeOfPlaza(REGION_HUB.planning), REGION_HUB.planning, 0.08), REGION_HUB.planning] });
  out.push({ kind: 'main', points: [edgeOfPlaza(P(0, 1)), P(-12, 70), P(-18, 100), P(-12, 140), REGION_HUB.growth] });
  out.push({ kind: 'main', points: [edgeOfPlaza(REGION_HUB.activity), mid(edgeOfPlaza(REGION_HUB.activity), REGION_HUB.activity, 0.08), REGION_HUB.activity] });
  out.push({ kind: 'main', points: [edgeOfPlaza(P(0.55, 1)), P(40, 80), P(62, 118), REGION_HUB.finance] });

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
      if (dist(hub, court) > 8) {
        // Curva para o lado que não passa pela água (a curva do desenho, não a linha reta).
        const bend = samplePath([hub, mid(hub, court, 0.1), court], 2).some((q) => inWater(q.x, q.z, PATH_WIDTH.secondary / 2 + 0.8)) ? -0.1 : 0.1;
        out.push({ kind: 'secondary', points: [hub, mid(hub, court, bend), court] });
      }
    }
    out.push({ kind: 'secondary', points: [court, mid(court, e, 0.12), e] });
  }
  // Circuitos de exploração entre regiões vizinhas (sem voltar à praça), desviando dos lotes e da água.
  const H = REGION_HUB;
  out.push({ kind: 'secondary', points: [COURTS.study!, { x: 160, z: -80 }, H.planning] });
  out.push({ kind: 'secondary', points: [H.planning, P(98, 100), H.finance] });
  out.push({ kind: 'secondary', points: [H.finance, P(45, 150), H.growth] });
  out.push({ kind: 'secondary', points: [H.growth, P(-20, 142), P(-15, 95), P(-65, 70), P(-105, 30), H.activity] });
  out.push({ kind: 'secondary', points: [COURTS.activity!, { x: -100, z: -140 }, H.knowledge] });

  // Trilha contemplativa em volta do lago (acompanha a margem, com folga).
  const loop: Point[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = lakeRadiusAt(a) + 7;
    loop.push({ x: LAKE.x + Math.cos(a) * r, z: LAKE.z + Math.sin(a) * r });
  }
  out.push({ kind: 'trail', points: loop });
  // A trilha do lago se liga à rede: ao circuito Sul–Oeste e ao fim da trilha das colinas.
  const nearLoop = (p: Point) => samplePath(loop, 2).reduce((m, q) => (dist(q, p) < dist(m, p) ? q : m), loop[0]!);
  out.push({ kind: 'trail', points: [P(-65, 70), nearLoop(P(-65, 70))] });
  out.push({ kind: 'trail', points: [P(-150, 60), nearLoop(P(-150, 60))] });
  // Acesso às quadras externas do Complexo Esportivo.
  out.push({ kind: 'secondary', points: [REGION_HUB.activity, { x: -205, z: -60 }, { x: SPORT_FIELDS.tennis.x, z: SPORT_FIELDS.tennis.z + SPORT_FIELDS.tennis.d / 2 + 3 }] });
  out.push({ kind: 'secondary', points: [{ x: -205, z: -60 }, { x: -240, z: -80 }, { x: -245, z: -110 }, { x: SPORT_FIELDS.football.x + SPORT_FIELDS.football.w / 2 + 3, z: SPORT_FIELDS.football.z + 10 }] });
  // Trilhas das colinas do Oeste e da mata do Norte.
  out.push({ kind: 'trail', points: [P(-120, -10), P(-170, -60), P(-205, -40), P(-200, 40), P(-150, 60)] });
  out.push({ kind: 'trail', points: [{ x: -100, z: -140 }, P(-88, -150), P(-60, -200), P(10, -215), P(55, -170), P(60, -100)] });
  // Trilha dos lagos ornamentais.
  out.push({ kind: 'trail', points: [COURTS.growth!, P(-75, 150), P(-92, 165), P(-35, 150), P(-30, 176), P(-15, 180), P(5, 172), REGION_HUB.growth] });
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
  { id: 'palco-musica', kind: 'stage', x: -140, z: -170, view: 0.9 },
  { id: 'cafe-sul', kind: 'cafe', x: 64, z: 280, view: 0 },
];

/** Residências (fora da área explorável): as pessoas do campus saem e voltam para elas. */
export function residences(): Array<Point & { id: string; floors: 1 | 2; rot: number; style: number }> {
  const rnd = seededRandom(404);
  const out: Array<Point & { id: string; floors: 1 | 2; rot: number; style: number }> = [];
  for (let i = 0; i < 52; i++) {
    const a = (i / 52) * Math.PI * 2 + (rnd() - 0.5) * 0.06;
    const r = ROAD_RADIUS + 16 + rnd() * 12;
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
/**
 * Ponto da curva suave que passa pelos pontos do caminho (Catmull-Rom uniforme, a mesma curva de
 * THREE.SplineCurve com que o caminho é desenhado). `t` de 0 a 1.
 */
function splinePoint(pts: Point[], t: number): Point {
  const p = (pts.length - 1) * t;
  const i = Math.floor(p);
  const w = p - i;
  const n = pts.length;
  const p0 = pts[i === 0 ? i : i - 1]!;
  const p1 = pts[i]!;
  const p2 = pts[i > n - 2 ? n - 1 : i + 1]!;
  const p3 = pts[i > n - 3 ? n - 1 : i + 2]!;
  const cr = (a: number, b: number, c: number, d: number) => {
    const v0 = (c - a) * 0.5;
    const v1 = (d - b) * 0.5;
    const w2 = w * w;
    return (2 * b - 2 * c + v0 + v1) * w2 * w + (-3 * b + 3 * c - 2 * v0 - v1) * w2 + v0 * w + b;
  };
  return { x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) };
}

/**
 * Pontos ao longo do caminho, a cada `step` metros (aprox.), sobre a mesma curva suave do desenho (não
 * sobre a linha reta entre os pontos: nas curvas, a diferença punha árvore e moita em cima do piso).
 */
export function samplePath(path: Point[], step = 4): Point[] {
  if (path.length < 2) return path.slice();
  let len = 0;
  for (let i = 0; i < path.length - 1; i++) len += dist(path[i]!, path[i + 1]!);
  const n = Math.max(1, Math.ceil(len / step));
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) out.push(k === n ? path[path.length - 1]! : splinePoint(path, k / n));
  return out;
}

/** Metade da largura ocupada por um caminho: o piso e, fora as trilhas, a borda de 0,4 m de cada lado. */
const pathHalf = (kind: PathKind) => PATH_WIDTH[kind] / 2 + (kind === 'trail' ? 0 : 0.4);

/** Folga em volta de cada ponto de convivência: o palco (anfiteatro de uns 14 m) e as praças pedem mais. */
const poiClear = (kind: PoiKind) => (kind === 'stage' ? 17 : kind === 'plaza' ? 15 : 10);

let pathCache: Array<{ x: number; z: number; half: number }> | null = null;
let pathGrid: Map<string, Array<{ x: number; z: number; half: number }>> | null = null;
/**
 * Chão livre para plantar flores, arbustos e grama ou pôr bancos: fora de caminhos, praça,
 * água, lotes dos prédios, quadras, espaços de convivência e além da borda do campus.
 */
export function isFreeGround(x: number, z: number, pad = 0.5): boolean {
  if (!pathCache) {
    pathCache = parkPaths().flatMap((p) => samplePath(p.points, 1.2).map((q) => ({ ...q, half: pathHalf(p.kind) })));
    pathGrid = new Map();
    for (const q of pathCache) {
      const k = `${Math.floor(q.x / 6)},${Math.floor(q.z / 6)}`;
      const arr = pathGrid.get(k);
      if (arr) arr.push(q);
      else pathGrid.set(k, [q]);
    }
  }
  const r = Math.hypot(x, z);
  if (r < PLAZA_RADIUS + 2 + pad || r > PARK_RADIUS + 20) return false;
  if (inWater(x, z, 1 + pad) || inField(x, z, 2 + pad)) return false;
  // O piso de cada lote cobre o raio inteiro (com meio-fio): nada nasce em cima dele.
  if (PARK_BUILDINGS.some((b) => Math.hypot(x - b.x, z - b.z) < b.radius + 0.4 + pad)) return false;
  if (POIS.some((p) => Math.hypot(x - p.x, z - p.z) < poiClear(p.kind) + pad)) return false;
  if (playSpots.some((p) => Math.hypot(x - p.x, z - p.z) < 12 + pad)) return false;
  const gx = Math.floor(x / 6);
  const gz = Math.floor(z / 6);
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) for (const q of pathGrid!.get(`${gx + i},${gz + j}`) ?? []) if (Math.hypot(q.x - x, q.z - z) < q.half + 0.4 + pad) return false;
  return true;
}

/** Alcance da identidade de uma área em volta dos seus prédios e do seu centro (metros). */
const THEME_SPREAD = 105;

/**
 * Peso de cada área temática num ponto (somam 1). Perto dos prédios e do centro de uma área, ela
 * domina; entre duas áreas as identidades (cor do gramado, árvores, piso, flores) se misturam aos
 * poucos — transição natural, sem muro nem linha. A praça e o entorno são do centro.
 */
export function themeWeights(x: number, z: number): Record<ParkRegion, number> {
  const w: Record<ParkRegion, number> = { central: 0, knowledge: 0, planning: 0, growth: 0, activity: 0, finance: 0 };
  w.central = 1.6 * Math.exp(-((Math.hypot(x, z) / 100) ** 2));
  const near = (t: ParkRegion, px: number, pz: number) => {
    const d = Math.hypot(x - px, z - pz);
    w[t] = Math.max(w[t], Math.exp(-((d / THEME_SPREAD) ** 2)));
  };
  for (const b of PARK_BUILDINGS) if (b.region !== 'central') near(b.region, b.x, b.z);
  for (const t of PARK_REGIONS) if (t !== 'central') near(t, REGION_HUB[t].x, REGION_HUB[t].z);
  // Quadra e campo são das Atividades.
  for (const f of Object.values(SPORT_FIELDS)) near('activity', f.x, f.z);
  let sum = 0;
  for (const t of PARK_REGIONS) sum += w[t];
  if (sum < 1e-4) {
    // Longe de tudo (borda e bairro): a área do prédio mais próximo.
    const b = PARK_BUILDINGS.reduce((m, c) => (Math.hypot(x - c.x, z - c.z) < Math.hypot(x - m.x, z - m.z) ? c : m));
    for (const t of PARK_REGIONS) w[t] = t === b.region ? 1 : 0;
    return w;
  }
  for (const t of PARK_REGIONS) w[t] /= sum;
  return w;
}

/** Área temática predominante num ponto. */
export function themeAt(x: number, z: number): ParkRegion {
  const w = themeWeights(x, z);
  return PARK_REGIONS.reduce((m, t) => (w[t] > w[m] ? t : m), 'central' as ParkRegion);
}

/** Densidade de árvores por área: mata no Conhecimento, colinas arborizadas nas Atividades, gramados abertos no Planejamento e nas Finanças, jardins no Desenvolvimento. */
const TREE_DENSITY: Record<ParkRegion, number> = { central: 0.35, knowledge: 1, planning: 0.28, growth: 0.5, activity: 0.75, finance: 0.25 };
export function treeDensity(x: number, z: number): number {
  if (Math.hypot(x, z) > PARK_RADIUS + 10) return 0.85;
  const w = themeWeights(x, z);
  let d = 0;
  for (const t of PARK_REGIONS) d += w[t] * TREE_DENSITY[t];
  return d;
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
    const r = Math.sqrt(rnd()) * (ROAD_RADIUS + 175);
    const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    if (rnd() > treeDensity(p.x, p.z)) continue;
    if (dist(p, { x: 0, z: 0 }) < PLAZA_RADIUS + 8) continue;
    if (inWater(p.x, p.z, 6)) continue;
    if (PARK_BUILDINGS.some((q) => dist(p, q) < q.radius + 1.5)) continue;
    if (POIS.some((q) => dist(p, q) < poiClear(q.kind))) continue;
    if (Object.values(COURTS).some((q) => dist(p, q) < 10)) continue;
    if (inField(p.x, p.z, 6)) continue;
    if (PLAYGROUNDS.some((g) => Math.hypot(p.x - g.x, p.z - g.z) < 16) || onStreet(p.x, p.z, 3)) continue;
    const edge = parkEdgeAt(a);
    if ((r > edge + 12 && r < ROAD_RADIUS + 42) || (r > ROAD_RADIUS + 58 && r < ROAD_RADIUS + 114)) continue; // rua, casas e prédios do bairro (árvores entre eles)
    if (near(pathGrid, p, 4.5) || near(grid, p, 4.2)) continue;
    const k = key(p.x, p.z);
    grid.set(k, [...(grid.get(k) ?? []), p]);
    out.push({ ...p, s: 0.75 + rnd() * 0.6 });
  }
  return out;
}


let walkGrid: Map<string, Array<{ x: number; z: number; h: number }>> | null = null;
/**
 * Ponto (com raio `r`) em cima de algum caminho do parque, na parte onde se anda (largura do
 * caminho). Serve para nada de bancos, mesas, postes ou pilares no meio da passagem.
 */
export function onPath(x: number, z: number, r = 0): boolean {
  if (!walkGrid) {
    walkGrid = new Map();
    for (const p of parkPaths())
      for (const s of samplePath(p.points, 1.2)) {
        const k = `${Math.floor(s.x / 4)},${Math.floor(s.z / 4)}`;
        const list = walkGrid.get(k) ?? [];
        list.push({ x: s.x, z: s.z, h: pathHalf(p.kind) });
        walkGrid.set(k, list);
      }
  }
  const cx = Math.floor(x / 4);
  const cz = Math.floor(z / 4);
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      for (const s of walkGrid.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(s.x - x, s.z - z) < s.h + r) return true;
  return false;
}

/* ---------- Bairro: avenida externa e ruas transversais ---------- */

/** Avenida que contorna o bairro, atrás da faixa de prédios. */
export const OUTER_ROAD = ROAD_RADIUS + 128;

let crossCache: number[] | null = null;
/**
 * Ângulos das ruas transversais que ligam a rua do parque à avenida externa: dez, espalhadas,
 * cada uma no maior vão entre duas casas do seu trecho (a rua nunca passa por cima de um lote).
 */
export function crossStreets(): number[] {
  if (crossCache) return crossCache;
  const homes = residences();
  const clearance = (a: number) => Math.min(...homes.map((h) => Math.abs(Math.atan2(Math.sin(Math.atan2(h.z, h.x) - a), Math.cos(Math.atan2(h.z, h.x) - a))) * Math.hypot(h.x, h.z) - 10));
  const out: number[] = [];
  for (let k = 0; k < 10; k++) {
    let best = 0;
    let bestC = -Infinity;
    for (let i = Math.round(k * 5.2); i < Math.round((k + 1) * 5.2); i++) {
      const a = ((i + 0.5) / 52) * Math.PI * 2;
      for (const d of [-0.012, 0, 0.012]) {
        const c = clearance(a + d);
        if (c > bestC) {
          bestC = c;
          best = a + d;
        }
      }
    }
    out.push(best);
  }
  crossCache = out;
  return out;
}

/** Ponto em cima de rua do bairro (avenida externa ou transversal), com margem `pad`. */
export function onStreet(x: number, z: number, pad = 0): boolean {
  const r = Math.hypot(x, z);
  if (Math.abs(r - OUTER_ROAD) < 6.5 + pad) return true;
  if (r < ROAD_RADIUS || r > OUTER_ROAD) return false;
  const a = Math.atan2(z, x);
  return crossStreets().some((c) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) * r < 6.5 + pad);
}

/* ---------- Parquinho ---------- */

let playSpots: Point[] = [];
/** Giro de um parquinho: a entrada (lado +z dos brinquedos) fica para o caminho mais próximo. */
function playRot(p: Point): number {
  for (let r = 12; r < 24; r += 1)
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      if (onPath(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r)) return a;
    }
  return 0;
}
/**
 * Parquinhos espalhados pelo parque: gramados livres de uns 30 m (a cerca fica a 2 m de qualquer
 * caminho, lote, água ou mirante), sempre com um caminho perto para chegar; o primeiro perto do
 * jardim do Sul e os outros o mais longe possível uns dos outros (até quatro).
 */
export const PLAYGROUNDS: Array<Point & { rot: number }> = (() => {
  const cands: Point[] = [];
  for (let x = -360; x <= 360; x += 10)
    for (let z = -360; z <= 360; z += 10) {
      if (Math.hypot(x, z) > PARK_RADIUS - 25) continue;
      if (PARK_BUILDINGS.some((b) => Math.hypot(b.x - x, b.z - z) < b.radius + 22)) continue;
      if (isFreeGround(x, z, 13) && !isFreeGround(x, z, 19)) cands.push({ x, z });
    }
  const south = { x: 20 * PARK_SCALE, z: 120 * PARK_SCALE };
  const out: Point[] = [];
  if (cands.length) out.push(cands.reduce((m, c) => (dist(c, south) < dist(m, south) ? c : m), cands[0]!));
  while (out.length < 4) {
    let best: Point | null = null;
    let bd = 0;
    for (const c of cands) {
      const d = Math.min(...out.map((o) => dist(o, c)));
      if (d > bd) {
        bd = d;
        best = c;
      }
    }
    if (!best || bd < 110) break;
    out.push(best);
  }
  if (!out.length) out.push({ x: 30, z: 200 });
  playSpots = out;
  return out.map((p) => ({ ...p, rot: playRot(p) }));
})();
/** O primeiro parquinho (perto do jardim do Sul). */
export const PLAYGROUND: Point = PLAYGROUNDS[0]!;

/** Carrinhos da praça (pipoca e água de coco): entre os bancos, fora das saídas dos caminhos. */
export function plazaCarts(): Array<{ x: number; z: number; face: number; kind: 'popcorn' | 'coconut' }> {
  const out: Array<{ x: number; z: number; face: number; kind: 'popcorn' | 'coconut' }> = [];
  for (let k = 0; k < 16 && out.length < 2; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8 + (k >= 8 ? Math.PI / 16 : 0);
    const x = Math.sin(a) * 12;
    const z = Math.cos(a) * 12;
    if (onPath(x, z, 2.5) || out.some((o) => Math.hypot(o.x - x, o.z - z) < 14)) continue;
    out.push({ x, z, face: a, kind: out.length ? 'coconut' : 'popcorn' });
  }
  return out;
}

/**
 * Brinquedos do parquinho, em volta do centro (PLAYGROUND), virados para a entrada: balanço de
 * três lugares, escorregador, gangorra, caixa de areia, cavalinho de mola e dois bancos para os pais.
 */
export const PLAY = {
  radius: 11,
  swings: { x: -5.5, z: -3.5, n: 3, gap: 1.4, top: 2.4, chain: 1.85 },
  slide: { x: 4.5, z: -5, h: 1.5, len: 3.4 },
  seesaw: { x: 4.5, z: 4, len: 3.6 },
  sand: { x: -5, z: 4.5, w: 4.2, d: 3.4 },
  spring: { x: 0, z: 0.5 },
  benches: [{ x: -1.5, z: 9.2, face: Math.PI }, { x: 2.5, z: 9.2, face: Math.PI }],
};

export const PLAY_ROT: number = PLAYGROUNDS[0]!.rot;
/** Ponto do parquinho `i` (coordenadas locais dos brinquedos) no mundo. */
export function playAt(lx: number, lz: number, i = 0): Point {
  const g = PLAYGROUNDS[i] ?? PLAYGROUNDS[0]!;
  const c = Math.cos(g.rot);
  const s = Math.sin(g.rot);
  return { x: g.x + lx * c + lz * s, z: g.z - lx * s + lz * c };
}
