import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@/app/modules';
import { MASSING, levelY, topLevel, volsAt } from '@/features/park/massing';
import { insideAt, type Pt } from '@/features/park/outline';
import {
  CIRCULATION,
  CORE_SWEEP,
  HALL_HALF,
  STEP_REACH,
  carve,
  corePath,
  coreWalk,
  inLiftCore,
  inLiftHall,
  inPoly,
  levelAtHeight,
  levelCount,
  liftCore,
  liftShaft,
  polyArea,
  stairEdge,
  stairOf,
  stairPath,
  stairSpots,
  stairTreads,
  stairWalk,
  voidRadius,
  type StairWalk,
} from '@/features/park/stairs';

/** Prédios do Campus com escada própria (a do núcleo é do Insights). */
const STAIRS: ModuleId[] = ['academy', 'languages', 'notes', 'library', 'inbox', 'calendar', 'tasks', 'projects', 'focus', 'goals', 'music', 'sports', 'finance'];

/** Pontos do miolo de um polígono (grade de 0,4 m). */
function interior(poly: readonly Pt[]): Pt[] {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const out: Pt[] = [];
  for (let x = Math.min(...xs) + 0.17; x <= Math.max(...xs); x += 0.4) for (let z = Math.min(...zs) + 0.17; z <= Math.max(...zs); z += 0.4) if (inPoly(poly, x, z)) out.push([x, z]);
  return out;
}

/**
 * Anda um caminho (x, y, z por ponto) em passos de 10 cm como o motor anda: dentro da escada, o
 * piso é o dela perto dos pés; fora, o do nível em que se está (que troca pela altura dos pés).
 * Devolve o maior degrau entre dois passos, o nível e a altura no fim, e o que deu errado.
 */
function walkPath(w: StairWalk, ys: readonly number[], path: readonly number[], L0: number): { step: number; L: number; y: number; errors: string[] } {
  let y = ys[L0]!;
  let L = L0;
  let step = 0;
  const errors: string[] = [];
  for (let i = 3; i < path.length; i += 3) {
    const ax = path[i - 3]!;
    const az = path[i - 1]!;
    const bx = path[i]!;
    const bz = path[i + 2]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1));
    for (let k = 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      let h: number;
      if (w.zone(x, z, y)) {
        const f = w.floorAt(x, z, y);
        if (f === null) {
          errors.push(`sem piso em (${x.toFixed(2)}, ${z.toFixed(2)}) y ${y.toFixed(2)}`);
          continue;
        }
        h = f;
      } else {
        if (w.edge(L, x, z)) errors.push(`guarda-corpo em (${x.toFixed(2)}, ${z.toFixed(2)}) nível ${L}`);
        if (Math.abs(y - ys[L]!) > 0.35) errors.push(`saiu da escada fora do piso em (${x.toFixed(2)}, ${z.toFixed(2)}) y ${y.toFixed(2)}`);
        h = ys[L]!;
      }
      step = Math.max(step, Math.abs(h - y));
      y = h;
      L = levelAtHeight(ys, y, L);
    }
  }
  return { step, L, y, errors };
}

