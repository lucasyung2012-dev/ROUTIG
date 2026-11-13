import { getDb, touchById } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { lessonInputSchema, type Content, type Doubt, type Lesson, type LessonInput } from '@/domain/academy';
import { AcademyRuleError } from './academyRepo';

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

const base = () => {
  const at = nowIso();
  return { createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
};

/* ---------- Conteúdo programático (Parte 9.4) ---------- */

export async function createContent(subjectId: string, parentId: string | null, kind: Content['kind'], title: string): Promise<Content> {
  const clean = title.trim().slice(0, 200);
  if (!clean) throw new AcademyRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.contents, db.changelog, async () => {
    const siblings = await db.contents.where('subjectId').equals(subjectId).filter((c) => !c.deletedAt && c.parentId === parentId).toArray();
    if (siblings.some((c) => c.title.toLowerCase() === clean.toLowerCase())) throw new AcademyRuleError('duplicate');
    const content: Content = { id: newId('cnt'), subjectId, parentId, kind, title: clean, status: 'notStarted', mastery: null, notes: '', order: siblings.reduce((m, c) => Math.max(m, c.order), 0) + 1, ...base() };
    await db.contents.add(content);
    await log({ entityType: 'content', entityId: content.id, action: 'create' });
    return content;
  });
}

/** Muda status, domínio, título ou notas. Status e domínio entram no histórico com o valor. */
export async function updateContent(id: string, patch: Partial<Pick<Content, 'title' | 'kind' | 'status' | 'mastery' | 'notes'>>): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.contents, db.changelog, async () => {
    const c = await db.contents.get(id);
    if (!c) throw new AcademyRuleError('not_found');
    const title = patch.title !== undefined ? patch.title.trim().slice(0, 200) : c.title;
    if (!title) throw new AcademyRuleError('invalid');
    await db.contents.put({ ...c, ...patch, title, updatedAt: nowIso(), rev: c.rev + 1 });
    const note = patch.status !== undefined ? `status:${patch.status}` : patch.mastery !== undefined ? `mastery:${patch.mastery ?? '-'}` : undefined;
    await log({ entityType: 'content', entityId: id, action: 'update', fields: Object.keys(patch), note });
  });
}

/** Sobe ou desce entre os irmãos. */
export async function moveContent(id: string, delta: -1 | 1): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.contents, async () => {
    const c = await db.contents.get(id);
    if (!c) return;
    const sibs = (await db.contents.where('subjectId').equals(c.subjectId).filter((x) => !x.deletedAt && x.parentId === c.parentId).toArray()).sort((a, b) => a.order - b.order);
    const i = sibs.findIndex((x) => x.id === id);
    const other = sibs[i + delta];
    if (!other) return;
    // Troca as posições (se forem iguais, separa).
    const mine = c.order === other.order ? other.order + delta : other.order;
    await touchById(db.contents, c.id, { order: mine });
    await touchById(db.contents, other.id, { order: c.order });
  });
}

/** Muda o item de lugar na árvore, sem deixar virar filho de si mesmo. */
export async function reparentContent(id: string, parentId: string | null): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.contents, async () => {
    const c = await db.contents.get(id);
    if (!c) return;
    let p = parentId;
    while (p) {
      if (p === id) throw new AcademyRuleError('invalid');
      p = (await db.contents.get(p))?.parentId ?? null;
    }
    const sibs = await db.contents.where('subjectId').equals(c.subjectId).filter((x) => !x.deletedAt && x.parentId === parentId).toArray();
    await touchById(db.contents, id, { parentId, order: sibs.reduce((m, x) => Math.max(m, x.order), 0) + 1 });
  });
}

/** Lixeira: o item e tudo o que está dentro dele. Devolve os ids, para "Desfazer". */
export async function softDeleteContent(id: string): Promise<string[]> {
  const db = getDb();
  return db.transaction('rw', db.contents, db.changelog, async () => {
    const c = await db.contents.get(id);
    if (!c) return [];
    const all = await db.contents.where('subjectId').equals(c.subjectId).toArray();
    const ids = [id];
    for (let i = 0; i < ids.length; i++) for (const x of all) if (x.parentId === ids[i] && !x.deletedAt) ids.push(x.id);
    const at = nowIso();
    for (const x of ids) await touchById(db.contents, x, { deletedAt: at }, at);
    await log({ entityType: 'content', entityId: id, action: 'delete', note: String(ids.length) });
    return ids;
  });
}

