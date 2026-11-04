import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { answerCard, createCard, createDeck } from '@/data/flashcardsRepo';
import { cardStage, isDue, masteryScore, newSrsState, review, sessionQueue } from '@/domain/srs';

beforeEach(() => setDbForTests(new RoutigDB(`test-srs-${Math.random().toString(36).slice(2)}`)));

const T = '2026-11-03';

describe('repetição espaçada adaptativa (Parte 9.9)', () => {
  it('acertos seguidos aumentam o intervalo: 1, 3, depois × facilidade', () => {
    let s = newSrsState();
    s = review(s, 'good', T, 'x');
    expect([s.interval, s.due]).toEqual([1, '2026-11-04']);
    s = review(s, 'good', T, 'x');
    expect(s.interval).toBe(3);
    s = review(s, 'good', T, 'x');
    expect(s.interval).toBe(8); // 3 × 2,5 arredondado
    expect(cardStage(s)).toBe('young');
  });

  it('errar volta amanhã, baixa a facilidade e conta lapso', () => {
    let s = review(review(review(newSrsState(), 'good', T, 'x'), 'good', T, 'x'), 'good', T, 'x');
    s = review(s, 'again', T, 'x');
    expect(s).toMatchObject({ interval: 1, streak: 0, lapses: 1, ease: 2.3 });
  });

  it('fácil sobe a facilidade e dá intervalo maior que bom', () => {
    const base = review(newSrsState(), 'good', T, 'x');
    expect(review(base, 'easy', T, 'x').interval).toBeGreaterThan(review(base, 'good', T, 'x').interval);
    expect(review(base, 'easy', T, 'x').ease).toBe(2.65);
  });

  it('facilidade nunca cai abaixo de 1,3', () => {
    let s = newSrsState();
    for (let i = 0; i < 20; i++) s = review(s, 'again', T, 'x');
    expect(s.ease).toBe(1.3);
  });

  it('a fila põe os atrasados e difíceis primeiro e limita os novos', () => {
    const c = (id: string, due: string | null, ease = 2.5) => ({ id, srs: { ...newSrsState(), due, ease, reps: due ? 3 : 0 } });
    const q = sessionQueue([c('novo1', null), c('facil', '2026-11-01', 2.8), c('dificil', '2026-11-01', 1.5), c('antigo', '2026-10-20'), c('futuro', '2026-12-01'), c('novo2', null)], T, { newLimit: 1, reviewLimit: 10 });
    expect(q.map((x) => x.id)).toEqual(['antigo', 'dificil', 'facil', 'novo1']);
    expect(isDue(c('futuro', '2026-12-01').srs, T)).toBe(false);
  });

  it('domínio estimado vai de 0 (novo) a perto de 100 (maduro e fácil)', () => {
    expect(masteryScore(newSrsState())).toBe(0);
    expect(masteryScore({ ...newSrsState(), reps: 8, streak: 8, interval: 60, ease: 3 })).toBeGreaterThan(90);
  });
});

describe('baralhos e cartões', () => {
  it('não duplica cartão no mesmo baralho e treino livre não muda o agendamento', async () => {
    const d = await createDeck({ name: 'Inglês', subjectId: null, color: '#438BEA', category: '', tags: [] });
    const card = await createCard({ deckId: d.id, front: 'apple', back: 'maçã', category: '', tags: [], contentId: null });
    await expect(createCard({ deckId: d.id, front: 'Apple', back: 'x', category: '', tags: [], contentId: null })).rejects.toMatchObject({ code: 'duplicate' });
    const practiced = await answerCard(card.id, 'easy', true, T);
    expect(practiced.srs.due).toBeNull();
    const reviewed = await answerCard(card.id, 'good', false, T);
    expect(reviewed.srs.due).toBe('2026-11-04');
    const hist = await getDb().cardReviews.where('cardId').equals(card.id).toArray();
    expect(hist.map((h) => h.manual).sort()).toEqual([false, true]);
  });
});
