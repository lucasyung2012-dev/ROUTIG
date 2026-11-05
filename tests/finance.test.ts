import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createAsset, importTransactions, loadHideValues, markDuplicates, saveQuote, saveTransaction } from '@/data/financeRepo';
import { computePosition, distribution, emptyAssetInput, parseDate, parseNumber, parseTransactionsCsv } from '@/domain/finance';

beforeEach(() => setDbForTests(new RoutigDB(`test-fin-${Math.random().toString(36).slice(2)}`)));

const at = '2026-11-04T00:00:00.000Z';
const tx = (type: 'buy' | 'sell' | 'income' | 'fee', date: string, quantity: number, price: number, fees = 0, amount = 0) => ({ type, date, quantity, price, fees, amount, createdAt: at });

describe('finanças: posição (Parte 16.3)', () => {
  it('preço médio ponderado com taxas; venda pelo preço médio e resultado realizado', () => {
    const p = computePosition([tx('buy', '2026-01-02', 10, 20, 2), tx('buy', '2026-02-02', 10, 30), tx('sell', '2026-03-02', 5, 40, 1), tx('income', '2026-03-10', 0, 0, 0, 7)], []);
    // custo 202 + 300 = 502 por 20 → 25,10; vende 5 por 200 - 1 = 199, custo 125,5 → realizado 73,5
    expect(p.quantity).toBe(15);
    expect(p.avgPrice).toBeCloseTo(25.1, 6);
    expect(p.invested).toBeCloseTo(376.5, 6);
    expect(p.realized).toBeCloseTo(73.5, 6);
    expect(p.income).toBe(7);
    expect(p.currentValue).toBeNull();
  });

  it('valor atual só com valor informado, o mais recente', () => {
    const quotes = [
      { date: '2026-10-01', price: 30, source: 'a', createdAt: at },
      { date: '2026-11-01', price: 33, source: 'b', createdAt: at },
    ];
    const p = computePosition([tx('buy', '2026-01-02', 10, 20)], quotes);
    expect([p.currentValue, p.unrealized, p.lastQuote?.source]).toEqual([330, 130, 'b']);
  });

  it('diversificação separada por moeda, sem somar moedas diferentes', () => {
    const d = distribution([
      { key: 'stocks', currency: 'BRL', value: 300 },
      { key: 'fixedIncome', currency: 'BRL', value: 100 },
      { key: 'etfs', currency: 'USD', value: 50 },
    ]);
    expect(d.get('BRL')?.map((x) => [x.key, x.share])).toEqual([
      ['stocks', 0.75],
      ['fixedIncome', 0.25],
    ]);
    expect(d.get('USD')?.[0]?.share).toBe(1);
  });
});

