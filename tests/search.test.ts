import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createGoal } from '@/data/goalsRepo';
import { createHabit } from '@/data/habitsRepo';
import { createItem, importFiles, prepareImport } from '@/data/libraryRepo';
import { loadPrivacy, savePrivacy } from '@/data/privacyRepo';
import { searchModules } from '@/data/searchRepo';
import { createAsset } from '@/data/financeRepo';
import { emptyAssetInput } from '@/domain/finance';
import { emptyGoalInput } from '@/domain/goals';
import { emptyHabitInput } from '@/domain/habits';
import { matchesAll, rankHits, snippetFor } from '@/domain/search';

beforeEach(() => setDbForTests(new RoutigDB(`test-search-${Math.random().toString(36).slice(2)}`)));

describe('busca global (Parte 4.3)', () => {
  it('todas as palavras, sem acento, em qualquer campo', () => {
    expect(matchesAll('revolucao industrial', 'Revolução', 'Industrial')).toBe(true);
    expect(matchesAll('revolucao francesa', 'Revolução Industrial')).toBe(false);
    expect(snippetFor('fotossintese', 'Na aula vimos a fotossíntese das plantas e o ciclo da água.', 30)).toContain('fotossíntese');
    const hits = [
      { key: '1', group: 'goals' as const, type: 'goal', label: 'Treinar saque', date: null, snippet: '', path: '' },
      { key: '2', group: 'goals' as const, type: 'goal', label: 'Saque melhor', date: null, snippet: '', path: '' },
    ];
    expect(rankHits('saque', hits).map((h) => h.key)).toEqual(['2', '1']);
  });

  it('acha objetivo, hábito, material e o texto de arquivo de texto; Finanças só se liberada', async () => {
    await createGoal({ ...emptyGoalInput(), name: 'Aprender violão', description: 'tocar Asa Branca' });
    await createHabit({ ...emptyHabitInput('2026-11-01'), name: 'Ler antes de dormir' });
    await createItem({ kind: 'link', title: 'Khan Academy', author: '', url: 'https://khanacademy.org', folder: '', category: 'estudos', tags: ['matematica'], collectionIds: [], favorite: false, readStatus: null, notes: '' });
    const [c] = await prepareImport([new File(['Resumo sobre mitocôndria e respiração celular'], 'resumo.txt', { type: 'text/plain' })]);
    await importFiles([c!], { folder: '', collectionIds: [], tags: [] });
    await createAsset({ ...emptyAssetInput(), name: 'Tesouro Selic' });
    const prefs = await loadPrivacy();
    expect(prefs.searchHidden).toEqual(['finance']);
    expect((await searchModules('asa branca', prefs.searchHidden)).map((h) => h.group)).toEqual(['goals']);
    expect((await searchModules('dormir', prefs.searchHidden))[0]).toMatchObject({ group: 'habits', type: 'habit' });
    expect((await searchModules('matematica', prefs.searchHidden))[0]).toMatchObject({ group: 'library', label: 'Khan Academy' });
    expect((await searchModules('mitocondria', prefs.searchHidden))[0]).toMatchObject({ group: 'library', type: 'document' });
    expect(await searchModules('selic', prefs.searchHidden)).toEqual([]);
    await savePrivacy({ searchHidden: [] });
    expect((await searchModules('selic', (await loadPrivacy()).searchHidden))[0]).toMatchObject({ group: 'finance', type: 'asset' });
    expect((await getDb().libraryItems.toArray()).find((i) => i.fileName === 'resumo.txt')?.textContent).toContain('mitocôndria');
  });
});
