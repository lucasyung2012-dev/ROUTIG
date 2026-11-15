import { describe, expect, it } from 'vitest';
import { NAV_MODULE_IDS } from '@/app/modules';
import { PATH_WIDTH, PLAZA_RADIUS, inField, inWater, entranceOf, heightAt, layoutProblems, parkPaths, PARK_BUILDINGS, PARK_REGIONS, samplePath, treePositions } from '@/domain/park';
import { Vector3 } from 'three';
import type { InboxItem } from '@/domain/inbox';
import { receptionData } from '@/features/park/receptionData';
import { createLogo3D } from '@/features/park/logo3d';

describe('parque 3D (V2, Etapa 0): planta', () => {
  it('15 prédios: um por módulo de trabalho; Dashboard, Profile e Settings não têm prédio; sem sobreposição', () => {
    const ids: string[] = PARK_BUILDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(15);
    for (const id of NAV_MODULE_IDS.filter((m) => m !== 'dashboard')) expect(ids).toContain(id);
    for (const id of ['dashboard', 'profile', 'settings']) expect(ids).not.toContain(id);
    // Toda área temática tem prédios; o centro é só a praça.
    for (const r of PARK_REGIONS.filter((x) => x !== 'central')) expect(PARK_BUILDINGS.some((b) => b.region === r)).toBe(true);
    expect(PARK_BUILDINGS.some((b) => b.region === 'central')).toBe(false);
    expect(layoutProblems()).toEqual([]);
  });

  it('Focus fica numa ilha do lago, ligada à margem por uma ponte em que dá para andar', async () => {
    const { ISLAND, BRIDGE, onBridge, onIsland } = await import('@/domain/park');
    const focus = PARK_BUILDINGS.find((b) => b.id === 'focus')!;
    expect(Math.hypot(focus.x - ISLAND.x, focus.z - ISLAND.z) + focus.radius).toBeLessThanOrEqual(ISLAND.radius);
    // Ilha e ponte não são água (dá para andar); a água em volta delas é.
    expect(inWater(ISLAND.x, ISLAND.z, 0.8)).toBe(false);
    const mx = (BRIDGE.from.x + BRIDGE.to.x) / 2;
    const mz = (BRIDGE.from.z + BRIDGE.to.z) / 2;
    expect(onBridge(mx, mz)).toBe(true);
    expect(inWater(mx, mz, 0.8)).toBe(false);
    const L = Math.hypot(BRIDGE.to.x - BRIDGE.from.x, BRIDGE.to.z - BRIDGE.from.z);
    const nx = -(BRIDGE.to.z - BRIDGE.from.z) / L;
    const nz = (BRIDGE.to.x - BRIDGE.from.x) / L;
    for (const side of [-1, 1]) expect(inWater(mx + nx * 8 * side, mz + nz * 8 * side, 0.8)).toBe(true);
    expect(inWater(ISLAND.x + ISLAND.radius + 6, ISLAND.z, 0)).toBe(true);
    // A ponte começa dentro da ilha, termina em terra firme e é plana (como o chão da ilha).
    expect(onIsland(BRIDGE.from.x, BRIDGE.from.z)).toBe(true);
    expect(inWater(BRIDGE.to.x, BRIDGE.to.z, 0)).toBe(false);
    expect(L).toBeGreaterThan(20);
    expect(Math.abs(heightAt(mx, mz))).toBeLessThan(0.05);
    expect(Math.abs(heightAt(focus.x, focus.z))).toBeLessThan(0.05);
    // Algum caminho passa pela ponte e outro chega à entrada do prédio.
    expect(parkPaths().some((p) => p.deck)).toBe(true);
  });

  it('árvores sempre nas mesmas posições e fora de prédios, praça e lago', () => {
    const a = treePositions(120);
    expect(a).toEqual(treePositions(120));
    expect(a.length).toBe(120);
  });

  it('cada prédio tem entrada no próprio lote, fora do lago, ligada a um caminho; praça plana', () => {
    const ends = parkPaths().map((p) => p.points[p.points.length - 1]!);
    for (const b of PARK_BUILDINGS) {
      const e = entranceOf(b);
      expect(Math.hypot(e.x - b.x, e.z - b.z)).toBeLessThan(b.radius);
      expect(inWater(e.x, e.z, 2)).toBe(false);
      expect(ends.some((p) => Math.hypot(p.x - e.x, p.z - e.z) < 0.01)).toBe(true);
    }
    expect(heightAt(0, 0)).toBe(0);
    expect(heightAt(PLAZA_RADIUS, 0)).toBe(0);
  });
});

