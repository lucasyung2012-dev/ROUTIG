import { useRef, useState } from 'react';
import { AlertTriangle, Copy, FileUp, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createAsset, FinanceRuleError, importTransactions, markDuplicates, restoreTransaction, saveQuote, saveTransaction, softDeleteTransaction, updateAsset } from '@/data/financeRepo';
import { todayKey } from '@/domain/dates';
import {
  ASSET_CATEGORIES,
  CURRENCIES,
  emptyAssetInput,
  formatMoney,
  parseTransactionsCsv,
  rowError,
  TX_TYPES,
  type AssetInput,
  type Currency,
  type FinAsset,
  type FinTransaction,
  type ImportRow,
  type TxInput,
  type TxType,
} from '@/domain/finance';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { useHidden } from './useFinance';

/** Valor em dinheiro que respeita "ocultar valores". */
export function Money({ value, currency, signed = false, className }: { value: number | null; currency: Currency; signed?: boolean; className?: string }) {
  const { settings, t } = useSettings();
  const hidden = useHidden();
  if (value === null) return <span className={cn('text-muted', className)}>—</span>;
  if (hidden) return <span className={cn('tracking-widest text-muted', className)} aria-label={t('finance.hiddenValue')}>•••••</span>;
  const text = formatMoney(Math.abs(value), currency, settings.locale);
  return <span className={cn('tabular', signed && value > 0 && 'text-success', signed && value < 0 && 'text-danger', className)}>{signed ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}` : value < 0 ? `−${text}` : text}</span>;
}

/** Quantidade, também escondida com "ocultar valores". */
export function Qty({ value }: { value: number }) {
  const { settings } = useSettings();
  const hidden = useHidden();
  if (hidden) return <span className="tracking-widest text-muted">•••</span>;
  return <span className="tabular">{value.toLocaleString(settings.locale, { maximumFractionDigits: 8 })}</span>;
}

const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')));

/* ---------- Ativo ---------- */

export function AssetDialog({ asset, onClose, onSaved }: { asset?: FinAsset; onClose: () => void; onSaved?: (a: FinAsset) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<AssetInput>(() => (asset ? { name: asset.name, ticker: asset.ticker, category: asset.category, market: asset.market, currency: asset.currency, custody: asset.custody, notes: asset.notes } : emptyAssetInput()));
  const set = (p: Partial<AssetInput>) => setInput((i) => ({ ...i, ...p }));
  const save = async () => {
    try {
      const a = asset ? await updateAsset(asset.id, input) : await createAsset(input);
      toast.show(t('finance.saved'));
      onSaved?.(a);
      onClose();
    } catch (e) {
      toast.show(e instanceof FinanceRuleError && e.code === 'duplicate' ? t('finance.errors.duplicateAsset') : t('finance.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={asset ? t('finance.editAsset') : t('finance.newAsset')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.name.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('finance.fields.name')}>{(id) => <Input id={id} autoFocus value={input.name} maxLength={120} placeholder={t('finance.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}</Field>
        <Field label={t('finance.fields.ticker')} optionalLabel={t('common.optional')}>
          {(id) => <Input id={id} value={input.ticker} maxLength={20} placeholder="PETR4, IVVB11, AAPL" onChange={(e) => set({ ticker: e.target.value.toUpperCase() })} />}
        </Field>
        <Field label={t('finance.fields.category')}>
          {(id) => (
            <Select id={id} value={input.category} onChange={(e) => set({ category: e.target.value as AssetInput['category'] })}>
              {ASSET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`finance.categories.${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('finance.fields.currency')}>
          {(id) => (
            <Select id={id} value={input.currency} onChange={(e) => set({ currency: e.target.value as Currency, market: e.target.value === 'BRL' ? 'BR' : input.market === 'BR' ? '' : input.market })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'OTHER' ? t('finance.otherCurrency') : c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('finance.fields.market')} optionalLabel={t('common.optional')}>
          {(id) => <Input id={id} value={input.market} maxLength={10} placeholder="BR, US" onChange={(e) => set({ market: e.target.value.toUpperCase() })} />}
        </Field>
        <Field label={t('finance.fields.custody')} optionalLabel={t('common.optional')}>
          {(id) => <Input id={id} value={input.custody} maxLength={80} placeholder={t('finance.custodyPlaceholder')} onChange={(e) => set({ custody: e.target.value })} />}
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('finance.fields.notes')} optionalLabel={t('common.optional')}>
            {(id) => <Textarea id={id} rows={2} maxLength={10000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- Movimentação ---------- */

export function TxDialog({ asset, tx, onClose }: { asset: FinAsset; tx?: FinTransaction; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [type, setType] = useState<TxType>(tx?.type ?? 'buy');
  const [date, setDate] = useState(tx?.date ?? today);
  const [quantity, setQuantity] = useState(tx?.quantity ? String(tx.quantity) : '');
  const [price, setPrice] = useState(tx?.price ? String(tx.price) : '');
  const [fees, setFees] = useState(tx?.fees ? String(tx.fees) : '');
  const [amount, setAmount] = useState(tx?.amount ? String(tx.amount) : '');
  const [note, setNote] = useState(tx?.note ?? '');
  const trade = type === 'buy' || type === 'sell';
  const save = async () => {
    const input: TxInput = { assetId: asset.id, date, type, quantity: num(quantity), price: num(price), fees: num(fees), amount: num(amount), source: tx?.source ?? 'manual', note };
    try {
      await saveTransaction(tx?.id ?? null, input, today);
      toast.show(t('finance.saved'));
      onClose();
    } catch (e) {
      const code = e instanceof FinanceRuleError ? e.code : 'invalid';
      toast.show(code === 'oversell' ? t('finance.errors.oversell') : code === 'future' ? t('finance.errors.future') : t('finance.errors.tx'), 'error');
    }
  };
  const remove = async () => {
    if (!tx) return;
    await softDeleteTransaction(tx.id);
    toast.show(t('finance.txRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreTransaction(tx.id) });
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={tx ? t('finance.editTx') : t('finance.newTx')}
      description={asset.ticker ? `${asset.name} · ${asset.ticker}` : asset.name}
      footer={
        <>
          {tx && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('finance.remove')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented<TxType> label={t('finance.fields.txType')} value={type} onChange={setType} options={TX_TYPES.map((x) => ({ value: x, label: t(`finance.txTypes.${x}`) }))} />
        <p className="text-xs text-muted">{t(`finance.txHints.${type}`)}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('finance.fields.date')}>{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
          {trade ? (
            <>
              <Field label={t('finance.fields.quantity')}>{(id) => <Input id={id} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
              <Field label={t('finance.fields.price', { currency: asset.currency })}>{(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
              <Field label={t('finance.fields.fees')} optionalLabel={t('common.optional')}>
                {(id) => <Input id={id} inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} />}
              </Field>
            </>
          ) : (
            <Field label={t('finance.fields.amount', { currency: asset.currency })}>{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
          )}
        </div>
        <Field label={t('finance.fields.note')} optionalLabel={t('common.optional')}>
          {(id) => <Input id={id} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {tx && tx.source !== 'manual' && <p className="text-xs text-muted">{t('finance.sourceLabel', { source: tx.source })}</p>}
      </div>
    </Dialog>
  );
}

/* ---------- Valor atual ---------- */

export function QuoteDialog({ asset, onClose }: { asset: FinAsset; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [price, setPrice] = useState('');
  const [source, setSource] = useState('');
  const save = async () => {
    try {
      await saveQuote(asset.id, date, num(price), source, today);
      toast.show(t('finance.saved'));
      onClose();
    } catch {
      toast.show(t('finance.errors.quote'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('finance.newQuote')}
      description={t('finance.quoteHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!price.trim() || !source.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('finance.fields.date')}>{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        <Field label={t('finance.fields.unitValue', { currency: asset.currency })}>{(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
        <div className="sm:col-span-2">
          <Field label={t('finance.fields.source')} hint={t('finance.sourceHint')}>
            {(id, d) => <Input id={id} aria-describedby={d} value={source} maxLength={200} placeholder={t('finance.sourcePlaceholder')} onChange={(e) => setSource(e.target.value)} />}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- Importação com prévia (Parte 16.4) ---------- */

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [info, setInfo] = useState<{ unknownColumns: string[]; missing: string[] } | null>(null);
  const [category, setCategory] = useState<FinAsset['category']>('stocks');
  const [currency, setCurrency] = useState<Currency>('BRL');
  const [custody, setCustody] = useState('');
  const [busy, setBusy] = useState(false);

  const preview = async (raw: string, name: string) => {
    const parsed = parseTransactionsCsv(raw);
    setFileName(name);
    setInfo({ unknownColumns: parsed.unknownColumns, missing: parsed.missing });
    setRows(await markDuplicates(parsed.rows));
  };
  const setRow = (i: number, p: Partial<ImportRow>) =>
    setRows((rs) =>
      rs &&
      rs.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...p };
        const error = rowError(next);
        return { ...next, error, include: error ? false : p.include ?? (r.error && !error ? true : next.include) };
      }),
    );
  const recheck = async () => rows && setRows(await markDuplicates(rows.map((r) => ({ ...r, include: r.include }))));
  const chosen = rows?.filter((r) => r.include && !r.error).length ?? 0;
  const confirm = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const r = await importTransactions(rows, { fileName: fileName || t('finance.pasted'), category, currency, custody, today });
      toast.show(t('finance.imported', { count: r.created, assets: r.assets }));
      onClose();
    } catch {
      toast.show(t('finance.errors.import'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={t('finance.import')}
      description={t('finance.importHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {rows && (
            <Button variant="primary" disabled={!chosen || busy} loading={busy} onClick={() => void confirm()}>
              {t('finance.importConfirm', { count: chosen })}
            </Button>
          )}
        </>
      }
    >
      {!rows ? (
        <div className="flex flex-col gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then((txt) => preview(txt, f.name));
              e.target.value = '';
            }}
          />
          <Button variant="primary" className="w-fit" icon={<FileUp className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
            {t('finance.chooseFile')}
          </Button>
          <p className="text-sm text-muted">{t('finance.importFormats')}</p>
          <Field label={t('finance.orPaste')}>
            {(id) => <Textarea id={id} rows={6} value={text} placeholder={'data;ativo;tipo;quantidade;preço;taxas\n03/11/2026;PETR4;compra;10;38,50;0,30'} onChange={(e) => setText(e.target.value)} className="font-mono text-sm" />}
          </Field>
          <Button variant="secondary" className="w-fit" disabled={!text.trim()} onClick={() => void preview(text, '')}>
            {t('finance.showPreview')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {info && info.missing.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-fg">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              {t('finance.missingColumns', { columns: info.missing.map((m) => t(`finance.columns.${m as 'date' | 'ticker' | 'type'}`)).join(', ') })}
            </p>
          )}
          {info && info.unknownColumns.length > 0 && <p className="text-xs text-muted">{t('finance.ignoredColumns', { columns: info.unknownColumns.join(', ') })}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t('finance.newAssetsCategory')}>
              {(id) => (
                <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as FinAsset['category'])}>
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`finance.categories.${c}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('finance.fields.currency')}>
              {(id) => (
                <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c === 'OTHER' ? t('finance.otherCurrency') : c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('finance.fields.custody')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} value={custody} maxLength={80} onChange={(e) => setCustody(e.target.value)} />}
            </Field>
          </div>
          <p className="text-xs text-muted">{t('finance.previewHint', { source: fileName || t('finance.pasted') })}</p>
          <div className="max-h-[50vh] overflow-auto rounded-xl ring-1 ring-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="p-2">{t('finance.columns.include')}</th>
                  <th className="p-2">{t('finance.columns.date')}</th>
                  <th className="p-2">{t('finance.columns.ticker')}</th>
                  <th className="p-2">{t('finance.columns.type')}</th>
                  <th className="p-2">{t('finance.columns.quantity')}</th>
                  <th className="p-2">{t('finance.columns.price')}</th>
                  <th className="p-2">{t('finance.columns.amount')}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={cn('border-t border-line/60', (r.error || r.duplicate) && 'bg-warning/5')}>
                    <td className="p-2">
                      <input type="checkbox" aria-label={t('finance.columns.include')} checked={r.include} disabled={!!r.error} onChange={(e) => setRow(i, { include: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                    </td>
                    <td className="p-1">
                      <input type="date" aria-label={t('finance.columns.date')} value={r.date} onChange={(e) => setRow(i, { date: e.target.value, })} className="w-36 rounded-lg bg-surface-2 px-2 py-1 ring-1 ring-inset ring-line" />
                    </td>
                    <td className="p-1">
                      <input aria-label={t('finance.columns.ticker')} value={r.ticker} onChange={(e) => setRow(i, { ticker: e.target.value.toUpperCase() })} className="w-24 rounded-lg bg-surface-2 px-2 py-1 ring-1 ring-inset ring-line" />
                    </td>
                    <td className="p-1">
                      <select aria-label={t('finance.columns.type')} value={r.type} onChange={(e) => setRow(i, { type: e.target.value as TxType })} className="rounded-lg bg-surface-2 px-2 py-1 ring-1 ring-inset ring-line">
                        {TX_TYPES.map((x) => (
                          <option key={x} value={x}>
                            {t(`finance.txTypes.${x}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <input aria-label={t('finance.columns.quantity')} inputMode="decimal" value={r.quantity || ''} onChange={(e) => setRow(i, { quantity: num(e.target.value) })} className="w-20 rounded-lg bg-surface-2 px-2 py-1 ring-1 ring-inset ring-line" />
                    </td>
                    <td className="p-1">
                      <input aria-label={t('finance.columns.price')} inputMode="decimal" value={r.price || ''} onChange={(e) => setRow(i, { price: num(e.target.value) })} className="w-24 rounded-lg bg-surface-2 px-2 py-1 ring-1 ring-inset ring-line" />
                    </td>
                    <td className="p-1">
                      <input aria-label={t('finance.columns.amount')} inputMode="decimal" value={r.amount || ''} onChange={(e) => setRow(i, { amount: num(e.target.value) })} className="w-24 rounded-lg bg-surface-2 px-2 py-1 ring-1 ring-inset ring-line" />
                    </td>
                    <td className="p-2 text-xs">
                      {r.error ? <span className="text-danger">{t(`finance.rowErrors.${r.error as 'date' | 'ticker' | 'type' | 'quantity' | 'amount'}`)}</span> : r.duplicate ? (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          {t('finance.duplicate')}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void recheck()}>
              {t('finance.recheck')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRows(null)}>
              {t('finance.startOver')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
