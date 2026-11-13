import { getDb, touch } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import {
  assessmentInputSchema,
  defaultGradingModel,
  defaultPeriods,
  gradingModelSchema,
  periodResultId,
  type AcademicPeriod,
  type AcademicYear,
  type Assessment,
  type AssessmentInput,
  type GradingModel,
  type PeriodResult,
  type Subject,
  type SubjectKind,
  type Teacher,
} from '@/domain/academy';

export class AcademyRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'duplicate' | 'in_use') {
    super(code);
  }
}

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

const base = () => {
  const at = nowIso();
  return { createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
};

function cleanModel(m: GradingModel): GradingModel {
  const parsed = gradingModelSchema.safeParse(m);
  if (!parsed.success) throw new AcademyRuleError('invalid');
  return parsed.data;
}

/* ---------- Anos letivos ---------- */

export interface YearInput {
  label: string;
  institution: string;
  grade: string;
  periods?: AcademicPeriod[];
  model?: GradingModel;
  masteryLevels?: string[];
}

/** Cria um ano letivo. O primeiro vira o "atual". Mesmo rótulo na mesma instituição não se repete. */
export async function createYear(input: YearInput): Promise<AcademicYear> {
  const label = input.label.trim().slice(0, 40);
  if (!label) throw new AcademyRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.academicYears, db.changelog, async () => {
    const all = await db.academicYears.filter((y) => !y.deletedAt).toArray();
    if (all.some((y) => y.label.toLowerCase() === label.toLowerCase() && y.institution.trim().toLowerCase() === input.institution.trim().toLowerCase())) throw new AcademyRuleError('duplicate');
    const year: AcademicYear = {
      id: newId('ay'),
      label,
      institution: input.institution.trim().slice(0, 120),
      grade: input.grade.trim().slice(0, 60),
      periods: input.periods ?? defaultPeriods(),
      model: cleanModel(input.model ?? defaultGradingModel()),
      masteryLevels: (input.masteryLevels ?? []).map((l) => l.trim().slice(0, 40)).filter(Boolean),
      current: all.length === 0,
      ...base(),
    };
    await db.academicYears.add(year);
    await log({ entityType: 'academicYear', entityId: year.id, action: 'create' });
    return year;
  });
}

export async function updateYear(id: string, patch: Partial<Pick<AcademicYear, 'label' | 'institution' | 'grade' | 'periods' | 'model' | 'masteryLevels'>>): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.academicYears, db.changelog, async () => {
    const y = await db.academicYears.get(id);
    if (!y) throw new AcademyRuleError('not_found');
    const next: AcademicYear = {
      ...y,
      ...patch,
      label: (patch.label ?? y.label).trim().slice(0, 40) || y.label,
      model: patch.model ? cleanModel(patch.model) : y.model,
      periods: (patch.periods ?? y.periods).map((p) => ({ ...p, name: p.name.trim().slice(0, 40) || p.name })),
      updatedAt: nowIso(),
      rev: y.rev + 1,
    };
    await db.academicYears.put(next);
    await log({ entityType: 'academicYear', entityId: id, action: 'update', fields: Object.keys(patch) });
  });
}

export async function setCurrentYear(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.academicYears, async () => {
    const at = nowIso();
    await db.academicYears.toCollection().modify((y) => {
      const current = y.id === id;
      if (y.current === current) return;
      y.current = current;
      touch(y, at);
    });
  });
}

/** Remover um período só é possível se nenhuma avaliação estiver nele. */
export async function periodInUse(periodId: string): Promise<boolean> {
  return (await getDb().assessments.filter((a) => !a.deletedAt && a.periodId === periodId).count()) > 0;
}

/* ---------- Professores ---------- */

export async function createTeacher(name: string, contact = '', notes = ''): Promise<Teacher> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new AcademyRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.teachers, db.changelog, async () => {
    const same = await db.teachers.filter((t) => !t.deletedAt && t.name.toLowerCase() === clean.toLowerCase()).first();
    if (same) return same;
    const teacher: Teacher = { id: newId('tch'), name: clean, contact: contact.slice(0, 200), notes: notes.slice(0, 2000), ...base() };
    await db.teachers.add(teacher);
    await log({ entityType: 'teacher', entityId: teacher.id, action: 'create' });
    return teacher;
  });
}

