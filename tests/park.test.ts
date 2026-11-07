import { describe, expect, it } from 'vitest';
import { NAV_MODULE_IDS } from '@/app/modules';
import { PLAZA_RADIUS, inWater, entranceOf, heightAt, layoutProblems, parkPaths, PARK_BUILDINGS, PARK_REGIONS, treePositions } from '@/domain/park';
import { Vector3 } from 'three';
import type { InboxItem } from '@/domain/inbox';
import { receptionData } from '@/features/park/receptionData';
import { createLogo3D } from '@/features/park/logo3d';

describe('parque 3D (V2, Etapa 0): planta', () => {
  it('um prédio por módulo (16 do menu + Profile e Settings), nas 5 regiões, sem sobreposição', () => {
    const ids = PARK_BUILDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(18);
    for (const id of [...NAV_MODULE_IDS, 'profile', 'settings']) expect(ids).toContain(id);
    for (const r of PARK_REGIONS) expect(PARK_BUILDINGS.some((b) => b.region === r)).toBe(true);
    expect(layoutProblems()).toEqual([]);
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
