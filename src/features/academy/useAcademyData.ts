import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { periodGrade, periodResultId, yearGrade, type AcademicYear, type Assessment, type GradeResult, type GradingModel, type PeriodResult, type Subject, type Teacher } from '@/domain/academy';

export interface AcademyData {
  loading: boolean;
  years: AcademicYear[];
  /** Ano aberto agora: o marcado como atual, ou o mais recente. */
  year: AcademicYear | null;
  subjects: Subject[];
  subjectsTrash: Subject[];
  teachers: Teacher[];
  /** Avaliações (não excluídas) das disciplinas do ano aberto. */
  assessments: Assessment[];
  assessmentsTrash: Assessment[];
  subjectById: Map<string, Subject>;
  teacherById: Map<string, Teacher>;
  modelOf: (s: Subject) => GradingModel;
  assessmentsOf: (subjectId: string, periodId?: string | null) => Assessment[];
  resultOf: (subjectId: string, periodId: string) => PeriodResult | null;
  gradeOf: (s: Subject, periodId: string) => GradeResult;
  yearGradeOf: (s: Subject) => ReturnType<typeof yearGrade>;
}

/** Tudo da Academy num lugar só, já com as notas calculadas (nada é guardado em duplicidade). */
export function useAcademyData(yearId?: string | null): AcademyData {
  const years = useLiveQuery(() => getDb().academicYears.toArray(), []);
  const subjects = useLiveQuery(() => getDb().subjects.toArray(), []);
  const teachers = useLiveQuery(() => getDb().teachers.toArray(), []);
  const assessments = useLiveQuery(() => getDb().assessments.toArray(), []);
  const results = useLiveQuery(() => getDb().periodResults.toArray(), []);

  return useMemo(() => {
    const ys = (years ?? []).filter((y) => !y.deletedAt).sort((a, b) => b.label.localeCompare(a.label));
    const year = (yearId ? ys.find((y) => y.id === yearId) : null) ?? ys.find((y) => y.current) ?? ys[0] ?? null;
    const allSubjects = (subjects ?? []).filter((s) => s.yearId === year?.id);
    const subs = allSubjects.filter((s) => !s.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
    const subIds = new Set(subs.map((s) => s.id));
    const allAsm = (assessments ?? []).filter((a) => subIds.has(a.subjectId));
    const asm = allAsm.filter((a) => !a.deletedAt).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    const resMap = new Map((results ?? []).map((r) => [r.id, r]));
    const modelOf = (s: Subject) => s.model ?? year?.model ?? ({} as GradingModel);
    const assessmentsOf = (subjectId: string, periodId?: string | null) => asm.filter((a) => a.subjectId === subjectId && (periodId === undefined || a.periodId === periodId));
    const resultOf = (subjectId: string, periodId: string) => resMap.get(periodResultId(subjectId, periodId)) ?? null;
    const gradeOf = (s: Subject, periodId: string) => periodGrade(modelOf(s), assessmentsOf(s.id, periodId), resultOf(s.id, periodId));
    return {
      loading: [years, subjects, teachers, assessments, results].some((x) => x === undefined),
      years: ys,
      year,
      subjects: subs,
      subjectsTrash: allSubjects.filter((s) => s.deletedAt),
      teachers: (teachers ?? []).filter((t) => !t.deletedAt).sort((a, b) => a.name.localeCompare(b.name)),
      assessments: asm,
      assessmentsTrash: allAsm.filter((a) => a.deletedAt),
      subjectById: new Map((subjects ?? []).map((s) => [s.id, s])),
      teacherById: new Map((teachers ?? []).map((t) => [t.id, t])),
      modelOf,
      assessmentsOf,
      resultOf,
      gradeOf,
      yearGradeOf: (s: Subject) => yearGrade(modelOf(s), (year?.periods ?? []).map((p) => gradeOf(s, p.id))),
    };
  }, [years, subjects, teachers, assessments, results, yearId]);
}

/** Número no formato do idioma (vírgula no português), com até 2 casas. */
export function formatGrade(v: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(v);
}
