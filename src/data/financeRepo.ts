import { getDb } from './db';
import { newId, nowIso } from '@/domain/ids';
import type { ChangeEntry } from '@/domain/entity';
import { todayKey } from '@/domain/dates';
import { assetInputSchema, txFingerprint, txInputSchema, type AssetInput, type FinAsset, type FinQuote, type FinTransaction, type ImportRow, type TxInput } from '@/domain/finance';

export class FinanceRuleError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'duplicate' | 'future' | 'oversell') {
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

/* ---------- Ativos ---------- */

/** Mesmo código (ou mesmo nome, sem código) na mesma custódia é o mesmo ativo. */
async function findSameAsset(data: AssetInput, exceptId?: string) {
  const all = await getDb().finAssets.filter((a) => a.id !== exceptId && !a.deletedAt).toArray();
  const key = (a: Pick<FinAsset, 'ticker' | 'name' | 'custody'>) => `${(a.ticker || a.name).trim().toLowerCase()}|${a.custody.trim().toLowerCase()}`;
  return all.find((a) => key(a) === key(data));
}

export async function createAsset(input: AssetInput): Promise<FinAsset> {
  const r = assetInputSchema.safeParse(input);
  if (!r.success) throw new FinanceRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.finAssets, db.changelog, async () => {
    if (await findSameAsset(r.data)) throw new FinanceRuleError('duplicate');
    const a: FinAsset = { ...r.data, archived: false, id: newId('fas'), ...base() };
    await db.finAssets.add(a);
    await log({ entityType: 'finAsset', entityId: a.id, action: 'create' });
    return a;
  });
}

export async function updateAsset(id: string, input: AssetInput): Promise<FinAsset> {
  const r = assetInputSchema.safeParse(input);
  if (!r.success) throw new FinanceRuleError('invalid');
  const db = getDb();
  return db.transaction('rw', db.finAssets, db.changelog, async () => {
    const cur = await db.finAssets.get(id);
    if (!cur) throw new FinanceRuleError('not_found');
    if (await findSameAsset(r.data, id)) throw new FinanceRuleError('duplicate');
    const next: FinAsset = { ...cur, ...r.data, updatedAt: nowIso(), rev: cur.rev + 1 };
    await db.finAssets.put(next);
    await log({ entityType: 'finAsset', entityId: id, action: 'update' });
    return next;
  });
}

export async function setAssetArchived(id: string, archived: boolean): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.finAssets, db.changelog, async () => {
    await db.finAssets.update(id, { archived, updatedAt: nowIso() });
    await log({ entityType: 'finAsset', entityId: id, action: 'update', note: archived ? 'archive' : 'unarchive' });
  });
}

async function setDeleted(table: 'finAssets' | 'finTransactions' | 'finQuotes', entityType: string, id: string, deletedAt: string | null) {
  const db = getDb();
  await db.transaction('rw', db.table(table), db.changelog, async () => {
    await db.table(table).update(id, { deletedAt, updatedAt: nowIso() });
    await log({ entityType, entityId: id, action: deletedAt ? 'delete' : 'restore' });
  });
}
export const softDeleteAsset = (id: string) => setDeleted('finAssets', 'finAsset', id, nowIso());
export const restoreAsset = (id: string) => setDeleted('finAssets', 'finAsset', id, null);

/* ---------- Movimentações ---------- */

async function heldQuantity(assetId: string, exceptId?: string): Promise<number> {
  const txs = await getDb().finTransactions.where('assetId').equals(assetId).filter((t) => !t.deletedAt && t.id !== exceptId).toArray();
  return txs.reduce((q, t) => (t.type === 'buy' ? q + t.quantity : t.type === 'sell' ? q - t.quantity : q), 0);
}

