import { z } from 'zod';
import type { DateKey } from './dates';
import type { BaseEntity } from './entity';
import type { SrsState } from './srs';

/* ---------- Finanças (Parte 16): aprender, acompanhar e organizar. Nunca operar. ---------- */

/** Categorias de ativo (Parte 16.3), brasileiros e internacionais. */
export const ASSET_CATEGORIES = ['fixedIncome', 'treasury', 'savings', 'stocks', 'reits', 'etfs', 'funds', 'crypto', 'international', 'other'] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'BTC', 'OTHER'] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface FinAsset extends BaseEntity {
  name: string;
  /** Código de negociação (PETR4, IVVB11, AAPL), quando houver. */
  ticker: string;
  category: AssetCategory;
  /** País ou mercado ("BR", "US"...). */
  market: string;
  currency: Currency;
  /** Onde está guardado (corretora, banco, carteira). */
  custody: string;
  notes: string;
  archived: boolean;
}

export const assetInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ticker: z.string().trim().toUpperCase().max(20),
  category: z.enum(ASSET_CATEGORIES),
  market: z.string().trim().toUpperCase().max(10),
  currency: z.enum(CURRENCIES),
  custody: z.string().trim().max(80),
  notes: z.string().max(10_000),
});
export type AssetInput = z.infer<typeof assetInputSchema>;

export function emptyAssetInput(): AssetInput {
  return { name: '', ticker: '', category: 'stocks', market: 'BR', currency: 'BRL', custody: '', notes: '' };
}

/** Movimentações registradas por você (ou importadas com prévia). Compra, venda, rendimento e taxa. */
export const TX_TYPES = ['buy', 'sell', 'income', 'fee'] as const;
export type TxType = (typeof TX_TYPES)[number];

export interface FinTransaction extends BaseEntity {
  assetId: string;
  date: DateKey;
  type: TxType;
  /** Compra e venda: quantidade. Rendimento e taxa: 0. */
  quantity: number;
  /** Compra e venda: preço unitário. */
  price: number;
  /** Taxas e custos da operação. */
  fees: number;
  /** Rendimento ou taxa avulsa: o valor. */
  amount: number;
  /** De onde veio o dado (Parte 16.4): "manual" ou o nome do arquivo importado. */
  source: string;
  note: string;
}

export const txInputSchema = z
  .object({
    assetId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(TX_TYPES),
    quantity: z.number().finite().min(0),
    price: z.number().finite().min(0),
    fees: z.number().finite().min(0),
    amount: z.number().finite().min(0),
    source: z.string().trim().min(1).max(200),
    note: z.string().max(2000),
  })
  .refine((t) => (t.type === 'buy' || t.type === 'sell' ? t.quantity > 0 : t.amount > 0), 'value_required');
export type TxInput = z.infer<typeof txInputSchema>;

/** Valor atual informado por você, com data e origem (sem cotação automática inventada). */
export interface FinQuote extends BaseEntity {
  assetId: string;
  date: DateKey;
  price: number;
  source: string;
}

/* ---------- Posição ---------- */

export interface Position {
  quantity: number;
  /** Preço médio de compra (com taxas), pelo custo médio ponderado. */
  avgPrice: number;
  /** Custo do que ainda está na carteira. */
  invested: number;
  /** Resultado realizado nas vendas. */
  realized: number;
  income: number;
  fees: number;
  /** Último valor informado (null = nunca informado: não inventamos). */
  lastQuote: { price: number; date: DateKey; source: string } | null;
  currentValue: number | null;
  /** Ganho ou perda ainda não realizado (só com valor atual informado). */
  unrealized: number | null;
}

const round = (n: number, d = 8) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Calcula a posição pelo custo médio ponderado: compras somam quantidade e custo (com taxas);
 * vendas tiram quantidade pelo preço médio e registram o resultado realizado.
 */
