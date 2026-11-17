/**
 * Circulação vertical dos prédios do Campus (seções 30 a 32 e a "Circulação" de cada prédio, 13 a
 * 27): o tipo da escada principal (reta, em L, em U, curva acompanhando o átrio ou a do núcleo) e
 * quantos elevadores; onde a escada fica (dentro da planta de todos os níveis que ela serve, ao lado
 * do saguão dos elevadores, fora do eixo da entrada, do vazio do meio e das salas); o vão em cada
 * laje e os trechos de guarda-corpo em volta dele; e o caminho de quem sobe ou desce, do pé da
 * escada num nível ao patamar de chegada no outro. O térreo alto (7 a 14 m) é vencido em trechos
 * de até 4,7 m, com patamares intermediários, sempre no mesmo desenho da escada.
 * Também: o núcleo dos elevadores (dentro do prédio, nos fundos, com o hall na frente das portas),
 * o recorte das lajes em volta do poço, e onde se pisa na escada (altura dos degraus e patamares
 * em cada ponto, o guarda-corpo e a troca de nível), para andar nela de verdade.
 * Só geometria pura (sem three.js): testável. Coordenadas locais do prédio (frente = +z).
 */
import type { ModuleId } from '@/app/modules';
import { FORMS, hasRoofTerrace, upperPlan, type Plan } from './forms';
import { MASSING, groundHeight, groundSpan, levelY, sideCut, topLevel, volsAt } from './massing';
import { boundOf, inVol, insideAt, segDist, spanZ, volPoly, type Pt, type Vol } from './outline';

export type StairKind = 'straight' | 'L' | 'U' | 'curved' | 'core';

/** Escada principal e número de elevadores de cada prédio. */
export interface Circulation {
  stair: StairKind | null;
  lifts: 0 | 1 | 2;
  /** Poço estreito de duas cabines (Notes e Focus, que tinham um elevador só): cabe onde cabia o de uma. */
  narrow?: boolean;
}

/**
 * Sentido de cada elevador nos prédios com dois: o da esquerda (x < 0, de quem olha as portas) só
 * sobe e o da direita só desce; com um elevador só, ele faz os dois sentidos.
 */
export type LiftDir = 'up' | 'down' | 'both';
export const liftDir = (i: number, count: number): LiftDir => (count < 2 ? 'both' : i === 0 ? 'up' : 'down');
/** O elevador de sentido `dir` para no nível `n` (de `count`): o que sobe não para no último; o que desce, no térreo. */
export const liftServes = (dir: LiftDir, n: number, count: number): boolean => count > 1 && n >= 0 && n < count && (dir === 'up' ? n < count - 1 : dir === 'down' ? n > 0 : true);
/** Andares que o elevador de sentido `dir` oferece a quem está no nível `cur`: só os de cima (sobe) ou só os de baixo (desce). */
export const liftTargets = (dir: LiftDir, cur: number, count: number): number[] => Array.from({ length: count }, (_, n) => n).filter((n) => n !== cur && (dir === 'up' ? n > cur : dir === 'down' ? n < cur : true));

/**
 * Programa de circulação (prompt, seções 13 a 27). Tasks e Projects não dizem a escada: U na torre
 * do Tasks (compacta, sobe ao terraço) e L no Projects (volumes deslocados). Focus: "reta ou em L"
 * (em L, que cabe atrás da galeria do mezanino). Habits: um pavimento só, sem escada nem elevador.
 * Insights (e Settings) sobem pela escada curva do núcleo; o Calendar, por uma curva acompanhando o
 * átrio (o núcleo dele fica fechado).
 */
export const CIRCULATION: Record<ModuleId, Circulation> = {
  academy: { stair: 'U', lifts: 2 },
  languages: { stair: 'L', lifts: 2 },
  notes: { stair: 'L', lifts: 2, narrow: true },
  library: { stair: 'U', lifts: 2 },
  inbox: { stair: 'L', lifts: 2 },
  calendar: { stair: 'curved', lifts: 2 },
  tasks: { stair: 'U', lifts: 2 },
  projects: { stair: 'L', lifts: 2 },
  focus: { stair: 'L', lifts: 2, narrow: true },
  habits: { stair: null, lifts: 0 },
  goals: { stair: 'U', lifts: 2 },
  insights: { stair: 'core', lifts: 2 },
  music: { stair: 'L', lifts: 2 },
  sports: { stair: 'straight', lifts: 2 },
  finance: { stair: 'U', lifts: 2 },
  dashboard: { stair: 'U', lifts: 2 },
  profile: { stair: 'U', lifts: 1 },
  settings: { stair: 'core', lifts: 1 },
};

/** Largura de cada lance, folga entre os lances, fundo do patamar e quanto o pé da escada fica fora do vão. */
export const LANE = 1.2;
const GAP = 0.15;
const LAND = 1.3;
const SPOT = 0.7;
/** Maior subida de um trecho (o térreo alto sobe em vários trechos, com patamares no meio). */
const MAX_RISE = 4.7;
const XA = -(LANE + GAP) / 2;
const XB = (LANE + GAP) / 2;
const HW = LANE + GAP / 2;

/** Ponto do caminho: x, z e a fração da subida do trecho (0 = embaixo, 1 = em cima). */
export type P3 = [x: number, z: number, h: number];

/** Lance: linha do meio (no plano) e a fração da subida no começo e no fim. */
export interface Flight {
  pts: Pt[];
  h0: number;
  h1: number;
}

/**
 * Uma fase do ciclo da escada (um trecho que sobe a altura de um andar ou parte do térreo alto). A
 * escada reta e a em L repetem a cada duas fases (a reta em tesoura, a em L em volta do vão do meio);
 * a em U e a curva da tesoura também começam e terminam nos mesmos patamares.
 */
export interface StairPhase {
  /** Caminho de quem sobe, do patamar de partida ao de chegada. */
  core: P3[];
  /** Onde se fica para subir (fora do vão, antes do patamar de partida). */
  foot: Pt;
  /** Onde se chega no nível de cima (fora do vão, depois do patamar de chegada). */
  head: Pt;
  flights: Flight[];
  /** Patamares intermediários (na metade da subida do trecho). */
  mids: Pt[][];
  /** Patamar de partida (no nível: parte da laje). */
  land: Pt[];
  /** Vão na laje do nível que parte desta fase (o contorno da escada menos o patamar). */
  hole: Pt[];
  /** Bordas do vão com guarda-corpo (as que dão para o piso; não as do patamar, por onde se entra). */
  rails: Array<[Pt, Pt]>;
}

