import { describe, expect, it } from 'vitest';
import { ACTIVITY_SPOTS, PEOPLE_COUNT, activityAt, campusPeople, navGraph, nearestNode, routeBetween, shortestPath, type Conditions } from '@/domain/parkPeople';
import { PARK_BUILDINGS, entranceOf, inWater } from '@/domain/park';

const base: Conditions = { hour: 12, day: 20400, rain: 0, fog: 0, wind: 0, season: 'spring' };

describe('parque V2.1: moradores do campus', () => {
  it('64 moradores fixos, com nome, casa e grupos de 1 a 4 amigos', () => {
    const a = campusPeople();
    expect(a).toHaveLength(PEOPLE_COUNT);
    expect(campusPeople()).toEqual(a);
    const sizes = new Map<number, number>();
    a.forEach((p) => sizes.set(p.group, (sizes.get(p.group) ?? 0) + 1));
    for (const n of sizes.values()) expect(n).toBeGreaterThanOrEqual(1);
    for (const n of sizes.values()) expect(n).toBeLessThanOrEqual(4);
    for (const p of a) expect(Math.hypot(p.home.x, p.home.z)).toBeGreaterThan(250);
  });

  it('a rede de caminhos liga a praça à entrada de todos os 18 prédios', () => {
    const g = navGraph();
    expect(g.gates.length).toBeGreaterThan(0);
    const plaza = nearestNode(g, { x: 0, z: 20 });
    for (const b of PARK_BUILDINGS) {
      const e = entranceOf(b);
      const ids = shortestPath(g, plaza, nearestNode(g, e));
      expect(ids.length, b.id).toBeGreaterThan(0);
    }
    expect(routeBetween({ x: 0, z: 20 }, { x: 40, z: 175 }).length).toBeGreaterThan(2);
  });

  it('lugares das atividades fora da água e fora dos prédios', () => {
    for (const list of Object.values(ACTIVITY_SPOTS))
      for (const s of list) {
        expect(inWater(s.x, s.z, 1)).toBe(false);
        for (const b of PARK_BUILDINGS) expect(Math.hypot(s.x - b.x, s.z - b.z), b.id).toBeGreaterThan(b.radius * 0.8);
      }
  });

  it('rotina por horário e clima: madrugada vazia, chuva esvazia, sempre igual para a mesma hora', () => {
    const people = campusPeople();
    const out = (c: Conditions) => people.filter((p) => activityAt(p, c) !== 'home').length;
    expect(out({ ...base, hour: 3 })).toBe(0);
    const noon = out(base);
    expect(noon).toBeGreaterThan(10);
    expect(out({ ...base, rain: 0.8 })).toBeLessThan(noon);
    expect(people.map((p) => activityAt(p, base))).toEqual(people.map((p) => activityAt(p, base)));
    // Com chuva, quem fica vai para lugares cobertos.
    for (const p of people) {
      const a = activityAt(p, { ...base, rain: 0.8 });
      expect(['home', 'cafe', 'read', 'study', 'work', 'gym']).toContain(a);
    }
  });
});
