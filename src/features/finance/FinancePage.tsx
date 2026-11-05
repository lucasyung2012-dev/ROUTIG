import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Eye, EyeOff, FileUp, Info, KeyRound, Plus, RotateCcw, Wallet } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { loadHideValues, restoreAsset, saveHideValues, setAssetArchived } from '@/data/financeRepo';
import { CURRENCIES, distribution, type AssetCategory, type Currency, type FinAsset } from '@/domain/finance';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { cn } from '@/ui/cn';
import { AssetDialog, ImportDialog, Money, Qty } from './financeUi';
import { HideContext, useFinance, useHidden, type FinanceData } from './useFinance';
import { FinanceAcademy } from './FinanceAcademy';
import { MarketArea } from './MarketArea';
import { PlanningArea } from './PlanningArea';
import { JournalArea } from './JournalArea';
import { FinanceLock, PinDialog } from './FinanceLock';
import { Segmented } from '@/ui/Segmented';

/** As áreas internas (Parte 16.1). */
const AREAS = ['academy', 'investments', 'market', 'planning', 'journal'] as const;
type Area = (typeof AREAS)[number];
const AREA_KEY = 'routig.finance.area';

function useArea(): [Area, (a: Area) => void] {
  const [area, setArea] = useState<Area>(() => {
    try {
      const v = localStorage.getItem(AREA_KEY);
      return (AREAS as readonly string[]).includes(v ?? '') ? (v as Area) : 'academy';
    } catch {
      return 'academy';
    }
  });
  return [
    area,
    (a) => {
      setArea(a);
      try {
        localStorage.setItem(AREA_KEY, a);
      } catch {
        /* preferência só desta sessão */
      }
    },
  ];
}

/** Liga e desliga "ocultar valores" (padrão: escondidos). Guardado no aparelho. */
export function useHideToggle() {
  const [hide, setHide] = useState(true);
  useEffect(() => {
    void loadHideValues().then(setHide);
  }, []);
  return {
    hide,
    toggle: () => {
      const next = !hide;
      setHide(next);
      void saveHideValues(next);
    },
  };
}

export function HideButton({ hide, toggle }: { hide: boolean; toggle: () => void }) {
  const { t } = useSettings();
  return <IconButton label={hide ? t('finance.showValues') : t('finance.hideValues')} icon={hide ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} onClick={toggle} />;
}

export function Disclaimer() {
  const { t } = useSettings();
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-surface-2/70 p-3 text-sm text-muted ring-1 ring-inset ring-line">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {t('finance.disclaimer')}
    </p>
  );
}

/** Finanças (Parte 16): aprender, acompanhar e organizar. Nada aqui compra, vende ou recomenda. */
export function FinancePage() {
  const { t } = useSettings();
  const data = useFinance();
  const { hide, toggle } = useHideToggle();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [area, setArea] = useArea();
  const [pinOpen, setPinOpen] = useState(false);
  const [lockKey, setLockKey] = useState(0);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  return (
    <FinanceLock key={lockKey}>
    <HideContext.Provider value={hide}>
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={t('modules.finance')}
          title={t('modules.finance')}
          description={t('moduleSummary.finance')}
          icon={<Wallet className="h-7 w-7" aria-hidden />}
          actions={
            <>
              <HideButton hide={hide} toggle={toggle} />
              <IconButton label={t('finance.lock.button')} icon={<KeyRound className="h-4 w-4" />} onClick={() => setPinOpen(true)} />
              {area === 'investments' && (
                <>
                  <Button variant="secondary" size="sm" icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)}>
                    {t('finance.import')}
                  </Button>
                  <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                    {t('finance.newAsset')}
                  </Button>
                </>
              )}
            </>
          }
        />
        <Disclaimer />
        <Segmented<Area> label={t('finance.areaLabel')} value={area} onChange={setArea} options={AREAS.map((a) => ({ value: a, label: t(`finance.areas.${a}`) }))} />
        {area === 'academy' ? (
          <FinanceAcademy />
        ) : area === 'market' ? (
          <MarketArea />
        ) : area === 'planning' ? (
          <PlanningArea />
        ) : area === 'journal' ? (
          <JournalArea assets={[...data.assets, ...data.archived]} />
        ) : data.assets.length === 0 && data.archived.length === 0 ? (
          <Surface tone="flat">
            <EmptyState icon={<Wallet className="h-6 w-6" />} title={t('finance.emptyTitle')} body={t('finance.empty')} />
          </Surface>
        ) : (
          <Investments data={data} />
        )}
        {data.trash.length > 0 && (
          <Surface tone="flat" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-fg">{t('finance.trash')}</h2>
            {data.trash.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted">{a.name}</span>
                <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreAsset(a.id)}>
                  {t('academy.assessment.restore')}
                </Button>
              </div>
            ))}
          </Surface>
        )}
        {creating && <AssetDialog onClose={() => setCreating(false)} />}
        {importing && <ImportDialog onClose={() => setImporting(false)} />}
        {pinOpen && <PinDialog onClose={() => setPinOpen(false)} onLocked={() => setLockKey((k) => k + 1)} />}
      </div>
    </HideContext.Provider>
    </FinanceLock>
  );
}

/* ---------- Investimentos (Parte 16.3) ---------- */

