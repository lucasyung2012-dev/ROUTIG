import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { Language, LanguageSession } from '@/domain/languages';

export interface LanguagesData {
  loading: boolean;
  languages: Language[];
  trash: Language[];
  sessions: LanguageSession[];
  sessionsOf: (languageId: string) => LanguageSession[];
  byId: Map<string, Language>;
}

/** Idiomas e sessões de estudo, em ordem. */
export function useLanguages(): LanguagesData {
  const all = useLiveQuery(() => getDb().languages.toArray(), []);
  const sessions = useLiveQuery(() => getDb().languageSessions.toArray(), []);
  return useMemo(() => {
    const live = (sessions ?? []).filter((s) => !s.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return {
      loading: all === undefined || sessions === undefined,
      languages: (all ?? []).filter((l) => !l.deletedAt).sort((a, b) => a.order - b.order),
      trash: (all ?? []).filter((l) => l.deletedAt),
      sessions: live,
      sessionsOf: (id: string) => live.filter((s) => s.languageId === id),
      byId: new Map((all ?? []).map((l) => [l.id, l])),
    };
  }, [all, sessions]);
}
