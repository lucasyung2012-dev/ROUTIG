import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@/app/modules';
import { pt } from '@/i18n/pt';
import { en } from '@/i18n/en';
import { FLOOR_PLANS } from '@/features/park/interiors/floors';
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
