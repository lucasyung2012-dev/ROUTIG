import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createSports, saveActivity, saveSportItem, sportHistory } from '@/data/sportsRepo';
import { emptyActivityInput, SPORT_PRESETS, SPORT_TABS, sportStats } from '@/domain/sports';

beforeEach(() => setDbForTests(new RoutigDB(`test-sports-${Math.random().toString(36).slice(2)}`)));

const presets = () => SPORT_PRESETS.map((p) => ({ ...p, notes: '' }));

describe('esportes (Parte 12)', () => {
  it('tênis e futebol com as áreas da especificação, sem duplicar', async () => {
    expect(await createSports(presets())).toBe(2);
    expect(await createSports(presets())).toBe(0);
    expect(SPORT_TABS.tennis).toEqual(['overview', 'training', 'match', 'tournament', 'technique', 'fundamental', 'evolution', 'goals', 'history', 'materials']);
    expect(SPORT_TABS.football).toEqual(['overview', 'match', 'training', 'fundamental', 'skill', 'position', 'goals', 'notes', 'history']);
  });

  it('registro rápido: só tipo e data; resultado só em partida e torneio; sem data futura', async () => {
    await createSports(presets());
    const tennis = (await getDb().sports.toArray()).find((s) => s.kind === 'tennis')!;
    const a = await saveActivity(null, emptyActivityInput(tennis.id, 'training', '2026-11-04'), '2026-11-04');
    expect([a.type, a.durationMin, a.outcome]).toEqual(['training', null, null]);
    const t2 = await saveActivity(null, { ...emptyActivityInput(tennis.id, 'training', '2026-11-03'), outcome: 'win' }, '2026-11-04');
    expect(t2.outcome).toBeNull();
    await expect(saveActivity(null, emptyActivityInput(tennis.id, 'match', '2026-11-05'), '2026-11-04')).rejects.toMatchObject({ code: 'future' });
  });

  it('placar, posições e evolução da confiança', async () => {
    await createSports(presets());
    const football = (await getDb().sports.toArray()).find((s) => s.kind === 'football')!;
    const meia = await saveSportItem(null, { sportId: football.id, category: 'position', name: 'Meia', confidence: 3, difficulties: '', notes: '' });
    const passe = await saveSportItem(null, { sportId: football.id, category: 'fundamental', name: 'Passe', confidence: 2, difficulties: '', notes: '' });
    await saveSportItem(passe.id, { sportId: football.id, category: 'fundamental', name: 'Passe', confidence: 4, difficulties: '', notes: '' });
    await expect(saveSportItem(null, { sportId: football.id, category: 'fundamental', name: 'passe', confidence: null, difficulties: '', notes: '' })).rejects.toMatchObject({ code: 'duplicate' });
    await saveActivity(null, { ...emptyActivityInput(football.id, 'match', '2026-11-01'), outcome: 'win', score: '3 x 2', positionId: meia.id, itemIds: [passe.id] }, '2026-11-04');
    await saveActivity(null, { ...emptyActivityInput(football.id, 'match', '2026-11-02'), outcome: 'draw', positionId: meia.id }, '2026-11-04');
    const st = sportStats(await getDb().sportActivities.toArray());
    expect(st.record).toEqual({ win: 1, loss: 0, draw: 1 });
    expect(st.positions.get(meia.id)).toBe(2);
    expect(st.items.get(passe.id)).toBe(1);
    const notes = (await sportHistory(football.id)).filter((c) => c.entityId === passe.id).map((c) => c.note);
    expect(notes).toEqual(expect.arrayContaining(['confidence:2', 'confidence:4']));
  });
});
