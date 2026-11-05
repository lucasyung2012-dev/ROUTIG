import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';

/** Lê de uma vez os registros de todos os módulos (Parte 19: dados reais, nada copiado). */
export function useInsightsData() {
  return useLiveQuery(async () => {
    const db = getDb();
    const [tasks, projects, goals, goalCheckins, habits, habitLogs, focus, subjects, years, assessments, contents, studySessions, languages, languageSessions, vocab, grammar, cardReviews, instruments, practice, songs, sports, sportActivities, finAssets, finTransactions, finQuotes, songChanges] = await Promise.all([
      db.tasks.toArray(),
      db.projects.toArray(),
      db.goals.toArray(),
      db.goalCheckins.toArray(),
      db.habits.toArray(),
      db.habitLogs.toArray(),
      db.focusSessions.toArray(),
      db.subjects.toArray(),
      db.academicYears.toArray(),
      db.assessments.toArray(),
      db.contents.toArray(),
      db.studySessions.toArray(),
      db.languages.toArray(),
      db.languageSessions.toArray(),
      db.vocab.toArray(),
      db.grammarRules.toArray(),
      db.cardReviews.toArray(),
      db.instruments.toArray(),
      db.practiceSessions.toArray(),
      db.songs.toArray(),
      db.sports.toArray(),
      db.sportActivities.toArray(),
      db.finAssets.toArray(),
      db.finTransactions.toArray(),
      db.finQuotes.toArray(),
      db.changelog.where('entityType').equals('song').toArray(),
    ]);
    return { tasks, projects, goals, goalCheckins, habits, habitLogs, focus, subjects, years, assessments, contents, studySessions, languages, languageSessions, vocab, grammar, cardReviews, instruments, practice, songs, sports, sportActivities, finAssets, finTransactions, finQuotes, songChanges };
  }, []);
}

export type InsightsRaw = NonNullable<ReturnType<typeof useInsightsData>>;