export async function restoreContents(ids: string[]): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.contents, db.changelog, async () => {
    for (const x of ids) await touchById(db.contents, x, { deletedAt: null });
    if (ids[0]) await log({ entityType: 'content', entityId: ids[0], action: 'restore' });
  });
}

/* ---------- Aulas (Parte 9.5) ---------- */

export async function saveLesson(id: string | null, input: LessonInput): Promise<Lesson> {
  const parsed = lessonInputSchema.safeParse({ ...input, contentIds: [...new Set(input.contentIds)], noteIds: [...new Set(input.noteIds)] });
  if (!parsed.success) throw new AcademyRuleError('invalid');
  const data = parsed.data;
  const db = getDb();
  return db.transaction('rw', db.lessons, db.changelog, async () => {
    if (id) {
      const cur = await db.lessons.get(id);
      if (!cur) throw new AcademyRuleError('not_found');
      const next: Lesson = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.lessons.put(next);
      await log({ entityType: 'lesson', entityId: id, action: 'update' });
      return next;
    }
    const lesson: Lesson = { ...data, id: newId('les'), ...base() };
    await db.lessons.add(lesson);
    await log({ entityType: 'lesson', entityId: lesson.id, action: 'create' });
    return lesson;
  });
}

async function setLessonDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.lessons, db.changelog, async () => {
    await touchById(db.lessons, id, { deletedAt });
    await log({ entityType: 'lesson', entityId: id, action });
  });
}
export const softDeleteLesson = (id: string) => setLessonDeleted(id, nowIso(), 'delete');
export const restoreLesson = (id: string) => setLessonDeleted(id, null, 'restore');

/* ---------- Dúvidas ---------- */

export async function createDoubt(subjectId: string, question: string, contentId: string | null = null): Promise<Doubt> {
  const q = question.trim().slice(0, 2000);
  if (!q) throw new AcademyRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.doubts, db.changelog, async () => {
    const same = await db.doubts.where('subjectId').equals(subjectId).filter((d) => !d.deletedAt && d.status === 'open' && d.question.toLowerCase() === q.toLowerCase()).first();
    if (same) throw new AcademyRuleError('duplicate');
    const doubt: Doubt = { id: newId('dbt'), subjectId, contentId, question: q, answer: '', status: 'open', resolvedAt: null, ...base() };
    await db.doubts.add(doubt);
    await log({ entityType: 'doubt', entityId: doubt.id, action: 'create' });
    return doubt;
  });
}

export async function updateDoubt(id: string, patch: Partial<Pick<Doubt, 'question' | 'answer' | 'status' | 'contentId'>>): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.doubts, db.changelog, async () => {
    const d = await db.doubts.get(id);
    if (!d) throw new AcademyRuleError('not_found');
    const resolvedAt = patch.status === 'resolved' && d.status !== 'resolved' ? nowIso() : patch.status === 'open' ? null : d.resolvedAt;
    await db.doubts.put({ ...d, ...patch, question: (patch.question ?? d.question).slice(0, 2000), answer: (patch.answer ?? d.answer).slice(0, 20_000), resolvedAt, updatedAt: nowIso(), rev: d.rev + 1 });
    await log({ entityType: 'doubt', entityId: id, action: patch.status === 'resolved' ? 'complete' : 'update' });
  });
}

async function setDoubtDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.doubts, db.changelog, async () => {
    await touchById(db.doubts, id, { deletedAt });
    await log({ entityType: 'doubt', entityId: id, action });
  });
}
export const softDeleteDoubt = (id: string) => setDoubtDeleted(id, nowIso(), 'delete');
export const restoreDoubt = (id: string) => setDoubtDeleted(id, null, 'restore');