export interface Stair {
  id: ModuleId;
  kind: Exclude<StairKind, 'core'>;
  /** Contorno da escada (o vão inteiro), no prédio. */
  well: Pt[];
  phases: StairPhase[];
  /** Altura do piso de cada nível servido (0 = térreo; o último pode ser o terraço da cobertura). */
  ys: number[];
  /** Trechos de cada nível até o de cima, e o índice do primeiro trecho de cada nível. */
  segs: number[];
  first: number[];
  /** Volumes que contêm a escada inteira (o vão é cortado na laje de cada um). */
  vols: Vol[];
}

const rect = (x0: number, x1: number, z0: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const turnPt = (p: Pt): Pt => [-p[0], -p[1]];
/** A mesma fase girada 180° (a fase seguinte da reta e da em L). */
function turn(p: StairPhase): StairPhase {
  return {
    core: p.core.map(([x, z, h]) => [-x, -z, h] as P3),
    foot: turnPt(p.foot),
    head: turnPt(p.head),
    flights: p.flights.map((f) => ({ pts: f.pts.map(turnPt), h0: f.h0, h1: f.h1 })),
    mids: p.mids.map((m) => m.map(turnPt)),
    land: p.land.map(turnPt),
    hole: p.hole.map(turnPt),
    rails: p.rails.map(([a, b]) => [turnPt(a), turnPt(b)] as [Pt, Pt]),
  };
}

/** Em U: sobe por um lance, vira no patamar do fundo e volta pelo outro, chegando ao lado de onde partiu. */
function shapeU(): { well: Pt[]; phases: StairPhase[] } {
  const f = 1.8;
  const e = f + LAND;
  const m = f + LAND / 2;
  return {
    well: rect(-HW, HW, -e, e),
    phases: [
      {
        core: [[XA, -m, 0], [XA, -f, 0], [XA, f, 0.5], [XA, m, 0.5], [XB, m, 0.5], [XB, f, 0.5], [XB, -f, 1], [XB, -m, 1]],
        foot: [XA, -(e + SPOT)],
        head: [XB, -(e + SPOT)],
        flights: [
          { pts: [[XA, -f], [XA, f]], h0: 0, h1: 0.5 },
          { pts: [[XB, f], [XB, -f]], h0: 0.5, h1: 1 },
        ],
        mids: [rect(-HW, HW, f, e)],
        land: rect(-HW, HW, -e, -f),
        hole: rect(-HW, HW, -f, e),
        rails: [[[HW, -f], [HW, e]], [[HW, e], [-HW, e]], [[-HW, e], [-HW, -f]]],
      },
    ],
  };
}

/** Reta: um lance por andar; o andar seguinte sobe pelo lance ao lado, no sentido contrário (em tesoura). */
function shapeStraight(): { well: Pt[]; phases: StairPhase[] } {
  const f = 3.6;
  const e = f + LAND;
  const m = f + LAND / 2;
  const p0: StairPhase = {
    core: [[XA, -m, 0], [XA, -f, 0], [XA, f, 1], [XA, m, 1]],
    foot: [XA, -(e + SPOT)],
    head: [XA, e + SPOT],
    flights: [{ pts: [[XA, -f], [XA, f]], h0: 0, h1: 1 }],
    mids: [],
    land: rect(-HW, HW, -e, -f),
    hole: rect(-HW, HW, -f, e),
    rails: [[[HW, -f], [HW, e]], [[HW, e], [-HW, e]], [[-HW, e], [-HW, -f]]],
  };
  return { well: rect(-HW, HW, -e, e), phases: [p0, turn(p0)] };
}

/** Em L: dois lances em ângulo reto por andar, em volta de um vão quadrado (a cada dois andares fecha a volta). */
function shapeL(): { well: Pt[]; phases: StairPhase[] } {
  const h = 3.0;
  const c = h - LANE / 2;
  const f = h - LANE;
  const p0: StairPhase = {
    core: [[-c, -c, 0], [-f, -c, 0], [f, -c, 0.5], [c, -c, 0.5], [c, -f, 0.5], [c, f, 1], [c, c, 1]],
    foot: [-(h + SPOT), -c],
    head: [c, h + SPOT],
    flights: [
      { pts: [[-f, -c], [f, -c]], h0: 0, h1: 0.5 },
      { pts: [[c, -f], [c, f]], h0: 0.5, h1: 1 },
    ],
    mids: [rect(f, h, -h, -f)],
    land: rect(-h, -f, -h, -f),
    hole: [[-f, -h], [h, -h], [h, h], [-h, h], [-h, -f], [-f, -f]],
    rails: [[[-f, -h], [h, -h]], [[h, -h], [h, h]], [[h, h], [-h, h]], [[-h, h], [-h, -f]]],
  };
  return { well: rect(-h, h, -h, h), phases: [p0, turn(p0)] };
}

/** Do local da escada (centro, giro) para o prédio. */
function place(cx: number, cz: number, rot: number): (p: Pt) => Pt {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return ([x, z]) => [cx + x * c + z * s, cz - x * s + z * c];
}
function moved(ph: StairPhase, f: (p: Pt) => Pt): StairPhase {
  return {
    core: ph.core.map(([x, z, h]) => {
      const [X, Z] = f([x, z]);
      return [X, Z, h] as P3;
    }),
    foot: f(ph.foot),
    head: f(ph.head),
    flights: ph.flights.map((fl) => ({ pts: fl.pts.map(f), h0: fl.h0, h1: fl.h1 })),
    mids: ph.mids.map((m) => m.map(f)),
    land: ph.land.map(f),
    hole: ph.hole.map(f),
    rails: ph.rails.map(([a, b]) => [f(a), f(b)] as [Pt, Pt]),
  };
}

/**
 * Curva acompanhando o átrio (Calendar): dois lances em arco, concêntricos ao prédio, um subindo por
 * fora e o seguinte voltando por dentro (tesoura curva); patamares nas duas pontas.
 */
function shapeArc(R0: number, A: number, sg: number): { well: Pt[]; phases: StairPhase[] } {
  const rI = R0 + LANE / 2;
  const rO = R0 + LANE + GAP + LANE / 2;
  const R1 = R0 + 2 * LANE + GAP;
  const fd = LAND / ((R0 + R1) / 2);
  const ff = 6.6 / rI;
  const B = A + sg * fd;
  const C = B + sg * ff;
  const E = C + sg * fd;
  const P = (r: number, a: number): Pt => [Math.sin(a) * r, Math.cos(a) * r];
  const arc = (r: number, a0: number, a1: number, n: number): Pt[] => Array.from({ length: n + 1 }, (_, k) => P(r, a0 + ((a1 - a0) * k) / n));
  const sector = (a0: number, a1: number): Pt[] => [...arc(R0, a0, a1, 12), ...arc(R1, a1, a0, 12)];
  const edges = (pts: Pt[]): Array<[Pt, Pt]> => pts.slice(1).map((p, k) => [pts[k]!, p] as [Pt, Pt]);
  const p3 = (p: Pt, h: number): P3 => [p[0], p[1], h];
  const n = 16;
  const p0: StairPhase = {
    core: [p3(P(rO, (A + B) / 2), 0), ...arc(rO, B, C, n).map((p, k) => p3(p, k / n)), p3(P(rO, (C + E) / 2), 1)],
    foot: P(rO, A - (sg * SPOT) / rO),
    head: P(rO, E + (sg * SPOT) / rO),
    flights: [{ pts: arc(rO, B, C, n), h0: 0, h1: 1 }],
    mids: [],
    land: sector(A, B),
    hole: sector(B, E),
    rails: [...edges(arc(R0, B, E, 12)), ...edges(arc(R1, B, E, 12)), [P(R0, E), P(R1, E)]],
  };
  const p1: StairPhase = {
    core: [p3(P(rI, (C + E) / 2), 0), ...arc(rI, C, B, n).map((p, k) => p3(p, k / n)), p3(P(rI, (A + B) / 2), 1)],
    foot: P(rI, E + (sg * SPOT) / rI),
    head: P(rI, A - (sg * SPOT) / rI),
    flights: [{ pts: arc(rI, C, B, n), h0: 0, h1: 1 }],
    mids: [],
    land: sector(C, E),
    hole: sector(A, C),
    rails: [...edges(arc(R0, A, C, 12)), ...edges(arc(R1, A, C, 12)), [P(R0, A), P(R1, A)]],
  };
  return { well: sector(A, E), phases: [p0, p1] };
}

/** Raio do vazio do meio dos andares de cima (o mesmo de floors.ts). */
export function voidRadius(id: ModuleId): number {
  const fp = upperPlan(FORMS[id]);
  const M = MASSING[id];
  return fp === 'atrium' || fp === 'garden' ? Math.max(3.2, M.void) : fp === 'core' ? Math.max(2.6, M.void) : 0;
}
const isRing = (fp: Plan) => fp === 'atrium' || fp === 'garden' || fp === 'core';

/**
 * Faixa das salas da planta em corredor (e da planta livre): de `zb` (fundos) a `zf` (frente). Atrás
 * de `zb` fica o saguão do elevador (a mesma conta do desenho das salas, em floors.ts).
 */
export function corridorBand(front: number, back: number): { zb: number; zf: number } {
  let zb = -back * 0.6;
  let zf = front - Math.max(1.5, front * 0.2);
  if (zf - zb < 6) {
    zb = -back + 4.5;
    zf = front - 1.2;
  }
  return { zb, zf };
}

/**
 * Poço dos elevadores por dentro: largura, fundo, o x de cada cabine (lado a lado, no eixo dos
 * fundos) e a largura da cabine. Com as paredes, o núcleo de duas cabines tem 3,9 m (o estreito,
 * 3,2 m; o de uma, 2,9 m): fica sempre dentro do eixo, aquém de onde a escada pode ficar (|x| ≥ 2 m).
 */
export function liftShaft(id: ModuleId): { w: number; d: number; xs: number[]; cw: number } {
  const c = CIRCULATION[id];
  if (c.lifts === 2 && c.narrow) return { w: 2.9, d: 1.9, xs: [-0.725, 0.725], cw: 1.25 };
  return c.lifts === 2 ? { w: 3.6, d: 1.9, xs: [-0.9, 0.9], cw: 1.55 } : { w: 2.6, d: 1.9, xs: [0], cw: 2.1 };
}

/** Espessura das paredes do poço, fundo e meia largura do hall na frente das portas. */
export const CORE_WALL = 0.15;
export const HALL_DEPTH = 2.0;
export const HALL_HALF = 1.9;

/**
 * Núcleo dos elevadores, dentro do prédio: o poço (paredes incluídas) de x0 a x1 e de z0 (fundos)
 * a z1 (frente, com as portas), encostado na parede dos fundos em x = 0, e o hall na frente das
 * portas até `hall`. O mesmo em todos os níveis (do térreo ao terraço).
 */
export interface LiftCore {
  w: number;
  d: number;
  xs: number[];
  cw: number;
  t: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Centro do poço (z), onde ficam as cabines. */
  tz: number;
  /** Até onde vai o hall na frente das portas (z). */
  hall: number;
}

const cores = new Map<ModuleId, LiftCore | null>();

/** O núcleo dos elevadores do prédio (null: sem elevador, Habits, ou sem andar em cima). */
export function liftCore(id: ModuleId): LiftCore | null {
  if (cores.has(id)) return cores.get(id) ?? null;
  const c = placeCore(id);
  cores.set(id, c);
  return c;
}

/**
 * O mais nos fundos possível em x = 0 em que o núcleo cabe na planta de todos os níveis (12 cm
 * da fachada) e o hall na frente das portas também (30 cm): onde o andar de cima é mais raso que
 * o térreo (Inbox, Goals, Projects), o núcleo sobe por dentro do volume mais alto.
 */
function placeCore(id: ModuleId): LiftCore | null {
  const top = topLevel(id);
  if (CIRCULATION[id].lifts === 0 || top < 1) return null;
  const s = liftShaft(id);
  const t = CORE_WALL;
  const x1 = s.w / 2 + t;
  const D = s.d + 2 * t;
  const levels = Array.from({ length: top + 1 }, (_, L) => volsAt(id, L));
  const fits = (z0: number): boolean => {
    const z1 = z0 + D;
    const box: Pt[] = [[-x1, z0], [x1, z0], [0, z0], [-x1, z1], [x1, z1], [-x1, (z0 + z1) / 2], [x1, (z0 + z1) / 2]];
    const hall: Pt[] = [[-HALL_HALF, z1 + HALL_DEPTH], [HALL_HALF, z1 + HALL_DEPTH], [0, z1 + HALL_DEPTH], [-HALL_HALF, z1 + 1], [HALL_HALF, z1 + 1]];
    return levels.every((v) => box.every(([x, z]) => insideAt(v, x, z, 0.12)) && hall.every(([x, z]) => insideAt(v, x, z, 0.3)));
  };
  const B = Math.ceil(boundOf(levels[0] ?? []) * 20) / 20;
  let z0 = NaN;
  for (let k = 0; -B + k * 0.05 < 0; k++) {
    if (!fits(-B + k * 0.05)) continue;
    z0 = -B + k * 0.05;
    break;
  }
  if (!Number.isFinite(z0)) z0 = -spanZ(levels[top] ?? [], 0).back + 0.12;
  z0 = Math.round(z0 * 100) / 100;
  const z1 = z0 + D;
  return { w: s.w, d: s.d, xs: s.xs, cw: s.cw, t, x0: -x1, x1, z0, z1, tz: z0 + t + s.d / 2, hall: z1 + HALL_DEPTH };
}

/** Dentro do núcleo dos elevadores (paredes incluídas), ou a menos de `m` m dele. */
export const inLiftCore = (c: LiftCore | null, x: number, z: number, m = 0): boolean => !!c && x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m;
/** No hall na frente das portas (ou a menos de `m` m dele). */
export const inLiftHall = (c: LiftCore | null, x: number, z: number, m = 0): boolean => !!c && Math.abs(x) < HALL_HALF + m && z >= c.z1 && z < c.hall + m;

/** Retângulo no plano (o núcleo, para recortar as lajes). */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Parte de um polígono convexo onde a·x + b·z ≤ c. */
function cutHalf(pts: readonly Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const fp = a * p[0] + b * p[1] - c;
    const fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if (fp <= 0 !== fq <= 0) {
      const k = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
    }
  }
  return out;
}

