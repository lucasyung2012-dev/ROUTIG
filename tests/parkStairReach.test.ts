import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import type { CameraWorld, Obstacle } from '@/features/park/camera';
import { footprint } from '@/features/park/collision';
import { FLOOR_PLANS, levelRules, planStairReach, roomSlots, stairRoute, stairWays, type LevelRule, type Slot } from '@/features/park/interiors/floors';
import type { Pt } from '@/features/park/outline';
import { groundSpan } from '@/features/park/massing';
import { stairReach, walkWorld, type ReachLevel } from '@/features/park/reach';
import { CIRCULATION, HALL_HALF, coreFrom, coreWalk, inLiftCore, inPoly, liftCore, liftDir, liftKeep, liftServes, liftShaft, liftTargets, stairApproach, stairOf, stairSpots, stairWalk, voidRadius, type StairWalk } from '@/features/park/stairs';

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

/** Cantos da sala (paredes incluídas, `grow` m além do piso dela), no prédio. */
function roomCorners(sl: Slot, grow = 0.08): Pt[] {
  const c = Math.cos(sl.face);
  const s = Math.sin(sl.face);
  const hw = sl.w / 2 + grow;
  const hd = sl.d / 2 + grow;
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const).map(([lx, lz]): Pt => [sl.x + lx * c + lz * s, sl.z - lx * s + lz * c]);
}
/** O ponto cai na sala (paredes incluídas) crescida `m` m para cada lado. */
function inRoom(sl: Slot, x: number, z: number, m: number): boolean {
  const c = Math.cos(sl.face);
  const s = Math.sin(sl.face);
  const dx = x - sl.x;
  const dz = z - sl.z;
  return Math.abs(dx * c - dz * s) < sl.w / 2 + 0.08 + m && Math.abs(dx * s + dz * c) < sl.d / 2 + 0.08 + m;
}
/** Dois polígonos convexos se sobrepõem (teste dos eixos separadores; encostar não conta). */
function overlap(a: readonly Pt[], b: readonly Pt[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q[1] - p[1];
      const nz = p[0] - q[0];
      const pa = a.map(([x, z]) => x * nx + z * nz);
      const pb = b.map(([x, z]) => x * nx + z * nz);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
    }
  return true;
}

/**
 * Células de 0,5 m das paredes das salas do nível `L` (as estantes, nas ilhas da planta livre),
 * como o footprint do desenho as marca (centro a até 0,71 da célula da peça, raio 0,62 da célula).
 */
function roomWalls(id: ModuleId, L: number): Obstacle[] {
  if (L < 1) return [];
  const C = 0.5;
  const cells = new Map<string, Obstacle>();
  for (const sl of roomSlots(id, L)) {
    const c = Math.cos(sl.face);
    const s = Math.sin(sl.face);
    const { w, d } = sl;
    const side = (w - 1.8) / 2;
    // Peças da sala: centro (x, z locais), meia largura e meio fundo.
    const parts: Array<[number, number, number, number]> =
      sl.kind === 'box'
        ? [[0, -d / 2, w / 2, 0.075], [-w / 2, 0, 0.075, d / 2], [w / 2, 0, 0.075, d / 2], [-(0.9 + side / 2), d / 2, side / 2, 0.06], [0.9 + side / 2, d / 2, side / 2, 0.06], [-0.9, d / 2, 0.04, 0.09], [0.9, d / 2, 0.04, 0.09]]
        : [[-(w / 2 - 0.2), -0.1, 0.2, d * 0.4], [w / 2 - 0.2, -0.1, 0.2, d * 0.4]];
    for (const [px, pz, hw, hd] of parts) {
      const cx = sl.x + px * c + pz * s;
      const cz = sl.z - px * s + pz * c;
      const R = Math.hypot(hw, hd) + 1;
      for (let i = Math.floor((cx - R) / C); i <= Math.floor((cx + R) / C); i++)
        for (let j = Math.floor((cz - R) / C); j <= Math.floor((cz + R) / C); j++) {
          const x = (i + 0.5) * C;
          const z = (j + 0.5) * C;
          const lx = (x - cx) * c - (z - cz) * s;
          const lz = (x - cx) * s + (z - cz) * c;
          if (Math.hypot(Math.max(0, Math.abs(lx) - hw), Math.max(0, Math.abs(lz) - hd)) > C * 0.71) continue;
          cells.set(`${i},${j}`, { x, z, r: C * 0.62, h: 3 });
        }
    }
  }
  return [...cells.values()];
}