export async function updateTeacher(id: string, patch: Partial<Pick<Teacher, 'name' | 'contact' | 'notes'>>): Promise<void> {
  const db = getDb();
  const t = await db.teachers.get(id);
  if (!t) throw new AcademyRuleError('not_found');
  await db.teachers.put({ ...t, ...patch, name: (patch.name ?? t.name).trim().slice(0, 80) || t.name, updatedAt: nowIso(), rev: t.rev + 1 });
  await log({ entityType: 'teacher', entityId: id, action: 'update', fields: Object.keys(patch) });
}

/** Exclui o professor; as disciplinas dele ficam sem professor (com confirmação na tela). */
export async function deleteTeacher(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.teachers, db.subjects, db.changelog, async () => {
    const at = nowIso();
    await db.subjects.filter((s) => s.teacherId === id).modify((s) => {
      s.teacherId = null;
      touch(s, at);
    });
    await db.teachers.delete(id);
    await log({ entityType: 'teacher', entityId: id, action: 'purge' });
  });
}

/* ---------- Disciplinas ---------- */

export interface SubjectInput {
  yearId: string;
  name: string;
  kind: SubjectKind;
  color: string;
  teacherId: string | null;
  notes?: string;
}

export async function createSubject(input: SubjectInput): Promise<Subject> {
  const name = input.name.trim().slice(0, 80);
  if (!name || !/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new AcademyRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.subjects, db.changelog, async () => {
    const same = await db.subjects.where('yearId').equals(input.yearId).filter((s) => !s.deletedAt && s.name.toLowerCase() === name.toLowerCase()).first();
    if (same) throw new AcademyRuleError('duplicate');
    const subject: Subject = { id: newId('sub'), yearId: input.yearId, name, kind: input.kind, color: input.color, teacherId: input.teacherId, model: null, notes: (input.notes ?? '').slice(0, 4000), ...base() };
    await db.subjects.add(subject);
    await log({ entityType: 'subject', entityId: subject.id, action: 'create' });
    return subject;
  });
}

export async function updateSubject(id: string, patch: Partial<Pick<Subject, 'name' | 'kind' | 'color' | 'teacherId' | 'model' | 'notes'>>): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.subjects, db.changelog, async () => {
    const s = await db.subjects.get(id);
    if (!s) throw new AcademyRuleError('not_found');
    const name = patch.name !== undefined ? patch.name.trim().slice(0, 80) : s.name;
    if (!name) throw new AcademyRuleError('invalid');
    if (name.toLowerCase() !== s.name.toLowerCase()) {
      const same = await db.subjects.where('yearId').equals(s.yearId).filter((o) => o.id !== id && !o.deletedAt && o.name.toLowerCase() === name.toLowerCase()).first();
      if (same) throw new AcademyRuleError('duplicate');
    }
    const model = patch.model === undefined ? s.model : patch.model === null ? null : cleanModel(patch.model);
    await db.subjects.put({ ...s, ...patch, name, model, updatedAt: nowIso(), rev: s.rev + 1 });
    await log({ entityType: 'subject', entityId: id, action: 'update', fields: Object.keys(patch) });
  });
}

async function setSubjectDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.subjects, db.changelog, async () => {
    const s = await db.subjects.get(id);
    if (!s) return;
    await db.subjects.put({ ...s, deletedAt, updatedAt: nowIso(), rev: s.rev + 1 });
    await log({ entityType: 'subject', entityId: id, action });
  });
}
export const softDeleteSubject = (id: string) => setSubjectDeleted(id, nowIso(), 'delete');
export const restoreSubject = (id: string) => setSubjectDeleted(id, null, 'restore');

/** Exclusão definitiva: a disciplina, as avaliações dela e as recuperações/bônus. */
export async function purgeSubject(id: string): Promise<number> {
  const db = getDb();
  return db.transaction('rw', [db.subjects, db.assessments, db.periodResults, db.examPreps, db.changelog], async () => {
    const ids = (await db.assessments.where('subjectId').equals(id).toArray()).map((a) => a.id);
    await db.examPreps.bulkDelete(ids);
    const n = await db.assessments.where('subjectId').equals(id).delete();
    await db.periodResults.where('subjectId').equals(id).delete();
    await db.subjects.delete(id);
    await log({ entityType: 'subject', entityId: id, action: 'purge', note: String(n) });
    return n;
  });
}

/* ---------- Avaliações ---------- */

function cleanAssessment(input: AssessmentInput): AssessmentInput {
  const parsed = assessmentInputSchema.safeParse({ ...input, noteIds: [...new Set(input.noteIds)] });
  if (!parsed.success) throw new AcademyRuleError('invalid');
  return parsed.data;
}