describe('Campus: núcleo dos elevadores dentro do prédio', () => {
  it('todo prédio com elevador tem o núcleo nos fundos, em x = 0, dentro da planta de todos os níveis, com o hall na frente', () => {
    for (const id of Object.keys(MASSING) as ModuleId[]) {
      const c = liftCore(id);
      if (CIRCULATION[id].lifts === 0 || topLevel(id) < 1) {
        expect(c, id).toBeNull();
        continue;
      }
      expect(c, id).not.toBeNull();
      const core = c!;
      expect(core.x1, id).toBeLessThanOrEqual(1.95 + 1e-9);
      expect(core.x0, id).toBeCloseTo(-core.x1, 9);
      expect(core.z1, id).toBeLessThan(0);
      expect(core.tz, id).toBeGreaterThan(core.z0);
      expect(core.tz, id).toBeLessThan(core.z1);
      for (let L = 0; L <= topLevel(id); L++) {
        const v = volsAt(id, L);
        for (const [x, z] of [[core.x0, core.z0], [core.x1, core.z0], [core.x0, core.z1], [core.x1, core.z1], [0, core.z0]] as const) expect(insideAt(v, x, z, 0.1), `${id} ${L} núcleo (${x}, ${z})`).toBe(true);
        for (const [x, z] of [[-HALL_HALF, core.hall], [HALL_HALF, core.hall], [0, core.z1 + 1.6]] as const) expect(insideAt(v, x, z, 0.25), `${id} ${L} hall`).toBe(true);
      }
    }
    expect(liftCore('habits')).toBeNull();
  });

  it('as cabinas cabem no poço, lado a lado, sem tocar a divisória', () => {
    for (const id of Object.keys(MASSING) as ModuleId[]) {
      if (!CIRCULATION[id].lifts) continue;
      const s = liftShaft(id);
      for (const x of s.xs) {
        expect(Math.abs(x) + s.cw / 2, id).toBeLessThan(s.w / 2);
        if (s.xs.length > 1) expect(Math.abs(x) - s.cw / 2, id).toBeGreaterThan(0.06);
      }
      // A cabine tem fundo para uma pessoa e a porta (1,12 m) cabe na frente dela.
      expect(s.d - 0.5, id).toBeGreaterThan(1.2);
      expect(s.cw, id).toBeGreaterThan(1.12);
    }
  });

  it('a escada nunca cai no núcleo nem no hall dos elevadores; o pé e a chegada ficam fora do núcleo', () => {
    for (const id of STAIRS) {
      const st = stairOf(id)!;
      const c = liftCore(id)!;
      for (const [x, z] of [...st.well, ...interior(st.well)]) {
        expect(inLiftCore(c, x, z), `${id} (${x.toFixed(1)}, ${z.toFixed(1)}) núcleo`).toBe(false);
        expect(inLiftHall(c, x, z), `${id} (${x.toFixed(1)}, ${z.toFixed(1)}) hall`).toBe(false);
      }
      for (let L = 0; L < st.ys.length; L++) {
        const s = stairSpots(st, L);
        for (const p of [s.up, s.down]) if (p) expect(inLiftCore(c, p[0], p[1], 0.4), `${id} ${L} pé`).toBe(false);
      }
    }
  });

  it('a laje é recortada em volta do poço: furo quando ele cabe inteiro, pedaços quando corta a borda', () => {
    const sq: Pt[] = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    // Inteiro dentro: vira um furo.
    const inside = carve(sq, [], { x0: -1, x1: 1, z0: -4, z1: -2 });
    expect(inside.length).toBe(1);
    expect(inside[0]!.holes.length).toBe(1);
    // Longe: fica como está.
    const away = carve(sq, [], { x0: 7, x1: 8, z0: 0, z1: 1 });
    expect(away.length).toBe(1);
    expect(away[0]!.holes.length).toBe(0);
    // Cortando a borda dos fundos: pedaços em volta, com a área certa e nada dentro do poço; o
    // furo da escada vai para o pedaço que o contém.
    const stair: Pt[] = [[2.5, -3], [4, -3], [4, 0], [2.5, 0]];
    const cut = carve(sq, [stair], { x0: -1, x1: 1, z0: -6, z1: -4 });
    expect(cut.length).toBeGreaterThan(1);
    expect(cut.reduce((s, p) => s + polyArea(p.pts), 0)).toBeCloseTo(100 - 2, 6);
    expect(cut.reduce((s, p) => s + p.holes.length, 0)).toBe(1);
    for (const p of cut) for (const [x, z] of interior(p.pts)) expect(x > -1 && x < 1 && z > -6 && z < -4).toBe(false);
  });
});