/** Área de um polígono. */
export function polyArea(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}

/**
 * Laje de um volume (polígono convexo, com os seus furos) sem o retângulo `box` (o poço dos
 * elevadores, por onde a cabine passa): o retângulo inteiro dentro vira mais um furo; cortando a
 * borda do volume, a laje vira pedaços em volta dele (à esquerda, à direita, na frente e atrás),
 * cada furo no pedaço que o contém; sem tocar, fica como está.
 */
export function carve(poly: Pt[], holes: Pt[][], box: Box): Array<{ pts: Pt[]; holes: Pt[][] }> {
  const whole = [{ pts: poly, holes }];
  const mid = cutHalf(cutHalf(poly, -1, 0, -box.x0), 1, 0, box.x1);
  const inner = cutHalf(cutHalf(mid, 0, -1, -box.z0), 0, 1, box.z1);
  if (inner.length < 3 || polyArea(inner) < 1e-3) return whole;
  const rect: Pt[] = [[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]];
  // Já dentro de um furo (a torre que sobe do meio do embasamento): nada a recortar.
  if (holes.some((h) => rect.every(([x, z]) => inPoly(h, x, z)))) return whole;
  if (polyArea(inner) > polyArea(rect) - 1e-3) return [{ pts: poly, holes: [...holes, rect] }];
  const pieces = [cutHalf(poly, 1, 0, box.x0), cutHalf(poly, -1, 0, -box.x1), cutHalf(mid, 0, -1, -box.z1), cutHalf(mid, 0, 1, box.z0)]
    .filter((p) => p.length >= 3 && polyArea(p) > 1e-3)
    .map((pts) => ({ pts, holes: [] as Pt[][] }));
  for (const h of holes) {
    const home = pieces.find((p) => h.every(([x, z]) => inPoly(p.pts, x, z) || polyDist(p.pts, x, z) < 1e-6));
    if (!home) return whole;
    home.holes.push(h);
  }
  return pieces;
}

