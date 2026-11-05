import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createLanguage, createLanguages, languageHistory, saveLanguageSession, updateLanguage } from '@/data/languagesRepo';
import { LANGUAGE_PRESETS, languageInputOf, profileForCode, sessionStats } from '@/domain/languages';

beforeEach(() => setDbForTests(new RoutigDB(`test-lang-${Math.random().toString(36).slice(2)}`)));

describe('idiomas (Parte 10.1)', () => {
  it('cria os cinco iniciais sem duplicar e aceita qualquer outro', async () => {
    expect(await createLanguages(LANGUAGE_PRESETS)).toBe(5);
    expect(await createLanguages(LANGUAGE_PRESETS)).toBe(0);
    await createLanguage({ name: 'Francês', code: 'fr', color: '#438BEA' });
    const all = await getDb().languages.orderBy('order').toArray();
    expect(all.map((l) => l.name)).toEqual(['Português', 'Inglês', 'Alemão', 'Espanhol', 'Mandarim', 'Francês']);
    expect(all.find((l) => l.name === 'Português')?.native).toBe(true);
    await expect(createLanguage({ name: 'francês', code: 'fr', color: '#438BEA' })).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('alemão e mandarim ganham os campos próprios pelo código', () => {
    expect(profileForCode('de')).toBe('german');
    expect(profileForCode('de-AT')).toBe('german');
    expect(profileForCode('zh')).toBe('mandarin');
    expect(profileForCode('en')).toBe('generic');
  });
});

describe('habilidades e histórico (Parte 10.5)', () => {
  it('guarda a evolução do nível e das habilidades no histórico', async () => {
    const l = await createLanguage({ name: 'Inglês', code: 'en', color: '#438BEA' });
    await updateLanguage(l.id, { ...languageInputOf(l), level: 'B1' });
    const after = (await getDb().languages.get(l.id))!;
    await updateLanguage(l.id, { ...languageInputOf(after), skills: { ...after.skills, speaking: { level: 'A2', confidence: 2, notes: '' } } });
    const notes = (await languageHistory(l.id)).map((e) => e.note).filter(Boolean);
    expect(notes).toEqual(['speaking:A2/2', 'level:B1']);
  });

  it('confiança fora de 1 a 5 é recusada', async () => {
    const l = await createLanguage({ name: 'Alemão', code: 'de', color: '#F59E0B' });
    await expect(updateLanguage(l.id, { ...languageInputOf(l), skills: { ...l.skills, reading: { level: null, confidence: 7, notes: '' } } })).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('sessões (Parte 10.6)', () => {
  it('soma o tempo por habilidade (pronúncia e conversação contam como fala)', async () => {
    const l = await createLanguage({ name: 'Espanhol', code: 'es', color: '#E5484D' });
    const base = { languageId: l.id, content: '', difficulties: '', result: '', notes: '', noteIds: [] };
    await saveLanguageSession(null, { ...base, date: '2026-11-03', activity: 'listening', durationMin: 30 });
    await saveLanguageSession(null, { ...base, date: '2026-11-03', activity: 'pronunciation', durationMin: 10 });
    await saveLanguageSession(null, { ...base, date: '2026-11-04', activity: 'conversation', durationMin: 20 });
    await saveLanguageSession(null, { ...base, date: '2026-11-04', activity: 'vocabulary', durationMin: 15 });
    await expect(saveLanguageSession(null, { ...base, date: '2026-11-04', activity: 'reading', durationMin: 0 })).rejects.toMatchObject({ code: 'invalid' });
    const s = sessionStats(await getDb().languageSessions.toArray());
    expect(s).toMatchObject({ total: 75, sessions: 4, days: 2, bySkill: { listening: 30, speaking: 30, reading: 0, writing: 0 } });
  });
});

describe('vocabulário (Parte 10.3)', () => {
  it('pinyin com números vira marcas de tom', async () => {
    const { numberedToPinyin, tonesOf } = await import('@/domain/languages');
    expect(numberedToPinyin('ni3 hao3')).toBe('nǐ hǎo');
    expect(numberedToPinyin('xie4xie5')).toBe('xièxie');
    expect(numberedToPinyin('lv4 nv3')).toBe('lǜ nǚ');
    expect(numberedToPinyin('gou3 zhou1')).toBe('gǒu zhōu');
    expect(numberedToPinyin('Zhong1guo2')).toBe('Zhōngguó');
    expect(tonesOf('ni3 hao3')).toBe('3 3');
  });

  it('palavra não duplica, precisa de tradução ou significado, e guarda os dados do alemão', async () => {
    const { createVocab } = await import('@/data/languagesRepo');
    const { emptyVocabInput } = await import('@/domain/languages');
    const l = await createLanguage({ name: 'Alemão', code: 'de', color: '#F59E0B' });
    const base = emptyVocabInput(l.id, 'german');
    const v = await createVocab({ ...base, term: 'Hund', translation: 'cachorro', plural: 'Hunde', german: { article: 'der', cases: '', prepositions: '', government: '' } });
    expect(v.german?.article).toBe('der');
    expect(v.srs.due).toBeNull();
    await expect(createVocab({ ...base, term: 'hund', translation: 'cão' })).rejects.toMatchObject({ code: 'duplicate' });
    await expect(createVocab({ ...base, term: 'Katze' })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('revisão usa o mesmo motor dos flashcards e fica no histórico', async () => {
    const { createVocab, answerVocab, vocabReviews } = await import('@/data/languagesRepo');
    const { emptyVocabInput } = await import('@/domain/languages');
    const l = await createLanguage({ name: 'Mandarim', code: 'zh', color: '#8E4EC6' });
    const v = await createVocab({ ...emptyVocabInput(l.id, 'mandarin'), term: 'nǐ hǎo', translation: 'olá', mandarin: { characters: '你好', pinyin: 'nǐ hǎo', tones: '3 3' } });
    const after = await answerVocab(v.id, 'good', false, '2026-11-04');
    expect(after.srs).toMatchObject({ due: '2026-11-05', reps: 1 });
    expect((await vocabReviews(v.id)).map((r) => r.rating)).toEqual(['good']);
  });
});

describe('gramática e revisões (Partes 10.4 e 10.7)', () => {
  it('não duplica regra no mesmo idioma, limpa exemplos vazios e revisa com repetição espaçada', async () => {
    const { createGrammar, answerGrammar, softDeleteGrammar, restoreGrammar } = await import('@/data/grammarRepo');
    const { emptyGrammarInput } = await import('@/domain/languages');
    const de = await createLanguage({ name: 'Alemão', code: 'de', color: '#E5484D' });
    const en = await createLanguage({ name: 'Inglês', code: 'en', color: '#438BEA' });
    const g = await createGrammar({ ...emptyGrammarInput(de.id), title: 'Dativ', examples: ['Ich helfe dem Mann.', '  '] });
    expect(g.examples).toEqual(['Ich helfe dem Mann.']);
    await expect(createGrammar({ ...emptyGrammarInput(de.id), title: ' dativ ' })).rejects.toMatchObject({ code: 'duplicate' });
    await createGrammar({ ...emptyGrammarInput(en.id), title: 'Dativ' });
    await softDeleteGrammar(g.id);
    await createGrammar({ ...emptyGrammarInput(de.id), title: 'Dativ' }).then((x) => softDeleteGrammar(x.id));
    await restoreGrammar(g.id);

    const free = await answerGrammar(g.id, 'easy', true, '2026-11-04');
    expect(free.srs.reps).toBe(0);
    const after = await answerGrammar(g.id, 'good', false, '2026-11-04');
    expect(after.srs).toMatchObject({ due: '2026-11-05', reps: 1 });
    const reviews = await getDb().cardReviews.where('cardId').equals(g.id).toArray();
    expect(reviews.map((r) => [r.rating, r.manual]).sort((a, b) => String(a).localeCompare(String(b)))).toEqual([['easy', true], ['good', false]]);
  });

  it('cada baralho de revisão pega as palavras certas', async () => {
    const { deckHasVocab, deckKey } = await import('@/domain/languages');
    const food = { category: 'comida' };
    const none = { category: '' };
    expect(deckHasVocab({ kind: 'all' }, food)).toBe(true);
    expect(deckHasVocab({ kind: 'vocab' }, none)).toBe(true);
    expect(deckHasVocab({ kind: 'vocab', category: 'comida' }, food)).toBe(true);
    expect(deckHasVocab({ kind: 'vocab', category: 'comida' }, none)).toBe(false);
    expect(deckHasVocab({ kind: 'vocab', category: null }, none)).toBe(true);
    expect(deckHasVocab({ kind: 'vocab', category: null }, food)).toBe(false);
    expect(deckHasVocab({ kind: 'grammar' }, food)).toBe(false);
    expect(new Set([deckKey({ kind: 'vocab' }), deckKey({ kind: 'vocab', category: null }), deckKey({ kind: 'all' }), deckKey({ kind: 'grammar' })]).size).toBe(4);
  });
});