export function computePosition(txs: Array<Pick<FinTransaction, 'date' | 'type' | 'quantity' | 'price' | 'fees' | 'amount' | 'createdAt'>>, quotes: Array<Pick<FinQuote, 'date' | 'price' | 'source' | 'createdAt'>>): Position {
  let quantity = 0;
  let invested = 0;
  let realized = 0;
  let income = 0;
  let fees = 0;
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  for (const t of sorted) {
    if (t.type === 'buy') {
      quantity += t.quantity;
      invested += t.quantity * t.price + t.fees;
      fees += t.fees;
    } else if (t.type === 'sell') {
      const avg = quantity > 0 ? invested / quantity : 0;
      const q = Math.min(t.quantity, quantity);
      realized += q * t.price - t.fees - q * avg;
      invested -= q * avg;
      quantity -= q;
      fees += t.fees;
    } else if (t.type === 'income') income += t.amount;
    else fees += t.amount;
  }
  quantity = round(quantity);
  invested = quantity === 0 ? 0 : round(invested, 6);
  const last = [...quotes].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  const lastQuote = last ? { price: last.price, date: last.date, source: last.source } : null;
  const currentValue = lastQuote ? round(quantity * lastQuote.price, 6) : null;
  return {
    quantity,
    avgPrice: quantity > 0 ? round(invested / quantity, 6) : 0,
    invested,
    realized: round(realized, 6),
    income: round(income, 6),
    fees: round(fees, 6),
    lastQuote,
    currentValue,
    unrealized: currentValue === null ? null : round(currentValue - invested, 6),
  };
}

/** Distribuição por um critério, separada por moeda (somar moedas diferentes exigiria câmbio, que não inventamos). */
export function distribution<K extends string>(rows: Array<{ key: K; currency: Currency; value: number }>): Map<Currency, Array<{ key: K; value: number; share: number }>> {
  const byCur = new Map<Currency, Map<K, number>>();
  for (const r of rows) {
    if (r.value <= 0) continue;
    const m = byCur.get(r.currency) ?? new Map<K, number>();
    m.set(r.key, (m.get(r.key) ?? 0) + r.value);
    byCur.set(r.currency, m);
  }
  const out = new Map<Currency, Array<{ key: K; value: number; share: number }>>();
  for (const [cur, m] of byCur) {
    const total = [...m.values()].reduce((a, v) => a + v, 0);
    out.set(
      cur,
      [...m.entries()].map(([key, value]) => ({ key, value, share: total ? value / total : 0 })).sort((a, b) => b.value - a.value),
    );
  }
  return out;
}

/** Valor da carteira ao longo do tempo, só nas datas em que há valor informado. */
export function valueHistory(txs: Array<Pick<FinTransaction, 'date' | 'type' | 'quantity' | 'price' | 'fees' | 'amount' | 'createdAt'>>, quotes: Array<Pick<FinQuote, 'date' | 'price' | 'source' | 'createdAt'>>): Array<{ date: DateKey; value: number; invested: number }> {
  return [...quotes]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((q) => {
      const p = computePosition(
        txs.filter((t) => t.date <= q.date),
        [q],
      );
      return { date: q.date, value: p.currentValue ?? 0, invested: p.invested };
    });
}

/* ---------- Importação (Parte 16.4) ---------- */

export interface ImportRow {
  include: boolean;
  date: DateKey;
  ticker: string;
  type: TxType;
  quantity: number;
  price: number;
  fees: number;
  amount: number;
  /** Problema que impede importar a linha. */
  error: string | null;
  duplicate: boolean;
}

