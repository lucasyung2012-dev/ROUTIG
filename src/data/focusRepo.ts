import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { focusConfigSchema, focusSessionSchema, migrateFocusConfig, type FocusConfig, type FocusSession, type FocusSessionInput, type FocusTimer } from '@/domain/focus';

export class FocusRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found') {
    super(code);
  }
}

const CONFIG_KEY = 'focus.config';
const ACTIVE_KEY = 'focus.active';

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

/* ---------- Configuração e timer em andamento ---------- */

export async function loadFocusConfig(): Promise<FocusConfig> {
  return migrateFocusConfig((await getDb().kv.get(CONFIG_KEY))?.value);
}

export async function saveFocusConfig(cfg: FocusConfig): Promise<void> {
  const parsed = focusConfigSchema.safeParse(cfg);
  if (!parsed.success) throw new FocusRuleError('invalid');
  await getDb().kv.put({ key: CONFIG_KEY, value: parsed.data, updatedAt: nowIso() });
}

/** O timer fica guardado: trocar de tela, recarregar ou fechar o app não perde a sessão. */
export async function loadActiveTimer(): Promise<FocusTimer | null> {
  const v = (await getDb().kv.get(ACTIVE_KEY))?.value;
  return v && typeof v === 'object' && 'phase' in v ? (v as FocusTimer) : null;
}

export async function saveActiveTimer(t: FocusTimer | null): Promise<void> {
  const db = getDb();
  if (t === null) await db.kv.delete(ACTIVE_KEY);
  else await db.kv.put({ key: ACTIVE_KEY, value: t, updatedAt: nowIso() });
}

/* ---------- Sessões ---------- */

export async function saveFocusSession(input: FocusSessionInput): Promise<FocusSession> {
  const parsed = focusSessionSchema.safeParse({ ...input, notes: input.notes.trim() });
  if (!parsed.success) throw new FocusRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.focusSessions, db.changelog, async () => {
    const at = nowIso();
    const s: FocusSession = { ...parsed.data, id: newId('fcs'), createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
    await db.focusSessions.add(s);
    await log({ entityType: 'focus', entityId: s.id, action: 'create', note: `${s.kind}:${s.actualMin}` });
    return s;
  });
}

/** Corrige observação, tipo e ligações; os minutos medidos pelo timer não mudam. */
export async function updateFocusSession(id: string, patch: Partial<Pick<FocusSession, 'notes' | 'kind' | 'taskId' | 'ref'>> & { actualMin?: number }): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.focusSessions, db.changelog, async () => {
    const cur = await db.focusSessions.get(id);
    if (!cur) throw new FocusRuleError('not_found');
    const next = { ...cur, ...patch, actualMin: cur.manual && patch.actualMin !== undefined ? patch.actualMin : cur.actualMin };
    const parsed = focusSessionSchema.safeParse(next);
    if (!parsed.success) throw new FocusRuleError('invalid');
    await db.focusSessions.put({ ...next, updatedAt: nowIso(), rev: cur.rev + 1 });
    await log({ entityType: 'focus', entityId: id, action: 'update' });
  });
}

export async function softDeleteFocusSession(id: string): Promise<void> {
  await getDb().focusSessions.update(id, { deletedAt: nowIso(), updatedAt: nowIso() });
}
export async function restoreFocusSession(id: string): Promise<void> {
  await getDb().focusSessions.update(id, { deletedAt: null, updatedAt: nowIso() });
}
