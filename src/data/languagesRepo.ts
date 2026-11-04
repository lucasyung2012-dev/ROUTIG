import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import {
  emptySkills,
  languageInputOf,
  languageInputSchema,
  languageSessionInputSchema,
  profileForCode,
  type Language,
  type LanguageInput,
  type LanguagePreset,
  type LanguageSession,
  type LanguageSessionInput,
} from '@/domain/languages';

export class LanguageRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'duplicate') {
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

function clean(input: LanguageInput): LanguageInput {
  const parsed = languageInputSchema.safeParse({ ...input, goals: input.goals.map((g) => g.trim()).filter(Boolean) });
  if (!parsed.success) throw new LanguageRuleError('invalid');
  return parsed.data;
}

/* ---------- Idiomas ---------- */

/** Cria um idioma. Mesmo nome não se repete. */
export async function createLanguage(preset: LanguagePreset): Promise<Language> {
  const db = getDb();
  return db.transaction('rw', db.languages, db.changelog, async () => {
    const all = await db.languages.filter((l) => !l.deletedAt).toArray();
    if (all.some((l) => l.name.trim().toLowerCase() === preset.name.trim().toLowerCase())) throw new LanguageRuleError('duplicate');
    const data = clean({ name: preset.name, code: preset.code, profile: profileForCode(preset.code), color: preset.color, native: !!preset.native, level: null, goals: [], skills: emptySkills(), notes: '' });
    const lang: Language = { ...data, id: newId('lng'), order: all.reduce((m, l) => Math.max(m, l.order), 0) + 1, ...base() };
    await db.languages.add(lang);
    await log({ entityType: 'language', entityId: lang.id, action: 'create' });
    return lang;
  });
}

/** Cria vários (os cinco iniciais); pula os que já existem. Devolve quantos criou. */
export async function createLanguages(presets: LanguagePreset[]): Promise<number> {
  let n = 0;
  for (const p of presets) {
    try {
      await createLanguage(p);
      n++;
    } catch (e) {
      if (!(e instanceof LanguageRuleError && e.code === 'duplicate')) throw e;
    }
  }
  return n;
}

/** Salva o idioma. Mudança de nível ou de habilidade entra no histórico com o valor (Parte 10.2: histórico). */
export async function updateLanguage(id: string, input: LanguageInput): Promise<Language> {
  const data = clean(input);
  const db = getDb();
  return db.transaction('rw', db.languages, db.changelog, async () => {
    const cur = await db.languages.get(id);
    if (!cur) throw new LanguageRuleError('not_found');
    if (data.name.toLowerCase() !== cur.name.toLowerCase()) {
      const same = await db.languages.filter((l) => l.id !== id && !l.deletedAt && l.name.toLowerCase() === data.name.toLowerCase()).first();
      if (same) throw new LanguageRuleError('duplicate');
    }
    const before = languageInputOf(cur);
    const fields = (Object.keys(data) as (keyof LanguageInput)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(data[k]));
    if (!fields.length) return cur;
    const next: Language = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.languages.put(next);
    // Guarda a evolução: nível geral e níveis/confiança de cada habilidade.
    const parts: string[] = [];
    if (fields.includes('level')) parts.push(`level:${data.level ?? '-'}`);
    if (fields.includes('skills')) for (const k of Object.keys(data.skills) as (keyof LanguageInput['skills'])[]) {
      const a = before.skills[k];
      const b = data.skills[k];
      if (a.level !== b.level || a.confidence !== b.confidence) parts.push(`${k}:${b.level ?? '-'}/${b.confidence ?? '-'}`);
    }
    await log({ entityType: 'language', entityId: id, action: 'update', fields, note: parts.length ? parts.join(' ') : undefined });
    return next;
  });
}

async function setDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.languages, db.changelog, async () => {
    await db.languages.update(id, { deletedAt, updatedAt: nowIso() });
    await log({ entityType: 'language', entityId: id, action });
  });
}
export const softDeleteLanguage = (id: string) => setDeleted(id, nowIso(), 'delete');
export const restoreLanguage = (id: string) => setDeleted(id, null, 'restore');

export async function moveLanguage(id: string, delta: -1 | 1): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.languages, async () => {
    const list = (await db.languages.filter((l) => !l.deletedAt).toArray()).sort((a, b) => a.order - b.order);
    const i = list.findIndex((l) => l.id === id);
    const other = list[i + delta];
    const me = list[i];
    if (!other || !me) return;
    await db.languages.update(me.id, { order: other.order });
    await db.languages.update(other.id, { order: me.order === other.order ? other.order + delta : me.order });
  });
}

export async function languageHistory(id: string): Promise<ChangeEntry[]> {
  return getDb().changelog.where('[entityType+entityId]').equals(['language', id]).reverse().sortBy('seq');
}

/* ---------- Sessões ---------- */

export async function saveLanguageSession(id: string | null, input: LanguageSessionInput): Promise<LanguageSession> {
  const parsed = languageSessionInputSchema.safeParse({ ...input, noteIds: [...new Set(input.noteIds)] });
  if (!parsed.success) throw new LanguageRuleError('invalid');
  const data = parsed.data;
  const db = getDb();
  return db.transaction('rw', db.languageSessions, db.changelog, async () => {
    if (id) {
      const cur = await db.languageSessions.get(id);
      if (!cur) throw new LanguageRuleError('not_found');
      const next: LanguageSession = { ...cur, ...data, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.languageSessions.put(next);
      await log({ entityType: 'languageSession', entityId: id, action: 'update' });
      return next;
    }
    const s: LanguageSession = { ...data, id: newId('lss'), ...base() };
    await db.languageSessions.add(s);
    await log({ entityType: 'languageSession', entityId: s.id, action: 'create' });
    return s;
  });
}

async function setSessionDeleted(id: string, deletedAt: string | null, action: 'delete' | 'restore') {
  const db = getDb();
  await db.transaction('rw', db.languageSessions, db.changelog, async () => {
    await db.languageSessions.update(id, { deletedAt, updatedAt: nowIso() });
    await log({ entityType: 'languageSession', entityId: id, action });
  });
}
export const softDeleteLanguageSession = (id: string) => setSessionDeleted(id, nowIso(), 'delete');
export const restoreLanguageSession = (id: string) => setSessionDeleted(id, null, 'restore');
