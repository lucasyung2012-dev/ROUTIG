import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { Sport, SportActivity, SportItem } from '@/domain/sports';

export interface SportsData {
  loading: boolean;
  sports: Sport[];
  trash: Sport[];
  byId: Map<string, Sport>;
  activitiesOf: (sportId: string) => SportActivity[];
  itemsOf: (sportId: string) => SportItem[];
  itemTrash: (sportId: string) => SportItem[];
}

export function useSports(): SportsData {
  const sports = useLiveQuery(() => getDb().sports.toArray(), []);
  const acts = useLiveQuery(() => getDb().sportActivities.toArray(), []);
  const items = useLiveQuery(() => getDb().sportItems.toArray(), []);
  return useMemo(() => {
    const liveActs = (acts ?? []).filter((a) => !a.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const liveItems = (items ?? []).filter((i) => !i.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
    return {
      loading: sports === undefined || acts === undefined || items === undefined,
      sports: (sports ?? []).filter((s) => !s.deletedAt).sort((a, b) => a.order - b.order),
      trash: (sports ?? []).filter((s) => s.deletedAt),
      byId: new Map((sports ?? []).map((s) => [s.id, s])),
      activitiesOf: (id) => liveActs.filter((a) => a.sportId === id),
      itemsOf: (id) => liveItems.filter((i) => i.sportId === id),
      itemTrash: (id) => (items ?? []).filter((i) => i.deletedAt && i.sportId === id),
    };
  }, [sports, acts, items]);
}
