import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@/app/modules';
import { PARK_BUILDINGS } from '@/domain/park';
import { FLOOR_PLANS } from '@/features/park/interiors/floors';
import { FORMS, ROOF_TERRACES, upperPlan } from '@/features/park/forms';
import { MASSING, STOREY, groundSpan, levelY, liftDist, roofsAt, sideCut, topLevel, volsAt } from '@/features/park/massing';
import { boundOf, deckSpots, entranceRun, exitAt, inVol, insideAt, inscribed, nearestInside, reachAt, spanZ, tallerInside, terraceDoors, volPoly, wallRuns, type Vol } from '@/features/park/outline';

const rect = (cx: number, cz: number, w: number, d: number, hi = 0, rot = 0): Vol => ({ kind: 'rect', cx, cz, w, d, hi, rot });
const runLen = (vols: Vol[], height?: (i: number) => number) => wallRuns(vols, 1, height).reduce((s, r) => s + r.len, 0);
/** Área da planta (amostrada em grade de 0,5 m). */
const area = (vols: readonly Vol[]) => {
  const B = boundOf(vols) + 1;
  let n = 0;
  for (let x = -B; x <= B; x += 0.5) for (let z = -B; z <= B; z += 0.5) if (insideAt(vols, x, z)) n++;
  return n * 0.25;
};