/** Número de níveis servidos (térreo, andares e o terraço da cobertura, quando há). */
export const levelCount = (id: ModuleId): number => (topLevel(id) > 0 ? topLevel(id) + 1 + (hasRoofTerrace(id) ? 1 : 0) : 1);

/** Trechos de cada nível até o de cima (o térreo alto em vários) e o primeiro de cada nível. */
function segments(id: ModuleId): { ys: number[]; segs: number[]; first: number[] } {
  const n = levelCount(id);
  const ys = Array.from({ length: n }, (_, L) => levelY(id, L));
  const segs = ys.slice(0, -1).map((y, L) => Math.max(1, Math.ceil(((ys[L + 1] ?? y) - y) / MAX_RISE - 1e-6)));
  const first: number[] = [];
  let acc = 0;
  for (let L = 0; L < n; L++) {
    first.push(acc);
    acc += segs[L] ?? 0;
  }
  return { ys, segs, first };
}

/** Ponto dentro do polígono (par-ímpar). */
export function inPoly(pts: readonly Pt[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]!;
    const [xj, zj] = pts[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** Distância até o contorno do polígono. */
function polyDist(pts: readonly Pt[], x: number, z: number): number {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, segDist(x, z, pts[j]![0], pts[j]![1], pts[i]![0], pts[i]![1]));
  return d;
}
/** Dentro do vão da escada, ou a menos de `m` m dele. */
export function inWell(st: Stair | null, x: number, z: number, m = 0): boolean {
  if (!st) return false;
  return inPoly(st.well, x, z) || (m > 0 && polyDist(st.well, x, z) < m);
}

/** Fase que parte do nível `L` (o patamar e o vão daquele nível). */
export const phaseAt = (st: Stair, L: number): StairPhase => st.phases[(st.first[L] ?? 0) % st.phases.length]!;

/** Vão da escada na laje do nível `L` (L ≥ 1); a laje do térreo não tem. */
export function stairHole(st: Stair | null, L: number): Pt[] | null {
  if (!st || L < 1 || L >= st.ys.length) return null;
  return phaseAt(st, L).hole;
}

/** Pé da escada para subir (nível de baixo) e chegada de quem desce (nível de cima), em cada nível. */
export function stairSpots(st: Stair, L: number): { up: Pt | null; down: Pt | null } {
  const n = st.ys.length;
  const P = st.phases.length;
  const up = L < n - 1 ? phaseAt(st, L).foot : null;
  const down = L >= 1 ? st.phases[((st.first[L] ?? 0) - 1 + P) % P]!.head : null;
  return { up, down };
}

/**
 * Caminho de quem sobe do nível `L` ao `L + 1` (ou desce do `L` ao `L − 1`): x, y (piso) e z de
 * cada ponto, do pé da escada ao ponto de chegada, passando pelos patamares.
 */
export function stairPath(st: Stair, L: number, up: boolean): number[] {
  const from = up ? L : L - 1;
  const y0 = st.ys[from];
  const y1 = st.ys[from + 1];
  if (y0 === undefined || y1 === undefined) return [];
  const k = st.segs[from] ?? 1;
  const r = (y1 - y0) / k;
  const P = st.phases.length;
  const pts: number[] = [];
  const f0 = phaseAt(st, from).foot;
  pts.push(f0[0], y0, f0[1]);
  let last: StairPhase = phaseAt(st, from);
  for (let j = 0; j < k; j++) {
    last = st.phases[((st.first[from] ?? 0) + j) % P]!;
    for (const [x, z, h] of last.core) pts.push(x, y0 + (j + h) * r, z);
  }
  pts.push(last.head[0], y1, last.head[1]);
  if (up) return pts;
  const out: number[] = [];
  for (let i = pts.length - 3; i >= 0; i -= 3) out.push(pts[i]!, pts[i + 1]!, pts[i + 2]!);
  return out;
}

/**
 * Caminho da escada em caracol do núcleo (Insights, Settings): da porta do núcleo (à esquerda dela)
 * para dentro, uma volta subindo em torno do pilar, e para fora pela mesma porta (à direita).
 */
export function corePath(r: number, y0: number, y1: number): number[] {
  const rr = (r - 0.3) / 2 + 0.1;
  const turnA = Math.PI * 2 * (17 / 18);
  const pts: number[] = [-0.5, y0, r + 1.0, -0.2, y0, r - 0.2];
  const n = 36;
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const a = -0.4 - u * turnA;
    pts.push(Math.sin(a) * rr, y0 + u * (y1 - y0), Math.cos(a) * rr);
  }
  pts.push(0.2, y1, r - 0.2, 0.5, y1, r + 1.0);
  return pts;
}
/** Os dois lugares da porta do núcleo: subir (esquerda) e descer (direita). */
export const coreSpots = (r: number): { up: Pt; down: Pt } => ({ up: [-0.5, r + 1.0], down: [0.5, r + 1.0] });
/** Primeiro nível servido pela escada do núcleo (o térreo do Insights já tem o núcleo com a escada). */
export const coreFrom = (id: ModuleId): number => (id === 'insights' ? 0 : 1);

