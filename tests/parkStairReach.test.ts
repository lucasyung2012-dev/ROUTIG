import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import type { CameraWorld, Obstacle } from '@/features/park/camera';
import { footprint } from '@/features/park/collision';
import { levelRules, type LevelRule } from '@/features/park/interiors/floors';
import { groundSpan } from '@/features/park/massing';
import { stairReach, walkWorld, type ReachLevel } from '@/features/park/reach';
import { CIRCULATION, coreFrom, coreWalk, inLiftCore, inPoly, liftCore, liftDir, liftServes, liftShaft, liftTargets, stairApproach, stairOf, stairSpots, stairWalk, voidRadius, type StairWalk } from '@/features/park/stairs';

/** Prédios do Campus com andares (Habits é só térreo). */
const FLOORS: ModuleId[] = ['academy', 'languages', 'notes', 'library', 'inbox', 'calendar', 'tasks', 'projects', 'focus', 'goals', 'insights', 'music', 'sports', 'finance'];

/** O mundo de quem anda em cada nível, só pela planta (como o motor, sem os móveis), com obstáculos extras por nível. */
function levelsOf(id: ModuleId, rules: readonly LevelRule[], sw: StairWalk, extra: (L: number) => Obstacle[] = () => []): ReachLevel[] {
  const front = groundSpan(id).front - 1.5;
  return rules.map((r, L): ReachLevel => {
    const base: CameraWorld = { ground: () => r.y, obstacles: extra(L), limit: { x: 0, z: 0, r: r.walk }, ceiling: r.y + 4, minDistance: 1.5, maxDistance: 40, blocked: r.blocked };
    return { y: r.y, starts: L === 0 ? [[r.arrive.x, r.arrive.z], [0, front]] : [[r.arrive.x, r.arrive.z]], world: (feet) => walkWorld(base, sw, L, r.y, feet) };
  });
}

function reachOf(id: ModuleId, extra?: (L: number) => Obstacle[]) {
  const rules = levelRules(id)!;
  const ys = rules.map((r) => r.y);
  const st = stairOf(id);
  const sw = st ? stairWalk(st) : coreWalk(voidRadius(id), ys.slice(coreFrom(id)));
  return stairReach({ ys, levels: levelsOf(id, rules, sw, extra), stair: st, core: st ? null : { r: voidRadius(id), from: coreFrom(id) } });
}

describe('Campus: chegar a pé à escada em todos os níveis (stairs:reach)', () => {
  it('em todo nível de todo prédio, da chegada do elevador se chega ao pé e à chegada da escada, e se sobe e desce a pé', () => {
    for (const id of FLOORS) {
      const rep = reachOf(id);
      expect(rep.length, id).toBe(levelRules(id)!.length);
      for (const r of rep) {
        const at = `${id} nível ${r.level}`;
        expect(r.arrival, `${at}: chegada do elevador livre`).toBe(true);
        for (const s of r.spots) expect(s.reached, `${at}: ${s.kind} (${s.at[0].toFixed(2)}, ${s.at[1].toFixed(2)})`).toBe(true);
        if (r.up !== null) expect(r.up, `${at}: sobe a pé`).toBe(true);
        if (r.down !== null) expect(r.down, `${at}: desce a pé`).toBe(true);
        // Em volta da escada (fora do guarda-corpo), perto do caminho até ela, nenhum ponto livre fica
        // isolado (fechados de verdade, só os bolsões entre o guarda-corpo, o núcleo e a fachada, longe dele).
        const st = stairOf(id);
        if (st) {
          const way = stairApproach(st, r.level);
          const near = r.ring.isolated.filter(([x, z]) => way.some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.5));
          expect(near.map((p) => p.map((v) => +v.toFixed(2))), `${at}: isolado perto do caminho`).toEqual([]);
        }
      }
      // Cada nível servido pela escada tem pé ou chegada (do térreo ao último).
      expect(rep.every((r) => r.spots.length > 0), id).toBe(true);
    }
  }, 120_000);

  it('a conferência acusa um obstáculo no pé da escada (a "barreira invisível")', () => {
    const id: ModuleId = 'notes';
    const st = stairOf(id)!;
    const foot = stairSpots(st, 0).up!;
    const rep = reachOf(id, (L) => (L === 0 ? [{ x: foot[0], z: foot[1], r: 0.3, h: 1 }] : []));
    expect(rep[0]!.spots.find((s) => s.kind === 'foot')!.reached).toBe(false);
    // O obstáculo aparece no anel em volta da escada.
    expect(rep[0]!.ring.obstacles.length).toBeGreaterThan(0);
  });

  it('o pé e a chegada da escada ficam fora do vão, no piso livre de cada nível; o caminho até ela, fora do vão', () => {
    for (const id of FLOORS) {
      const st = stairOf(id);
      if (!st) continue;
      const rules = levelRules(id)!;
      rules.forEach((r, L) => {
        for (const [x, z] of stairApproach(st, L)) expect(inPoly(st.well, x, z), `${id} ${L} (${x.toFixed(1)}, ${z.toFixed(1)}) no vão`).toBe(false);
        const s = stairSpots(st, L);
        for (const [x, z] of [s.up, s.down].filter((p): p is [number, number] => !!p)) {
          expect(inPoly(st.well, x, z), `${id} ${L} (${x.toFixed(1)}, ${z.toFixed(1)}) no vão`).toBe(false);
          expect(r.blocked(x, z), `${id} ${L} (${x.toFixed(1)}, ${z.toFixed(1)}) bloqueado`).toBe(false);
        }
      });
    }
  });
});