describe('finanças: regras e importação (Parte 16.4 e 16.8)', () => {
  it('não vende mais do que tem, não aceita data futura, valores escondidos por padrão', async () => {
    const a = await createAsset({ ...emptyAssetInput(), name: 'Petrobras', ticker: 'petr4' });
    expect(a.ticker).toBe('PETR4');
    await expect(createAsset({ ...emptyAssetInput(), name: 'Outro nome', ticker: 'PETR4' })).rejects.toMatchObject({ code: 'duplicate' });
    await saveTransaction(null, { assetId: a.id, date: '2026-11-01', type: 'buy', quantity: 10, price: 30, fees: 0, amount: 0, source: 'manual', note: '' }, '2026-11-04');
    await expect(saveTransaction(null, { assetId: a.id, date: '2026-11-02', type: 'sell', quantity: 11, price: 30, fees: 0, amount: 0, source: 'manual', note: '' }, '2026-11-04')).rejects.toMatchObject({ code: 'oversell' });
    await expect(saveTransaction(null, { assetId: a.id, date: '2026-11-05', type: 'buy', quantity: 1, price: 30, fees: 0, amount: 0, source: 'manual', note: '' }, '2026-11-04')).rejects.toMatchObject({ code: 'future' });
    await saveQuote(a.id, '2026-11-04', 31, 'app', '2026-11-04');
    await saveQuote(a.id, '2026-11-04', 32, 'app', '2026-11-04');
    expect((await getDb().finQuotes.toArray()).map((q) => q.price)).toEqual([32]);
    expect(await loadHideValues()).toBe(true);
  });

  it('lê números, datas e o CSV de corretora em português', () => {
    expect(parseNumber('R$ 1.234,56')).toBe(1234.56);
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseDate('03/11/2026')).toBe('2026-11-03');
    const csv = 'Data;Ativo;Tipo;Quantidade;Preço;Taxas\n03/11/2026;PETR4;Compra;10;38,50;0,30\n04/11/2026;PETR4;Dividendo;;;\n05/11/2026;;Venda;1;40;0';
    const { rows, missing } = parseTransactionsCsv(csv);
    expect(missing).toEqual([]);
    expect(rows[0]).toMatchObject({ date: '2026-11-03', ticker: 'PETR4', type: 'buy', quantity: 10, price: 38.5, fees: 0.3, error: null, include: true });
    expect(rows[1]).toMatchObject({ type: 'income', error: 'amount', include: false });
    expect(rows[2]).toMatchObject({ error: 'ticker' });
  });

  it('importa com prévia: marca duplicatas, cria o ativo e guarda a origem', async () => {
    const csv = 'data,ativo,tipo,quantidade,preco\n2026-11-03,IVVB11,compra,2,300\n2026-11-03,IVVB11,compra,2,300';
    const marked = await markDuplicates(parseTransactionsCsv(csv).rows);
    expect(marked.map((r) => [r.duplicate, r.include])).toEqual([
      [false, true],
      [true, false],
    ]);
    const r = await importTransactions(marked, { fileName: 'extrato.csv', category: 'etfs', currency: 'BRL', custody: 'Corretora', today: '2026-11-04' });
    expect(r).toEqual({ created: 1, assets: 1 });
    expect((await getDb().finTransactions.toArray())[0]?.source).toBe('extrato.csv · 2026-11-04');
    const again = await markDuplicates(parseTransactionsCsv(csv).rows);
    expect(again.every((x) => x.duplicate && !x.include)).toBe(true);
  });
});

describe('finanças: Academia e Mercado (Partes 16.2 e 16.5)', () => {
  it('glossário sem termo repetido e com revisão espaçada', async () => {
    const { saveTerm, answerTerm } = await import('@/data/financeLearnRepo');
    const x = await saveTerm(null, 'Liquidez', 'Facilidade de virar dinheiro', '');
    await expect(saveTerm(null, ' liquidez ', 'outra', '')).rejects.toMatchObject({ code: 'duplicate' });
    const after = await answerTerm(x.id, 'good', '2026-11-04');
    expect(after.srs).toMatchObject({ due: '2026-11-05', reps: 1 });
  });

  it('aula ligada ao curso; mercado exige fonte e separa fato de análise', async () => {
    const { saveLearning, saveMarket } = await import('@/data/financeLearnRepo');
    const { emptyLearningInput } = await import('@/domain/finance');
    const c = await saveLearning(null, { ...emptyLearningInput('course'), title: 'Curso X' });
    const l = await saveLearning(null, { ...emptyLearningInput('lesson'), title: 'Aula 1', courseId: c.id });
    expect(l.courseId).toBe(c.id);
    const s = await saveLearning(null, { ...emptyLearningInput('summary'), title: 'Resumo', courseId: c.id });
    expect(s.courseId).toBeNull();
    const base = { kind: 'rates' as const, title: 'Selic', value: '10,50% a.a.', date: '2026-11-04', url: '', notes: '' };
    await expect(saveMarket(null, { ...base, source: ' ', nature: 'fact' })).rejects.toMatchObject({ code: 'invalid' });
    const m = await saveMarket(null, { ...base, source: 'Banco Central', nature: 'analysis' });
    expect(m.nature).toBe('analysis');
  });
});