describe('Campus: contorno dos volumes (geometria pura)', () => {
  it('ponto dentro do retângulo, do círculo e do polígono, com folga', () => {
    const r = rect(0, 0, 10, 6, 0, Math.PI / 2);
    // Girado 90°: a largura passa a correr ao longo de z.
    expect(inVol(r, 0, 4.9)).toBe(true);
    expect(inVol(r, 4, 0)).toBe(false);
    expect(inVol(r, 0, 4.9, 0.5)).toBe(false);
    const c: Vol = { kind: 'circle', cx: 2, cz: 0, r: 3, hi: 0 };
    expect(inVol(c, 4.9, 0)).toBe(true);
    expect(inVol(c, 5.1, 0)).toBe(false);
    const p: Vol = { kind: 'poly', cx: 0, cz: 0, r: 10, sides: 6, rot: Math.PI / 6, hi: 0 };
    // Apótema do hexágono (frente plana em z = 8,66).
    expect(inVol(p, 0, 8.6)).toBe(true);
    expect(inVol(p, 0, 8.7)).toBe(false);
  });

  it('volumes ligados viram um prédio só: sem parede na passagem, a folga vale na união', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(8, 0, 8, 4);
    // Perímetro da união: 10 + 10 + 10 + (3 + 4 + 3 por fora do primeiro) + 4 + 8 + 8 − 4 (abertura).
    const union = 10 * 4 - 4 + 4 + 2 * 7;
    expect(runLen([a, b])).toBeCloseTo(union, 0);
    // Na passagem (x = 5) dá para andar com folga; contra a parede, não.
    expect(insideAt([a, b], 5, 0, 0.6)).toBe(true);
    expect(insideAt([a, b], 5, 1.8, 0.6)).toBe(false);
    expect(insideAt([a, b], 0, 4.7, 0.45)).toBe(false);
    expect(insideAt([a, b], 0, 4.4, 0.45)).toBe(true);
    // Nenhum trecho de parede fica dentro do outro volume.
    for (const r of wallRuns([a, b])) {
      const mx = (r.ax + r.bx) / 2 + r.nx * 0.2;
      const mz = (r.az + r.bz) / 2 + r.nz * 0.2;
      expect(insideAt([a, b], mx, mz)).toBe(false);
    }
  });

  it('ala mais baixa: a parede do volume alto sobe acima da cobertura dela', () => {
    const tall = rect(0, 0, 10, 10);
    const low = rect(8, 0, 8, 4);
    const h = (i: number) => (i === 0 ? 10 : 5);
    const runs = wallRuns([tall, low], 1, h);
    const over = runs.filter((r) => r.from > 0);
    expect(over.length).toBeGreaterThan(0);
    for (const r of over) {
      expect(r.vol).toBe(0);
      expect(r.from).toBe(5);
      expect(Math.abs(r.ax - 5)).toBeLessThan(1e-6);
    }
    expect(over.reduce((s, r) => s + r.len, 0)).toBeCloseTo(4, 5);
  });

  it('frente, fundos, saída em cada direção e ponto válido mais perto', () => {
    const v = [rect(0, 1, 20, 24), rect(0, 15, 6, 6)];
    const s = spanZ(v, 0);
    expect(s.front).toBeCloseTo(18, 0);
    expect(s.back).toBeCloseTo(11, 0);
    expect(exitAt(v, Math.PI / 2, 0)).toBeCloseTo(10, 0);
    expect(reachAt(v, Math.PI, 40)).toBeCloseTo(11, 0);
    expect(inscribed(v)).toBeGreaterThan(9.5);
    const [x, z] = nearestInside(v, 30, 0, 1);
    expect(insideAt(v, x, z, 1)).toBe(true);
    expect(Math.hypot(x - 30, z)).toBeLessThan(22);
  });

  it('a entrada fica no trecho da frente que cruza x = 0', () => {
    const v = [rect(0, 0, 20, 20), rect(0, 12, 8, 4)];
    const e = entranceRun(wallRuns(v));
    expect(e).not.toBeNull();
    expect(e!.nz).toBeCloseTo(1, 5);
    expect(e!.az).toBeCloseTo(14, 5);
  });

  it('uma porta por terraço de ala, no trecho de fachada de frente para ela', () => {
    const tower = rect(0, 0, 12, 12, 2);
    const wingE = rect(10, 0, 8, 10, 1);
    const wingW = rect(-10, 0, 8, 10, 1);
    const doors = terraceDoors(wallRuns([tower]), [wingE, wingW]);
    expect(doors.length).toBe(2);
    const east = doors.find((d) => d.x > 0)!;
    expect(east.x).toBeCloseTo(6, 5);
    expect(east.nx).toBeCloseTo(1, 5);
    expect(Math.abs(east.z)).toBeLessThan(0.6);
  });

  it('torre que sobe do meio de um embasamento baixo vira furo no teto dele', () => {
    const podium: Vol = { kind: 'poly', cx: 0, cz: 0, r: 16, sides: 6, rot: Math.PI / 6, hi: 0, h: 6 };
    const tower = rect(0, 0, 18, 18, 2);
    const side = rect(14, 0, 8, 6, 1);
    const h = (i: number) => (i === 0 ? 6 : 11);
    const holes = tallerInside([podium, tower, side], 0, h);
    expect(holes.length).toBe(1);
    expect(holes[0]!.length).toBe(4);
    expect(tallerInside([podium, tower, side], 1, h)).toEqual([]);
  });

  it('peças do terraço dentro da planta, longe da borda e fora da ponte do elevador', () => {
    const v = [rect(0, 0, 24, 20)];
    const spots = deckSpots(v, wallRuns(v), 3, Math.PI);
    expect(spots.filter((s) => s.kind === 'bench').length).toBeGreaterThan(1);
    expect(spots.some((s) => s.kind === 'tree')).toBe(true);
    for (const s of spots) {
      expect(insideAt(v, s.x, s.z, 0.8), `${s.kind}`).toBe(true);
      expect(Math.abs(s.x) < 2.4 && s.z < 0, `${s.kind} na ponte`).toBe(false);
      expect(Math.hypot(s.x, s.z)).toBeGreaterThan(3);
    }
  });
});

