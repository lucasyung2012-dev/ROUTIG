/**
 * Andar dentro dos prédios com escada (seção 30): o mundo de cada nível para quem anda (o piso do
 * nível, o da escada perto dos pés, o guarda-corpo, a regra da altura ao sair da escada) e a
 * conferência de até onde se chega a pé (comando de teste 'stairs:reach' e testes): numa grade de
 * 0,25 m, a partir da chegada do elevador (e da entrada, no térreo), anda como o corpo anda
 * (camera.ts: limite, obstáculos com a folga do corpo, `blocked`, subida máxima por passo, troca de
 * nível pela altura dos pés) e diz se o pé de cada lance e a chegada de cada patamar são
 * alcançados, se dá para subir e descer a pé, e o que bloqueia o anel em volta da escada.
 * Sem three.js: testável.
 */
import type { CameraWorld, Obstacle } from './camera';
import type { Pt } from './outline';
import { coreSpots, inPoly, levelAtHeight, stairSpots, type Stair, type StairWalk } from './stairs';

/** Subida mais íngreme por metro dentro dos prédios (a da escada). */
export const INDOOR_GRADE = 1.4;
/** Quanto acima do piso do nível os pés podem estar para sair da escada (num patamar do meio, não). */
export const LEAVE_ABOVE = 0.8;
/** Quanto abaixo do piso do nível (descendo pelo lance de baixo) ainda se sai para o piso. */
export const LEAVE_BELOW = 0.35;

/**
 * O mundo do nível `L` (piso em `y0`) com a escada onde se anda (o mesmo de engine.ts): dentro
 * dela, o piso é o do degrau ou do patamar mais perto dos pés (`feet`) e onde ela não tem piso não
 * se passa; fora dela, o piso do nível, e dela só se sai pelo patamar do nível em que se está
 * (nunca pelo lado do lance nem de um patamar no meio da subida).
 */
export function walkWorld(base: CameraWorld, sw: StairWalk, L: number, y0: number, feet: () => number): CameraWorld {
  const baseBlocked = base.blocked;
  return {
    ...base,
    maxGrade: INDOOR_GRADE,
    ground: (x, z) => {
      const y = feet();
      return sw.zone(x, z, y) ? (sw.floorAt(x, z, y) ?? y0) : y0;
    },
    blocked: (x, z) => {
      const y = feet();
      if (sw.zone(x, z, y)) return sw.floorAt(x, z, y) === null;
      // Fora da escada com os pés longe do piso do nível (num patamar do meio, no alto de um
      // pulo): não se sai por ali.
      if (y > y0 + LEAVE_ABOVE || y < y0 - LEAVE_BELOW) return true;
      return sw.edge(L, x, z) || !!baseBlocked?.(x, z);
    },
  };
}

/** Um nível para a conferência: o piso, o mundo de quem anda (com os pés em `feet`) e de onde se parte. */
export interface ReachLevel {
  y: number;
  world: (feet: () => number) => CameraWorld;
  /** Chegada do elevador (e a entrada, no térreo). */
  starts: Pt[];
}

/** O que bloqueia um ponto para quem anda no nível (vazio = livre). */
export type Why = '' | 'limit' | 'obstacle' | 'stair' | 'height' | 'blocked';

/** Ponto de interesse da escada num nível e se foi alcançado a pé. */
export interface ReachSpot {
  kind: 'foot' | 'head';
  at: Pt;
  reached: boolean;
}

export interface ReachReport {
  level: number;
  /** A chegada do elevador fica num ponto livre. */
  arrival: boolean;
  /** Pé da escada (subir) e chegada de quem desce, neste nível. */
  spots: ReachSpot[];
  /** A pé, da chegada deste nível até o patamar do nível de cima / de baixo (null: não há). */
  up: boolean | null;
  down: boolean | null;
  /**
   * Anel em volta da escada (de 0,3 a 1,0 m fora do contorno): pontos livres alcançados, livres
   * mas isolados (não se chega a eles) e os bloqueados por obstáculo (com o obstáculo) ou pela
   * regra do nível (fachada, núcleo, vazio). O guarda-corpo (a menos de 0,3 m) não entra.
   */
  ring: { ok: number; isolated: Pt[]; obstacles: Array<{ at: Pt; o: Obstacle }>; rule: number };
}

/** Grade da conferência (m). */
export const REACH_CELL = 0.25;

