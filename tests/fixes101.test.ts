import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { addEventCategory, createEvent, removeEventCategory, updateOccurrence } from '@/data/eventsRepo';
import { emptyEventInput, occurrencesInRange } from '@/domain/events';
import { createHabit, setHabitLog } from '@/data/habitsRepo';
import { gatherAlertInput } from '@/data/notificationsRepo';
import { emptyHabitInput } from '@/domain/habits';
import { parseCsv, toCsv } from '@/domain/transfer';
import { joinSegments, quickSegments, textToBlocks, type Block } from '@/domain/notes';
import { importTransactions, markDuplicates } from '@/data/financeRepo';
import { parseTransactionsCsv } from '@/domain/finance';
import { BackupDB, listSnapshots, runAutoBackupIfDue, saveBackupPrefs, saveSnapshot, setBackupDbForTests } from '@/data/backupRepo';
import { DEFAULT_BACKUP_PREFS, migrateBackupPrefs } from '@/domain/backup';

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

describe('Finanças: importação com as regras do cadastro', () => {
  it('venda acima da carteira e data futura não entram; compra e venda do mesmo arquivo, em ordem, entram', async () => {
    const csv = 'data,ativo,tipo,quantidade,preco\n2026-11-02,BOVA11,compra,10,120\n2026-11-03,BOVA11,venda,4,125\n2026-11-03,BOVA11,venda,50,125\n2030-01-01,BOVA11,compra,1,100';
    const rows = await markDuplicates(parseTransactionsCsv(csv).rows, '2026-11-05');
    expect(rows.map((r) => r.error)).toEqual([null, null, 'oversell', 'future']);
    expect(rows.map((r) => r.include)).toEqual([true, true, false, false]);
    // Mesmo marcando tudo à mão, a gravação confere de novo.
    const forced = rows.map((r) => ({ ...r, include: true, error: null }));
    const res = await importTransactions(forced, { fileName: 'x.csv', category: 'etfs', currency: 'BRL', custody: '', today: '2026-11-05' });
    expect(res.created).toBe(2);
  });
});

describe('Backup: limite de cópias automáticas só quando escolhido', () => {
  it('sem limite guarda todas; com limite 7, as automáticas mais antigas saem e a manual fica', async () => {
    setBackupDbForTests(new BackupDB(`test-fix101-b-${Math.random().toString(36).slice(2)}`));
    expect(migrateBackupPrefs({ keepAuto: 5 }).keepAuto).toBe(0);
    await getDb().tasks.add({ id: 't', title: 'x' } as never);
    await saveSnapshot('manual');
    for (let i = 0; i < 8; i++) await saveSnapshot('auto');
    const later = new Date(Date.now() + 2 * 86_400_000);
    await runAutoBackupIfDue(later);
    expect((await listSnapshots()).filter((s) => s.kind === 'auto')).toHaveLength(9);
    await saveBackupPrefs({ ...DEFAULT_BACKUP_PREFS, keepAuto: 7 });
    await runAutoBackupIfDue(new Date(later.getTime() + 2 * 86_400_000));
    const left = await listSnapshots();
    expect(left.filter((s) => s.kind === 'auto')).toHaveLength(7);
    expect(left.filter((s) => s.kind === 'manual')).toHaveLength(1);
  });
});
