/**
 * Contorno dos prédios do Campus (planta única por fora e por dentro): cada prédio é um conjunto de
 * volumes (retângulos, círculos ou polígonos regulares) em coordenadas locais (frente = +z, x para
 * o lado, 1 unidade = 1 m), cada um com o nível mais baixo e o mais alto que ocupa. Daqui saem as
 * paredes (por aresta de volume, sem os trechos que caem dentro de outro volume do mesmo nível, de
 * modo que volumes ligados viram um prédio só, com passagem entre eles), onde se pode andar, as
 * lajes, as coberturas e os terraços. Só geometria pura (sem three.js): testável.
 */

export type Pt = [x: number, z: number];

interface VolBase {
  /** Centro do volume (local). */
  cx: number;
  cz: number;
  /** Nível mais baixo que o volume ocupa (0 = térreo). */
  lo?: number;
  /** Nível mais alto que o volume ocupa (0 = só o térreo). */
  hi: number;
  /** Altura do volume quando ele só tem o térreo (ala mais baixa); sem isso, o pé-direito do prédio. */
  h?: number;
}

/** Volume retangular (`w` ao longo de x, `d` ao longo de z, girado `rot` em y). */
export interface RectVol extends VolBase {
  kind: 'rect';
  w: number;
  d: number;
  rot?: number;
}
/** Volume redondo. */
export interface CircleVol extends VolBase {
  kind: 'circle';
  r: number;
}
/** Volume em polígono regular (raio circunscrito `r`, primeiro vértice no ângulo `rot`). */
export interface PolyVol extends VolBase {
  kind: 'poly';
  r: number;
  sides: number;
  rot?: number;
}
export type Vol = RectVol | CircleVol | PolyVol;

/** Trecho reto de parede: de a até b, com a normal para fora; `from` = altura onde a parede começa (sobre um volume mais baixo). */
export interface WallRun {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Normal para fora (unitária). */
  nx: number;
  nz: number;
  len: number;
  from: number;
  /** Índice do volume (na lista recebida) dono da aresta. */
  vol: number;
}

/** Ponto dentro do volume, a pelo menos `m` m da borda (m < 0: com folga para fora). */
export function inVol(v: Vol, x: number, z: number, m = 0): boolean {
  const dx = x - v.cx;
  const dz = z - v.cz;
  if (v.kind === 'circle') return Math.hypot(dx, dz) <= v.r - m;
  if (v.kind === 'rect') {
    const c = Math.cos(v.rot ?? 0);
    const s = Math.sin(v.rot ?? 0);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) <= v.w / 2 - m && Math.abs(lz) <= v.d / 2 - m;
  }
  const sec = (Math.PI * 2) / v.sides;
  const apo = v.r * Math.cos(Math.PI / v.sides);
  const r0 = v.rot ?? 0;
  for (let k = 0; k < v.sides; k++) {
    const phi = r0 + (k + 0.5) * sec;
    if (dx * Math.sin(phi) + dz * Math.cos(phi) > apo - m) return false;
  }
  return true;
}

/** Contorno do volume no plano (x, z); o redondo vira um polígono de `n` lados. */
export function volPoly(v: Vol, n = 48): Pt[] {
  if (v.kind === 'rect') {
    const c = Math.cos(v.rot ?? 0);
    const s = Math.sin(v.rot ?? 0);
    const corner = (lx: number, lz: number): Pt => [v.cx + lx * c + lz * s, v.cz - lx * s + lz * c];
    const hw = v.w / 2;
    const hd = v.d / 2;
    return [corner(-hw, hd), corner(hw, hd), corner(hw, -hd), corner(-hw, -hd)];
  }
  const sides = v.kind === 'circle' ? n : v.sides;
  const r0 = v.kind === 'poly' ? (v.rot ?? 0) : 0;
  return Array.from({ length: sides }, (_, k) => {
    const t = r0 + (k / sides) * Math.PI * 2;
    return [v.cx + Math.sin(t) * v.r, v.cz + Math.cos(t) * v.r] as Pt;
  });
}