describe('Campus: colisão pelo desenho (footprint)', () => {
  it('uma parede na diagonal marca só as células ao longo dela, não a caixa inteira', () => {
    const root = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.15), new THREE.MeshBasicMaterial());
    wall.position.set(0, 1.5, 0);
    wall.rotation.y = Math.PI / 4;
    root.add(wall);
    const cells = footprint(root, () => 0, 0.3, 1.45, 0.5);
    expect(cells.length).toBeGreaterThan(10);
    // Toda célula fica perto da linha da parede (x = −z, girada 45°): no máximo meia diagonal + meia espessura.
    for (const o of cells) expect(Math.abs(o.x + o.z) / Math.SQRT2, `(${o.x}, ${o.z})`).toBeLessThan(0.5 * 0.71 + 0.1 + 1e-6);
    // A caixa inteira (5,7 m x 5,7 m) teria mais de 120 células.
    expect(cells.length).toBeLessThan(60);
  });
});

describe('Campus: elevadores, o da esquerda sobe e o da direita desce', () => {
  it('todo prédio com andares tem dois elevadores (Notes e Focus no poço estreito), o núcleo dentro da planta', () => {
    for (const id of FLOORS) {
      expect(CIRCULATION[id].lifts, id).toBe(2);
      const s = liftShaft(id);
      expect(s.xs.length, id).toBe(2);
      expect(s.xs[0]!, id).toBeLessThan(0);
      expect(s.xs[1]!, id).toBeGreaterThan(0);
      expect(liftCore(id), id).not.toBeNull();
    }
    expect(liftShaft('notes').w).toBeLessThan(liftShaft('academy').w);
    expect(CIRCULATION.habits.lifts).toBe(0);
    expect(liftCore('habits')).toBeNull();
  });

  it('a escada não encosta no núcleo (o pé e a chegada a mais de 0,4 m dele)', () => {
    for (const id of FLOORS) {
      const st = stairOf(id);
      const c = liftCore(id)!;
      if (!st) continue;
      for (const p of st.well) expect(inLiftCore(c, p[0], p[1]), `${id} vão`).toBe(false);
      for (let L = 0; L < st.ys.length; L++) {
        const s = stairSpots(st, L);
        for (const p of [s.up, s.down]) if (p) expect(inLiftCore(c, p[0], p[1], 0.4), `${id} ${L} pé`).toBe(false);
        for (const p of stairApproach(st, L)) expect(inLiftCore(c, p[0], p[1], 0.1), `${id} ${L} caminho`).toBe(false);
      }
    }
  });

  it('sentido e paradas: o que sobe não para no último nível; o que desce, no térreo; o painel lista só os andares do sentido', () => {
    expect(liftDir(0, 2)).toBe('up');
    expect(liftDir(1, 2)).toBe('down');
    expect(liftDir(0, 1)).toBe('both');
    const n = 4;
    expect([0, 1, 2, 3].map((k) => liftServes('up', k, n))).toEqual([true, true, true, false]);
    expect([0, 1, 2, 3].map((k) => liftServes('down', k, n))).toEqual([false, true, true, true]);
    expect(liftTargets('up', 1, n)).toEqual([2, 3]);
    expect(liftTargets('down', 2, n)).toEqual([0, 1]);
    expect(liftTargets('up', 3, n)).toEqual([]);
    expect(liftTargets('down', 0, n)).toEqual([]);
    expect(liftTargets('both', 1, 3)).toEqual([0, 2]);
  });

  it('o hall de cada nível fica livre na frente das duas portas (chegada à esquerda e à direita)', () => {
    for (const id of FLOORS) {
      const c = liftCore(id)!;
      for (const r of levelRules(id)!) for (const x of c.xs) expect(r.blocked(x, r.arrive.z), `${id} y ${r.y} porta ${x}`).toBe(false);
    }
  });
});