/** Registra ou corrige uma movimentação. Não deixa vender mais do que existe na carteira. */
export async function saveTransaction(id: string | null, input: TxInput, today: string): Promise<FinTransaction> {
  const clean = { ...input, quantity: input.type === 'buy' || input.type === 'sell' ? input.quantity : 0, price: input.type === 'buy' || input.type === 'sell' ? input.price : 0, amount: input.type === 'income' || input.type === 'fee' ? input.amount : 0 };
  const r = txInputSchema.safeParse(clean);
  if (!r.success) throw new FinanceRuleError('invalid');
  if (r.data.date > today) throw new FinanceRuleError('future');
  if (r.data.type === 'sell' && r.data.quantity > (await heldQuantity(r.data.assetId, id ?? undefined)) + 1e-9) throw new FinanceRuleError('oversell');
  const db = getDb();
  return db.transaction('rw', db.finTransactions, db.changelog, async () => {
    if (id) {
      const cur = await db.finTransactions.get(id);
      if (!cur) throw new FinanceRuleError('not_found');
      const next: FinTransaction = { ...cur, ...r.data, updatedAt: nowIso(), rev: cur.rev + 1 };
      await db.finTransactions.put(next);
      await log({ entityType: 'finTransaction', entityId: id, action: 'update' });
      return next;
    }
    const t: FinTransaction = { ...r.data, id: newId('ftx'), ...base() };
    await db.finTransactions.add(t);
    await log({ entityType: 'finTransaction', entityId: t.id, action: 'create', note: t.type });
    return t;
  });
}
export const softDeleteTransaction = (id: string) => setDeleted('finTransactions', 'finTransaction', id, nowIso());
export const restoreTransaction = (id: string) => setDeleted('finTransactions', 'finTransaction', id, null);

/* ---------- Valor atual (informado por você) ---------- */

export async function saveQuote(assetId: string, date: string, price: number, source: string, today: string): Promise<FinQuote> {
  if (!Number.isFinite(price) || price < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !source.trim()) throw new FinanceRuleError('invalid');
  if (date > today) throw new FinanceRuleError('future');
  const db = getDb();
  return db.transaction('rw', db.finQuotes, async () => {
    // Um valor por ativo por dia: informar de novo corrige.
    const same = await db.finQuotes.where('assetId').equals(assetId).filter((q) => !q.deletedAt && q.date === date).first();
    if (same) {
      const next = { ...same, price, source: source.trim().slice(0, 200), updatedAt: nowIso(), rev: same.rev + 1 };
      await db.finQuotes.put(next);
      return next;
    }
    const q: FinQuote = { assetId, date, price, source: source.trim().slice(0, 200), id: newId('fqt'), ...base() };
    await db.finQuotes.add(q);
    return q;
  });
}
export const softDeleteQuote = (id: string) => setDeleted('finQuotes', 'finQuote', id, nowIso());
export const restoreQuote = (id: string) => setDeleted('finQuotes', 'finQuote', id, null);

/* ---------- Importação (Parte 16.4) ---------- */

/**
 * Mesmas regras do cadastro manual: nada com data futura, e nenhuma venda maior do que a quantidade
 * na carteira (contando o que já existe e as linhas do arquivo, em ordem de data). Não muda nada no banco.
 */
export async function validateImportRows(rows: ImportRow[], today: string): Promise<ImportRow[]> {
  const db = getDb();
  const assets = new Map((await db.finAssets.filter((a) => !a.deletedAt).toArray()).map((a) => [a.id, (a.ticker || a.name).toUpperCase()]));
  const held = new Map<string, number>();
  for (const t of await db.finTransactions.filter((x) => !x.deletedAt).toArray()) {
    const k = assets.get(t.assetId);
    if (!k) continue;
    held.set(k, (held.get(k) ?? 0) + (t.type === 'buy' ? t.quantity : t.type === 'sell' ? -t.quantity : 0));
  }
  const out = rows.map((r) => ({ ...r }));
  const order = out.map((_, i) => i).sort((a, b) => out[a]!.date.localeCompare(out[b]!.date));
  for (const i of order) {
    const r = out[i]!;
    // Erros de leitura (data, ativo, tipo, valores) continuam; os de regra são refeitos a cada conferência.
    if (r.error && r.error !== 'future' && r.error !== 'oversell') continue;
    r.error = null;
    if (r.date > today) r.error = 'future';
    if (r.error || r.duplicate || !r.include) continue;
    const k = r.ticker.toUpperCase();
    const q = held.get(k) ?? 0;
    if (r.type === 'sell' && r.quantity > q + 1e-9) r.error = 'oversell';
    else held.set(k, q + (r.type === 'buy' ? r.quantity : r.type === 'sell' ? -r.quantity : 0));
  }
  return out.map((r) => (r.error ? { ...r, include: false } : r));
}