/** Distância de um ponto a um segmento. */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

const RING8: Pt[] = Array.from({ length: 8 }, (_, k) => [Math.sin((k / 8) * Math.PI * 2), Math.cos((k / 8) * Math.PI * 2)] as Pt);

/**
 * Ponto dentro da união dos volumes. Com `m` > 0, também os 8 pontos em volta a `m` m (folga das
 * paredes, inclusive nos cantos e nas passagens entre volumes ligados).
 */
export function insideAt(vols: readonly Vol[], x: number, z: number, m = 0): boolean {
  const any = (px: number, pz: number) => vols.some((v) => inVol(v, px, pz, 0));
  if (m <= 0) return vols.some((v) => inVol(v, x, z, m));
  if (!any(x, z)) return false;
  return RING8.every(([sx, sz]) => any(x + sx * m, z + sz * m));
}

/**
 * Paredes de um nível: cada aresta de cada volume, em pedaços de até `step` m, sem os pedaços que
 * caem dentro de outro volume (a passagem entre volumes ligados). `height(i)` é a altura do
 * volume i; um volume vizinho mais baixo só tira a parte de baixo da parede (o resto sobe acima da
 * cobertura dele, com `from` = altura dele). Pedaços seguidos da mesma aresta viram um trecho só.
 */
