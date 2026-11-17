import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@/app/modules';
import { FLOOR_PLANS } from '@/features/park/interiors/floors';
import { FORMS, hasRoofTerrace, upperPlan } from '@/features/park/forms';
import { topLevel, volsAt } from '@/features/park/massing';
import { insideAt, type Pt } from '@/features/park/outline';
import { CIRCULATION, corePath, inPoly, inWell, levelCount, liftShaft, phaseAt, ringGap, stairHole, stairOf, stairPath, stairSpots, voidRadius } from '@/features/park/stairs';

/** Prédios do Campus com mais de um pavimento e escada própria (a do núcleo é do Insights). */
const STAIRS: ModuleId[] = ['academy', 'languages', 'notes', 'library', 'inbox', 'calendar', 'tasks', 'projects', 'focus', 'goals', 'music', 'sports', 'finance'];

/** Pontos do miolo de um polígono (grade de 0,4 m). */
function interior(poly: readonly Pt[]): Pt[] {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const out: Pt[] = [];
  for (let x = Math.min(...xs) + 0.17; x <= Math.max(...xs); x += 0.4) for (let z = Math.min(...zs) + 0.17; z <= Math.max(...zs); z += 0.4) if (inPoly(poly, x, z)) out.push([x, z]);
  return out;
}

