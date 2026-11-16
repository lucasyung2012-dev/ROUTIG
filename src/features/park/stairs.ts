/**
 * Circulação vertical dos prédios do Campus (seções 30 a 32 e a "Circulação" de cada prédio, 13 a
 * 27): o tipo da escada principal (reta, em L, em U, curva acompanhando o átrio ou a do núcleo) e
 * quantos elevadores; onde a escada fica (dentro da planta de todos os níveis que ela serve, ao lado
 * do saguão dos elevadores, fora do eixo da entrada, do vazio do meio e das salas); o vão em cada
 * laje e os trechos de guarda-corpo em volta dele; e o caminho de quem sobe ou desce, do pé da
 * escada num nível ao patamar de chegada no outro. O térreo alto (7 a 14 m) é vencido em trechos
 * de até 4,7 m, com patamares intermediários, sempre no mesmo desenho da escada.
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
}

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
  notes: { stair: 'L', lifts: 1 },
  library: { stair: 'U', lifts: 2 },
  inbox: { stair: 'L', lifts: 2 },
  calendar: { stair: 'curved', lifts: 2 },
  tasks: { stair: 'U', lifts: 2 },
  projects: { stair: 'L', lifts: 2 },
  focus: { stair: 'L', lifts: 1 },
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

/** Poço dos elevadores: largura e o x de cada cabine (lado a lado, no eixo dos fundos). */
export function liftShaft(id: ModuleId): { w: number; d: number; xs: number[] } {
  const n = CIRCULATION[id].lifts;
  return n === 2 ? { w: 5.0, d: 2.7, xs: [-1.25, 1.25] } : { w: 2.7, d: 2.7, xs: [0] };
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
  const at = search(id, local, sg, 1.6, 1.7) ?? search(id, local, sg, 0.45, 1.7) ?? search(id, local, sg, 0.45, 0.6);
  if (!at) return null;
  const f = place(at.cx, at.cz, at.rot);
  const well = local.well.map(f);
  return { id, kind, well, phases: local.phases.map((p) => moved(p, f)), ...sg, vols: holding(id, well) };
}

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
 * piso livre; nos anéis, nos fundos (na abertura do anel). `clear`: folga do vazio do meio.
 */
function search(id: ModuleId, local: { well: Pt[]; phases: StairPhase[] }, sg: { ys: number[]; first: number[] }, wall: number, clear: number): { cx: number; cz: number; rot: number } | null {
  const top = topLevel(id);
  const fp = upperPlan(FORMS[id]);
  // Longe do eixo: da ponte do elevador e da entrada (x = 0) e, nas plantas em corredor, do corredor do meio.
  const axis = Math.max(2.0, (fp === 'corridor' ? 1.6 : fp === 'open' ? 2.4 : 0) + 0.2);
  const inner = voidRadius(id);
  const g0 = volsAt(id, 0);
  const span0 = groundSpan(id);
  const back1 = spanZ(volsAt(id, 1), 0).back;
  const shaftW = liftShaft(id).w;
  const levels = Array.from({ length: top + 1 }, (_, L) => volsAt(id, L));
  const H = MASSING[id].ground;
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
      // Junto à parede dos fundos do térreo: livre o portal dos elevadores e o botão de chamada.
      if (z < -(span0.back - 2.5) && Math.abs(x) < shaftW / 2 + 0.7) return false;
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