const HEADER_ALIASES: Record<string, keyof Pick<ImportRow, 'date' | 'ticker' | 'type' | 'quantity' | 'price' | 'fees' | 'amount'>> = {
  data: 'date',
  date: 'date',
  'data do negócio': 'date',
  'data do negocio': 'date',
  ativo: 'ticker',
  ticker: 'ticker',
  código: 'ticker',
  codigo: 'ticker',
  produto: 'ticker',
  papel: 'ticker',
  'código de negociação': 'ticker',
  'codigo de negociacao': 'ticker',
  tipo: 'type',
  type: 'type',
  operação: 'type',
  operacao: 'type',
  'tipo de movimentação': 'type',
  'tipo de movimentacao': 'type',
  'entrada/saída': 'type',
  'entrada/saida': 'type',
  quantidade: 'quantity',
  quantity: 'quantity',
  qtd: 'quantity',
  preço: 'price',
  preco: 'price',
  'preço unitário': 'price',
  'preco unitario': 'price',
  price: 'price',
  taxas: 'fees',
  taxa: 'fees',
  fees: 'fees',
  custos: 'fees',
  valor: 'amount',
  'valor da operação': 'amount',
  'valor da operacao': 'amount',
  amount: 'amount',
};

/** Número brasileiro ou internacional: "1.234,56", "1,234.56", "R$ 10,00". */
export function parseNumber(raw: string): number | null {
  let s = raw.replace(/[^\d,.-]/g, '');
  if (!s || s === '-') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "31/12/2025", "2025-12-31" ou "31-12-2025". */
export function parseDate(raw: string): DateKey | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (!m) return null;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}

function parseType(raw: string): TxType | null {
  const s = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (/^(c|compra|buy|credito)$/.test(s) || s.includes('compra')) return 'buy';
  if (/^(v|venda|sell|debito)$/.test(s) || s.includes('venda')) return 'sell';
  if (/(dividend|rendimento|juros|jcp|provento|income)/.test(s)) return 'income';
  if (/(taxa|tarifa|custodia|fee|imposto|ir)/.test(s)) return 'fee';
  return null;
}

/** Divide uma linha de CSV respeitando aspas. Aceita vírgula, ponto e vírgula ou tabulação. */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/**
 * Lê um extrato ou planilha em CSV (exportado da corretora ou do Excel) e devolve linhas para a prévia.
 * Nada é salvo aqui: a prévia deixa corrigir e desmarcar antes de confirmar.
 */
export function parseTransactionsCsv(text: string): { rows: ImportRow[]; unknownColumns: string[]; missing: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], unknownColumns: [], missing: ['date', 'ticker', 'type'] };
  const head = lines[0]!;
  const sep = head.includes(';') ? ';' : head.includes('\t') ? '\t' : ',';
  const headers = splitCsvLine(head, sep).map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());
  const map = headers.map((h) => HEADER_ALIASES[h] ?? null);
  const unknownColumns = headers.filter((_, i) => map[i] === null);
  const missing = (['date', 'ticker', 'type'] as const).filter((k) => !map.includes(k));
  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, sep);
    const get = (k: string) => {
      const i = map.indexOf(k as never);
      return i >= 0 ? (cells[i] ?? '') : '';
    };
    const date = parseDate(get('date'));
    const type = parseType(get('type'));
    const quantity = parseNumber(get('quantity')) ?? 0;
    const price = parseNumber(get('price')) ?? 0;
    const fees = parseNumber(get('fees')) ?? 0;
    const amount = Math.abs(parseNumber(get('amount')) ?? 0);
    const ticker = get('ticker').toUpperCase().split(/\s+-\s+|\s/)[0] ?? '';
    const resolvedPrice = (type === 'buy' || type === 'sell') && !price && amount && quantity ? amount / quantity : price;
    let error: string | null = null;
    if (!date) error = 'date';
    else if (!ticker) error = 'ticker';
    else if (!type) error = 'type';
    else if ((type === 'buy' || type === 'sell') && (quantity <= 0 || resolvedPrice <= 0)) error = 'quantity';
    else if ((type === 'income' || type === 'fee') && amount <= 0) error = 'amount';
    rows.push({ include: !error, date: date ?? '', ticker, type: type ?? 'buy', quantity: Math.abs(quantity), price: Math.abs(resolvedPrice), fees: Math.abs(fees), amount, error, duplicate: false });
  }
  return { rows, unknownColumns, missing };
}

