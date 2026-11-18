import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@/app/modules';
import type { Seat } from '@/features/park/camera';
import { FLOOR_PLANS, levelRules, stairRoute, stairWays } from '@/features/park/interiors/floors';
import { KEEP, LIFE, LIFE_CAP, createIndoorLife, deskAt, floorLight, headcount, levelFactor, lifePick, lifeSpots, occupancy, staffOn, type LifeKind, type LifeLevel } from '@/features/park/interiors/indoorLife';
import { inWell, liftCore, liftKeep, stairOf } from '@/features/park/stairs';
import { volsAt } from '@/features/park/massing';
import { insideAt, segDist } from '@/features/park/outline';

const IDS = Object.keys(FLOOR_PLANS) as ModuleId[];
const KINDS: LifeKind[] = ['study', 'work', 'data', 'music', 'sport', 'calm'];
const HOURS = Array.from({ length: 97 }, (_, i) => i * 0.25);

/** Os níveis do prédio só pela planta (sem móveis): a mesma regra de onde se pisa do motor. */
function planLevels(id: ModuleId): LifeLevel[] {
  const rules = levelRules(id);
  if (rules) return rules.map((r) => ({ y: r.y, blocked: r.blocked, obstacles: [] }));
  const g = volsAt(id, 0);
  return [{ y: 0, blocked: (x, z) => !insideAt(g, x, z, 0.45), obstacles: [] }];
}

const spotsCache = new Map<ModuleId, ReturnType<typeof lifeSpots>>();
const spotsOf = (id: ModuleId) => {
  let s = spotsCache.get(id);
  if (!s) {
    s = lifeSpots(id, planLevels(id), []);
    spotsCache.set(id, s);
  }
  return s;
};

describe('Campus vivo: ocupação pela hora', () => {
  it('fica entre 0 e 1 a qualquer hora e vazia de madrugada', () => {
    for (const k of KINDS) {
      for (const h of HOURS) {
        const o = occupancy(k, h);
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(1);
      }
      expect(occupancy(k, 3)).toBe(0);
    }
  });

  it('tem o pico de cada uso no horário dele', () => {
    expect(occupancy('study', 10)).toBeGreaterThan(0.6);
    expect(occupancy('work', 14)).toBeGreaterThan(occupancy('work', 20));
    expect(occupancy('music', 20)).toBeGreaterThan(occupancy('music', 10));
    expect(occupancy('sport', 7.5)).toBeGreaterThan(occupancy('sport', 13));
    // A hora dá a volta no relógio.
    expect(occupancy('study', 34)).toBeCloseTo(occupancy('study', 10));
  });

  it('conta ninguém de madrugada, gente no pico e menos no aparelho fraco', () => {
    for (const id of IDS) {
      expect(headcount(id, 3, 'high', 100)).toBe(0);
      expect(headcount(id, 10.5, 'low', 100)).toBeLessThanOrEqual(headcount(id, 10.5, 'medium', 100));
      expect(headcount(id, 10.5, 'medium', 100)).toBeLessThanOrEqual(headcount(id, 10.5, 'high', 100));
      expect(headcount(id, 20, 'high', 100)).toBeLessThanOrEqual(LIFE_CAP.high);
      // Nunca mais gente que lugares.
      expect(headcount(id, 10.5, 'high', 3)).toBeLessThanOrEqual(3);
    }
    expect(headcount('library', 10.5, 'high', 100)).toBeGreaterThan(10);
  });

  it('acende os andares conforme a ocupação (térreo aceso com a recepção aberta)', () => {
    for (const id of IDS) {
      for (const h of HOURS) for (let L = 0; L < 5; L++) {
        const v = floorLight(id, L, h);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(floorLight(id, 0, 12)).toBe(1);
      expect(floorLight(id, 0, 3)).toBeLessThan(1);
      for (let L = 1; L <= (FLOOR_PLANS[id]?.length ?? 0); L++) expect(floorLight(id, L, 3)).toBe(0);
    }
    // No pico do trabalho, todos os andares dos prédios de trabalho estão acesos.
    for (const id of IDS.filter((i) => LIFE[i].kind === 'work')) for (let L = 1; L <= (FLOOR_PLANS[id]?.length ?? 0); L++) expect(floorLight(id, L, 10.5)).toBe(1);
    expect(staffOn(8)).toBe(true);
    expect(staffOn(23)).toBe(false);
  });
});

describe('Campus vivo: lugares de quem fica de pé ou anda', () => {
  it.each(IDS)('%s: ninguém no vão da escada, no núcleo/hall dos elevadores, na chegada ou na rota até a escada', (id) => {
    const levels = planLevels(id);
    const spots = spotsOf(id);
    const st = stairOf(id);
    const core = liftCore(id);
    const keep = core ? liftKeep(core) : null;
    const inKeep = (x: number, z: number) => !!keep && x > keep.x0 && x < keep.x1 && z > keep.z0 && z < keep.z1;
    const ways = levels.map((_, L) => stairWays(id, L));
    const routes = levels.map((_, L) => stairRoute(id, L));
    expect(spots.length).toBeGreaterThan(2);
    for (const s of spots) {
      expect(s.seated).toBe(false);
      const lv = levels[s.level]!;
      expect(lv.blocked(s.x, s.z)).toBe(false);
      expect(inWell(st, s.x, s.z, KEEP.well - 0.01)).toBe(false);
      expect(inKeep(s.x, s.z)).toBe(false);
      for (const [wx, wz] of ways[s.level]!) expect(Math.hypot(wx - s.x, wz - s.z)).toBeGreaterThanOrEqual(KEEP.ways - 1e-6);
      for (const [rx, rz] of routes[s.level]!) expect(Math.hypot(rx - s.x, rz - s.z)).toBeGreaterThanOrEqual(KEEP.route - 1e-6);
      // Quem anda: o caminho inteiro fora do vão, do núcleo e do que não se pisa.
      if (s.to) {
        const d = Math.hypot(s.to.x - s.x, s.to.z - s.z);
        for (let k = 0; k <= d; k += 0.25) {
          const x = s.x + ((s.to.x - s.x) * k) / d;
          const z = s.z + ((s.to.z - s.z) * k) / d;
          expect(lv.blocked(x, z)).toBe(false);
          expect(inWell(st, x, z, 0.3)).toBe(false);
          expect(inKeep(x, z)).toBe(false);
        }
      }
    }
    // Ninguém de pé colado em outra pessoa.
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i]!;
        const b = spots[j]!;
        if (a.level !== b.level || a.to || b.to) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(1.1 - 1e-6);
      }
  });

  it('não põe ninguém de pé dentro de um móvel', () => {
    const id: ModuleId = 'habits';
    const base = planLevels(id)[0]!;
    const free = lifeSpots(id, [base], []);
    expect(free.length).toBeGreaterThan(0);
    // Um "móvel" em cima de cada lugar livre: todos esses lugares deixam de valer.
    const furniture = free.map((s) => ({ x: s.x, z: s.z, r: 0.5, h: 0.9 }));
    const again = lifeSpots(id, [{ ...base, obstacles: furniture }], []);
    for (const s of again) for (const o of furniture) expect(Math.hypot(o.x - s.x, o.z - s.z)).toBeGreaterThanOrEqual(o.r + KEEP.furniture - 1e-6);
  });
});

