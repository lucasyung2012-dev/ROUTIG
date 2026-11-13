import { getDb, touchById } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { journalInputSchema, type BudgetCategory, type BudgetEntry, type JournalEntry, type JournalInput } from '@/domain/finance';
import { FinanceRuleError } from './financeRepo';
import { hashPin, pinMatches, type UnlockResult } from './securityRepo';
import { secondsBlocked, waitAfterFailures } from '@/domain/security';

async function log(entry: Omit<ChangeEntry, 'at' | 'seq'>): Promise<void> {
  await getDb().changelog.add({ at: nowIso(), ...entry });
}

const base = () => {
  const at = nowIso();
  return { createdAt: at, updatedAt: at, deletedAt: null, rev: 1 };
};

async function setDeleted(table: 'finJournal' | 'budgetCategories' | 'budgetEntries', entityType: string, id: string, deletedAt: string | null) {
  const db = getDb();
  await db.transaction('rw', db.table(table), db.changelog, async () => {
    await touchById(db.table(table), id, { deletedAt });
    await log({ entityType, entityId: id, action: deletedAt ? 'delete' : 'restore' });
  });
}

/* ---------- Diário de Investimentos ---------- */

export async function saveJournal(id: string | null, input: JournalInput, today: string): Promise<JournalEntry> {
  const r = journalInputSchema.safeParse(input);
  if (!r.success) throw new FinanceRuleError('invalid');
  if (r.data.date > today) throw new FinanceRuleError('future');
  const db = getDb();
  return db.transaction('rw', db.finJournal, db.changelog, async () => {
    if (id) {
      const cur = await db.finJournal.get(id);
      if (!cur) throw new FinanceRuleError('not_found');
      // O resultado posterior e a comparação marcam quando a decisão foi revista.
      const reviewed = !cur.reviewedAt && (r.data.outcome.trim() || r.data.comparison) ? today : cur.reviewedAt;
      const next: JournalEntry = { ...cur, ...r.data, reviewedAt: reviewed, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.finJournal.put(next);
      await log({ entityType: 'finJournal', entityId: id, action: 'update', ...(reviewed && !cur.reviewedAt ? { note: 'reviewed' } : {}) });
      return next;
    }
    const j: JournalEntry = { ...r.data, reviewedAt: r.data.outcome.trim() || r.data.comparison ? today : null, id: newId('fjr'), ...base() };
    await db.finJournal.add(j);
    await log({ entityType: 'finJournal', entityId: j.id, action: 'create' });
    return j;
  });
}
export const softDeleteJournal = (id: string) => setDeleted('finJournal', 'finJournal', id, nowIso());
export const restoreJournal = (id: string) => setDeleted('finJournal', 'finJournal', id, null);

/* ---------- Orçamento (opcional) ---------- */

export async function saveBudgetCategory(id: string | null, name: string, kind: 'income' | 'expense', planned: number): Promise<BudgetCategory> {
  const n = name.trim();
  if (!n || n.length > 80 || !Number.isFinite(planned) || planned < 0) throw new FinanceRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.budgetCategories, db.changelog, async () => {
    const dup = await db.budgetCategories.filter((c) => c.id !== id && !c.deletedAt && c.kind === kind && c.name.trim().toLowerCase() === n.toLowerCase()).first();
    if (dup) throw new FinanceRuleError('duplicate');
    if (id) {
      const cur = await db.budgetCategories.get(id);
      if (!cur) throw new FinanceRuleError('not_found');
      const next = { ...cur, name: n, kind, planned, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.budgetCategories.put(next);
      await log({ entityType: 'budgetCategory', entityId: id, action: 'update', ...(cur.planned !== planned ? { note: `planned:${planned}` } : {}) });
      return next;
    }
    const c: BudgetCategory = { name: n, kind, planned, id: newId('bct'), ...base() };
    await db.budgetCategories.add(c);
    await log({ entityType: 'budgetCategory', entityId: c.id, action: 'create' });
    return c;
  });
}
export const softDeleteBudgetCategory = (id: string) => setDeleted('budgetCategories', 'budgetCategory', id, nowIso());
export const restoreBudgetCategory = (id: string) => setDeleted('budgetCategories', 'budgetCategory', id, null);

export async function saveBudgetEntry(id: string | null, date: string, categoryId: string, amount: number, description: string, today: string): Promise<BudgetEntry> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !categoryId || !Number.isFinite(amount) || amount <= 0 || description.length > 200) throw new FinanceRuleError('invalid');
  if (date > today) throw new FinanceRuleError('future');
  const db = getDb();
  return db.transaction('rw', db.budgetEntries, async () => {
    if (id) {
      const cur = await db.budgetEntries.get(id);
      if (!cur) throw new FinanceRuleError('not_found');
      const next = { ...cur, date, categoryId, amount, description: description.trim(), updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.budgetEntries.put(next);
      return next;
    }
    const e: BudgetEntry = { date, categoryId, amount, description: description.trim(), id: newId('ben'), ...base() };
    await db.budgetEntries.add(e);
    return e;
  });
}
export const softDeleteBudgetEntry = (id: string) => setDeleted('budgetEntries', 'budgetEntry', id, nowIso());
export const restoreBudgetEntry = (id: string) => setDeleted('budgetEntries', 'budgetEntry', id, null);