/** Mesma data, ativo, tipo, quantidade e preço (ou valor) = provável duplicata. */
export function txFingerprint(t: Pick<FinTransaction, 'date' | 'type' | 'quantity' | 'price' | 'amount'> & { ticker: string }): string {
  return [t.date, t.ticker.toUpperCase(), t.type, round(t.quantity, 6), round(t.price, 6), round(t.amount, 4)].join('|');
}

/** Formata dinheiro na moeda do ativo. */
export function formatMoney(value: number, currency: Currency, locale: string): string {
  if (currency === 'OTHER' || currency === 'BTC') return `${value.toLocaleString(locale, { maximumFractionDigits: currency === 'BTC' ? 8 : 2 })}${currency === 'BTC' ? ' BTC' : ''}`;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/** O que impede importar uma linha da prévia (refeito a cada correção). */
export function rowError(r: Pick<ImportRow, 'date' | 'ticker' | 'type' | 'quantity' | 'price' | 'amount'>): ImportRow['error'] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return 'date';
  if (!r.ticker.trim()) return 'ticker';
  if ((r.type === 'buy' || r.type === 'sell') && (r.quantity <= 0 || r.price <= 0)) return 'quantity';
  if ((r.type === 'income' || r.type === 'fee') && r.amount <= 0) return 'amount';
  return null;
}

/* ---------- Academia Financeira (Parte 16.2) ---------- */

export const LEARN_KINDS = ['course', 'lesson', 'summary', 'concept', 'learning'] as const;
export type LearnKind = (typeof LEARN_KINDS)[number];

export const LEARN_STATUSES = ['todo', 'doing', 'done'] as const;
export type LearnStatus = (typeof LEARN_STATUSES)[number];

export interface FinLearning extends BaseEntity {
  kind: LearnKind;
  title: string;
  /** Explicação com as suas palavras (clara e progressiva). */
  body: string;
  /** Aula: o curso a que pertence. */
  courseId: string | null;
  status: LearnStatus;
  /** Curso: onde é (site, canal, escola). */
  provider: string;
  url: string;
  date: DateKey | null;
}

export const learningInputSchema = z.object({
  kind: z.enum(LEARN_KINDS),
  title: z.string().trim().min(1).max(160),
  body: z.string().max(40_000),
  courseId: z.string().nullable(),
  status: z.enum(LEARN_STATUSES),
  provider: z.string().trim().max(120),
  url: z.union([z.literal(''), z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'http')]),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
export type LearningInput = z.infer<typeof learningInputSchema>;

export function emptyLearningInput(kind: LearnKind): LearningInput {
  return { kind, title: '', body: '', courseId: null, status: 'todo', provider: '', url: '', date: null };
}

/** Glossário: cada termo entra na revisão espaçada (Parte 16.2: revisões). */
export interface FinTerm extends BaseEntity {
  term: string;
  definition: string;
  example: string;
  srs: SrsState;
}

/* ---------- Mercado (Parte 16.5) ---------- */

export const MARKET_KINDS = ['news', 'indicator', 'inflation', 'rates', 'currency', 'index', 'calendar', 'scenario'] as const;
export type MarketKind = (typeof MARKET_KINDS)[number];

export interface MarketEntry extends BaseEntity {
  kind: MarketKind;
  title: string;
  /** Valor do indicador, quando houver (ex.: "10,50% a.a."). */
  value: string;
  /** Data do dado (ou do evento, no calendário econômico). */
  date: DateKey;
  /** Origem obrigatória: de onde veio a informação. */
  source: string;
  url: string;
  /** Fato registrado ou análise/opinião (Parte 16.5: diferenciar). */
  nature: 'fact' | 'analysis';
  notes: string;
}

export const marketInputSchema = z.object({
  kind: z.enum(MARKET_KINDS),
  title: z.string().trim().min(1).max(200),
  value: z.string().trim().max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().trim().min(1).max(200),
  url: z.union([z.literal(''), z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'http')]),
  nature: z.enum(['fact', 'analysis']),
  notes: z.string().max(10_000),
});
export type MarketInput = z.infer<typeof marketInputSchema>;