/** Mesma disciplina, mesmo nome e mesma data: é a mesma avaliação (não duplica). */
async function findDuplicate(input: AssessmentInput, exceptId?: string): Promise<Assessment | undefined> {
  return getDb()
    .assessments.where('subjectId')
    .equals(input.subjectId)
    .filter((a) => a.id !== exceptId && !a.deletedAt && a.name.trim().toLowerCase() === input.name.trim().toLowerCase() && a.date === input.date)
    .first();
}

export async function createAssessment(input: AssessmentInput): Promise<Assessment> {
  const data = cleanAssessment(input);
  const db = getDb();
  return db.transaction('rw', db.assessments, db.changelog, async () => {
    if (await findDuplicate(data)) throw new AcademyRuleError('duplicate');
    const a: Assessment = { ...data, id: newId('asm'), ...base() };
    await db.assessments.add(a);
    await log({ entityType: 'assessment', entityId: a.id, action: 'create' });
    return a;
  });
}

export async function updateAssessment(id: string, input: AssessmentInput): Promise<Assessment> {
  const data = cleanAssessment(input);
  const db = getDb();
  return db.transaction('rw', db.assessments, db.changelog, async () => {
    const cur = await db.assessments.get(id);
    if (!cur) throw new AcademyRuleError('not_found');
    if (await findDuplicate(data, id)) throw new AcademyRuleError('duplicate');
    const fields = (Object.keys(data) as (keyof AssessmentInput)[]).filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(data[k]));
    const next: Assessment = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.assessments.put(next);
    // A nota fica no histórico com o valor (Parte 9.6: histórico do cálculo).
    if (fields.length) await log({ entityType: 'assessment', entityId: id, action: 'update', fields, note: fields.includes('score') ? `score:${data.score ?? '—'}` : undefined });
    return next;
  });
}

async function setAssessmentDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.assessments, db.changelog, async () => {
    const a = await db.assessments.get(id);
    if (!a) return;
    await db.assessments.put({ ...a, deletedAt, updatedAt: nowIso(), rev: a.rev + 1 });
    await log({ entityType: 'assessment', entityId: id, action });
  });
}
export const softDeleteAssessment = (id: string) => setAssessmentDeleted(id, nowIso(), 'delete');
export const restoreAssessment = (id: string) => setAssessmentDeleted(id, null, 'restore');

export async function purgeAssessment(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.assessments, db.examPreps, db.changelog, async () => {
    await db.assessments.delete(id);
    await db.examPreps.delete(id);
    await log({ entityType: 'assessment', entityId: id, action: 'purge' });
  });
}

/* ---------- Recuperação e bônus ---------- */

/** Guarda recuperação e bônus de um período; cada mudança entra no histórico com os valores. */
export async function setPeriodResult(subjectId: string, periodId: string, patch: { recoveryScore?: number | null; bonus?: number | null }): Promise<void> {
  const valid = (v: number | null | undefined) => v === undefined || v === null || (Number.isFinite(v) && v >= 0 && v <= 1000);
  if (!valid(patch.recoveryScore) || !valid(patch.bonus)) throw new AcademyRuleError('invalid');
  const db = getDb();
  const id = periodResultId(subjectId, periodId);
  await db.transaction('rw', db.periodResults, db.changelog, async () => {
    const cur = (await db.periodResults.get(id)) ?? { id, subjectId, periodId, recoveryScore: null, bonus: null, updatedAt: nowIso() };
    const next: PeriodResult = { ...cur, ...patch, updatedAt: nowIso() };
    await db.periodResults.put(next);
    await log({ entityType: 'periodResult', entityId: id, action: 'update', fields: Object.keys(patch), note: `rec:${next.recoveryScore ?? '—'} bonus:${next.bonus ?? '—'}` });
  });
}

export async function gradeHistory(subjectId: string): Promise<ChangeEntry[]> {
  const db = getDb();
  const assessmentIds = new Set((await db.assessments.where('subjectId').equals(subjectId).toArray()).map((a) => a.id));
  const entries = await db.changelog
    .where('entityType')
    .anyOf(['assessment', 'periodResult', 'subject'])
    .filter((e) => (e.entityType === 'assessment' && assessmentIds.has(e.entityId)) || (e.entityType === 'periodResult' && e.entityId.startsWith(`${subjectId}:`)) || (e.entityType === 'subject' && e.entityId === subjectId))
    .toArray();
  return entries.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
}
