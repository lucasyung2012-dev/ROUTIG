import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createInstrument, createItem, createSong, instrumentHistory, savePractice, updateItem, updateSong } from '@/data/musicRepo';
import { chordsInSheet, emptyItemInput, emptyPracticeInput, emptySongInput, GUITAR_PRESET, itemInputOf, parseChordList, parseFrets, practiceStats, songInputOf } from '@/domain/music';

beforeEach(() => setDbForTests(new RoutigDB(`test-music-${Math.random().toString(36).slice(2)}`)));

const guitar = () => createInstrument({ ...GUITAR_PRESET, startedOn: null, notes: '' });

describe('música (Parte 11)', () => {
  it('violão como instrumento inicial, sem duplicar', async () => {
    const g = await guitar();
    expect([g.name, g.strings, g.tuning]).toEqual(['Violão', 6, 'E A D G B E']);
    await expect(guitar()).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('lê as casas do acorde em vários formatos', () => {
    expect(parseFrets('x32010', 6)).toEqual([null, 3, 2, 0, 1, 0]);
    expect(parseFrets('8 10 10 9 8 8', 6)).toEqual([8, 10, 10, 9, 8, 8]);
    expect(parseFrets('x3201', 6)).toBeNull();
    expect(parseFrets('x3201y', 6)).toBeNull();
  });

  it('acha os acordes da cifra e não repete', () => {
    const sheet = 'Am        C\nQuando a gente ama\nG    F   Am\nÉ claro que a gente cuida';
    expect(chordsInSheet(sheet)).toEqual(['Am', 'C', 'G', 'F']);
    expect(parseChordList('Am, C  G7 / am D/F#')).toEqual(['Am', 'C', 'G7', 'D/F#']);
  });

  it('repertório: não duplica música do mesmo artista; status e progresso entram no histórico', async () => {
    const g = await guitar();
    const s = await createSong({ ...emptySongInput(g.id), name: 'Tempo Perdido', artist: 'Legião Urbana' });
    await expect(createSong({ ...emptySongInput(g.id), name: 'tempo perdido', artist: 'legião urbana' })).rejects.toMatchObject({ code: 'duplicate' });
    await createSong({ ...emptySongInput(g.id), name: 'Tempo Perdido', artist: 'Outro' });
    await expect(createSong({ ...emptySongInput(g.id), name: 'X', videoUrl: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'invalid' });
    await updateSong(s.id, { ...songInputOf(s), status: 'learning', progress: 40 });
    const notes = (await instrumentHistory(g.id)).map((c) => c.note);
    expect(notes).toEqual(expect.arrayContaining(['status:learning', 'progress:40']));
  });

  it('técnica: a evolução da confiança fica no histórico', async () => {
    const g = await guitar();
    const it1 = await createItem({ ...emptyItemInput(g.id, 'technique'), name: 'Pestana', confidence: 2 });
    await updateItem(it1.id, { ...itemInputOf(it1), confidence: 4, status: 'practicing' });
    const notes = (await instrumentHistory(g.id)).filter((c) => c.entityId === it1.id).map((c) => c.note);
    expect(notes).toEqual(expect.arrayContaining(['confidence:2', 'confidence:4', 'status:practicing']));
    await expect(createItem({ ...emptyItemInput(g.id, 'technique'), name: 'pestana' })).rejects.toMatchObject({ code: 'duplicate' });
    await createItem({ ...emptyItemInput(g.id, 'chord'), name: 'Pestana', frets: 'x02210' });
  });

  it('prática conta minutos e quantas vezes cada música foi praticada', async () => {
    const g = await guitar();
    const s = await createSong({ ...emptySongInput(g.id), name: 'Asa Branca' });
    await savePractice(null, { ...emptyPracticeInput(g.id, '2026-11-02'), durationMin: 20, songIds: [s.id, s.id] });
    await savePractice(null, { ...emptyPracticeInput(g.id, '2026-11-04'), durationMin: 30, songIds: [s.id] });
    const sessions = await getDb().practiceSessions.toArray();
    expect(sessions[0]?.songIds).toEqual([s.id]);
    const st = practiceStats(sessions);
    expect([st.minutes, st.sessions, st.times.get(s.id)]).toEqual([50, 2, { count: 2, last: '2026-11-04' }]);
  });
});
