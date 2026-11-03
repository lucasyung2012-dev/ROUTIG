import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import {
  addEventCategory,
  createEvent,
  deleteFollowing,
  deleteOccurrence,
  EventRuleError,
  loadCalendarConfig,
  purgeEvent,
  removeEventCategory,
  restoreEvent,
  softDeleteEvent,
  updateEvent,
  updateFollowing,
  updateOccurrence,
} from '@/data/eventsRepo';
import { emptyEventInput, findConflicts, layoutColumns, occurrencesInRange, toMinutes, fromMinutes, type CalendarEvent } from '@/domain/events';
import { rangeFor } from '@/features/calendar/CalendarPage';

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-events-${Math.random().toString(36).slice(2)}`));
});

const weekly = { freq: 'weekly' as const, interval: 1, weekdays: [], pauses: [], exceptions: [], until: null };
const dates = (e: CalendarEvent, from: string, to: string) => occurrencesInRange(e, from, to).map((o) => o.date);

describe('ocorrências', () => {
  it('evento simples aparece só no dia dele', async () => {
    const e = await createEvent(emptyEventInput({ title: 'Dentista', start: '2026-11-05', endDate: '2026-11-05' }));
    expect(dates(e, '2026-11-01', '2026-11-30')).toEqual(['2026-11-05']);
    expect(dates(e, '2026-11-06', '2026-11-30')).toEqual([]);
  });

  it('férias de vários dias tocam todos os dias do intervalo', async () => {
    const e = await createEvent(emptyEventInput({ title: 'Férias', allDay: true, categoryId: 'vacation', start: '2026-12-20', endDate: '2027-01-31' }));
    expect(dates(e, '2027-01-10', '2027-01-10')).toEqual(['2026-12-20']);
    const [o] = occurrencesInRange(e, '2027-01-10', '2027-01-10');
    expect(o?.endDate).toBe('2027-01-31');
    expect(o?.startTime).toBeNull();
  });

  it('aula semanal respeita pausa de férias e exceção', async () => {
    const e = await createEvent(
      emptyEventInput({
        title: 'Aula de violão',
        start: '2026-11-02',
        endDate: '2026-11-02',
        startTime: '15:00',
        recurrence: { ...weekly, exceptions: ['2026-11-09'], pauses: [{ from: '2026-11-20', to: '2026-11-28', label: 'recesso' }] },
      }),
    );
    expect(dates(e, '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
  });

  it('a primeira data da série também respeita exceção', async () => {
    const e = await createEvent(emptyEventInput({ title: 'X', start: '2026-11-02', endDate: '2026-11-02', recurrence: { ...weekly, exceptions: ['2026-11-02'] } }));
    expect(dates(e, '2026-11-01', '2026-11-10')).toEqual(['2026-11-09']);
  });
});

describe('editar série (Parte 6.3)', () => {
  const base = () => createEvent(emptyEventInput({ title: 'Treino', start: '2026-11-02', endDate: '2026-11-02', startTime: '18:00', recurrence: weekly }));

  it('somente esta ocorrência: muda só aquela data, inclusive movendo de dia', async () => {
    const e = await base();
    const next = await updateOccurrence(e.id, '2026-11-09', { startTime: '19:00', date: '2026-11-10' });
    const occ = occurrencesInRange(next, '2026-11-01', '2026-11-20');
    expect(occ.map((o) => o.date)).toEqual(['2026-11-02', '2026-11-10', '2026-11-16']);
    expect(occ[1]?.startTime).toBe('19:00');
    expect(occ[0]?.startTime).toBe('18:00');
  });

  it('esta e as próximas: divide a série sem mexer no passado', async () => {
    const e = await base();
    const created = await updateFollowing(e.id, '2026-11-16', { ...emptyEventInput({ title: 'Treino novo', start: '2026-11-16', endDate: '2026-11-16', startTime: '17:00', recurrence: weekly }) });
    const old = (await getDb().events.get(e.id))!;
    expect(dates(old, '2026-11-01', '2026-12-31')).toEqual(['2026-11-02', '2026-11-09']);
    expect(dates(created, '2026-11-01', '2026-11-30')).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
    expect(created.seriesOf).toBe(e.id);
    expect(await getDb().events.count()).toBe(2);
  });

  it('toda a série: muda todas as ocorrências', async () => {
    const e = await base();
    const next = await updateEvent(e.id, { ...emptyEventInput({ title: 'Treino', start: '2026-11-02', endDate: '2026-11-02', startTime: '20:00', recurrence: weekly }) });
    expect(occurrencesInRange(next, '2026-11-01', '2026-11-20').every((o) => o.startTime === '20:00')).toBe(true);
  });

  it('excluir só uma ocorrência e excluir esta e as próximas', async () => {
    const e = await base();
    await deleteOccurrence(e.id, '2026-11-09');
    await deleteFollowing(e.id, '2026-11-23');
    const after = (await getDb().events.get(e.id))!;
    expect(dates(after, '2026-11-01', '2026-12-31')).toEqual(['2026-11-02', '2026-11-16']);
  });
});

describe('Lixeira e validação', () => {
  it('excluir manda para a Lixeira; restaurar e excluir de vez', async () => {
    const e = await createEvent(emptyEventInput({ title: 'Prova', start: '2026-11-05', endDate: '2026-11-05', categoryId: 'exam' }));
    await softDeleteEvent(e.id);
    expect(occurrencesInRange((await getDb().events.get(e.id))!, '2026-11-01', '2026-11-30')).toEqual([]);
    await restoreEvent(e.id);
    expect((await getDb().events.get(e.id))?.deletedAt).toBeNull();
    await purgeEvent(e.id);
    expect(await getDb().events.get(e.id)).toBeUndefined();
  });

  it('recusa sem título e fim antes do início', async () => {
    await expect(createEvent(emptyEventInput({ title: ' ' }))).rejects.toBeInstanceOf(EventRuleError);
    await expect(createEvent(emptyEventInput({ title: 'X', allDay: true, start: '2026-11-05', endDate: '2026-11-01' }))).rejects.toBeInstanceOf(EventRuleError);
  });

  it('remover categoria própria move os eventos para "Outro"', async () => {
    const cat = await addEventCategory('Coral', 'rose');
    const e = await createEvent(emptyEventInput({ title: 'Ensaio', categoryId: cat.id }));
    expect(await removeEventCategory(cat.id)).toBe(1);
    expect((await getDb().events.get(e.id))?.categoryId).toBe('other');
    expect((await loadCalendarConfig()).categories.some((c) => c.id === cat.id)).toBe(false);
  });
});

describe('conflitos e layout', () => {
  it('detecta sobreposição no mesmo dia e só avisa', () => {
    const c = findConflicts([
      { key: 'a', date: '2026-11-02', start: 600, end: 660, title: 'A' },
      { key: 'b', date: '2026-11-02', start: 630, end: 700, title: 'B' },
      { key: 'c', date: '2026-11-02', start: 700, end: 760, title: 'C' },
      { key: 'd', date: '2026-11-03', start: 600, end: 660, title: 'D' },
    ]);
    expect(c.map(([a, b]) => `${a.key}${b.key}`)).toEqual(['ab']);
  });

  it('coloca itens sobrepostos lado a lado', () => {
    const l = layoutColumns([
      { key: 'a', start: 600, end: 660 },
      { key: 'b', start: 630, end: 700 },
      { key: 'c', start: 720, end: 780 },
    ]);
    expect(l.get('a')).toEqual({ col: 0, cols: 2 });
    expect(l.get('b')).toEqual({ col: 1, cols: 2 });
    expect(l.get('c')).toEqual({ col: 0, cols: 1 });
  });

  it('horários', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(fromMinutes(570)).toBe('09:30');
  });

  it('intervalos das visualizações', () => {
    expect(rangeFor('week', '2026-11-04', 1)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(rangeFor('year', '2026-11-04', 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(rangeFor('day', '2026-11-04', 1)).toEqual({ from: '2026-11-04', to: '2026-11-04' });
  });
});