export function wallRuns(vols: readonly Vol[], step = 1, height: (i: number) => number = () => Infinity): WallRun[] {
  const out: WallRun[] = [];
  vols.forEach((v, i) => {
    const pts = volPoly(v);
    const own = height(i);
    for (let e = 0; e < pts.length; e++) {
      const p = pts[e]!;
      const q = pts[(e + 1) % pts.length]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 1e-6) continue;
      // Normal para fora: perpendicular à aresta, do lado oposto ao centro do volume.
      let nx = (q[1] - p[1]) / len;
      let nz = -(q[0] - p[0]) / len;
      if (((p[0] + q[0]) / 2 - v.cx) * nx + ((p[1] + q[1]) / 2 - v.cz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const n = Math.max(1, Math.ceil(len / step));
      let run: WallRun | null = null;
      const flush = () => {
        if (run && run.len > 0.05) out.push(run);
        run = null;
      };
      for (let k = 0; k < n; k++) {
        const ax = p[0] + ((q[0] - p[0]) * k) / n;
        const az = p[1] + ((q[1] - p[1]) * k) / n;
        const bx = p[0] + ((q[0] - p[0]) * (k + 1)) / n;
        const bz = p[1] + ((q[1] - p[1]) * (k + 1)) / n;
        const sx = (ax + bx) / 2 + nx * 0.12;
        const sz = (az + bz) / 2 + nz * 0.12;
        let cover = -1;
        for (let j = 0; j < vols.length; j++) if (j !== i && inVol(vols[j]!, sx, sz, 0)) cover = Math.max(cover, height(j));
        const covered = cover >= 0;
        if (covered && cover >= own - 1e-6) {
          flush();
          continue;
        }
        const from = covered ? cover : 0;
        const cur = run as WallRun | null;
        if (cur && Math.abs(cur.from - from) < 1e-6) {
          cur.bx = bx;
          cur.bz = bz;
          cur.len = Math.hypot(bx - cur.ax, bz - cur.az);
        } else {
          flush();
          run = { ax, az, bx, bz, nx, nz, len: Math.hypot(bx - ax, bz - az), from, vol: i };
        }
      }
      flush();
    }
  });
  return out;
}

/** Maior distância do centro (0, 0) a um ponto dos volumes. */
export function boundOf(vols: readonly Vol[]): number {
  let r = 0;
  for (const v of vols) for (const [x, z] of volPoly(v, 32)) r = Math.max(r, Math.hypot(x, z));
  return r;
}

/** Frente (maior z) e fundos (distância até o menor z) dos volumes ao longo da linha x = `x`. */
export function spanZ(vols: readonly Vol[], x = 0): { front: number; back: number } {
  const B = boundOf(vols) + 1;
  let front = -Infinity;
  let back = Infinity;
  for (let z = -B; z <= B; z += 0.05) {
    if (!insideAt(vols, x, z)) continue;
    front = Math.max(front, z);
    back = Math.min(back, z);
  }
  return { front: Number.isFinite(front) ? front : 0, back: Number.isFinite(back) ? -back : 0 };
}

/** Distância do centro até sair dos volumes na direção `a` (ângulo de atan2(x, z)), a partir de `from`. */
export function exitAt(vols: readonly Vol[], a: number, from = 0, m = 0): number {
  const s = Math.sin(a);
  const c = Math.cos(a);
  let r = from;
  while (r < 400 && insideAt(vols, s * r, c * r, m)) r += 0.1;
  return r;
}

/** Ponto válido mais perto (dentro da união com folga `m`); o próprio ponto, se já é válido. */
export function nearestInside(vols: readonly Vol[], x: number, z: number, m: number, ok: (x: number, z: number) => boolean = () => true): Pt {
  if (insideAt(vols, x, z, m) && ok(x, z)) return [x, z];
  for (let r = 0.25; r < 40; r += 0.25) {
    const n = Math.max(12, Math.round((Math.PI * 2 * r) / 0.4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.sin(a) * r;
      const pz = z + Math.cos(a) * r;
      if (insideAt(vols, px, pz, m) && ok(px, pz)) return [px, pz];
    }
  }
  return [x, z];
}

/** Distância até o trecho de parede mais perto (e qual). */
export function nearestRun(runs: readonly WallRun[], x: number, z: number): { d: number; run: WallRun | null } {
  let d = Infinity;
  let run: WallRun | null = null;
  for (const r of runs) {
    const e = segDist(x, z, r.ax, r.az, r.bx, r.bz);
    if (e < d) {
      d = e;
      run = r;
    }
  }
  return { d, run };
}

/** Trecho da fachada da frente que cruza x = 0 (onde fica a porta de entrada), se houver. */
export function entranceRun(runs: readonly WallRun[]): WallRun | null {
  let best: WallRun | null = null;
  let bz = -Infinity;
  for (const r of runs) {
    if (r.nz < 0.7 || r.from > 0) continue;
    if (Math.min(r.ax, r.bx) > 0.01 || Math.max(r.ax, r.bx) < -0.01) continue;
    const t = Math.abs(r.bx - r.ax) > 1e-6 ? (0 - r.ax) / (r.bx - r.ax) : 0.5;
    const z = r.az + (r.bz - r.az) * t;
    if (z > bz) {
      bz = z;
      best = r;
    }
  }
  return best;
}

/** Posição ao longo do trecho (0 = a, len = b) de um ponto projetado nele. */
export function alongRun(r: WallRun, x: number, z: number): number {
  const dx = (r.bx - r.ax) / r.len;
  const dz = (r.bz - r.az) / r.len;
  return (x - r.ax) * dx + (z - r.az) * dz;
}

/** Distância do centro até a borda de fora dos volumes na direção `a`, vindo de longe (`far`) para dentro. */
export function reachAt(vols: readonly Vol[], a: number, far: number): number {
  const s = Math.sin(a);
  const c = Math.cos(a);
  let r = far;
  while (r > 0 && !insideAt(vols, s * r, c * r)) r -= 0.05;
  return Math.max(0, r);
}

/** Maior círculo em volta de (cx, cz) que cabe na planta (amostrado em 24 direções). */
export function inscribed(vols: readonly Vol[], cx = 0, cz = 0): number {
  if (!insideAt(vols, cx, cz)) return 0;
  let r = Infinity;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    let d = 0;
    while (d < 200 && insideAt(vols, cx + Math.sin(a) * d, cz + Math.cos(a) * d)) d += 0.1;
    r = Math.min(r, d);
  }
  return r;
}

/** Peça de um terraço: floreira e banco junto ao guarda-corpo; árvore e mesa no meio. */
export interface DeckSpot {
  kind: 'planter' | 'bench' | 'tree' | 'table';
  x: number;
  z: number;
  /** Para onde a peça olha (banco: para fora, para a vista). */
  face: number;
}

/**
 * Peças de um terraço sobre os volumes `vols` (o mesmo desenho por dentro e por fora): floreiras e
 * bancos alternados a 1,1 m das bordas livres (`edges`: trechos de guarda-corpo), de frente para a
 * vista, longe dos cantos e da passagem da ponte do elevador (direção `back`, ângulo de
 * atan2(x, z)); com `middle`, árvores em vasos e mesas no meio, longe do vão do centro (`hole`).
 */
export function deckSpots(vols: readonly Vol[], edges: readonly WallRun[], hole: number, back: number, middle = true): DeckSpot[] {
  const sb = Math.sin(back);
  const cb = Math.cos(back);
  const onBridge = (x: number, z: number, w: number) => x * sb + z * cb > 0 && Math.abs(x * cb - z * sb) < w;
  const out: DeckSpot[] = [];
  let k = 0;
  for (const r of edges) {
    const n = Math.floor((r.len - 2.0) / 3.4);
    if (n < 1) continue;
    const face = Math.atan2(r.nx, r.nz);
    for (let i = 0; i < n; i++) {
      const s = 1.0 + ((i + 0.5) * (r.len - 2.0)) / n;
      const x = r.ax + ((r.bx - r.ax) * s) / r.len - r.nx * 1.1;
      const z = r.az + ((r.bz - r.az) * s) / r.len - r.nz * 1.1;
      if (onBridge(x, z, 2.6) || !insideAt(vols, x, z, 0.8) || Math.hypot(x, z) < hole + 1.2) continue;
      out.push({ kind: k++ % 2 ? 'bench' : 'planter', x, z, face });
    }
  }
  if (!middle) return out;
  let j = 0;
  for (let x = -38.5; x <= 38.5; x += 7)
    for (let z = -38.5; z <= 38.5; z += 7) {
      if (!insideAt(vols, x, z, 3.2) || Math.hypot(x, z) < Math.max(hole, 2.5) + 1.6 || onBridge(x, z, 2.4)) continue;
      out.push({ kind: j % 2 ? 'table' : 'tree', x, z, face: Math.atan2(x, z) });
      j++;
    }
  return out;
}

/**
 * Contornos dos volumes mais altos que ficam inteiros dentro do volume `i` (a torre que sobe do
 * meio de um embasamento baixo): viram furos no teto e na cobertura do volume baixo.
 */
export function tallerInside(vols: readonly Vol[], i: number, height: (j: number) => number): Pt[][] {
  const v = vols[i];
  if (!v) return [];
  const out: Pt[][] = [];
  vols.forEach((o, j) => {
    if (j === i || height(j) <= height(i)) return;
    const pts = volPoly(o);
    if (pts.every(([x, z]) => inVol(v, x, z, 0.05))) out.push(pts);
  });
  return out;
}

/**
 * Portas de um andar para os terraços das alas mais baixas (`terr`): uma por terraço, no trecho de
 * fachada que dá para ele mais perto do meio da ala (cabe uma porta de 1,8 m), no meio do trecho.
 */
export function terraceDoors(runs: readonly WallRun[], terr: readonly Vol[]): Array<{ x: number; z: number; nx: number; nz: number }> {
  const out: Array<{ x: number; z: number; nx: number; nz: number }> = [];
  for (const t of terr) {
    let best: WallRun | null = null;
    let bd = Infinity;
    for (const r of runs) {
      if (r.len < 2.0) continue;
      const mx = (r.ax + r.bx) / 2;
      const mz = (r.az + r.bz) / 2;
      if (!inVol(t, mx + r.nx * 0.8, mz + r.nz * 0.8, 0.3)) continue;
      const d = Math.hypot(mx - t.cx, mz - t.cz);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (best) out.push({ x: (best.ax + best.bx) / 2, z: (best.az + best.bz) / 2, nx: best.nx, nz: best.nz });
  }
  return out;
}
