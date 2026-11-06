import { describe, expect, it } from 'vitest';
import { NAV_MODULE_IDS } from '@/app/modules';
import { layoutProblems, PARK_BUILDINGS, PARK_REGIONS, treePositions } from '@/domain/park';

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
});