describe('Campus: a volumetria de cada prédio (por fora e por dentro)', () => {
  const ids = PARK_BUILDINGS.map((b) => b.id);

  it('15 prédios, cada um com a sua volumetria e o número de andares do programa', () => {
    expect(ids.length).toBe(15);
    for (const id of Object.keys(FLOOR_PLANS) as ModuleId[]) expect(topLevel(id), id).toBe(FLOOR_PLANS[id].length);
    // Habits só tem o térreo; Notes tem dois pavimentos; Finanças e Música, três.
    expect(topLevel('habits')).toBe(0);
    expect(topLevel('notes')).toBe(1);
    expect(topLevel('finance')).toBe(2);
    expect(topLevel('music')).toBe(2);
  });

  it('a planta cabe no lote, com folga para o jardim em volta', () => {
    for (const b of PARK_BUILDINGS) {
      const bound = boundOf(MASSING[b.id].vols);
      expect(bound, b.id).toBeLessThan(b.radius - 2.5);
    }
  });

  it('os prédios não têm o mesmo tamanho nem a mesma altura', () => {
    const areas = ids.map((id) => area(volsAt(id, 0)));
    const heights = ids.map((id) => levelY(id, topLevel(id) + 1) || MASSING[id].ground);
    expect(Math.max(...areas) / Math.min(...areas)).toBeGreaterThan(2);
    expect(new Set(heights.map((h) => Math.round(h))).size).toBeGreaterThan(6);
    // Nenhum par de prédios com a mesma planta (área a menos de 3%) e a mesma altura.
    ids.forEach((a, i) =>
      ids.forEach((b, j) => {
        if (j <= i) return;
        const same = Math.abs(areas[i]! - areas[j]!) / Math.max(areas[i]!, areas[j]!) < 0.03 && Math.abs(heights[i]! - heights[j]!) < 1;
        expect(same, `${a} e ${b}`).toBe(false);
      }),
    );
    // Habits baixo e largo; Finanças compacto e alto; Esportes amplo; Notes comprido e horizontal.
    const A = (id: ModuleId) => areas[ids.indexOf(id)]!;
    expect(A('finance')).toBeLessThan(A('habits'));
    expect(A('sports')).toBeGreaterThan(A('finance') * 1.6);
    expect(levelY('finance', topLevel('finance') + 1)).toBeGreaterThan(MASSING.habits.ground + 5);
    const nb = boundOf(volsAt('notes', 0));
    const ns = spanZ(volsAt('notes', 0), 0);
    expect(2 * exitAt(volsAt('notes', 0), Math.PI / 2, 0)).toBeGreaterThan(ns.front + ns.back);
    expect(nb).toBeGreaterThan(20);
  });

  it('as alas podem ser mais baixas que o corpo principal (alturas diferentes)', () => {
    for (const id of ['academy', 'library', 'languages', 'tasks', 'projects', 'music', 'insights', 'inbox', 'calendar'] as ModuleId[]) {
      const his = new Set(MASSING[id].vols.map((v) => v.hi));
      expect(his.size, id).toBeGreaterThan(1);
    }
    // Calendar: geometria radial (tambor) com alas retangulares; Insights: círculo + retângulos.
    expect(MASSING.calendar.vols.some((v) => v.kind === 'circle')).toBe(true);
    expect(MASSING.calendar.vols.filter((v) => v.kind === 'rect' && Math.abs(v.rot ?? 0) > 1).length).toBe(2);
    expect(MASSING.insights.vols.some((v) => v.kind === 'circle')).toBe(true);
    expect(MASSING.insights.vols.some((v) => v.kind === 'rect')).toBe(true);
    // Projects: um volume deslocado e girado.
    expect(MASSING.projects.vols.some((v) => v.kind === 'rect' && (v.rot ?? 0) !== 0)).toBe(true);
  });

  it('entrada em x = 0 na frente; elevador nos fundos em x = 0; o centro fica dentro do térreo', () => {
    for (const id of Object.keys(MASSING) as ModuleId[]) {
      const g = volsAt(id, 0);
      expect(insideAt(g, 0, 0, 1), id).toBe(true);
      const e = entranceRun(wallRuns(g));
      expect(e, id).not.toBeNull();
      expect(e!.len, id).toBeGreaterThan(3.4);
      const s = groundSpan(id);
      // Lounge dos elevadores no fundo do térreo e quem chega pela porta da frente: lugares válidos.
      expect(insideAt(g, 0, -(s.back - 1.6), 0.45), `${id} fundos`).toBe(true);
      expect(insideAt(g, 0, s.front - 1.6, 0.45), `${id} frente`).toBe(true);
      expect(insideAt(g, 0, s.front - 4.6, 0.45), `${id} saguão`).toBe(true);
      expect(liftDist(id)).toBeCloseTo(s.back + 2.8, 5);
    }
  });

  it('em cada andar: chega-se pela ponte em x = 0, nos fundos; o vazio do meio cabe na planta', () => {
    for (const id of Object.keys(MASSING) as ModuleId[]) {
      const fp = upperPlan(FORMS[id]);
      const inner = fp === 'atrium' || fp === 'garden' ? Math.max(3.2, MASSING[id].void) : fp === 'core' ? Math.max(2.6, MASSING[id].void) : 0;
      for (let L = 1; L <= topLevel(id); L++) {
        const v = volsAt(id, L);
        expect(v.length, `${id} ${L}`).toBeGreaterThan(0);
        const s = spanZ(v, 0);
        expect(s.back, `${id} ${L}`).toBeGreaterThan(4);
        // A ponte chega à fachada dos fundos (nunca atrás da torre) e quem sai dela pisa dentro.
        expect(s.back, `${id} ${L}`).toBeLessThan(liftDist(id) - 1.5);
        expect(insideAt(v, 0, -s.back + 2.4, 0.45), `${id} ${L} chegada`).toBe(true);
        if (!inner) continue;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          expect(insideAt(v, Math.sin(a) * (inner + 2), Math.cos(a) * (inner + 2), 0.35), `${id} ${L} vazio`).toBe(true);
        }
      }
    }
  });

  it('mezanino (Focus, Projects): a galeria fica entre os fundos e a frente do andar', () => {
    for (const id of ['focus', 'projects'] as ModuleId[]) {
      expect(upperPlan(FORMS[id])).toBe('side');
      for (let L = 1; L <= topLevel(id); L++) {
        const s = spanZ(volsAt(id, L), 0);
        const zv = sideCut(id, L);
        expect(zv, `${id} ${L}`).toBeLessThan(s.front - 3);
        expect(zv - 2.8 - (-s.back), `${id} ${L}`).toBeGreaterThan(4);
      }
    }
    // O mezanino do Focus é parcial: o pavilhão do jardim tem só o térreo (com a claraboia).
    expect(volsAt('focus', 1).length).toBeLessThan(volsAt('focus', 0).length);
    expect(MASSING.focus.sky).toBeGreaterThan(0);
  });

  it('terraço das alas só nos prédios com terraço; as coberturas ficam na altura do piso', () => {
    for (const id of Object.keys(MASSING) as ModuleId[])
      for (let L = 1; L <= topLevel(id); L++)
        for (const v of roofsAt(id, L)) {
          expect(v.hi, id).toBe(L - 1);
          if (L === 1) expect(v.h === undefined || v.h >= MASSING[id].ground, id).toBe(true);
        }
    // Academy: as alas terminam um andar abaixo do bloco do átrio (terraço em cima delas).
    expect(ROOF_TERRACES).toContain('academy');
    expect(roofsAt('academy', 3).length).toBe(2);
    expect(levelY('academy', 3)).toBeCloseTo(MASSING.academy.ground + 2 * STOREY, 5);
  });

  it('o cofre de Finanças fica no anexo leste, com a câmara dentro da planta', () => {
    const g = volsAt('finance', 0);
    // Porta do cofre em x = 13,5 (de frente para o salão) e a câmara 1,35 m atrás dela.
    for (const z of [-1.7, 0, 1.7]) {
      expect(insideAt(g, 13.5, z, 0.1)).toBe(true);
      expect(insideAt(g, 14.9, z, 0.1)).toBe(true);
    }
    expect(MASSING.finance.vols.some((v) => v.kind === 'rect' && inVol(v, 13.5, 0) && !inVol(v, 0, 0))).toBe(true);
  });

  it('contorno do térreo fechado e sem pontas soltas (cada volume vira um polígono)', () => {
    for (const id of Object.keys(MASSING) as ModuleId[])
      for (const v of MASSING[id].vols) expect(volPoly(v).length, id).toBeGreaterThanOrEqual(4);
  });
});