const cache = new Map<ModuleId, Stair | null>();

/** A escada principal do prédio (null: sem escada própria, Habits, ou a do núcleo). */
export function stairOf(id: ModuleId): Stair | null {
  if (cache.has(id)) return cache.get(id) ?? null;
  const st = build(id);
  cache.set(id, st);
  return st;
}

function build(id: ModuleId): Stair | null {
  const kind = CIRCULATION[id].stair;
  const top = topLevel(id);
  if (!kind || kind === 'core' || top < 1) return null;
  const sg = segments(id);
  if (kind === 'curved') {
    // Em volta do meio, no tambor que sobe até o último andar, à esquerda dos fundos (o saguão dos
    // elevadores fica no eixo, à direita dela).
    const drum = volsAt(id, top).find((v) => v.kind === 'circle' && inVol(v, 0, 0, 1) && (v.lo ?? 0) === 0);
    if (!drum || drum.kind !== 'circle') return null;
    const R0 = drum.r - 6.3;
    const { well, phases } = shapeArc(R0, Math.PI + Math.asin(2.3 / R0), 1);
    return { id, kind, well, phases, ...sg, vols: holding(id, well) };
  }
  const local = kind === 'U' ? shapeU() : kind === 'L' ? shapeL() : shapeStraight();
  // No mezanino (planta 'side'), a frente da escada dá para o pé-direito alto: o caminho até o
  // outro lado dela passa entre ela e o núcleo dos elevadores, que precisa de folga (CORE_GAP);
  // encostada no núcleo, o guarda-corpo e a parede dele fechavam a passagem (no Projects, o 2º
  // andar ficava sem chegar à escada). Onde não cabe com folga (Focus), mais perto, como antes. Nas
  // outras plantas a escada fica onde estava (o caminho até ela é pela frente).
  let at: { cx: number; cz: number; rot: number } | null = null;
  for (const gap of upperPlan(FORMS[id]) === 'side' ? [CORE_GAP, 0.6, 0] : [0]) {
    at = search(id, local, sg, 1.6, 1.7, gap) ?? search(id, local, sg, 0.45, 1.7, gap) ?? search(id, local, sg, 0.45, 0.6, gap);
    if (at) break;
  }
  if (!at) return null;
  const f = place(at.cx, at.cz, at.rot);
  const well = local.well.map(f);
  return { id, kind, well, phases: local.phases.map((p) => moved(p, f)), ...sg, vols: holding(id, well) };
}

/**
 * Folga entre a escada e o núcleo dos elevadores (m): 0,3 m de guarda-corpo, 0,3 m da parede do
 * núcleo e meio metro de passagem entre os dois.
 */
export const CORE_GAP = 1.1;

/** Volumes de qualquer nível que contêm a escada inteira (o vão corta a laje de cada um). */
function holding(id: ModuleId, well: readonly Pt[]): Vol[] {
  return MASSING[id].vols.filter((v) => v.hi >= 1 && well.every(([x, z]) => inVol(v, x, z, 0.05)));
}

/** Pontos de amostra do contorno e do miolo de um polígono local (lados de até `step`). */
function samples(well: readonly Pt[], step = 0.6): Pt[] {
  const out: Pt[] = [];
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of well) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) out.push([x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz]);
  return out;
}

