import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { studySessionInputSchema, type StudySession, type StudySessionInput } from '@/domain/academy';
import { AcademyRuleError } from './academyRepo';

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

function clean(input: StudySessionInput): StudySessionInput {
  const parsed = studySessionInputSchema.safeParse({ ...input, contentIds: [...new Set(input.contentIds)] });
  if (!parsed.success) throw new AcademyRuleError('invalid');
  return parsed.data;
}

/** Mesma disciplina, mesmo dia, mesmo tipo e mesma prova: é a mesma sessão (não duplica). */
async function findDuplicate(data: StudySessionInput, exceptId?: string) {
  return getDb()
    .studySessions.where('subjectId')
    .equals(data.subjectId)
    .filter((s) => s.id !== exceptId && !s.deletedAt && s.date === data.date && s.kind === data.kind && s.assessmentId === data.assessmentId && s.time === data.time)
    .first();
}

export async function createSession(input: StudySessionInput): Promise<StudySession> {
  const data = clean(input);
  const db = getDb();
  return db.transaction('rw', db.studySessions, db.changelog, async () => {
    if (await findDuplicate(data)) throw new AcademyRuleError('duplicate');
    const at = nowIso();
    const s: StudySession = { ...data, id: newId('ses'), status: 'planned', actualMin: null, difficulties: '', completedAt: null, createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
    await db.studySessions.add(s);
    await log({ entityType: 'studySession', entityId: s.id, action: 'create' });
    return s;
  });
}

/** Cria várias de uma vez (revisões distribuídas); pula as que já existem. Devolve quantas criou. */
export async function createSessions(inputs: StudySessionInput[]): Promise<number> {
  let n = 0;
  for (const i of inputs) {
    try {
      await createSession(i);
      n++;
    } catch (e) {
      if (!(e instanceof AcademyRuleError && e.code === 'duplicate')) throw e;
    }
  }
  return n;
}

export async function updateSession(id: string, input: StudySessionInput): Promise<void> {
  const data = clean(input);
  const db = getDb();
  await db.transaction('rw', db.studySessions, db.changelog, async () => {
    const s = await db.studySessions.get(id);
    if (!s) throw new AcademyRuleError('not_found');
    if (await findDuplicate(data, id)) throw new AcademyRuleError('duplicate');
    await db.studySessions.put({ ...s, ...data, updatedAt: nowIso(), rev: s.rev + 1 });
    await log({ entityType: 'studySession', entityId: id, action: 'update' });
  });
}

/** Acompanhar a execução: feita (com tempo real e dificuldades), pulada ou de volta a planejada. */
export async function setSessionStatus(id: string, status: StudySession['status'], extra: { actualMin?: number | null; difficulties?: string } = {}): Promise<void> {
  if (extra.actualMin != null && (!Number.isInteger(extra.actualMin) || extra.actualMin < 0 || extra.actualMin > 1440)) throw new AcademyRuleError('invalid');
  const db = getDb();
  await db.transaction('rw', db.studySessions, db.changelog, async () => {
    const s = await db.studySessions.get(id);
    if (!s) throw new AcademyRuleError('not_found');
    const at = nowIso();
    await db.studySessions.put({
      ...s,
      status,
      actualMin: status === 'done' ? (extra.actualMin ?? s.durationMin) : null,
      difficulties: (extra.difficulties ?? s.difficulties).slice(0, 4000),
      completedAt: status === 'done' ? at : null,
      updatedAt: at,
      rev: s.rev + 1,
    });
    await log({ entityType: 'studySession', entityId: id, action: status === 'done' ? 'complete' : status === 'skipped' ? 'skip' : 'update' });
  });
}

async function setDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.studySessions, db.changelog, async () => {
    await db.studySessions.update(id, { deletedAt, updatedAt: nowIso() });
    await log({ entityType: 'studySession', entityId: id, action });
  });
}
export const softDeleteSession = (id: string) => setDeleted(id, nowIso(), 'delete');
export const restoreSession = (id: string) => setDeleted(id, null, 'restore');
