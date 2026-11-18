import type { StudySession } from '@/domain/academy';
import type { DateKey } from '@/domain/dates';
import type { GrammarRule, VocabEntry } from '@/domain/languages';
import type { Note } from '@/domain/notes';

/*
 * Partes puras das estações nativas do Campus Norte (só filtram e ordenam os registros reais do
 * módulo; nada é calculado à parte nem guardado em outro lugar).
 */

/** Notas manuscritas (com um bloco de desenho), fora da lixeira, da editada por último à mais antiga. */
export function handwrittenNotes(notes: readonly Note[]): Note[] {
  return notes.filter((n) => !n.deletedAt && n.blocks.some((b) => b.type === 'drawing')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Próximas sessões planejadas da disciplina (de hoje em diante), por data e hora; no máximo `n`. */
export function nextSessions(sessions: readonly StudySession[], subjectId: string, today: DateKey, n: number): StudySession[] {
  return sessions
    .filter((s) => s.subjectId === subjectId && !s.deletedAt && s.status === 'planned' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
    .slice(0, n);
}

/**
 * Regras de gramática do idioma para a revisão espaçada de hoje (o mesmo critério da Revisão de
 * Idiomas): `due`, as vencidas (srs.due até hoje), da mais atrasada à mais recente; `fresh`, as
 * novas (nunca revisadas), por título. Fora da lixeira.
 */
export function grammarToReview(rules: readonly GrammarRule[], today: DateKey): { due: GrammarRule[]; fresh: GrammarRule[] } {
  const live = rules.filter((g) => !g.deletedAt);
  return {
    due: live.filter((g) => g.srs.due !== null && g.srs.due <= today).sort((a, b) => (a.srs.due ?? '').localeCompare(b.srs.due ?? '') || a.title.localeCompare(b.title)),
    fresh: live.filter((g) => g.srs.due === null).sort((a, b) => a.title.localeCompare(b.title)),
  };
}

/** Palavras do vocabulário com a pronúncia anotada (o campo do cadastro), em ordem alfabética. */
export function withPronunciation(vocab: readonly VocabEntry[]): VocabEntry[] {
  return vocab.filter((v) => !v.deletedAt && v.pronunciation.trim() !== '').sort((a, b) => a.term.localeCompare(b.term));
}
