import { describe, expect, it } from 'vitest';
import { RECEPTION_DESKS, RECEPTION_WAY_GAP, receptionChairAt, receptionChairClear, type ReceptionId } from '@/features/park/interiors/westsouth';
import { stairRoute, stairWays } from '@/features/park/interiors/floors';
import { inLiftCore, inWell, liftCore, liftKeep, stairOf } from '@/features/park/stairs';
import { volsAt } from '@/features/park/massing';
import { insideAt } from '@/features/park/outline';
import { lifeSpots, type LifeLevel } from '@/features/park/interiors/indoorLife';

const IDS = Object.keys(RECEPTION_DESKS) as ReceptionId[];

describe('cadeira da recepção dos prédios do oeste/sul', () => {
  it('cada recepção tem a cadeira atrás do balcão, dentro do térreo, olhando para o visitante', () => {
    for (const id of IDS) {
      const d = RECEPTION_DESKS[id];
      const c = receptionChairAt(id);
      expect(insideAt(volsAt(id, 0), c.x, c.z, 0.5), id).toBe(true);
      // Do assento, o balcão fica na frente (para onde se olha).
      const dx = d.x - c.x;
      const dz = d.z - c.z;
      expect(Math.hypot(dx, dz)).toBeCloseTo(d.back, 6);
      expect(dx / d.back).toBeCloseTo(Math.sin(c.face), 6);
      expect(dz / d.back).toBeCloseTo(Math.cos(c.face), 6);
    }
  });

  it('nenhuma cadeira cai na escada, no núcleo ou no hall dos elevadores, nem perto do caminho até a escada', () => {
    for (const id of IDS) {
      const c = receptionChairAt(id);
      expect(receptionChairClear(id, c.x, c.z), id).toBe(true);
      expect(inWell(stairOf(id), c.x, c.z, 0.9), id).toBe(false);
      const core = liftCore(id);
      expect(inLiftCore(core, c.x, c.z, 0.3), id).toBe(false);
      if (core) {
        const k = liftKeep(core);
        expect(c.x > k.x0 && c.x < k.x1 && c.z > k.z0 && c.z < k.z1, id).toBe(false);
      }
      for (const [px, pz] of [...stairWays(id, 0), ...stairRoute(id, 0)]) expect(Math.hypot(px - c.x, pz - c.z), id).toBeGreaterThanOrEqual(RECEPTION_WAY_GAP);
    }
  });

  it('a cadeira é o lugar da recepcionista (a vida do interior põe alguém atendendo nela)', () => {
    const level: LifeLevel = { y: 0, blocked: () => false, obstacles: [] };
    for (const id of IDS) {
      const c = receptionChairAt(id);
      const spots = lifeSpots(id, [level], [{ x: c.x, y: 0.45, z: c.z, face: c.face, tag: 'staff' }]);
      expect(spots.some((s) => s.doing === 'reception' && s.seated && Math.hypot(s.x - c.x, s.z - c.z) < 0.01), id).toBe(true);
    }
  });

  it('o teste de folga recusa um ponto no caminho da escada', () => {
    const ways = stairWays('sports', 0);
    expect(ways.length).toBeGreaterThan(0);
    const [x, z] = ways[0]!;
    expect(receptionChairClear('sports', x, z)).toBe(false);
  });
});