describe('Campus: andar na escada (seção 30)', () => {
  it('em cada lance, a altura sobe junto com o caminho, do patamar de baixo ao de cima', () => {
    for (const id of STAIRS) {
      const st = stairOf(id)!;
      const treads = stairTreads(st);
      const w = stairWalk(st);
      for (const t of treads) {
        if (t.kind !== 'flight') continue;
        // Nenhum lance mais íngreme do que se sobe andando dentro dos prédios.
        let len = 0;
        for (let i = 1; i < t.pts.length; i++) len += Math.hypot(t.pts[i]![0] - t.pts[i - 1]![0], t.pts[i]![1] - t.pts[i - 1]![1]);
        expect((t.yb - t.ya) / len, id).toBeLessThan(1.0);
        // Pela linha do meio, do começo ao fim: a altura é a do lance naquele ponto.
        let prev = t.ya;
        for (let k = 0; k <= 20; k++) {
          const s = (k / 20) * len;
          let acc = 0;
          let p: Pt = t.pts[0]!;
          for (let i = 1; i < t.pts.length; i++) {
            const a = t.pts[i - 1]!;
            const c = t.pts[i]!;
            const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
            if (acc + l >= s - 1e-9) {
              const u = l > 0 ? (s - acc) / l : 0;
              p = [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u];
              break;
            }
            acc += l;
          }
          const want = t.ya + ((t.yb - t.ya) * k) / 20;
          const h = w.floorAt(p[0], p[1], want);
          expect(h, `${id} lance ${k}`).not.toBeNull();
          expect(h!, `${id} lance ${k}`).toBeCloseTo(want, 3);
          expect(h!, id).toBeGreaterThanOrEqual(prev - 1e-6);
          prev = h!;
        }
      }
    }
  });

  it('sobe e desce a pé, do pé da escada à chegada no outro nível, sem degrau maior que um passo, sem atravessar guarda-corpo e trocando de nível sozinho', () => {
    for (const id of STAIRS) {
      const st = stairOf(id)!;
      const w = stairWalk(st);
      for (let L = 0; L + 1 < st.ys.length; L++) {
        const up = walkPath(w, st.ys, stairPath(st, L, true), L);
        expect(up.errors, `${id} sobe ${L}`).toEqual([]);
        expect(up.step, `${id} sobe ${L}`).toBeLessThan(0.15);
        expect(up.L, `${id} sobe ${L}`).toBe(L + 1);
        expect(up.y, `${id} sobe ${L}`).toBeCloseTo(st.ys[L + 1]!, 5);
        const down = walkPath(w, st.ys, stairPath(st, L + 1, false), L + 1);
        expect(down.errors, `${id} desce ${L + 1}`).toEqual([]);
        expect(down.step, `${id} desce ${L + 1}`).toBeLessThan(0.15);
        expect(down.L, `${id} desce ${L + 1}`).toBe(L);
        expect(down.y, `${id} desce ${L + 1}`).toBeCloseTo(st.ys[L]!, 5);
      }
    }
  });

  it('o vão segura: no meio do vão, debaixo do lance e ao lado dele não se pisa; só se entra pelo patamar', () => {
    for (const id of STAIRS) {
      const st = stairOf(id)!;
      const w = stairWalk(st);
      // Debaixo dos lances, no térreo: nenhum ponto do vão (fora do patamar e do começo do lance) tem piso na altura do chão.
      let under = 0;
      for (const [x, z] of interior(st.well)) {
        const h = w.floorAt(x, z, 0);
        if (h !== null) expect(Math.abs(h), `${id} (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThanOrEqual(STEP_REACH);
        else under++;
      }
      expect(under, id).toBeGreaterThan(0);
      // Fora da escada, colado no contorno: o pé de subir (de frente para o patamar) é livre; o
      // ponto mais longe do patamar, no contorno, é guarda-corpo.
      const foot = stairSpots(st, 0).up!;
      expect(stairEdge(st, 0, foot[0], foot[1]), `${id} pé`).toBe(false);
      const land = st.phases[0]!.land;
      const lx = land.reduce((s, p) => s + p[0], 0) / land.length;
      const lz = land.reduce((s, p) => s + p[1], 0) / land.length;
      const far = st.well.reduce((m, p) => (Math.hypot(p[0] - lx, p[1] - lz) > Math.hypot(m[0] - lx, m[1] - lz) ? p : m), st.well[0]!);
      const cx = st.well.reduce((s, p) => s + p[0], 0) / st.well.length;
      const cz = st.well.reduce((s, p) => s + p[1], 0) / st.well.length;
      const d = Math.hypot(far[0] - cx, far[1] - cz) || 1;
      const out: Pt = [far[0] + ((far[0] - cx) / d) * 0.15, far[1] + ((far[1] - cz) / d) * 0.15];
      expect(stairEdge(st, 0, out[0], out[1]), `${id} canto`).toBe(true);
    }
  });

  it('o caracol do núcleo (Insights) também se anda: entra pela porta, sobe a volta e sai pela porta no andar de cima', () => {
    const id: ModuleId = 'insights';
    const r = voidRadius(id);
    const ys = Array.from({ length: levelCount(id) }, (_, L) => levelY(id, L));
    const w = coreWalk(r, ys);
    for (let n = 0; n + 1 < ys.length; n++) {
      const up = walkPath(w, ys, corePath(r, ys[n]!, ys[n + 1]!), n);
      expect(up.errors, `sobe ${n}`).toEqual([]);
      expect(up.step, `sobe ${n}`).toBeLessThan(0.15);
      expect(up.L, `sobe ${n}`).toBe(n + 1);
      const path = corePath(r, ys[n]!, ys[n + 1]!);
      const down: number[] = [];
      for (let i = path.length - 3; i >= 0; i -= 3) down.push(path[i]!, path[i + 1]!, path[i + 2]!);
      const dn = walkPath(w, ys, down, n + 1);
      expect(dn.errors, `desce ${n + 1}`).toEqual([]);
      expect(dn.L, `desce ${n + 1}`).toBe(n);
    }
    // No pilar e na parede (fora da porta) não se pisa; a volta sobe o andar inteiro em CORE_SWEEP.
    expect(w.floorAt(0.1, 0.1, 0)).toBeNull();
    expect(w.floorAt(-r + 0.2, 0, 0)).toBeNull();
    const a = -0.4 - CORE_SWEEP * 0.5;
    const rr = 1.5;
    expect(w.floorAt(Math.sin(a) * rr, Math.cos(a) * rr, ys[1]! / 2)).toBeCloseTo(ys[1]! / 2, 6);
  });

  it('troca de nível na metade da subida, com folga para não ficar trocando parado no meio', () => {
    const ys = [0, 10, 14.4, 18.8];
    expect(levelAtHeight(ys, 0, 0)).toBe(0);
    expect(levelAtHeight(ys, 4.9, 0)).toBe(0);
    expect(levelAtHeight(ys, 5.2, 0)).toBe(1);
    expect(levelAtHeight(ys, 4.9, 1)).toBe(1);
    expect(levelAtHeight(ys, 4.8, 1)).toBe(0);
    expect(levelAtHeight(ys, 12.3, 1)).toBe(1);
    expect(levelAtHeight(ys, 12.4, 1)).toBe(2);
    expect(levelAtHeight(ys, 15, 0)).toBe(2);
    expect(levelAtHeight(ys, 18.8, 3)).toBe(3);
    expect(levelAtHeight(ys, 2, 3)).toBe(0);
    expect(levelAtHeight([], 3, 2)).toBe(0);
  });
});