/* ---------- Preferências do planejamento ---------- */

export interface PlanPrefs {
  budgetEnabled: boolean;
  currency: 'BRL' | 'USD' | 'EUR';
  reserve: { monthlyCost: number; months: number; saved: number };
}

const PLAN_KEY = 'finance.plan';
const DEFAULT_PREFS: PlanPrefs = { budgetEnabled: false, currency: 'BRL', reserve: { monthlyCost: 0, months: 6, saved: 0 } };

export async function loadPlanPrefs(): Promise<PlanPrefs> {
  const v = (await getDb().kv.get(PLAN_KEY))?.value as Partial<PlanPrefs> | undefined;
  return { ...DEFAULT_PREFS, ...(v ?? {}), reserve: { ...DEFAULT_PREFS.reserve, ...(v?.reserve ?? {}) } };
}

export async function savePlanPrefs(p: PlanPrefs): Promise<void> {
  const r = p.reserve;
  if (![r.monthlyCost, r.months, r.saved].every((n) => Number.isFinite(n) && n >= 0) || r.months > 60) throw new FinanceRuleError('invalid');
  await getDb().kv.put({ key: PLAN_KEY, value: p, updatedAt: nowIso() });
}

/* ---------- Controle de acesso (Parte 16.8) ---------- */

const PIN_KEY = 'finance.pin';

/** Formato guardado: hash forte (PBKDF2) + tentativas erradas. Até a V1.0.0 era um SHA-256 só (sem `iterations`). */
interface FinancePinValue {
  salt: string;
  hash: string;
  iterations?: number;
  failed?: number;
  blockedUntil?: string | null;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadPin(): Promise<FinancePinValue | undefined> {
  return (await getDb().kv.get(PIN_KEY))?.value as FinancePinValue | undefined;
}

async function savePin(v: FinancePinValue): Promise<void> {
  await getDb().kv.put({ key: PIN_KEY, value: v, updatedAt: nowIso() });
}

/** Confere o PIN no formato novo (PBKDF2) ou no antigo (SHA-256); o antigo é convertido no primeiro acerto. */
async function pinOk(v: FinancePinValue, pin: string): Promise<boolean> {
  if (v.iterations) return pinMatches({ salt: v.salt, hash: v.hash, iterations: v.iterations }, pin);
  if ((await sha256(`${v.salt}:${pin}`)) !== v.hash) return false;
  await savePin({ ...(await hashPin(pin)), failed: 0, blockedUntil: null });
  return true;
}

/** O PIN nunca é guardado: só o hash forte com sal (o mesmo do PIN do app). */
export async function setFinancePin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new FinanceRuleError('invalid');
  await savePin({ ...(await hashPin(pin)), failed: 0, blockedUntil: null });
}

export async function hasFinancePin(): Promise<boolean> {
  return !!(await getDb().kv.get(PIN_KEY))?.value;
}

/** Confere sem contar tentativa (para trocar ou remover o PIN, com Finanças já aberto). */
export async function checkFinancePin(pin: string): Promise<boolean> {
  const v = await loadPin();
  if (!v) return true;
  return pinOk(v, pin);
}

/** Desbloquear Finanças: erros seguidos fazem esperar cada vez mais, como no PIN do app. */
export async function tryFinanceUnlock(pin: string, now = new Date()): Promise<UnlockResult> {
  const v = await loadPin();
  if (!v) return { ok: true };
  const blocked = secondsBlocked({ blockedUntil: v.blockedUntil ?? null }, now);
  if (blocked > 0) return { ok: false, waitSec: blocked };
  if (await pinOk(v, pin)) {
    const cur = await loadPin();
    if (cur && (cur.failed || cur.blockedUntil)) await savePin({ ...cur, failed: 0, blockedUntil: null });
    return { ok: true };
  }
  const failed = (v.failed ?? 0) + 1;
  const wait = waitAfterFailures(failed);
  await savePin({ ...v, failed, blockedUntil: wait ? new Date(now.getTime() + wait * 1000).toISOString() : null });
  return { ok: false, waitSec: wait };
}

export async function removeFinancePin(): Promise<void> {
  await getDb().kv.delete(PIN_KEY);
}

/** Histórico de Finanças (Parte 16.6): o que mudou, do mais novo ao mais antigo. */
export async function financeHistory(limit = 150): Promise<ChangeEntry[]> {
  const types = ['finAsset', 'finTransaction', 'finImport', 'finJournal', 'budgetCategory', 'finLearning', 'finTerm', 'market'];
  return (await getDb().changelog.where('entityType').anyOf(types).reverse().sortBy('seq')).slice(0, limit);
}
