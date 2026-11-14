import { describe, expect, it } from 'vitest';
import type { FocusSession } from '@/domain/focus';
import type { Language, LanguageSession } from '@/domain/languages';
import type { Sport, SportActivity } from '@/domain/sports';
import { focusCalendarItems, languageCalendarItems, sportCalendarItems } from '@/features/calendar/moduleItems';

const base = { createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', deletedAt: null as string | null, rev: 1 };

const sport = (over: Partial<Sport> = {}): Sport => ({ ...base, id: 'spt1', name: 'Futebol', kind: 'football', color: '#30A46C', notes: '', order: 1, ...over });
const act = (over: Partial<SportActivity> = {}): SportActivity => ({
  ...base,
  id: 'act1',
  sportId: 'spt1',
  type: 'training',
  date: '2026-11-10',
  durationMin: 60,
  title: '',
  location: '',
  itemIds: [],
  outcome: null,
  score: '',
  opponent: '',
  positionId: null,
  feeling: null,
  difficulties: '',
  evolution: '',
  notes: '',
  ...over,
});
const TYPES: Record<string, string> = { training: 'Treino', match: 'Partida', tournament: 'Torneio', event: 'Evento' };
const OUTCOMES: Record<string, string> = { win: 'Vitória', loss: 'Derrota', draw: 'Empate' };
const sportLabels = {
  type: (t: string) => TYPES[t] ?? t,
  outcome: (o: string) => OUTCOMES[o] ?? o,
};

describe('Calendar: atividades esportivas', () => {
  it('treino aparece no dia como "Esporte: tipo", com a cor do esporte, e abre o esporte', () => {
    const [i] = sportCalendarItems([sport()], [act()], '2026-11-01', '2026-11-30', sportLabels);
    expect(i).toMatchObject({ kind: 'sport', date: '2026-11-10', allDay: true, title: 'Futebol: treino', color: '#30A46C', sportId: 'spt1', categoryId: null, done: false });
  });

  it('partida leva o resultado e o placar', () => {
    const [i] = sportCalendarItems([sport()], [act({ type: 'match', outcome: 'win', score: '3x1' })], '2026-11-01', '2026-11-30', sportLabels);
    expect(i?.title).toBe('Futebol: partida · Vitória 3x1');
  });

  it('fica de fora: fora do período, na lixeira ou de esporte apagado', () => {
    expect(sportCalendarItems([sport()], [act({ date: '2026-12-01' })], '2026-11-01', '2026-11-30', sportLabels)).toEqual([]);
    expect(sportCalendarItems([sport()], [act({ deletedAt: '2026-11-11T00:00:00.000Z' })], '2026-11-01', '2026-11-30', sportLabels)).toEqual([]);
    expect(sportCalendarItems([sport({ deletedAt: '2026-11-11T00:00:00.000Z' })], [act()], '2026-11-01', '2026-11-30', sportLabels)).toEqual([]);
  });
});

const lang = (over: Partial<Language> = {}): Language =>
  ({ ...base, id: 'lng1', name: 'Inglês', code: 'en', profile: 'general', color: '#3E63DD', native: false, level: null, goals: [], skills: {}, notes: '', order: 1, ...over }) as unknown as Language;
const lsess = (over: Partial<LanguageSession> = {}): LanguageSession =>
  ({ ...base, id: 'ls1', languageId: 'lng1', date: '2026-11-12', activity: 'reading', durationMin: 20, content: '', difficulties: '', result: '', notes: '', noteIds: [], ...over }) as LanguageSession;

describe('Calendar: sessões de idioma', () => {
  it('aparece no dia com atividade e minutos e abre o idioma', () => {
    const [i] = languageCalendarItems([lang()], [lsess()], '2026-11-01', '2026-11-30', () => 'Leitura');
    expect(i).toMatchObject({ kind: 'language', date: '2026-11-12', allDay: true, title: 'Inglês: Leitura · 20 min', languageId: 'lng1', color: '#3E63DD' });
  });

  it('fica de fora: na lixeira, de idioma apagado ou fora do período', () => {
    expect(languageCalendarItems([lang()], [lsess({ deletedAt: 'x' })], '2026-11-01', '2026-11-30', () => '')).toEqual([]);
    expect(languageCalendarItems([lang({ deletedAt: 'x' })], [lsess()], '2026-11-01', '2026-11-30', () => '')).toEqual([]);
    expect(languageCalendarItems([lang()], [lsess()], '2026-11-13', '2026-11-30', () => '')).toEqual([]);
  });
});

const local = (h: number, m: number) => new Date(2026, 10, 12, h, m).toISOString();
const fsess = (over: Partial<FocusSession> = {}): FocusSession => ({
  ...base,
  id: 'f1',
  date: '2026-11-12',
  startedAt: local(9, 0),
  endedAt: local(9, 30),
  kind: 'study',
  mode: 'pomodoro',
  plannedMin: 25,
  actualMin: 25,
  breakMin: 5,
  cycles: 1,
  completed: true,
  taskId: null,
  ref: null,
  environment: 'minimal',
  notes: '',
  manual: false,
  ...over,
});

describe('Calendar: sessões de foco', () => {
  it('aparece no horário em que começou, do início ao fim, com os minutos de foco', () => {
    const [i] = focusCalendarItems([fsess()], '2026-11-01', '2026-11-30', (k, min) => `Focus: ${k} · ${min} min`);
    expect(i).toMatchObject({ kind: 'focus', date: '2026-11-12', allDay: false, start: 540, end: 570, title: 'Focus: study · 25 min', tone: 'violet' });
  });

  it('horário inválido vira dia inteiro', () => {
    const [i] = focusCalendarItems([fsess({ startedAt: 'x', endedAt: 'y' })], '2026-11-01', '2026-11-30', () => 'f');
    expect(i).toMatchObject({ allDay: true, start: null, end: null });
  });

  it('fica de fora: na lixeira, sem minutos de foco ou fora do período', () => {
    expect(focusCalendarItems([fsess({ deletedAt: 'x' })], '2026-11-01', '2026-11-30', () => '')).toEqual([]);
    expect(focusCalendarItems([fsess({ actualMin: 0 })], '2026-11-01', '2026-11-30', () => '')).toEqual([]);
    expect(focusCalendarItems([fsess()], '2026-11-13', '2026-11-30', () => '')).toEqual([]);
  });
});
