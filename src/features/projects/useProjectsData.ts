import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { projectProgress, type Project, type ProjectProgress } from '@/domain/projects';
import { isClosedKind, statusKind, type Task } from '@/domain/tasks';
import { useTasksData, type TasksData } from '@/features/tasks/useTasksData';

export interface ProjectsData {
  loading: boolean;
  projects: Project[];
  trash: Project[];
  byId: Map<string, Project>;
  tasks: TasksData;
  tasksOf: (projectId: string) => Task[];
  progressOf: (project: Project) => ProjectProgress;
}

export function useProjectsData(): ProjectsData {
  const all = useLiveQuery(() => getDb().projects.toArray(), []);
  const tasks = useTasksData();
  return useMemo(() => {
    const projects = (all ?? []).filter((p) => !p.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const tasksOf = (id: string) => tasks.active.filter((t) => t.projectId === id);
    return {
      loading: all === undefined || tasks.loading,
      projects,
      trash: (all ?? []).filter((p) => p.deletedAt),
      byId: new Map((all ?? []).map((p) => [p.id, p])),
      tasks,
      tasksOf,
      progressOf: (p) => projectProgress(p, tasksOf(p.id), (s) => isClosedKind(statusKind(tasks.config, s)) && statusKind(tasks.config, s) === 'done'),
    };
  }, [all, tasks]);
}
