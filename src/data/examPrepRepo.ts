import { getDb } from './db';
import { nowIso } from '@/domain/ids';
import { emptyExamPrep, examPrepSchema, type ExamPrep } from '@/domain/academy';
import { AcademyRuleError } from './academyRepo';

export async function loadExamPrep(assessmentId: string): Promise<ExamPrep> {
  return (await getDb().examPreps.get(assessmentId)) ?? emptyExamPrep(assessmentId);
}

/** Salva a preparação/pós-avaliação inteira, depois de validar. */
export async function saveExamPrep(prep: ExamPrep): Promise<void> {
  const parsed = examPrepSchema.safeParse(prep);
  if (!parsed.success) throw new AcademyRuleError('invalid');
  const db = getDb();
  await db.transaction('rw', db.examPreps, db.assessments, db.changelog, async () => {
    if (!(await db.assessments.get(prep.id))) throw new AcademyRuleError('not_found');
    const at = nowIso();
    await db.examPreps.put({ ...prep, ...parsed.data, updatedAt: at });
    await db.changelog.add({ at, entityType: 'examPrep', entityId: prep.id, action: 'update' });
  });
}

/**
 * Leva a pós-avaliação ao conteúdo programático, só quando o usuário confirma:
 * "dominados" vão para o nível mais alto de domínio; "para revisar" descem para
 * o segundo nível (se estavam acima). O andamento (estudado, revisado) não muda.
 */
export async function applyPostToContents(assessmentId: string, levels: number): Promise<number> {
  const db = getDb();
  return db.transaction('rw', [db.examPreps, db.contents, db.changelog], async () => {
    const prep = await db.examPreps.get(assessmentId);
    if (!prep) return 0;
    const top = Math.max(0, levels - 1);
    let n = 0;
    const at = nowIso();
    for (const id of prep.post.masteredContentIds) {
      const c = await db.contents.get(id);
      if (!c || c.deletedAt) continue;
      await db.contents.put({ ...c, mastery: top, updatedAt: at, rev: c.rev + 1 });
      await db.changelog.add({ at, entityType: 'content', entityId: id, action: 'update', fields: ['mastery'], note: `mastery:${top}` });
      n++;
    }
    for (const id of prep.post.reviewContentIds) {
      const c = await db.contents.get(id);
      if (!c || c.deletedAt) continue;
      const next = c.mastery === null ? 1 : Math.min(c.mastery, 1);
      if (next === c.mastery) continue;
      await db.contents.put({ ...c, mastery: next, updatedAt: at, rev: c.rev + 1 });
      await db.changelog.add({ at, entityType: 'content', entityId: id, action: 'update', fields: ['mastery'], note: `mastery:${next}` });
      n++;
    }
    await db.examPreps.put({ ...prep, post: { ...prep.post, appliedAt: at }, updatedAt: at });
    return n;
  });
}