function Investments({ data }: { data: FinanceData }) {
  const { t } = useSettings();
  const [showArchived, setShowArchived] = useState(false);
  const currencies = CURRENCIES.filter((c) => data.assets.some((a) => a.currency === c));
  return (
    <div className="flex flex-col gap-4">
      {currencies.map((cur) => (
        <Summary key={cur} currency={cur} assets={data.assets.filter((a) => a.currency === cur)} data={data} />
      ))}
      <Diversification data={data} />
      <Surface className="flex flex-col gap-2">
        <h3 className="font-semibold text-fg">{t('finance.assets')}</h3>
        <ul className="flex flex-col divide-y divide-line/60">
          {data.assets.map((a) => (
            <AssetRow key={a.id} a={a} data={data} />
          ))}
        </ul>
        {data.archived.length > 0 && (
          <>
            <button type="button" className="mt-2 flex w-fit items-center gap-2 text-sm text-muted hover:text-fg" aria-expanded={showArchived} onClick={() => setShowArchived((s) => !s)}>
              <Archive className="h-4 w-4" aria-hidden />
              {t('finance.archivedTitle', { count: data.archived.length })}
            </button>
            {showArchived && (
              <ul className="flex flex-col divide-y divide-line/60 opacity-70">
                {data.archived.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                    <Link to={`/finance/assets/${a.id}`} className="min-w-0 flex-1 truncate text-fg hover:text-accent">
                      {a.name}
                    </Link>
                    <Button size="sm" variant="secondary" onClick={() => void setAssetArchived(a.id, false)}>
                      {t('finance.unarchive')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Surface>
    </div>
  );
}

function AssetRow({ a, data }: { a: FinAsset; data: FinanceData }) {
  const { t } = useSettings();
  const p = data.positionOf(a.id);
  return (
    <li>
      <Link to={`/finance/assets/${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 transition hover:bg-surface-2/40">
        <div className="min-w-0 flex-1 basis-40">
          <span className="block truncate font-medium text-fg">{a.name}</span>
          <span className="block truncate text-xs text-muted">{[a.ticker, t(`finance.categories.${a.category}`), a.custody].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="w-24 text-right text-sm">
          <Qty value={p.quantity} />
          <span className="block text-xs text-muted">{t('finance.qtyShort')}</span>
        </div>
        <div className="w-32 text-right text-sm">
          <Money value={p.invested} currency={a.currency} />
          <span className="block text-xs text-muted">{t('finance.invested')}</span>
        </div>
        <div className="w-32 text-right text-sm">
          <Money value={p.currentValue} currency={a.currency} />
          <span className="block text-xs text-muted">{p.lastQuote ? t('finance.currentOn', { date: p.lastQuote.date.split('-').reverse().join('/') }) : t('finance.noQuote')}</span>
        </div>
      </Link>
    </li>
  );
}

function Summary({ currency, assets, data }: { currency: Currency; assets: FinAsset[]; data: FinanceData }) {
  const { t } = useSettings();
  const pos = assets.map((a) => data.positionOf(a.id));
  const held = pos.filter((p) => p.quantity > 0);
  const withQuote = held.filter((p) => p.currentValue !== null);
  const invested = pos.reduce((s, p) => s + p.invested, 0);
  const value = withQuote.reduce((s, p) => s + (p.currentValue ?? 0), 0);
  const investedQuoted = withQuote.reduce((s, p) => s + p.invested, 0);
  const income = pos.reduce((s, p) => s + p.income, 0);
  const realized = pos.reduce((s, p) => s + p.realized, 0);
  return (
    <Surface className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">{t('finance.summaryIn', { currency })}</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <Money value={invested} currency={currency} className="text-xl font-semibold" />
          <span className="block text-xs text-muted">{t('finance.invested')}</span>
        </div>
        <div>
          <Money value={withQuote.length ? value : null} currency={currency} className="text-xl font-semibold" />
          <span className="block text-xs text-muted">{held.length && withQuote.length < held.length ? t('finance.partialValue', { n: withQuote.length, total: held.length }) : t('finance.currentValue')}</span>
        </div>
        <div>
          <Money value={withQuote.length ? value - investedQuoted : null} currency={currency} signed className="text-xl font-semibold" />
          <span className="block text-xs text-muted">{t('finance.unrealized')}</span>
        </div>
        <div>
          <Money value={income + realized} currency={currency} signed className="text-xl font-semibold" />
          <span className="block text-xs text-muted">{t('finance.incomeAndRealized')}</span>
        </div>
      </div>
    </Surface>
  );
}

/* ---------- Diversificação ---------- */

function Diversification({ data }: { data: FinanceData }) {
  const { t } = useSettings();
  const hidden = useHidden();
  const [by, setBy] = useState<'category' | 'custody'>('category');
  const rows = data.assets.map((a) => ({ key: by === 'category' ? a.category : a.custody || t('finance.noCustody'), currency: a.currency, value: data.positionOf(a.id).invested }));
  const dist = distribution(rows);
  if (!dist.size) return null;
  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 font-semibold text-fg">{t('finance.diversification')}</h3>
        <div className="flex gap-1">
          {(['category', 'custody'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={by === k} onClick={() => setBy(k)} className={cn('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', by === k ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line')}>
              {t(`finance.by.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">{t('finance.diversificationHint')}</p>
      {[...dist.entries()].map(([cur, list]) => (
        <div key={cur} className="flex flex-col gap-1.5">
          {dist.size > 1 && <span className="text-xs font-semibold text-subtle">{cur}</span>}
          {list.map((r) => (
            <div key={r.key} className="flex items-center gap-2 text-sm">
              <span className="w-36 truncate text-fg">{by === 'category' ? t(`finance.categories.${r.key as AssetCategory}`) : r.key}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(r.share * 100)}%` }} />
              </span>
              <span className="w-12 text-right text-xs tabular text-muted">{hidden ? '••' : `${Math.round(r.share * 100)}%`}</span>
            </div>
          ))}
        </div>
      ))}
    </Surface>
  );
}
