import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { addEventCategory, createEvent, removeEventCategory, updateOccurrence } from '@/data/eventsRepo';
import { emptyEventInput, occurrencesInRange } from '@/domain/events';
import { createHabit, setHabitLog } from '@/data/habitsRepo';
import { gatherAlertInput } from '@/data/notificationsRepo';
import { emptyHabitInput } from '@/domain/habits';
import { parseCsv, toCsv } from '@/domain/transfer';
import { joinSegments, quickSegments, textToBlocks, type Block } from '@/domain/notes';

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-fix101-${Math.random().toString(36).slice(2)}`));
});

describe('V1.0.1', () => {
  it('CSV: texto que parece fórmula vira texto; números continuam números', () => {
    const csv = toCsv([['=SOMA(A1)', '+1', '-x', '@a', 'normal', -5, 3.5]]);
    expect(parseCsv(csv)).toEqual([["'=SOMA(A1)", "'+1", "'-x", "'@a", 'normal', '-5', '3.5']]);
  });

  it('aviso de hábitos: hábito semanal já cumprido em outro dia da semana não avisa', async () => {
    const weekly = { period: 'week' as const, times: 1, weekdays: [], intervalDays: 2, target: null };
    const done = await createHabit({ ...emptyHabitInput('2026-11-02'), name: 'Correr', frequency: weekly });
    const pending = await createHabit({ ...emptyHabitInput('2026-11-02'), name: 'Nadar', frequency: weekly });
    await setHabitLog(done.id, '2026-11-03', 1, '', '2026-11-05');
    const input = await gatherAlertInput(1, new Date(2026, 10, 5, 12));
    expect(input.habitsDue.map((h) => h.name)).toEqual(['Nadar']);
    expect(pending.id).toBeTruthy();
  });
});

describe('Notes: modo rápido mantém a ordem', () => {
  it('editar o texto não move imagem, tabela e desenho', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'paragraph', text: 'antes' },
      { id: 'i', type: 'image', fileId: 'f', caption: '' },
      { id: 'b', type: 'bullet', text: 'depois' },
      { id: 'c', type: 'paragraph', text: 'mais' },
      { id: 'd', type: 'drawing', strokes: [], height: 100 },
    ];
    const segs = quickSegments(blocks);
    expect(segs.map((s) => s.kind)).toEqual(['text', 'block', 'text', 'block']);
    const edited = joinSegments(segs.map((s, i) => (i === 2 ? { kind: 'text' as const, blocks: textToBlocks('- depois editado\nmais') } : s)));
    expect(edited.map((b) => b.type)).toEqual(['paragraph', 'image', 'bullet', 'paragraph', 'drawing']);
    expect(joinSegments(segs)).toEqual(blocks);
  });
});

describe('Calendar: "somente esta" guarda categoria e observações', () => {
  it('a ocorrência muda sozinha; remover a categoria leva a ocorrência para Outro', async () => {
    const cat = await addEventCategory('Clube', 'teal');
    const e = await createEvent(emptyEventInput({ title: 'Treino', start: '2026-11-09', endDate: '2026-11-09', startTime: '18:00', recurrence: { freq: 'weekly', interval: 1, weekdays: [], pauses: [], exceptions: [], until: null } }));
    await updateOccurrence(e.id, '2026-11-16', { categoryId: cat.id, notes: 'levar raquete' });
    const ev = (await getDb().events.get(e.id))!;
    const [a, b] = occurrencesInRange(ev, '2026-11-09', '2026-11-16');
    expect([a!.categoryId, b!.categoryId, b!.notes]).toEqual(['appointment', cat.id, 'levar raquete']);
    await removeEventCategory(cat.id);
    const after = (await getDb().events.get(e.id))!;
    expect(after.overrides['2026-11-16']?.categoryId).toBe('other');
  });
});