/**
 * Até onde se chega a pé, nível a nível (veja o cabeçalho). `stair`: a escada principal (pés e
 * chegadas pelos patamares); `core`: o caracol do núcleo (raio e primeiro nível servido), cuja
 * porta é o pé e a chegada.
 */
export function stairReach(o: { ys: readonly number[]; levels: readonly ReachLevel[]; stair: Stair | null; core?: { r: number; from: number } | null; cell?: number }): ReachReport[] {
  const G = o.cell ?? REACH_CELL;
  const ys = o.ys;
  let feetY = 0;
  const feet = () => feetY;
  const worlds = o.levels.map((lv) => lv.world(feet));
  const near = worlds.map((w) => grid(w.obstacles));
  const pad = (w: CameraWorld) => (Number.isFinite(w.ceiling) ? 0.3 : 0.45);

  /** O que impede de pisar em (x, z) no nível `L` com os pés em `y`. */
  const why = (L: number, x: number, z: number, y: number): { w: Why; o?: Obstacle } => {
    const w = worlds[L]!;
    feetY = y;
    if (Math.hypot(x - w.limit.x, z - w.limit.z) > w.limit.r) return { w: 'limit' };
    const p = pad(w);
    for (const ob of near[L]!(x, z)) if (Math.hypot(x - ob.x, z - ob.z) < ob.r + p) return { w: 'obstacle', o: ob };
    if (w.blocked?.(x, z)) return { w: 'blocked' };
    return { w: '' };
  };

  const key = (i: number, j: number, L: number) => `${i},${j},${L}`;
  const spotsOf = (L: number): ReachSpot[] => {
    if (o.stair) {
      const s = stairSpots(o.stair, L);
      return [...(s.up ? [{ kind: 'foot' as const, at: s.up, reached: false }] : []), ...(s.down ? [{ kind: 'head' as const, at: s.down, reached: false }] : [])];
    }
    if (o.core && L >= o.core.from) {
      const s = coreSpots(o.core.r);
      return [...(L + 1 < ys.length ? [{ kind: 'foot' as const, at: s.up, reached: false }] : []), ...(L > o.core.from ? [{ kind: 'head' as const, at: s.down, reached: false }] : [])];
    }
    return [];
  };

  // Nos outros níveis, só perto da escada (até 2 m dela): basta para subir e descer a pé, sem
  // percorrer o prédio inteiro a partir de cada nível.
  const box = ((): [number, number, number, number] => {
    const pts: readonly Pt[] = o.stair?.well ?? (o.core ? [[-o.core.r, -o.core.r], [o.core.r, o.core.r]] : []);
    if (!pts.length) return [0, 0, 0, 0];
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...zs) - 2, Math.max(...zs) + 2];
  })();
  const nearStair = (x: number, z: number) => x >= box[0] && x <= box[1] && z >= box[2] && z <= box[3];

  /** Anda a partir dos pontos dados (todos no nível `L0`); devolve as células alcançadas no piso de cada nível. */
  const flood = (L0: number, starts: readonly Pt[]): Set<string> => {
    const seen = new Set<string>();
    const flat = new Set<string>();
    const q: Array<[number, number, number, number]> = [];
    const push = (i: number, j: number, L: number, y: number) => {
      const k = `${i},${j},${L},${Math.round(y * 20)}`;
      if (seen.has(k)) return;
      seen.add(k);
      q.push([i, j, L, y]);
      if (Math.abs(y - ys[L]!) < 0.05) flat.add(key(i, j, L));
    };
    for (const [x, z] of starts) {
      const i = Math.round(x / G);
      const j = Math.round(z / G);
      if (why(L0, i * G, j * G, ys[L0]!).w === '') push(i, j, L0, ys[L0]!);
    }
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    for (let h = 0; h < q.length; h++) {
      const [i, j, L, y] = q[h]!;
      const w = worlds[L]!;
      for (const [di, dj] of D) {
        const x = (i + di) * G;
        const z = (j + dj) * G;
        if (why(L, x, z, y).w !== '') continue;
        feetY = y;
        const g = w.ground(x, z);
        if ((g - y) / G > (w.maxGrade ?? INDOOR_GRADE)) continue;
        const nL = levelAtHeight(ys, g, L);
        // Fora do piso do nível de partida, só perto da escada.
        if ((nL !== L0 || Math.abs(g - ys[L0]!) > 0.05) && !nearStair(x, z)) continue;
        push(i + di, j + dj, nL, g);
      }
    }
    return flat;
  };
  const hit = (R: Set<string>, p: Pt, L: number) => {
    const i0 = Math.round(p[0] / G);
    const j0 = Math.round(p[1] / G);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (R.has(key(i0 + di, j0 + dj, L))) return true;
    return false;
  };

  return o.levels.map((lv, L) => {
    const R = flood(L, lv.starts);
    const spots = spotsOf(L).map((s) => ({ ...s, reached: hit(R, s.at, L) }));
    const above = L + 1 < ys.length ? spotsOf(L + 1).find((s) => s.kind === 'head') : undefined;
    const below = L > 0 ? spotsOf(L - 1).find((s) => s.kind === 'foot') : undefined;
    const ring: ReachReport['ring'] = { ok: 0, isolated: [], obstacles: [], rule: 0 };
    const well = o.stair?.well;
    if (well) {
      const xs = well.map((p) => p[0]);
      const zs = well.map((p) => p[1]);
      for (let i = Math.floor((Math.min(...xs) - 1.2) / G); i <= Math.ceil((Math.max(...xs) + 1.2) / G); i++)
        for (let j = Math.floor((Math.min(...zs) - 1.2) / G); j <= Math.ceil((Math.max(...zs) + 1.2) / G); j++) {
          const x = i * G;
          const z = j * G;
          if (inPoly(well, x, z)) continue;
          const d = edgeDist(well, x, z);
          if (d < 0.3 || d > 1.0) continue;
          const r = why(L, x, z, ys[L]!);
          if (r.w === '') {
            if (R.has(key(i, j, L))) ring.ok++;
            else ring.isolated.push([x, z]);
          } else if (r.w === 'obstacle' && r.o) ring.obstacles.push({ at: [x, z], o: r.o });
          else ring.rule++;
        }
    }
    const a = lv.starts[0];
    return {
      level: L,
      arrival: !!a && why(L, a[0], a[1], ys[L]!).w === '',
      spots,
      up: above && (o.stair || o.core) ? hit(R, above.at, L + 1) : null,
      down: below && (o.stair || o.core) ? hit(R, below.at, L - 1) : null,
      ring,
    };
  });
}

