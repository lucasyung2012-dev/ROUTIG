import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { Content, Doubt, Lesson } from '@/domain/academy';
import type { Note } from '@/domain/notes';
import type { Project } from '@/domain/projects';
import type { Task } from '@/domain/tasks';

export interface SubjectExtras {
  loading: boolean;
  contents: Content[];
  lessons: Lesson[];
  lessonsTrash: Lesson[];
  doubts: Doubt[];
  /** Atividades: tarefas ligadas à disciplina (as mesmas de Tasks). */
  tasks: Task[];
  /** Trabalhos: projetos ligados à disciplina (os mesmos de Projects). */
  projects: Project[];
  /** Materiais: notas ligadas à disciplina, a aulas ou a avaliações dela. */
  notes: Note[];
  contentById: Map<string, Content>;
}

/**
 * Conteúdos, aulas, dúvidas, atividades, trabalhos e materiais de uma ou mais
 * disciplinas, lidos dos módulos de origem (nada é copiado).
 */
export function useSubjectExtras(subjectIds: string[], assessmentNoteIds: string[] = []): SubjectExtras {
  const key = subjectIds.join(',');
  const data = useLiveQuery(async () => {
    const db = getDb();
    const ids = new Set(subjectIds);
    const [contents, lessons, doubts, tasks, projects] = await Promise.all([
      db.contents.where('subjectId').anyOf(subjectIds).toArray(),
      db.lessons.where('subjectId').anyOf(subjectIds).toArray(),
      db.doubts.where('subjectId').anyOf(subjectIds).toArray(),
      db.tasks.filter((t) => !t.deletedAt && !!t.subjectId && ids.has(t.subjectId)).toArray(),
      db.projects.filter((p) => !p.deletedAt && !!p.subjectId && ids.has(p.subjectId)).toArray(),
    ]);
    const lessonNotes = new Set(lessons.filter((l) => !l.deletedAt).flatMap((l) => l.noteIds));
    const extra = new Set(assessmentNoteIds);
    const notes = await db.notes.filter((n) => !n.deletedAt && (n.links.some((l) => l.type === 'subject' && ids.has(l.id)) || lessonNotes.has(n.id) || extra.has(n.id))).toArray();
    return { contents, lessons, doubts, tasks, projects, notes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, assessmentNoteIds.join(',')]);

  return useMemo(() => {
    const contents = (data?.contents ?? []).filter((c) => !c.deletedAt);
    return {
      loading: data === undefined,
      contents,
      lessons: (data?.lessons ?? []).filter((l) => !l.deletedAt).sort((a, b) => b.date.localeCompare(a.date)),
      lessonsTrash: (data?.lessons ?? []).filter((l) => l.deletedAt),
      doubts: (data?.doubts ?? []).filter((d) => !d.deletedAt).sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'open' ? -1 : 1)),
      tasks: data?.tasks ?? [],
      projects: (data?.projects ?? []).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999')),
      notes: (data?.notes ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      contentById: new Map(contents.map((c) => [c.id, c])),
    };
  }, [data]);
}