const wrapPi = (a: number) => Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI));

/**
 * Lugar da escada: a mais perto do saguão dos elevadores (fundos, no eixo) que cumpre tudo: dentro
 * do mesmo volume em todos os níveis (com `wall` m de folga das paredes: de preferência 1,6 m, que
 * deixa passagem e as estantes junto às paredes livres), sem cruzar a borda de outro volume
 * (o vão corta a laje de quem a contém inteira), fora do eixo da entrada e da ponte do elevador, do
 * vazio do meio (e do corredor do meio), do pé-direito alto (mezanino) e da frente, de
 * preferência atrás da faixa das salas (planta em corredor); o pé e a chegada de cada nível no
 * piso livre; nos anéis, nos fundos (na abertura do anel). `clear`: folga do vazio do meio; `gap`:
 * folga do núcleo dos elevadores (passagem entre ele e a escada).
 */
function search(id: ModuleId, local: { well: Pt[]; phases: StairPhase[] }, sg: { ys: number[]; first: number[] }, wall: number, clear: number, gap = 0): { cx: number; cz: number; rot: number } | null {
  const top = topLevel(id);
  const fp = upperPlan(FORMS[id]);
  // Longe do eixo: da ponte do elevador e da entrada (x = 0) e, nas plantas em corredor, do corredor do meio.
  const axis = Math.max(2.0, (fp === 'corridor' ? 1.6 : fp === 'open' ? 2.4 : 0) + 0.2);
  const inner = voidRadius(id);
  const g0 = volsAt(id, 0);
  const span0 = groundSpan(id);
  const back1 = spanZ(volsAt(id, 1), 0).back;
  const levels = Array.from({ length: top + 1 }, (_, L) => volsAt(id, L));
  const H = MASSING[id].ground;
  // Núcleo dos elevadores (dentro do prédio): nem a escada nem o pé e a chegada dela caem nele.
  const core = liftCore(id);
  // Folga do saguão dos elevadores junto à parede dos fundos do térreo (a mesma de antes do núcleo
  // ir para dentro do prédio: a escada de cada prédio fica onde estava).
  // (O poço estreito de duas cabines do Notes e do Focus guarda a folga do de uma: a escada não muda.)
  const portal = CIRCULATION[id].lifts > 1 && !CIRCULATION[id].narrow ? 3.2 : 2.05;
  const zv = Array.from({ length: top + 1 }, (_, L) => (L > 0 && fp === 'side' ? sideCut(id, L) : Infinity));
  const zb = Array.from({ length: top + 1 }, (_, L) => {
    if (L === 0 || (fp !== 'corridor' && fp !== 'open')) return Infinity;
    const s = spanZ(levels[L]!, 0);
    return corridorBand(s.front, s.back).zb;
  });
  const S = samples(local.well);
  const corners = local.well;
  const n = sg.ys.length;
  // Pés e chegadas que cada nível usa (na fase daquele nível).
  const P = local.phases.length;
  const spots: Array<{ L: number; p: Pt }> = [];
  for (let L = 0; L < n; L++) {
    if (L < n - 1) spots.push({ L, p: local.phases[(sg.first[L] ?? 0) % P]!.foot });
    if (L >= 1) spots.push({ L, p: local.phases[((sg.first[L] ?? 0) - 1 + P) % P]!.head });
  }
  // Grade de 0,25 m alinhada na origem.
  const B = Math.ceil(boundOf(g0) * 4) / 4;
  const backVols = levels[top]!.filter((v) => (v.lo ?? 0) === 0);
  let best: { cx: number; cz: number; rot: number } | null = null;
  let bestScore = Infinity;
  const tmp: Pt[] = S.map(() => [0, 0] as Pt);
  // Centros candidatos (grade de 0,25 m) do mais perto ao mais longe do saguão dos elevadores: o
  // primeiro que serve (com a penalidade da faixa das salas) encerra a busca.
  const centres: Array<[near: number, cx: number, cz: number]> = [];
  for (let cx = -B; cx <= B; cx += 0.25) for (let cz = -B; cz <= Math.min(B, span0.front * 0.5); cz += 0.25) centres.push([Math.hypot(cx, cz + back1 - 3), cx, cz]);
  centres.sort((a, b) => a[0] - b[0]);
  const rots = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((r) => [r, Math.cos(r), Math.sin(r)] as const);
  for (const [near, cx, cz] of centres) {
    if (near >= bestScore) break;
    for (const [rot, c, s] of rots) {
      const W = (p: Pt): Pt => [cx + p[0] * c + p[1] * s, cz - p[0] * s + p[1] * c];
      // Rápido: os cantos dentro de um volume que vai do térreo ao último andar.
      const wc = corners.map(W);
      // Na planta em corredor, de preferência atrás das salas (a escada que entra na faixa delas tira o lugar de salas).
      const zTop = Math.max(...wc.map((p) => p[1]));
      const score = near + 2 * Math.max(0, ...zb.map((b) => zTop - b));
      if (score >= bestScore) continue;
      const v = backVols.find((u) => wc.every(([x, z]) => inVol(u, x, z, wall)));
      if (!v) continue;
      if (wc.some(([x, z]) => Math.abs(x) < axis || z > span0.front - 5)) continue;
      S.forEach((p, i) => {
        const q = tmp[i]!;
        q[0] = cx + p[0] * c + p[1] * s;
        q[1] = cz - p[0] * s + p[1] * c;
      });
      if (!ok(tmp, v)) continue;
      if (!spots.every(({ L, p }) => spotOk(L, W(p)))) continue;
      if (isRing(fp)) {
        const all = [...tmp, ...spots.map(({ p }) => W(p))];
        if (all.some(([x, z]) => Math.abs(wrapPi(Math.atan2(x, z))) > 1.7)) continue;
      }
      best = { cx, cz, rot };
      bestScore = score;
    }
  }
  return best;

  function ok(pts: readonly Pt[], v: Vol): boolean {
    for (const [x, z] of pts) {
      if (!inVol(v, x, z, wall)) return false;
      if (Math.abs(x) < axis) return false;
      // Junto à parede dos fundos do térreo: livre o saguão dos elevadores; nunca no núcleo deles.
      if (z < -(span0.back - 2.5) && Math.abs(x) < portal) return false;
      if (inLiftCore(core, x, z, gap)) return false;
      if (inner && Math.hypot(x, z) < inner + clear) return false;
      for (let L = 1; L <= top; L++) if (z > zv[L]! - 0.45) return false;
    }
    // Outro volume no mesmo nível: ou contém a escada inteira (o vão corta a laje dele também) ou
    // não toca nela. No térreo, um volume mais baixo que contém o da escada já tem o furo dela.
    for (let L = 0; L <= top; L++)
      for (const u of levels[L]!) {
        if (u === v) continue;
        const hits = pts.filter(([x, z]) => inVol(u, x, z)).length;
        if (!hits) continue;
        if (hits === pts.length && pts.every(([x, z]) => inVol(u, x, z, 0.05))) continue;
        if (L === 0 && groundHeight(id, u) < H && volPoly(v).every(([x, z]) => inVol(u, x, z, 0.05))) continue;
        return false;
      }
    return true;
  }
  function spotOk(L: number, [x, z]: Pt): boolean {
    const Lv = Math.min(L, top);
    if (!insideAt(levels[Lv]!, x, z, 0.5)) return false;
    if (inLiftCore(core, x, z, 0.4)) return false;
    if (inner && Math.hypot(x, z) < inner + Math.min(0.8, clear)) return false;
    if (L >= 1 && L <= top && z > zv[L]! - 0.6) return false;
    return true;
  }
}

