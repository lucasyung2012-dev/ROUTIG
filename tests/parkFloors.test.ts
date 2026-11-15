import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@/app/modules';
import { pt } from '@/i18n/pt';
import { en } from '@/i18n/en';
import { FLOOR_PLANS, floorNameKey } from '@/features/park/interiors/floors';
import { FORMS, ROOF_TERRACES, apothem, clipZ, faces, hasRoofTerrace, levelRot, levelScale, outline, polyR, railRuns, terraceSpots, upperPlan } from '@/features/park/forms';
import { DASHBOARD_SECTORS, PROFILE_SECTORS, SETTINGS_ROOMS } from '@/features/park/interiors/central';
import { CALENDAR_SECTORS, FINANCE_SECTORS, PROJECTS_SECTORS, TASKS_SECTORS } from '@/features/park/interiors/east';
import { INBOX_SECTORS } from '@/features/park/interiors/inbox';
import { ACADEMY_SECTORS, INSIGHTS_SECTORS, LANGUAGES_SECTORS, LIBRARY_SECTORS, NOTES_SECTORS } from '@/features/park/interiors/north';
import { FOCUS_SECTORS, GOALS_SECTORS, HABITS_SECTORS, MUSIC_SECTORS, SPORTS_SECTORS } from '@/features/park/interiors/westsouth';

/** Níveis por prédio (térreo + andares, sem contar o terraço da cobertura): programa aprovado do Campus. */
const LEVELS: Record<ModuleId, number> = { dashboard: 3, profile: 2, settings: 3, notes: 2, library: 3, calendar: 3, tasks: 3, focus: 2, habits: 1, academy: 4, languages: 4, projects: 3, music: 3, sports: 2, goals: 3, insights: 3, finance: 3, inbox: 3 };
/** Prédios com terraço aberto na cobertura. */
const TERRACES: ModuleId[] = ['academy', 'calendar', 'goals', 'insights', 'languages', 'library', 'projects', 'tasks'];
const SECTORS: Record<ModuleId, readonly string[]> = {
  dashboard: DASHBOARD_SECTORS,
  profile: PROFILE_SECTORS,
  settings: SETTINGS_ROOMS,
  calendar: CALENDAR_SECTORS,
  tasks: TASKS_SECTORS,
  projects: PROJECTS_SECTORS,
  finance: FINANCE_SECTORS,
  inbox: INBOX_SECTORS,
  library: LIBRARY_SECTORS,
  notes: NOTES_SECTORS,
  academy: ACADEMY_SECTORS,
  languages: LANGUAGES_SECTORS,
  insights: INSIGHTS_SECTORS,
  focus: FOCUS_SECTORS,
  habits: HABITS_SECTORS,
  goals: GOALS_SECTORS,
  music: MUSIC_SECTORS,
  sports: SPORTS_SECTORS,
};

describe('parque V2.1: andares dos interiores', () => {
  it('cada prédio tem os níveis da especificação (térreo + andares)', () => {
    for (const [id, n] of Object.entries(LEVELS) as Array<[ModuleId, number]>) expect(FLOOR_PLANS[id].length + 1, id).toBe(n);
  });

  it('cada sala abre um setor real do próprio prédio (ou as opções do parque); nenhuma sala sem tela', () => {
    for (const [id, floors] of Object.entries(FLOOR_PLANS) as Array<[ModuleId, (typeof FLOOR_PLANS)[ModuleId]]>)
      for (const rooms of floors)
        for (const [key, sector] of rooms) {
          expect(sector, `${id}.${key}`).not.toBeNull();
          if (sector === '@options') continue;
          expect(SECTORS[id], `${id}.${key}`).toContain(sector);
        }
  });

  it('todas as salas têm nome em português e inglês', () => {
    const P = pt.park.floorRooms as Record<string, Record<string, string>>;
    const E = en.park.floorRooms as Record<string, Record<string, string>>;
    for (const [id, floors] of Object.entries(FLOOR_PLANS))
      for (const rooms of floors)
        for (const [key] of rooms) {
          expect(P[id]?.[key], `${id}.${key}`).toBeTruthy();
          expect(E[id]?.[key], `${id}.${key}`).toBeTruthy();
        }
  });
});