/** Distância até o contorno de um polígono. */
function edgeDist(pts: readonly Pt[], x: number, z: number): number {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j]!;
    const [bx, bz] = pts[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    d = Math.min(d, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return d;
}

/** Obstáculos perto de um ponto (grade de 2 m), sem depender de three.js. */
function grid(list: readonly Obstacle[]): (x: number, z: number) => Obstacle[] {
  const S = 2;
  const map = new Map<string, Obstacle[]>();
  for (const ob of list)
    for (let i = Math.floor((ob.x - ob.r - 1) / S); i <= Math.floor((ob.x + ob.r + 1) / S); i++)
      for (let j = Math.floor((ob.z - ob.r - 1) / S); j <= Math.floor((ob.z + ob.r + 1) / S); j++) {
        const k = `${i},${j}`;
        const arr = map.get(k);
        if (arr) arr.push(ob);
        else map.set(k, [ob]);
      }
  return (x, z) => map.get(`${Math.floor(x / S)},${Math.floor(z / S)}`) ?? [];
}

/** Resumo de uma conferência (o que o comando 'stairs:reach' grava na página). */
export function reachSummary(rep: readonly ReachReport[]): Array<Record<string, unknown>> {
  const f = (p: Pt) => [+p[0].toFixed(2), +p[1].toFixed(2)];
  return rep.map((r) => ({
    level: r.level,
    arrival: r.arrival,
    spots: r.spots.map((s) => `${s.kind}${s.reached ? '' : ' NÃO'} ${f(s.at).join(',')}`),
    up: r.up,
    down: r.down,
    ring: { ok: r.ring.ok, rule: r.ring.rule, isolated: r.ring.isolated.length, obstacles: r.ring.obstacles.length },
    isolated: r.ring.isolated.slice(0, 12).map(f),
    obstacles: r.ring.obstacles.slice(0, 12).map(({ at, o }) => ({ at: f(at), o: [+o.x.toFixed(2), +o.z.toFixed(2), +o.r.toFixed(2), +o.h.toFixed(1)] })),
  }));
}
