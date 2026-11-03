import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { loadTasksConfig } from '@/data/tasksRepo';
import { defaultTasksConfig, type Task, type TaskList, type TasksConfig, type TaskStatus } from '@/domain/tasks';
import { useSettings } from '@/app/SettingsProvider';

export interface TasksData {
  loading: boolean;
  /** Todas as tarefas, inclusive as da Lixeira. */
  all: Task[];
  /** Fora da Lixeira. */
  active: Task[];
  trash: Task[];
  byId: Map<string, Task>;
  lists: TaskList[];
  config: TasksConfig;
  tags: string[];
  categories: string[];
}

/** Lê tarefas, listas e configuração do banco local e atualiza a tela sozinho a cada mudança. */
export function useTasksData(): TasksData {
  const all = useLiveQuery(() => getDb().tasks.toArray(), []);
  const lists = useLiveQuery(() => getDb().taskLists.orderBy('order').toArray(), []);
  const config = useLiveQuery(() => loadTasksConfig(), []);

  return useMemo(() => {
    const tasks = all ?? [];
    const active = tasks.filter((t) => !t.deletedAt);
    const cfg = config ?? defaultTasksConfig();
    const tags = [...new Set(active.flatMap((t) => t.tags))].sort();
    const categories = [...new Set([...cfg.categories, ...active.map((t) => t.category).filter(Boolean)])].sort();
    return {
      loading: all === undefined || lists === undefined || config === undefined,
      all: tasks,
      active,
      trash: tasks.filter((t) => t.deletedAt).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
      byId: new Map(tasks.map((t) => [t.id, t])),
      lists: lists ?? [],
      config: cfg,
      tags,
      categories,
    };
  }, [all, lists, config]);
}

/** Nome visível de um status: o que o usuário deu, ou a tradução do de fábrica. */
export function useStatusName() {
  const { t } = useSettings();
  return (s: TaskStatus | undefined): string => {
    if (!s) return '—';
    if (s.name) return s.name;
    switch (s.id) {
      case 'todo':
      case 'doing':
      case 'waiting':
      case 'done':
      case 'cancelled':
      case 'archived':
        return t(`tasks.status.${s.id}`);
      default:
        return t(`tasks.kinds.${s.kind}`);
    }
  };
}

export const LIST_COLORS = ['#7357F6', '#16B8A6', '#F59E0B', '#EC6695', '#438BEA', '#8B93B8'] as const;
