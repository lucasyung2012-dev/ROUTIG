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
    const all = await getDb().languages.toArray();
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