describe('parque V2.1: arquitetura de cada prédio', () => {
  it('as plantas variam entre os prédios (não é tudo igual)', () => {
    const plans = new Set(Object.values(FORMS).map((f) => f.plan));
    const facades = new Set(Object.values(FORMS).map((f) => f.facade));
    expect(plans.size).toBe(6);
    // Só os materiais do prompt (seção 11: pedra, madeira, concreto, vidro, metal): sem tijolo.
    expect(facades.has('brick')).toBe(false);
    expect(facades.size).toBe(5);
    expect(Object.keys(FORMS).sort()).toEqual(Object.keys(FLOOR_PLANS).sort());
  });

  it('raio do polígono: canto = raio, meio da face = apótema', () => {
    expect(polyR(4, Math.PI / 4, 10, Math.PI / 4)).toBeCloseTo(10);
    expect(polyR(4, Math.PI / 4, 10, 0)).toBeCloseTo(apothem(4, 10));
    expect(polyR(0, 0, 7, 1.234)).toBe(7);
  });

  it('em todo andar, a porta dos fundos cabe numa face (alinhada com a ponte do elevador)', () => {
    for (const [id, f] of Object.entries(FORMS) as Array<[ModuleId, (typeof FORMS)[ModuleId]]>)
      for (let L = 1; L <= FLOOR_PLANS[id].length; L++) {
        const R = 16 * levelScale(f, L);
        const fs = faces(f.sides, f.sides >= 3 ? levelRot(f, L) : 0, R);
        const back = fs.reduce((m, fc) => (Math.abs(Math.atan2(Math.sin(fc.phi - Math.PI), Math.cos(fc.phi - Math.PI))) < Math.abs(Math.atan2(Math.sin(m.phi - Math.PI), Math.cos(m.phi - Math.PI))) ? fc : m));
        const lx = back.a * Math.tan(Math.atan2(Math.sin(Math.PI - back.phi), Math.cos(Math.PI - back.phi)));
        // A ponte tem 2,4 m: a porta (1,8 m) pode deslizar até 1 m sem sair dela.
        expect(Math.abs(lx) - Math.max(0, back.len / 2 - 1.0), `${id} andar ${L}`).toBeLessThan(1.0);
      }
  });

  it('o recorte do mezanino fica atrás da galeria', () => {
    const pts = clipZ(outline(4, Math.PI / 4, 10), 1.5);
    expect(pts.length).toBeGreaterThan(3);
    for (const [, z] of pts) expect(z).toBeLessThanOrEqual(1.5 + 1e-9);
  });
});

describe('Campus: terraço na cobertura e prédio só com térreo', () => {
  it('os prédios do programa têm terraço; Habits fica só no térreo', () => {
    expect([...ROOF_TERRACES].sort()).toEqual(TERRACES);
    expect(hasRoofTerrace('habits')).toBe(false);
    expect(FLOOR_PLANS.habits).toEqual([]);
  });

  it('o terraço tem nome próprio nos dois idiomas, e cada nível tem nome', () => {
    const P = pt.park.floorRooms as Record<string, Record<string, string>>;
    const E = en.park.floorRooms as Record<string, Record<string, string>>;
    for (const id of TERRACES) {
      expect(P[id]?.terrace, id).toBeTruthy();
      expect(E[id]?.terrace, id).toBeTruthy();
      expect(floorNameKey(id, FLOOR_PLANS[id].length + 1)).toBe(`park.floorRooms.${id}.terrace`);
    }
    const names = pt.park.floorNames as Record<string, string>;
    for (const [id, n] of Object.entries(LEVELS) as Array<[ModuleId, number]>)
      for (let k = 0; k < n; k++) {
        const key = floorNameKey(id, k);
        expect(key, `${id} ${k}`).toBe(`park.floorNames.f${k}`);
        expect(names[`f${k}`], key).toBeTruthy();
      }
  });

  it('bancos e floreiras do terraço ficam dentro do guarda-corpo e fora da ponte do elevador', () => {
    for (const id of TERRACES) {
      const f = FORMS[id];
      const L = FLOOR_PLANS[id].length;
      const R = 16 * levelScale(f, L) * 1.03;
      const rot = f.sides >= 3 ? levelRot(f, L) : 0;
      const spots = terraceSpots(f, L, R, 4, Math.PI);
      expect(spots.filter((s) => s.kind === 'bench').length, id).toBeGreaterThan(1);
      for (const s of spots) {
        const r = Math.hypot(s.x, s.z);
        expect(r, `${id} ${s.kind}`).toBeLessThan(polyR(f.sides, rot, R, Math.atan2(s.x, s.z)) - 0.5);
        expect(Math.abs(s.x) < 2.4 && s.z < 0, `${id} ${s.kind} na ponte`).toBe(false);
        if (s.kind === 'tree' || s.kind === 'table') expect(r).toBeGreaterThan(4);
      }
    }
  });

  it('o guarda-corpo da borda abre só na passagem da ponte', () => {
    const pts = outline(4, Math.PI / 4, 12);
    const skip = (x: number, z: number) => Math.abs(x) < 1.25 && z < 0;
    const runs = railRuns(pts, skip);
    expect(runs.length).toBeGreaterThan(0);
    let len = 0;
    for (const run of runs)
      for (let i = 0; i + 1 < run.length; i++) {
        const [ax, az] = run[i]!;
        const [bx, bz] = run[i + 1]!;
        expect(skip((ax + bx) / 2, (az + bz) / 2)).toBe(false);
        len += Math.hypot(bx - ax, bz - az);
      }
    const perimeter = 4 * 12 * Math.SQRT2;
    expect(len).toBeGreaterThan(perimeter - 3.5);
    expect(len).toBeLessThan(perimeter - 2);
  });

  it('o Focus tem mezanino parcial em cima, sem mudar a entrada do térreo', () => {
    expect(upperPlan(FORMS.focus)).toBe('side');
    expect(FORMS.focus.plan).toBe('garden');
    expect(upperPlan(FORMS.library)).toBe('atrium');
  });
});