describe('Campus: escadas e elevadores pela circulação de cada prédio', () => {
  it('tipo da escada e número de elevadores do programa', () => {
    const want: Partial<Record<ModuleId, [string | null, number]>> = {
      academy: ['U', 2],
      languages: ['L', 2],
      notes: ['L', 2],
      library: ['U', 2],
      inbox: ['L', 2],
      calendar: ['curved', 2],
      focus: ['L', 2],
      habits: [null, 0],
      goals: ['U', 2],
      insights: ['core', 2],
      music: ['L', 2],
      finance: ['U', 2],
    };
    for (const [id, [stair, lifts]] of Object.entries(want) as Array<[ModuleId, [string | null, number]]>) {
      expect(CIRCULATION[id].stair, id).toBe(stair);
      expect(CIRCULATION[id].lifts, id).toBe(lifts);
      expect(liftShaft(id).xs.length, id).toBe(Math.max(1, lifts));
    }
    expect(stairOf('habits')).toBeNull();
    expect(stairOf('insights')).toBeNull();
  });

  it('todo prédio de vários pavimentos tem escada (a principal ou a do núcleo), do térreo ao último nível', () => {
    for (const id of STAIRS) {
      const st = stairOf(id);
      expect(st, id).not.toBeNull();
      expect(st!.ys.length, id).toBe(levelCount(id));
      expect(st!.ys.length, id).toBe(FLOOR_PLANS[id].length + 1 + (hasRoofTerrace(id) ? 1 : 0));
    }
  });

  it('a escada fica dentro da planta de todos os níveis, fora do eixo da entrada e do vazio do meio', () => {
    for (const id of STAIRS) {
      const st = stairOf(id)!;
      const top = topLevel(id);
      const inner = voidRadius(id);
      for (const [x, z] of [...st.well, ...interior(st.well)]) {
        for (let L = 0; L <= top; L++) expect(insideAt(volsAt(id, L), x, z, 0.3), `${id} nível ${L} (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(true);
        expect(Math.abs(x), `${id} eixo`).toBeGreaterThan(1.8);
        if (inner) expect(Math.hypot(x, z), `${id} vazio`).toBeGreaterThan(inner + 0.5);
      }
    }
  });

  it('o vão de cada laje fica dentro da escada; quem anda não entra nele, e o pé e a chegada ficam no piso livre', () => {
    for (const id of STAIRS) {
      const st = stairOf(id)!;
      const n = st.ys.length;
      expect(stairHole(st, 0), id).toBeNull();
      for (let L = 1; L < n; L++) {
        const hole = stairHole(st, L)!;
        expect(hole.length, `${id} ${L}`).toBeGreaterThan(2);
        // Todo ponto do vão é bloqueado (o mesmo teste do andar: inWell com folga).
        for (const [x, z] of interior(hole)) expect(inWell(st, x, z, 0.3), `${id} ${L} vão`).toBe(true);
        // O patamar do nível não é vão (é laje).
        for (const [x, z] of interior(phaseAt(st, L).land)) expect(inPoly(hole, x, z), `${id} ${L} patamar`).toBe(false);
      }
      for (let L = 0; L < n; L++) {
        const s = stairSpots(st, L);
        expect(!!s.up, `${id} ${L} sobe`).toBe(L < n - 1);
        expect(!!s.down, `${id} ${L} desce`).toBe(L > 0);
        const vols = volsAt(id, Math.min(L, topLevel(id)));
        for (const p of [s.up, s.down]) {
          if (!p) continue;
          expect(inWell(st, p[0], p[1], 0.3), `${id} ${L} pé no vão`).toBe(false);
          expect(insideAt(vols, p[0], p[1], 0.4), `${id} ${L} pé fora da planta`).toBe(true);
        }
      }
    }
  });

  it('o caminho sobe do pé no nível de baixo à chegada no de cima, sem descer no meio; a descida é o mesmo caminho ao contrário', () => {
    for (const id of STAIRS) {
      const st = stairOf(id)!;
      for (let L = 0; L + 1 < st.ys.length; L++) {
        const up = stairPath(st, L, true);
        const foot = stairSpots(st, L).up!;
        const head = stairSpots(st, L + 1).down!;
        expect(up[0]).toBeCloseTo(foot[0]);
        expect(up[1]).toBeCloseTo(st.ys[L]!);
        expect(up[2]).toBeCloseTo(foot[1]);
        expect(up[up.length - 3]).toBeCloseTo(head[0]);
        expect(up[up.length - 2]).toBeCloseTo(st.ys[L + 1]!);
        expect(up[up.length - 1]).toBeCloseTo(head[1]);
        for (let i = 4; i < up.length; i += 3) expect(up[i]!, `${id} ${L}`).toBeGreaterThanOrEqual(up[i - 3]! - 1e-6);
        // Nenhum passo maior que 8 m no plano (o caminho segue a escada, não corta caminho).
        for (let i = 3; i < up.length; i += 3) expect(Math.hypot(up[i]! - up[i - 3]!, up[i + 2]! - up[i - 1]!)).toBeLessThan(8);
        const down = stairPath(st, L + 1, false);
        expect(down.length).toBe(up.length);
        expect(down[0]).toBeCloseTo(head[0]);
        expect(down[1]).toBeCloseTo(st.ys[L + 1]!);
      }
    }
  });

  it('no anel de salas, a abertura dos fundos cobre a escada, o pé e a chegada', () => {
    for (const id of STAIRS) {
      const fp = upperPlan(FORMS[id]);
      if (fp !== 'atrium' && fp !== 'garden' && fp !== 'core') continue;
      const st = stairOf(id)!;
      const [g0, g1] = ringGap(st);
      expect(g0).toBeLessThanOrEqual(Math.PI - 0.5 + 1e-9);
      expect(g1).toBeGreaterThanOrEqual(Math.PI + 0.5 - 1e-9);
      for (const [x, z] of st.well) {
        let a = Math.atan2(x, z);
        if (a < 0) a += Math.PI * 2;
        expect(a, id).toBeGreaterThan(g0);
        expect(a, id).toBeLessThan(g1);
      }
    }
    expect(ringGap(null)).toEqual([Math.PI - 0.5, Math.PI + 0.5]);
  });

  it('o caracol do núcleo sai e chega pela porta, subindo a altura do andar', () => {
    const p = corePath(3, 9, 13.4);
    expect(p[1]).toBe(9);
    expect(p[p.length - 2]).toBeCloseTo(13.4);
    for (let i = 4; i < p.length; i += 3) expect(p[i]!).toBeGreaterThanOrEqual(p[i - 3]! - 1e-9);
    for (let i = 0; i < p.length; i += 3) expect(Math.hypot(p[i]!, p[i + 2]!)).toBeLessThan(4.1);
  });
});