/** Marca as linhas que já existem (mesmo ativo, data, tipo, quantidade e preço) e confere as regras. Não muda nada no banco. */
export async function markDuplicates(rows: ImportRow[], today = todayKey()): Promise<ImportRow[]> {
  return validateImportRows(await markDuplicatesOnly(rows), today);
}

async function markDuplicatesOnly(rows: ImportRow[]): Promise<ImportRow[]> {
  const db = getDb();
  const assets = new Map((await db.finAssets.filter((a) => !a.deletedAt).toArray()).map((a) => [a.id, a]));
  const existing = new Set(
    (await db.finTransactions.filter((t) => !t.deletedAt).toArray()).map((t) => {
      const a = assets.get(t.assetId);
      return txFingerprint({ ...t, ticker: a?.ticker || a?.name || '' });
    }),
  );
  const seen = new Set<string>();
  return rows.map((r) => {
    const fp = txFingerprint(r);
    const duplicate = existing.has(fp) || seen.has(fp);
    seen.add(fp);
    return { ...r, duplicate, include: r.include && !duplicate && !r.error };
  });
}

/**
 * Importa as linhas confirmadas. Ativo que ainda não existe é criado com a categoria escolhida.
 * Cada movimentação guarda a origem (nome do arquivo e data da importação).
 */
export async function importTransactions(rows: ImportRow[], opts: { fileName: string; category: FinAsset['category']; currency: FinAsset['currency']; custody: string; today: string }): Promise<{ created: number; assets: number }> {
  // Confere de novo na hora de gravar: a escolha do usuário vale, mas nenhuma regra é pulada.
  const chosen = (await validateImportRows(rows, opts.today)).filter((r) => r.include && !r.error);
  const db = getDb();
  const source = `${opts.fileName.slice(0, 120)} · ${opts.today}`;
  return db.transaction('rw', db.finAssets, db.finTransactions, db.changelog, async () => {
    const assets = await db.finAssets.filter((a) => !a.deletedAt).toArray();
    let createdAssets = 0;
    const byTicker = new Map(assets.map((a) => [(a.ticker || a.name).toUpperCase(), a]));
    let created = 0;
    for (const r of chosen.sort((a, b) => a.date.localeCompare(b.date))) {
      let asset = byTicker.get(r.ticker.toUpperCase());
      if (!asset) {
        asset = { name: r.ticker, ticker: r.ticker.toUpperCase(), category: opts.category, market: opts.currency === 'BRL' ? 'BR' : '', currency: opts.currency, custody: opts.custody.trim(), notes: '', archived: false, id: newId('fas'), ...base() };
        await db.finAssets.add(asset);
        byTicker.set(r.ticker.toUpperCase(), asset);
        createdAssets++;
        await log({ entityType: 'finAsset', entityId: asset.id, action: 'create', note: `import:${opts.fileName.slice(0, 80)}` });
      }
      const t: FinTransaction = { assetId: asset.id, date: r.date, type: r.type, quantity: r.type === 'buy' || r.type === 'sell' ? r.quantity : 0, price: r.type === 'buy' || r.type === 'sell' ? r.price : 0, fees: r.fees, amount: r.type === 'income' || r.type === 'fee' ? r.amount : 0, source, note: '', id: newId('ftx'), ...base() };
      await db.finTransactions.add(t);
      created++;
    }
    await log({ entityType: 'finImport', entityId: newId('fim'), action: 'create', note: `${opts.fileName.slice(0, 80)}:${created}` });
    return { created, assets: createdAssets };
  });
}

/* ---------- Privacidade (Parte 16.8) ---------- */

const HIDE_KEY = 'finance.hideValues';

/** Valores escondidos por padrão: só aparecem quando você toca no olho. */
export async function loadHideValues(): Promise<boolean> {
  const v = (await getDb().kv.get(HIDE_KEY))?.value;
  return v === undefined ? true : v === true;
}
export async function saveHideValues(hide: boolean): Promise<void> {
  await getDb().kv.put({ key: HIDE_KEY, value: hide, updatedAt: nowIso() });
}