describe('Campus vivo: assentos, mesas e recepção', () => {
  const lv: LifeLevel = { y: 0, blocked: () => false, obstacles: [{ x: 0, z: 0.8, r: 0.496, h: 0.75 }] };

  it('acha a mesa na frente do assento (e só com altura de mesa)', () => {
    const d = deskAt({ x: 0, z: 0, face: 0 }, lv);
    expect(d).not.toBeNull();
    expect(d!.y).toBeCloseTo(0.75);
    expect(d!.z).toBeGreaterThan(0.4);
    expect(deskAt({ x: 0, z: 0, face: Math.PI }, lv)).toBeNull();
    expect(deskAt({ x: 0, z: 0, face: 0 }, { ...lv, obstacles: [{ x: 0, z: 0.8, r: 0.496, h: 1.6 }] })).toBeNull();
  });

  it('põe a recepcionista na cadeira da recepção só no horário dela', () => {
    const seats: Seat[] = [
      { x: 3, y: 0.45, z: 2, face: 0, tag: 'staff' },
      { x: -3, y: 0.45, z: 2, face: 0 },
    ];
    const level: LifeLevel = { y: 0, blocked: () => false, obstacles: [] };
    const spots = lifeSpots('habits', [level], seats);
    const rec = spots.findIndex((s) => s.doing === 'reception');
    expect(rec).toBeGreaterThanOrEqual(0);
    expect(spots.filter((s) => s.seated)).toHaveLength(2);
    expect(lifePick('habits', spots, 9, 'high')).toContain(rec);
    expect(lifePick('habits', spots, 23.5, 'high')).not.toContain(rec);
  });
});

describe('Campus vivo: quem está agora', () => {
  it.each(IDS)('%s: ninguém de madrugada, gente no pico, sempre os mesmos e só em andar aceso', (id) => {
    const spots = spotsOf(id);
    expect(lifePick(id, spots, 3, 'high')).toHaveLength(0);
    const kindPeak: Record<LifeKind, number> = { study: 10.5, work: 10.5, data: 11, music: 20, sport: 18, calm: 17 };
    const peak = kindPeak[LIFE[id].kind];
    const a = lifePick(id, spots, peak, 'high');
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(LIFE_CAP.high);
    expect(lifePick(id, spots, peak, 'high')).toEqual(a);
    expect(lifePick(id, spots, peak, 'low').length).toBeLessThanOrEqual(a.length);
    for (const h of [8, 12, 15, 19, 21.5]) for (const i of lifePick(id, spots, h, 'high')) expect(levelFactor(id, spots[i]!.level, h)).toBeGreaterThan(0);
  });

  it('devolve a mesma lista a cada quadro, sem ninguém no assento onde a pessoa sentou', () => {
    const seats: Seat[] = Array.from({ length: 12 }, (_, i) => ({ x: (i % 4) * 1.5 - 2, y: 0.45, z: Math.floor(i / 4) * 1.5 - 1, face: 0 }));
    const spots = lifeSpots('library', planLevels('library'), seats);
    const life = createIndoorLife('library', spots);
    const f1 = life.figures(10.5, 1, 'high');
    const n1 = f1.length;
    const f2 = life.figures(10.5, 2, 'high');
    expect(f2).toBe(f1);
    expect(f2.length).toBe(n1);
    const busy = spots.find((s, i) => s.seated && life.active().includes(i));
    if (busy) {
      const f3 = life.figures(10.5, 3, 'high', null, { x: busy.x, z: busy.z });
      expect(f3.some((f) => Math.hypot(f.x - busy.x, f.z - busy.z) < 0.3 && Math.abs(f.y - (busy.y - 0.44)) < 0.01)).toBe(false);
    }
    // Quem anda fica no caminho entre os dois pontos dele.
    const walkers = spots.filter((p) => p.to);
    for (const t of [0, 3.3, 7.9, 12.1])
      for (const f of life.figures(10.5, t, 'high')) {
        expect(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.z)).toBe(true);
        if (f.pose !== 'walk') continue;
        expect(walkers.some((p) => segDist(f.x, f.z, p.x, p.z, p.to!.x, p.to!.z) < 1e-6)).toBe(true);
      }
  });
});