/**
 * Abertura do anel de salas (plantas em anel): o saguão dos fundos (π ± 0,5) e, quando a escada fica
 * nos fundos, ela inteira com o pé e a chegada de cada nível. Ângulos de atan2(x, z).
 */
export function ringGap(st: Stair | null): [number, number] {
  let lo = -0.5;
  let hi = 0.5;
  if (st) {
    const pts: Pt[] = [...st.well];
    for (let L = 0; L < st.ys.length; L++) {
      const s = stairSpots(st, L);
      if (s.up) pts.push(s.up);
      if (s.down) pts.push(s.down);
    }
    for (const [x, z] of pts) {
      const d = wrapPi(Math.atan2(x, z));
      lo = Math.min(lo, d - 0.1);
      hi = Math.max(hi, d + 0.1);
    }
  }
  return [Math.PI + lo, Math.PI + hi];
}

/* ---------- Andar na escada (seção 30): onde se pisa, o guarda-corpo e a troca de nível ---------- */

/** Bordas do polígono `pts` que caem no contorno da escada (dão para fora dela). */
export function contourEdges(pts: readonly Pt[], well: readonly Pt[]): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j]!;
    const c = pts[i]!;
    if (polyDist(well, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2) < 0.03) out.push([a, c]);
  }
  return out;
}

/**
 * Por onde se chega à escada no nível `L`: o pé (subir), a chegada (descer) e, na frente de cada
 * borda do patamar que dá para o piso (por onde se entra), o ponto a 0,6 m dela. Salas, móveis,
 * plantas e placas ficam longe destes pontos (floors.ts), para nada travar o caminho até a escada.
 */
export function stairApproach(st: Stair, L: number): Pt[] {
  const s = stairSpots(st, L);
  const out: Pt[] = [];
  if (s.up) out.push(s.up);
  if (s.down) out.push(s.down);
  const land = phaseAt(st, Math.max(0, Math.min(L, st.ys.length - 1))).land;
  const cx = land.reduce((a, p) => a + p[0], 0) / land.length;
  const cz = land.reduce((a, p) => a + p[1], 0) / land.length;
  for (const [a, c] of contourEdges(land, st.well)) {
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (l < 0.3) continue;
    const mx = (a[0] + c[0]) / 2;
    const mz = (a[1] + c[1]) / 2;
    let nx = (c[1] - a[1]) / l;
    let nz = -(c[0] - a[0]) / l;
    if ((mx - cx) * nx + (mz - cz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    out.push([mx + nx * 0.6, mz + nz * 0.6]);
  }
  return out;
}

/** Meia largura do lance onde cabe o centro do corpo (o resto é o corpo até o guarda-corpo). */
export const TREAD_HALF = LANE / 2 - 0.2;
/** Folga do corpo até o guarda-corpo de um patamar no meio da subida. */
const PAD = 0.2;
/** Quanto o piso da escada pode estar acima ou abaixo dos pés para ser alcançado num passo. */
export const STEP_REACH = 0.6;

/**
 * Onde se pisa na escada: o lance (faixa ao longo da linha do meio, subindo de `ya` a `yb`) ou o
 * patamar (polígono na altura `y`). O patamar de cada nível (`open`) faz parte da laje: as bordas
 * dele no contorno da escada dão para o piso; os patamares do meio da subida têm guarda-corpo.
 */
export type Tread = { kind: 'flight'; pts: Pt[]; ya: number; yb: number } | { kind: 'pad'; pts: Pt[]; y: number; open: boolean };

/** Lances e patamares da escada inteira, do térreo ao último nível (o mesmo desenho de vertical.ts). */
export function stairTreads(st: Stair): Tread[] {
  const out: Tread[] = [];
  const P = st.phases.length;
  for (let L = 0; L + 1 < st.ys.length; L++) {
    const y0 = st.ys[L]!;
    const k = st.segs[L] ?? 1;
    const r = (st.ys[L + 1]! - y0) / k;
    for (let j = 0; j < k; j++) {
      const ph = st.phases[((st.first[L] ?? 0) + j) % P]!;
      const ys = y0 + j * r;
      for (const f of ph.flights) out.push({ kind: 'flight', pts: f.pts, ya: ys + f.h0 * r, yb: ys + f.h1 * r });
      for (const m of ph.mids) out.push({ kind: 'pad', pts: m, y: ys + 0.5 * r, open: false });
      if (j > 0) out.push({ kind: 'pad', pts: ph.land, y: ys, open: false });
    }
  }
  for (let L = 0; L < st.ys.length; L++) out.push({ kind: 'pad', pts: phaseAt(st, L).land, y: st.ys[L]!, open: true });
  return out;
}

/** Ponto de uma linha mais perto de (x, z): a distância e a fração do comprimento até ele (0 a 1). */
export function alongLine(pts: readonly Pt[], x: number, z: number): { d: number; t: number } {
  let best = Infinity;
  let at = 0;
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const c = pts[i + 1]!;
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const l = Math.sqrt(l2);
    const u = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
    const d = Math.hypot(a[0] + dx * u - x, a[1] + dz * u - z);
    if (d < best) {
      best = d;
      at = acc + u * l;
    }
    acc += l;
  }
  return { d: best, t: acc > 0 ? at / acc : 0 };
}

/**
 * Altura do piso da escada em (x, z) para quem está com os pés em `y`: dos lances e patamares que
 * passam por ali (em cada pavimento há um em cima do outro), o mais perto dos pés, se dá para
 * alcançá-lo num passo. null: ali não se pisa (vão, guarda-corpo, debaixo do lance).
 */
export function treadY(st: Stair, treads: readonly Tread[], x: number, z: number, y: number): number | null {
  let best: number | null = null;
  let bd = STEP_REACH;
  for (const t of treads) {
    let h: number;
    if (t.kind === 'flight') {
      const a = alongLine(t.pts, x, z);
      if (a.d > TREAD_HALF) continue;
      h = t.ya + (t.yb - t.ya) * a.t;
    } else {
      if (!inPoly(t.pts, x, z)) continue;
      if (!t.open && polyDist(st.well, x, z) < PAD) continue;
      h = t.y;
    }
    const dd = Math.abs(h - y);
    if (dd <= bd) {
      bd = dd;
      best = h;
    }
  }
  return best;
}

/**
 * Fora da escada, junto do contorno dela (a menos de `m` m), no nível `L`: só se passa de frente
 * para uma borda do patamar daquele nível que dá para o piso (por onde se entra na escada); o resto
 * é guarda-corpo (do vão na laje, ou dos lados do lance no térreo).
 */
export function stairEdge(st: Stair, L: number, x: number, z: number, m = 0.3): boolean {
  if (inPoly(st.well, x, z) || polyDist(st.well, x, z) >= m) return false;
  const land = phaseAt(st, Math.max(0, Math.min(L, st.ys.length - 1))).land;
  return !contourEdges(land, st.well).some(([a, c]) => {
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) return false;
    const s = ((x - a[0]) * dx + (z - a[1]) * dz) / l;
    return s >= -0.05 && s <= l + 0.05 && segDist(x, z, a[0], a[1], c[0], c[1]) < m + 0.05;
  });
}

