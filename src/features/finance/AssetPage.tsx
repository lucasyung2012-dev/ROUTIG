import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ChevronLeft, PenLine, Plus, Tag, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { restoreAsset, restoreQuote, setAssetArchived, softDeleteAsset, softDeleteQuote } from '@/data/financeRepo';
import { formatDateKey } from '@/domain/dates';
import { valueHistory, type FinTransaction } from '@/domain/finance';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { AssetDialog, Money, QuoteDialog, Qty, TxDialog } from './financeUi';
import { Disclaimer, HideButton, useHideToggle } from './FinancePage';
import { HideContext, useFinance, useHidden, type FinanceData } from './useFinance';
import { FinanceLock } from './FinanceLock';

export function AssetPage() {
  const { id } = useParams();
  const { t, settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const data = useFinance();
  const { hide, toggle } = useHideToggle();
  const [editing, setEditing] = useState(false);
  const [tx, setTx] = useState<{ tx?: FinTransaction } | null>(null);
  const [quote, setQuote] = useState(false);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  const asset = id ? data.byId.get(id) : undefined;
  if (!asset || asset.deletedAt)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Surface tone="flat">
          <EmptyState title={t('finance.notFound')} />
        </Surface>
      </div>
    );
  const p = data.positionOf(asset.id);
  const txs = data.txsOf(asset.id);
  const quotes = data.quotesOf(asset.id);
  const trash = async () => {
    await softDeleteAsset(asset.id);
    toast.show(t('finance.moved'), 'success', { label: t('notes.undo'), run: () => void restoreAsset(asset.id) });
    navigate('/finance');
  };
  const cur = asset.currency;
  return (
    <FinanceLock>
    <HideContext.Provider value={hide}>
      <div className="flex flex-col gap-5">
        <BackLink />
        <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
          <div className="h-2 bg-brand" aria-hidden />
          <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
            <div className="min-w-0 flex-1 basis-56">
              <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{asset.name}</h1>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {asset.ticker && <Badge>{asset.ticker}</Badge>}
                <Badge>{t(`finance.categories.${asset.category}`)}</Badge>
                <Badge>{asset.currency}</Badge>
                {asset.market && <Badge>{asset.market}</Badge>}
                {asset.custody && <Badge>{asset.custody}</Badge>}
                {asset.archived && <Badge tone="warning">{t('finance.archived')}</Badge>}
              </div>
            </div>
            <HideButton hide={hide} toggle={toggle} />
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setTx({})}>
              {t('finance.newTx')}
            </Button>
            <Button variant="secondary" size="sm" icon={<Tag className="h-4 w-4" />} onClick={() => setQuote(true)}>
              {t('finance.newQuote')}
            </Button>
            <IconButton label={t('finance.editAsset')} icon={<PenLine className="h-4 w-4" />} onClick={() => setEditing(true)} />
            <IconButton label={asset.archived ? t('finance.unarchive') : t('finance.archive')} icon={<Archive className="h-4 w-4" />} onClick={() => void setAssetArchived(asset.id, !asset.archived)} />
            <IconButton label={t('finance.moveToTrash')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void trash()} />
          </div>
        </div>
        <Disclaimer />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('finance.quantity')}>
            <Qty value={p.quantity} />
          </Stat>
          <Stat label={t('finance.avgPrice')}>
            <Money value={p.quantity ? p.avgPrice : null} currency={cur} />
          </Stat>
          <Stat label={t('finance.invested')}>
            <Money value={p.invested} currency={cur} />
          </Stat>
          <Stat label={p.lastQuote ? t('finance.currentOn', { date: formatDateKey(p.lastQuote.date, settings.locale) }) : t('finance.noQuote')}>
            <Money value={p.currentValue} currency={cur} />
          </Stat>
          <Stat label={t('finance.unrealized')}>
            <Money value={p.unrealized} currency={cur} signed />
          </Stat>
          <Stat label={t('finance.realized')}>
            <Money value={p.realized} currency={cur} signed />
          </Stat>
          <Stat label={t('finance.income')}>
            <Money value={p.income} currency={cur} />
          </Stat>
          <Stat label={t('finance.fees')}>
            <Money value={p.fees} currency={cur} />
          </Stat>
        </div>
        {p.lastQuote && <p className="text-xs text-muted">{t('finance.quoteSource', { source: p.lastQuote.source, date: formatDateKey(p.lastQuote.date, settings.locale) })}</p>}

        <Evolution assetId={asset.id} currency={cur} data={data} />

        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Surface className="flex flex-col gap-2">
            <h2 className="font-semibold text-fg">{t('finance.transactions')}</h2>
            {txs.length === 0 ? (
              <p className="text-sm text-muted">{t('finance.noTx')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line/60">
                {txs.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => setTx({ tx: x })} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-sm hover:bg-surface-2/40">
                      <span className="w-24 text-muted">{formatDateKey(x.date, settings.locale)}</span>
                      <Badge tone={x.type === 'buy' ? 'info' : x.type === 'sell' ? 'warning' : x.type === 'income' ? 'success' : 'neutral'}>{t(`finance.txTypes.${x.type}`)}</Badge>
                      {x.type === 'buy' || x.type === 'sell' ? (
                        <span className="min-w-0 flex-1 text-fg">
                          <Qty value={x.quantity} /> × <Money value={x.price} currency={cur} />
                          {x.fees > 0 && (
                            <span className="text-muted">
                              {' '}
                              + <Money value={x.fees} currency={cur} />
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 text-fg">
                          <Money value={x.amount} currency={cur} />
                        </span>
                      )}
                      {x.source !== 'manual' && <span className="w-full text-xs text-subtle">{t('finance.sourceLabel', { source: x.source })}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
          <Surface className="flex flex-col gap-2">
            <h2 className="font-semibold text-fg">{t('finance.quotes')}</h2>
            {quotes.length === 0 ? (
              <p className="text-sm text-muted">{t('finance.noQuotes')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {quotes.map((q) => (
                  <li key={q.id} className="flex items-center gap-2 text-sm">
                    <span className="w-24 text-muted">{formatDateKey(q.date, settings.locale)}</span>
                    <Money value={q.price} currency={cur} className="flex-1" />
                    <span className="min-w-0 max-w-32 truncate text-xs text-subtle" title={q.source}>
                      {q.source}
                    </span>
                    <IconButton label={t('finance.remove')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void softDeleteQuote(q.id).then(() => toast.show(t('finance.quoteRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreQuote(q.id) }))} />
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </div>
        {asset.notes && (
          <Surface className="flex flex-col gap-2">
            <h2 className="font-semibold text-fg">{t('finance.fields.notes')}</h2>
            <p className="whitespace-pre-wrap text-sm text-fg">{asset.notes}</p>
          </Surface>
        )}
        {editing && <AssetDialog asset={asset} onClose={() => setEditing(false)} />}
        {tx && <TxDialog asset={asset} tx={tx.tx} onClose={() => setTx(null)} />}
        {quote && <QuoteDialog asset={asset} onClose={() => setQuote(false)} />}
      </div>
    </HideContext.Provider>
    </FinanceLock>
  );
}

function BackLink() {
  const { t } = useSettings();
  return (
    <Link to="/finance" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-fg">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('finance.back')}
    </Link>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Surface className="flex flex-col gap-1">
      <span className="text-lg font-semibold text-fg">{children}</span>
      <span className="text-xs text-muted">{label}</span>
    </Surface>
  );
}

/** Evolução (Parte 16.3): valor informado × valor aplicado, só nas datas com valor informado. */
function Evolution({ assetId, currency, data }: { assetId: string; currency: FinanceData['assets'][number]['currency']; data: FinanceData }) {
  const { t, settings } = useSettings();
  const hidden = useHidden();
  const points = valueHistory(data.txsOf(assetId), data.quotesOf(assetId)).slice(-24);
  if (points.length < 2) return <p className="text-xs text-muted">{t('finance.evolutionHint')}</p>;
  const top = Math.max(...points.map((p) => Math.max(p.value, p.invested)), 1);
  return (
    <Surface className="flex flex-col gap-3">
      <h2 className="font-semibold text-fg">{t('finance.evolution')}</h2>
      <div className="flex h-40 items-end gap-1.5" role="img" aria-label={hidden ? t('finance.hiddenValue') : points.map((p) => `${formatDateKey(p.date, settings.locale)}: ${p.value.toFixed(2)} ${currency}`).join('; ')}>
        {points.map((p) => (
          <div key={p.date} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="relative w-full" style={{ height: `${(p.value / top) * 100}%` }}>
              <span className="absolute inset-0 rounded-t-md bg-brand" />
              <span className="absolute inset-x-0 border-t-2 border-dashed border-fg/50" style={{ bottom: `${p.value ? (p.invested / p.value) * 100 : 0}%` }} aria-hidden />
            </span>
            <span className="w-full truncate text-center text-[0.625rem] text-subtle">{formatDateKey(p.date, settings.locale)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">{t('finance.evolutionLegend')}</p>
    </Surface>
  );
}

