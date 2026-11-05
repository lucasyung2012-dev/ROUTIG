import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { Instrument, MusicItem, PracticeSession, Song } from '@/domain/music';

export interface MusicData {
  loading: boolean;
  instruments: Instrument[];
  trash: Instrument[];
  byId: Map<string, Instrument>;
  itemsOf: (instrumentId: string) => MusicItem[];
  songsOf: (instrumentId: string) => Song[];
  practiceOf: (instrumentId: string) => PracticeSession[];
  itemTrash: (instrumentId: string) => MusicItem[];
  songTrash: (instrumentId: string) => Song[];
}

/** Instrumentos e tudo de cada um, lido do banco (sem cópias entre telas). */
export function useMusic(): MusicData {
  const instruments = useLiveQuery(() => getDb().instruments.toArray(), []);
  const items = useLiveQuery(() => getDb().musicItems.toArray(), []);
  const songs = useLiveQuery(() => getDb().songs.toArray(), []);
  const practice = useLiveQuery(() => getDb().practiceSessions.toArray(), []);
  return useMemo(() => {
    const live = <T extends { deletedAt: string | null }>(xs: T[] | undefined) => (xs ?? []).filter((x) => !x.deletedAt);
    const dead = <T extends { deletedAt: string | null }>(xs: T[] | undefined) => (xs ?? []).filter((x) => x.deletedAt);
    return {
      loading: instruments === undefined || items === undefined || songs === undefined || practice === undefined,
      instruments: live(instruments).sort((a, b) => a.order - b.order),
      trash: dead(instruments),
      byId: new Map((instruments ?? []).map((i) => [i.id, i])),
      itemsOf: (id) => live(items).filter((i) => i.instrumentId === id).sort((a, b) => a.name.localeCompare(b.name)),
      songsOf: (id) => live(songs).filter((s) => s.instrumentId === id).sort((a, b) => a.name.localeCompare(b.name)),
      practiceOf: (id) => live(practice).filter((p) => p.instrumentId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
      itemTrash: (id) => dead(items).filter((i) => i.instrumentId === id),
      songTrash: (id) => dead(songs).filter((s) => s.instrumentId === id),
    };
  }, [instruments, items, songs, practice]);
}