/** Escada em caracol do núcleo: começa no ângulo CORE_START e sobe o andar inteiro em CORE_SWEEP. */
export const CORE_START = -0.4;
export const CORE_SWEEP = Math.PI * 2 - 0.75;
/** Meia abertura (rad) da porta do núcleo, na frente (ângulo 0). */
export const CORE_DOOR = 0.35;
const TAU = Math.PI * 2;

/**
 * Altura do piso do caracol (núcleo de raio `r`; `ys` = níveis servidos, de baixo para cima) em
 * (x, z) para quem está com os pés em `y`. Entre a porta e o começo da volta fica o patamar de
 * cada nível (onde a volta de baixo chega e a de cima começa); na volta, a altura sobe com o
 * ângulo. null: no pilar, na parede (fora da porta) ou longe demais dos pés.
 */
export function coreY(r: number, ys: readonly number[], x: number, z: number, y: number): number | null {
  const rho = Math.hypot(x, z);
  if (rho >= r || rho < 0.45) return null;
  const a = Math.atan2(x, z);
  const door = Math.abs(a) < CORE_DOOR - 0.12;
  if (rho > r - 0.5 && !door) return null;
  const s = (((CORE_START - a) % TAU) + TAU) % TAU;
  const flat = rho > r - 0.5 || s > CORE_SWEEP;
  let best: number | null = null;
  let bd = STEP_REACH;
  const n = flat ? ys.length : ys.length - 1;
  for (let k = 0; k < n; k++) {
    const h = flat ? ys[k]! : ys[k]! + (s / CORE_SWEEP) * (ys[k + 1]! - ys[k]!);
    const dd = Math.abs(h - y);
    if (dd <= bd) {
      bd = dd;
      best = h;
    }
  }
  return best;
}

/** Na porta do núcleo (por onde se entra no caracol), no ângulo. */
export const coreDoor = (x: number, z: number): boolean => Math.abs(Math.atan2(x, z)) < CORE_DOOR - 0.12;

/**
 * Escada onde se anda: `zone` diz se o ponto é da escada (aí ela decide tudo); `floorAt` dá a
 * altura do piso dela perto dos pés (null: não se pisa ali); `edge` diz, fora dela e no nível
 * `L`, se o ponto é guarda-corpo (só se entra pelo patamar).
 */
export interface StairWalk {
  zone: (x: number, z: number, y: number) => boolean;
  floorAt: (x: number, z: number, y: number) => number | null;
  edge: (L: number, x: number, z: number) => boolean;
}

/** A escada principal como lugar onde se anda. */
export function stairWalk(st: Stair): StairWalk {
  const treads = stairTreads(st);
  return {
    zone: (x, z) => inPoly(st.well, x, z),
    floorAt: (x, z, y) => treadY(st, treads, x, z, y),
    edge: (L, x, z) => stairEdge(st, L, x, z),
  };
}

/** O caracol do núcleo (raio `r`) como lugar onde se anda, nos níveis `ys` (do primeiro servido ao último). */
export function coreWalk(r: number, ys: readonly number[]): StairWalk {
  const lo = (ys[0] ?? 0) - 0.6;
  return {
    zone: (x, z, y) => y > lo && Math.hypot(x, z) < r,
    floorAt: (x, z, y) => coreY(r, ys, x, z, y),
    edge: () => false,
  };
}

/**
 * Nível em que se está pela altura dos pés (`ys` = piso de cada nível), a partir do atual: troca
 * ao passar da metade da subida entre dois níveis (com `hyst` m de folga, para não ficar trocando
 * para lá e para cá parado no meio do lance).
 */
export function levelAtHeight(ys: readonly number[], y: number, cur: number, hyst = 0.15): number {
  if (!ys.length) return 0;
  let L = Math.max(0, Math.min(ys.length - 1, cur));
  while (L + 1 < ys.length && y > (ys[L]! + ys[L + 1]!) / 2 + hyst) L++;
  while (L > 0 && y < (ys[L - 1]! + ys[L]!) / 2 - hyst) L--;
  return L;
}
