import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { builtinTemplates, type Note, type NoteCollection, type Notebook, type NoteTemplate } from '@/domain/notes';

export interface NotesData {
  loading: boolean;
  notes: Note[];
  trash: Note[];
  notebooks: Notebook[];
  collections: NoteCollection[];
  templates: NoteTemplate[];
  categories: string[];
  tags: string[];
}

const TPL_KEYS = ['class', 'topic', 'mainIdeas', 'doubts', 'homework', 'chapter', 'summary', 'keyConcepts', 'reviewQuestions', 'meeting', 'participants', 'decisions', 'nextSteps', 'journal', 'highlights', 'learned', 'tomorrow'] as const;

export function useNotesData(): NotesData {
  const { t } = useSettings();
  const all = useLiveQuery(() => getDb().notes.toArray(), []);
  const notebooks = useLiveQuery(() => getDb().notebooks.orderBy('order').toArray(), []);
  const collections = useLiveQuery(() => getDb().noteCollections.toArray(), []);
  const userTemplates = useLiveQuery(() => getDb().noteTemplates.toArray(), []);

  return useMemo(() => {
    const notes = (all ?? []).filter((n) => !n.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const labels = Object.fromEntries(TPL_KEYS.map((k) => [k, t(`notes.tpl.${k}`)]));
    return {
      loading: all === undefined || notebooks === undefined || collections === undefined || userTemplates === undefined,
      notes,
      trash: (all ?? []).filter((n) => n.deletedAt),
      notebooks: notebooks ?? [],
      collections: (collections ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      templates: [...builtinTemplates(labels), ...(userTemplates ?? [])],
      categories: [...new Set(notes.map((n) => n.category).filter(Boolean))].sort(),
      tags: [...new Set(notes.flatMap((n) => n.tags))].sort(),
    };
  }, [all, notebooks, collections, userTemplates, t]);
}
