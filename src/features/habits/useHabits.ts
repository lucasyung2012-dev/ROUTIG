import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { DateKey } from '@/domain/dates';
import type { Habit, HabitLog } from '@/domain/habits';

export interface HabitsData {
  loading: boolean;
  /** Ativos e pausados, em ordem. */
  habits: Habit[];
  archived: Habit[];
  trash: Habit[];
  byId: Map<string, Habit>;
  /** Registros de cada hábito por data. */
  logsOf: (habitId: string) => Map<DateKey, HabitLog>;
  listOf: (habitId: string) => HabitLog[];
}

const EMPTY = new Map<DateKey, HabitLog>();

export function useHabits(): HabitsData {
  const all = useLiveQuery(() => getDb().habits.toArray(), []);
  const logs = useLiveQuery(() => getDb().habitLogs.filter((l) => !l.deletedAt).toArray(), []);
  return useMemo(() => {
    const byHabit = new Map<string, Map<DateKey, HabitLog>>();
    for (const l of logs ?? []) {
      let m = byHabit.get(l.habitId);
      if (!m) byHabit.set(l.habitId, (m = new Map()));
      m.set(l.date, l);
    }
    const live = (all ?? []).filter((h) => !h.deletedAt).sort((a, b) => a.order - b.order);
    return {
      loading: all === undefined || logs === undefined,
      habits: live.filter((h) => !h.archived),
      archived: live.filter((h) => h.archived),
      trash: (all ?? []).filter((h) => h.deletedAt),
      byId: new Map((all ?? []).map((h) => [h.id, h])),
      logsOf: (id: string) => byHabit.get(id) ?? EMPTY,
      listOf: (id: string) => [...(byHabit.get(id)?.values() ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [all, logs]);
}
