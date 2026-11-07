import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@/app/modules';
import { pt } from '@/i18n/pt';
import { en } from '@/i18n/en';
import { FLOOR_PLANS } from '@/features/park/interiors/floors';
import { FORMS, apothem, clipZ, faces, levelRot, levelScale, outline, polyR } from '@/features/park/forms';
import { DASHBOARD_SECTORS, PROFILE_SECTORS, SETTINGS_ROOMS } from '@/features/park/interiors/central';
import { CALENDAR_SECTORS, FINANCE_SECTORS, PROJECTS_SECTORS, TASKS_SECTORS } from '@/features/park/interiors/east';
import { INBOX_SECTORS } from '@/features/park/interiors/inbox';
import { ACADEMY_SECTORS, INSIGHTS_SECTORS, LANGUAGES_SECTORS, LIBRARY_SECTORS, NOTES_SECTORS } from '@/features/park/interiors/north';
import { FOCUS_SECTORS, GOALS_SECTORS, HABITS_SECTORS, MUSIC_SECTORS, SPORTS_SECTORS } from '@/features/park/interiors/westsouth';

/** Níveis por prédio na V2.1 (seção 10). */
const LEVELS: Record<ModuleId, number> = { dashboard: 3, profile: 2, notes: 2, library: 3, calendar: 3, tasks: 3, focus: 2, habits: 2, academy: 4, languages: 3, projects: 3, music: 3, sports: 3, goals: 2, insights: 4, finance: 3, settings: 3, inbox: 2 };
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

  it('cada sala abre um setor real do próprio prédio (ou as opções do parque, ou nada)', () => {
    for (const [id, floors] of Object.entries(FLOOR_PLANS) as Array<[ModuleId, (typeof FLOOR_PLANS)[ModuleId]]>)
      for (const rooms of floors)
        for (const [key, sector] of rooms) {
          if (sector === null || sector === '@options') continue;
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
    expect(facades.size).toBe(6);
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