describe('Campus: salas dos andares fora do núcleo, do hall e do caminho até a escada', () => {
  it('nenhuma sala entra no núcleo dos elevadores nem no hall na frente das portas, em nenhum nível de nenhum prédio', () => {
    for (const id of FLOORS) {
      const c = liftCore(id)!;
      const hx = Math.max(c.x1, HALL_HALF);
      const coreHall: Pt[] = [[-hx, c.z0], [hx, c.z0], [hx, c.hall], [-hx, c.hall]];
      FLOOR_PLANS[id].forEach((_, i) => {
        const L = i + 1;
        for (const sl of roomSlots(id, L)) {
          const at = `${id} nível ${L} sala ${sl.k} (${sl.x.toFixed(2)}, ${sl.z.toFixed(2)})`;
          expect(overlap(roomCorners(sl), coreHall), `${at}: no núcleo ou no hall`).toBe(false);
          // A chegada do elevador fica a mais de 0,5 m de toda sala (com as paredes).
          expect(inRoom(sl, 0, c.z1 + 1.6, 0.5), `${at}: na chegada do elevador`).toBe(false);
        }
      });
    }
  });

  it('nenhuma sala cobre o pé, a chegada ou a entrada do patamar da escada, nem entra no vão', () => {
    for (const id of FLOORS) {
      const st = stairOf(id);
      FLOOR_PLANS[id].forEach((_, i) => {
        const L = i + 1;
        const way = stairWays(id, L);
        if (st) expect(way, `${id} ${L}`).toEqual(stairApproach(st, L));
        for (const sl of roomSlots(id, L)) {
          const at = `${id} nível ${L} sala ${sl.k}`;
          for (const [x, z] of way) expect(inRoom(sl, x, z, 0.5), `${at}: caminho (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
          if (!st) continue;
          for (const [x, z] of st.well) expect(inRoom(sl, x, z, 0.3), `${at}: canto do vão (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
          // Amostra da sala (0,25 m) fora do vão.
          const cs = roomCorners(sl, 0);
          const [a, b, , e] = cs;
          for (let u = 0; u <= 1.0001; u += 0.25 / Math.max(1, sl.w))
            for (let v = 0; v <= 1.0001; v += 0.25 / Math.max(1, sl.d)) {
              const x = a![0] + (b![0] - a![0]) * u + (e![0] - a![0]) * v;
              const z = a![1] + (b![1] - a![1]) * u + (e![1] - a![1]) * v;
              expect(inPoly(st.well, x, z), `${at}: no vão (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
            }
        }
      });
    }
  });

  it('cada andar com salas no programa fica com pelo menos uma (no Projects, todas do lado sem a escada)', () => {
    for (const id of FLOORS)
      FLOOR_PLANS[id].forEach((rooms, i) => {
        if (!rooms.length) return;
        const slots = roomSlots(id, i + 1);
        expect(slots.length, `${id} nível ${i + 1}`).toBeGreaterThan(0);
        // Cada sala aparece uma vez só, com o índice dela no programa.
        expect(new Set(slots.map((s) => s.k)).size, `${id} nível ${i + 1}`).toBe(slots.length);
        for (const s of slots) expect(s.k < rooms.length, `${id} nível ${i + 1}`).toBe(true);
      });
    // Projects: a escada fica à direita do núcleo; as salas do mezanino ficam todas à esquerda.
    for (const L of [1, 2]) for (const s of roomSlots('projects', L)) expect(s.x, `projects ${L}`).toBeLessThan(0);
  });

  it('a área livre do núcleo e do hall (liftKeep) contém o núcleo, o hall e a chegada', () => {
    for (const id of FLOORS) {
      const c = liftCore(id)!;
      const k = liftKeep(c);
      expect(k.x0 <= Math.min(c.x0, -HALL_HALF) && k.x1 >= Math.max(c.x1, HALL_HALF), id).toBe(true);
      expect(k.z0 <= c.z0 && k.z1 >= c.hall, id).toBe(true);
      expect(c.z1 + 1.6 > k.z0 && c.z1 + 1.6 < k.z1, id).toBe(true);
    }
  });

  it('há rota a pé, só pela planta, da chegada do elevador até cada ponto do caminho da escada, em todo nível', () => {
    for (const id of FLOORS) {
      const n = levelRules(id)!.length;
      for (let L = 1; L < n; L++) {
        const way = stairWays(id, L);
        const route = stairRoute(id, L);
        if (!way.length) continue;
        expect(route.length, `${id} ${L}`).toBeGreaterThan(0);
        const dist = ([x, z]: readonly [number, number]) => Math.min(...route.map(([px, pz]) => Math.hypot(px - x, pz - z)));
        // Pé e topo dos lances (os primeiros pontos) sempre; das bordas do patamar, basta uma — uma
        // borda pode dar para um canto fechado atrás da escada (corrimão, núcleo e fachada).
        const st = stairOf(id);
        const s = st ? stairSpots(st, L) : null;
        const ends = s ? (s.up ? 1 : 0) + (s.down ? 1 : 0) : way.length;
        // A rota daqui é a simplificada (só a planta, corpo de 0,3 m): entre escada e núcleo ela pode
        // parar um pouco antes; o alcance de verdade é conferido no teste completo (stairReach).
        for (const p of way.slice(0, ends)) expect(dist(p), `${id} ${L} (${p[0].toFixed(2)}, ${p[1].toFixed(2)})`).toBeLessThan(2.5);
        const edges = way.slice(ends);
        if (edges.length) expect(Math.min(...edges.map(dist)), `${id} ${L} bordas`).toBeLessThan(1.25);
      }
    }
  });

  it('com as paredes das salas desenhadas, da chegada do elevador se chega à escada e se sobe e desce a pé', () => {
    for (const id of FLOORS) {
      const rep = reachOf(id, (L) => roomWalls(id, L));
      for (const r of rep) {
        const at = `${id} nível ${r.level}`;
        const why = JSON.stringify(r.misses.map((m) => ({ what: m.what, level: m.level, near: m.near.slice(0, 3).map((b) => [b.o.x, b.o.z]) })));
        expect(r.arrival, `${at}: chegada do elevador livre ${why}`).toBe(true);
        for (const s of r.spots) expect(s.reached, `${at}: ${s.kind} ${why}`).toBe(true);
        if (r.up !== null) expect(r.up, `${at}: sobe a pé ${why}`).toBe(true);
        if (r.down !== null) expect(r.down, `${at}: desce a pé ${why}`).toBe(true);
        expect(r.misses, at).toEqual([]);
      }
    }
  }, 180_000);

  it('as salas não fecham o corredor até a escada: da chegada do elevador se chega a pé ao pé, à chegada e a uma borda do patamar, em todo andar de todo prédio (planStairReach)', () => {
    for (const id of FLOORS)
      FLOOR_PLANS[id].forEach((_, i) => {
        const L = i + 1;
        const r = planStairReach(id, L, roomSlots(id, L));
        if (!r) return;
        const at = `${id} nível ${L}`;
        // Pé e chegada da escada (os primeiros pontos do caminho), com as salas; "sem salas" diz se
        // já a planta (regra do nível, fachada, guarda-corpo do vazio) fecha o ponto.
        r.way.slice(0, r.ends).forEach(([x, z], g) => {
          // O que a planta já fecha (modelo simplificado) não é culpa das salas: o alcance real é o
          // do teste completo acima. Aqui: o que se alcança sem salas continua alcançável com elas.
          if (r.base[g]) expect(r.rooms[g], `${at}: ponto ${g} (${x.toFixed(2)}, ${z.toFixed(2)}); sem salas: ${r.base[g]}`).toBe(true);
        });
        // Das bordas do patamar, basta uma (como na rota até a escada), se alguma se alcança sem salas.
        if (r.base.slice(r.ends).some(Boolean)) expect(r.rooms.slice(r.ends).some(Boolean), `${at}: borda do patamar`).toBe(true);
      });
  }, 120_000);

  it('a conferência das salas acusa uma sala cuja parede passa pelo pé da escada', () => {
    const id: ModuleId = 'notes';
    const L = 1;
    const st = stairOf(id)!;
    const s = stairSpots(st, L);
    const foot = (s.up ?? s.down)!;
    // Sala de 3 m x 3 m virada para +z: a parede do fundo passa pelo ponto.
    const wall: Slot = { k: 0, x: foot[0], z: foot[1] + 1.5, face: 0, w: 3, d: 3, kind: 'box' };
    const r = planStairReach(id, L, [wall])!;
    const g = r.way.findIndex(([x, z]) => x === foot[0] && z === foot[1]);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(r.rooms[g]).toBe(false);
  });

  it('Languages, 3º andar: a Biblioteca de vocabulário continua no andar, numa vaga que não fecha a escada', () => {
    expect(roomSlots('languages', 3).map((sl) => sl.k)).toEqual([0]);
    const r = planStairReach('languages', 3, roomSlots('languages', 3))!;
    for (let g = 0; g < r.ends; g++) expect(r.rooms[g], `ponto ${g}`).toBe(true);
  });

  it('a conferência diz o que trava: um obstáculo na chegada do elevador aparece entre os mais perto dela', () => {
    const id: ModuleId = 'tasks';
    const c = liftCore(id)!;
    const a: Pt = [0, c.z1 + 1.6];
    const rep = reachOf(id, (L) => (L === 1 ? [{ x: a[0] + 0.2, z: a[1], r: 0.3, h: 1 }] : []));
    const r = rep[1]!;
    expect(r.arrival).toBe(false);
    const m = r.misses.find((x) => x.what === 'arrival')!;
    expect(m.level).toBe(1);
    expect(m.why).toBe('obstacle');
    expect(m.near[0]!.o.x).toBeCloseTo(0.2);
    expect(m.near[0]!.d).toBeLessThan(0);
  });

  it('a conferência diz o que cerca um pé da escada isolado (as peças da cerca, com o nível)', () => {
    const id: ModuleId = 'notes';
    const st = stairOf(id)!;
    const foot = stairSpots(st, 0).up!;
    // Um anel de obstáculos em volta do pé (a 1 m dele).
    const fence: Obstacle[] = Array.from({ length: 24 }, (_, k) => ({ x: foot[0] + Math.sin((k / 24) * Math.PI * 2) * 1.0, z: foot[1] + Math.cos((k / 24) * Math.PI * 2) * 1.0, r: 0.2, h: 1 }));
    const rep = reachOf(id, (L) => (L === 0 ? fence : []));
    const m = rep[0]!.misses.find((x) => x.what === 'foot')!;
    expect(m.why).toBe('');
    expect(m.walls.length).toBeGreaterThan(0);
    for (const b of m.walls) {
      expect(b.level).toBe(0);
      expect(Math.hypot(b.o.x - foot[0], b.o.z - foot[1])).toBeCloseTo(1.0, 5);
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