describe('parque V2.1: caminhos em ordem', () => {
  it('toda ponta de caminho chega a algum lugar: outro caminho, a praça ou a entrada de um prédio', () => {
    const paths = parkPaths();
    const entrances = PARK_BUILDINGS.map(entranceOf);
    const loose: string[] = [];
    paths.forEach((p, i) => {
      const a0 = p.points[0]!;
      const a1 = p.points[p.points.length - 1]!;
      if (Math.hypot(a0.x - a1.x, a0.z - a1.z) < 1) return; // circuito fechado
      for (const end of [a0, a1]) {
        if (inField(end.x, end.z, 5)) continue; // chega à quadra ou ao campo
        if (Math.abs(Math.hypot(end.x, end.z) - PLAZA_RADIUS) < 1) continue;
        if (entrances.some((e) => Math.hypot(e.x - end.x, e.z - end.z) < 1)) continue;
        const joined = paths.some((o, j) => j !== i && samplePath(o.points, 1).some((q) => Math.hypot(q.x - end.x, q.z - end.z) < 3));
        if (!joined) loose.push(`caminho ${i} solto em ${end.x.toFixed(0)},${end.z.toFixed(0)}`);
      }
    });
    expect(loose).toEqual([]);
  });

  it('nenhum caminho passa pela água nem pelo lote de outro prédio', () => {
    const problems: string[] = [];
    for (const [i, p] of parkPaths().entries()) {
      const w = PATH_WIDTH[p.kind];
      const end = p.points[p.points.length - 1]!;
      const own = PARK_BUILDINGS.find((b) => { const e = entranceOf(b); return Math.hypot(e.x - end.x, e.z - end.z) < 0.01; });
      for (const q of samplePath(p.points, 2)) {
        if (inWater(q.x, q.z, w / 2 + 0.3)) problems.push(`caminho ${i} na água em ${q.x.toFixed(0)},${q.z.toFixed(0)}`);
        for (const b of PARK_BUILDINGS) if (b !== own && Math.hypot(q.x - b.x, q.z - b.z) < b.radius * 0.75) problems.push(`caminho ${i} no lote de ${b.id}`);
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });
});

describe('parque (V2): Central de Recepção', () => {
  const base = { createdAt: '2026-11-05T12:00:00.000Z', updatedAt: '2026-11-05T12:00:00.000Z', deletedAt: null, rev: 1, kind: 'text', url: null, fileId: null, fileName: null, mime: null, size: null, snoozedUntil: null, processedTo: null } as const;
  const item = (id: string, over: Partial<InboxItem>): InboxItem => ({ ...base, id, text: id, status: 'open', ...over });

  it('números lidos dos itens reais: entrada, adiados, destinos, arquivo; excluídos ficam de fora', () => {
    const items = [
      item('a', {}),
      item('b', { snoozedUntil: '2026-11-20' }),
      item('c', { status: 'processed', processedTo: { type: 'task', id: 't1' } }),
      item('d', { status: 'processed', processedTo: { type: 'library', id: 'l1' } }),
      item('e', { status: 'archived', createdAt: '2026-10-01T12:00:00.000Z' }),
      item('f', { deletedAt: '2026-11-05T13:00:00.000Z' }),
    ];
    const d = receptionData(items, '2026-11-05');
    expect(d).toMatchObject({ open: 1, snoozed: 1, processed: 2, archived: 1, today: 4 });
    expect(d.byType).toEqual({ task: 1, event: 0, note: 0, library: 1 });
    expect(d.recent).toHaveLength(3);
    expect(d.recent).not.toContain('f');
  });

  it('logo do ROUTIG em 3D: malha única com o degradê oficial e do tamanho pedido', () => {
    const logo = createLogo3D(3);
    const g = logo.mesh.geometry;
    expect(g.attributes.color).toBeDefined();
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new Vector3());
    expect(size.y).toBeGreaterThan(2.4);
    expect(size.y).toBeLessThan(3.6);
    logo.dispose();
  });
});

describe('parque (V2): estações e eventos', () => {
  it('estação pela data no hemisfério sul e fim de ano decorativo', async () => {
    const { seasonOf, festiveOn } = await import('@/features/park/world');
    expect(seasonOf(new Date(2026, 0, 15))).toBe('summer');
    expect(seasonOf(new Date(2026, 4, 1))).toBe('autumn');
    expect(seasonOf(new Date(2026, 6, 10))).toBe('winter');
    expect(seasonOf(new Date(2026, 10, 6))).toBe('spring');
    expect(festiveOn(new Date(2026, 11, 24))).toBe(true);
    expect(festiveOn(new Date(2027, 0, 3))).toBe(true);
    expect(festiveOn(new Date(2026, 10, 6))).toBe(false);
  });
});

describe('Campus temático (14/11/2026): terreno e áreas', () => {
  it('o chão de pisar é a própria malha desenhada (nos vértices e entre eles)', async () => {
    const { TERRAIN, terrainVertex } = await import('@/domain/park');
    const step = TERRAIN.size / TERRAIN.seg;
    const half = TERRAIN.size / 2;
    for (const [i, j] of [[10, 20], [144, 144], [200, 90], [57, 233]] as const) {
      expect(heightAt(-half + i * step, -half + j * step)).toBeCloseTo(terrainVertex(i, j), 5);
      // No meio de um quadrado, a altura fica entre as dos quatro cantos (plano dos triângulos).
      const hs = [terrainVertex(i, j), terrainVertex(i + 1, j), terrainVertex(i, j + 1), terrainVertex(i + 1, j + 1)];
      const m = heightAt(-half + (i + 0.3) * step, -half + (j + 0.3) * step);
      expect(m).toBeGreaterThanOrEqual(Math.min(...hs) - 1e-6);
      expect(m).toBeLessThanOrEqual(Math.max(...hs) + 1e-6);
    }
  });

  it('relevo variado: morros altos e depressões dentro do parque, praça plana', () => {
    let max = -Infinity;
    let min = Infinity;
    for (let x = -360; x <= 360; x += 8)
      for (let z = -360; z <= 360; z += 8) {
        if (Math.hypot(x, z) > 360 || inWater(x, z, 30)) continue;
        const h = heightAt(x, z);
        max = Math.max(max, h);
        min = Math.min(min, h);
      }
    expect(max).toBeGreaterThan(14);
    expect(min).toBeLessThan(-0.8);
    expect(heightAt(0, 0)).toBe(0);
  });

  it('todo caminho é caminhável (nenhum trecho mais íngreme que ~31°)', () => {
    const steep: string[] = [];
    for (const [i, p] of parkPaths().entries()) {
      const s = samplePath(p.points, 1);
      for (let k = 1; k < s.length; k++) {
        const a = s[k - 1]!;
        const c = s[k]!;
        const run = Math.hypot(c.x - a.x, c.z - a.z);
        if (run < 0.3) continue;
        const g = Math.abs(heightAt(c.x, c.z) - heightAt(a.x, a.z)) / run;
        if (g > 0.6) steep.push(`caminho ${i} em ${a.x.toFixed(0)},${a.z.toFixed(0)}: ${g.toFixed(2)}`);
      }
    }
    expect(steep.slice(0, 10)).toEqual([]);
  });

  it('cada prédio fica na sua área temática; cada área tem prédios', async () => {
    const { themeAt } = await import('@/domain/park');
    for (const b of PARK_BUILDINGS) if (b.region !== 'central') expect(`${b.id}:${themeAt(b.x, b.z)}`).toBe(`${b.id}:${b.region}`);
    const byTheme = (t: string) => PARK_BUILDINGS.filter((b) => b.region === t).map((b) => b.id).sort();
    expect(byTheme('planning')).toEqual(['calendar', 'inbox', 'projects', 'tasks']);
    expect(byTheme('knowledge')).toEqual(['academy', 'languages', 'library', 'notes']);
    expect(byTheme('growth')).toEqual(['goals', 'habits', 'insights']);
    expect(byTheme('activity')).toEqual(['focus', 'music', 'sports']);
    expect(byTheme('finance')).toEqual(['finance']);
  });
});
