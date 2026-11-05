import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { compareGoals, type Goal, type GoalCheckin } from '@/domain/goals';

export interface GoalsData {
  loading: boolean;
  goals: Goal[];
  trash: Goal[];
  byId: Map<string, Goal>;
  checkinsOf: (goalId: string) => GoalCheckin[];
  /** Objetivos que ligam um registro de outro módulo (para mostrar do outro lado, sem cópia). */
  goalsLinkedTo: (type: string, id: string) => Goal[];
}

const EMPTY: GoalCheckin[] = [];

export function useGoals(): GoalsData {
  const all = useLiveQuery(() => getDb().goals.toArray(), []);
  const checkins = useLiveQuery(() => getDb().goalCheckins.filter((c) => !c.deletedAt).toArray(), []);
  return useMemo(() => {
    const byGoal = new Map<string, GoalCheckin[]>();
    for (const c of checkins ?? []) {
      const list = byGoal.get(c.goalId) ?? [];
      list.push(c);
      byGoal.set(c.goalId, list);
    }
    for (const list of byGoal.values()) list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const live = (all ?? []).filter((g) => !g.deletedAt).sort(compareGoals);
    return {
      loading: all === undefined || checkins === undefined,
      goals: live,
      trash: (all ?? []).filter((g) => g.deletedAt),
      byId: new Map((all ?? []).map((g) => [g.id, g])),
      checkinsOf: (id: string) => byGoal.get(id) ?? EMPTY,
      goalsLinkedTo: (type: string, id: string) => live.filter((g) => g.refs.some((r) => r.type === type && r.id === id)),
    };
  }, [all, checkins]);
}
