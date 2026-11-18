import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/domain/academy';
import type { GrammarRule, VocabEntry } from '@/domain/languages';
import type { Note } from '@/domain/notes';
import { grammarToReview, handwrittenNotes, nextSessions, withPronunciation } from '@/features/park/panels/north/stationData';

const note = (id: string, updatedAt: string, drawing: boolean, deletedAt: string | null = null) =>
  ({ id, updatedAt, deletedAt, blocks: drawing ? [{ id: `${id}-d`, type: 'drawing', strokes: [], height: 400 }] : [{ id: `${id}-p`, type: 'paragraph', text: 'oi' }] }) as unknown as Note;

const session = (id: string, over: Partial<StudySession>) => ({ id, subjectId: 's1', date: '2026-11-20', time: null, status: 'planned', deletedAt: null, kind: 'study', durationMin: 30, ...over }) as unknown as StudySession;

const rule = (id: string, title: string, due: string | null, deletedAt: string | null = null) => ({ id, title, deletedAt, srs: { due } }) as unknown as GrammarRule;

const word = (id: string, term: string, pronunciation: string, deletedAt: string | null = null) => ({ id, term, pronunciation, deletedAt }) as unknown as VocabEntry;

describe('estações nativas do Campus Norte: partes puras', () => {
  it('notas manuscritas: só as com desenho, fora da lixeira, da mais recente para a mais antiga', () => {
    const out = handwrittenNotes([note('a', '2026-11-01', true), note('b', '2026-11-10', false), note('c', '2026-11-12', true), note('d', '2026-11-15', true, '2026-11-16')]);
    expect(out.map((n) => n.id)).toEqual(['c', 'a']);
  });

  it('próximas sessões: planejadas, da disciplina, de hoje em diante, por data e hora, no limite', () => {
    const list = [
      session('past', { date: '2026-11-17' }),
      session('other', { subjectId: 's2' }),
      session('done', { status: 'done' }),
      session('gone', { deletedAt: '2026-11-18' }),
      session('late', { date: '2026-11-25' }),
      session('noon', { date: '2026-11-20', time: '12:00' }),
      session('morning', { date: '2026-11-20', time: '08:00' }),
      session('today', { date: '2026-11-18' }),
    ];
    expect(nextSessions(list, 's1', '2026-11-18', 10).map((s) => s.id)).toEqual(['today', 'morning', 'noon', 'late']);
    expect(nextSessions(list, 's1', '2026-11-18', 2).map((s) => s.id)).toEqual(['today', 'morning']);
  });

  it('gramática para revisar: vencidas (mais atrasada primeiro) e novas, sem as futuras nem as apagadas', () => {
    const { due, fresh } = grammarToReview([rule('f', 'Futuro', '2026-12-01'), rule('n2', 'Zeta', null), rule('d2', 'B', '2026-11-18'), rule('d1', 'A', '2026-11-02'), rule('n1', 'Alfa', null), rule('x', 'Apagada', '2026-11-01', '2026-11-03')], '2026-11-18');
    expect(due.map((g) => g.id)).toEqual(['d1', 'd2']);
    expect(fresh.map((g) => g.id)).toEqual(['n1', 'n2']);
  });

  it('pronúncia: só as palavras com a pronúncia anotada, em ordem alfabética', () => {
    const out = withPronunciation([word('1', 'zebra', '/ˈziː.brə/'), word('2', 'apple', '  '), word('3', 'book', '/bʊk/'), word('4', 'cat', '/kæt/', '2026-11-01')]);
    expect(out.map((v) => v.term)).toEqual(['book', 'zebra']);
  });
});
