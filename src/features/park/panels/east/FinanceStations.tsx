import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BellRing, Plus } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { answerTerm, saveLearning, saveMarket } from '@/data/financeLearnRepo';
import { loadPlanPrefs, saveBudgetCategory, saveBudgetEntry, saveJournal, savePlanPrefs, type PlanPrefs } from '@/data/financePlanRepo';
import { FinanceRuleError } from '@/data/financeRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import { budgetMonth, CURRENCIES, emptyLearningInput, LEARN_STATUSES, MARKET_KINDS, reserveTarget, type FinAsset, type FinLearning, type JournalEntry, type JournalInput, type LearnStatus, type MarketKind } from '@/domain/finance';
import { isDue, previewIntervals, RATINGS, sessionQueue, type Rating } from '@/domain/srs';
import { Disclaimer, HideButton, useHideToggle } from '@/features/finance/FinancePage';
import { FinanceLock } from '@/features/finance/FinanceLock';
import { AssetDialog, Money, QuoteDialog, TxDialog } from '@/features/finance/financeUi';
import { HideContext, useFinance } from '@/features/finance/useFinance';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Input, Select } from '@/ui/Field';
import { LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import type { FinanceSector } from '../../interiors/east';
import { Chips, Empty, SectionTitle, Station, rowClass, useStationMemory } from './station';

/**
 * Estações do Centro de Gestão Financeira. Tudo atrás do mesmo bloqueio de Finanças (FinanceLock: o
 * mesmo PIN, as mesmas esperas, o mesmo "Esqueci o PIN"); nada de Finanças é lido antes de abrir.
 * Os dados e as gravações são os de Finanças (useFinance, financeRepo, financePlanRepo,
 * financeLearnRepo), com o mesmo "ocultar valores" e as mesmas janelas de ativo, movimentação e valor.
 */
export function FinanceStations({ id }: { id: FinanceSector }) {
  const { t } = useSettings();
  return (
    <Station building="finance" plate={t(`park.native.east.finance.plates.${id}`)} to="/finance">
      <FinanceLock>
        <FinanceDesk id={id} />
      </FinanceLock>
    </Station>
  );
}

/** Só monta depois do bloqueio: daqui para baixo é que os registros de Finanças são lidos. */
function FinanceDesk({ id }: { id: FinanceSector }) {
  const { t } = useSettings();
  const { hide, toggle } = useHideToggle();
  const body = id === 'investments' ? <Investments /> : id === 'journal' ? <Journal /> : id === 'planning' ? <Planning /> : id === 'academy' ? <Academy /> : <Market />;
  return (
    <HideContext.Provider value={hide}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-xs text-muted">{t(`park.native.east.finance.hints.${id}`)}</p>
          <HideButton hide={hide} toggle={toggle} />
        </div>
        {body}
      </div>
    </HideContext.Provider>
  );
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));

/* ---------- Visão financeira: carteira por moeda e ativos ---------- */

type AssetDialogState = { kind: 'asset' } | { kind: 'tx' | 'quote'; asset: FinAsset } | null;

function Investments() {
  const { t, settings } = useSettings();
  const data = useFinance();
  const [dialog, setDialog] = useState<AssetDialogState>(null);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={3} />;
  const currencies = CURRENCIES.filter((c) => data.assets.some((a) => a.currency === c));
  return (
    <>
      <Disclaimer />
      {data.assets.length === 0 ? (
        <Empty>{t('finance.empty')}</Empty>
      ) : (
        currencies.map((cur) => {
          // As mesmas contas do resumo de Finanças: o valor atual só soma o que tem valor informado.
          const pos = data.assets.filter((a) => a.currency === cur).map((a) => data.positionOf(a.id));
          const held = pos.filter((p) => p.quantity > 0);
          const quoted = held.filter((p) => p.currentValue !== null);
          const invested = pos.reduce((s, p) => s + p.invested, 0);
          const value = quoted.reduce((s, p) => s + (p.currentValue ?? 0), 0);
          const investedQuoted = quoted.reduce((s, p) => s + p.invested, 0);
          return (
            <div key={cur} className={cn(rowClass, 'grid grid-cols-3 gap-2')}>
              <span className="col-span-3 text-xs font-semibold uppercase tracking-wide text-subtle">{t('finance.summaryIn', { currency: cur })}</span>
              <span className="flex min-w-0 flex-col">
                <Money value={invested} currency={cur} className="text-sm font-semibold" />
                <span className="text-xs text-muted">{t('finance.invested')}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <Money value={quoted.length ? value : null} currency={cur} className="text-sm font-semibold" />
                <span className="text-xs text-muted">{held.length && quoted.length < held.length ? t('finance.partialValue', { n: quoted.length, total: held.length }) : t('finance.currentValue')}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <Money value={quoted.length ? value - investedQuoted : null} currency={cur} signed className="text-sm font-semibold" />
                <span className="text-xs text-muted">{t('finance.unrealized')}</span>
              </span>
            </div>
          );
        })
      )}
      <SectionTitle
        extra={
          <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ kind: 'asset' })}>
            {t('finance.newAsset')}
          </Button>
        }
      >
        {t('finance.assets')}
      </SectionTitle>
      {data.assets.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {data.assets.map((a) => {
            const p = data.positionOf(a.id);
            return (
              <li key={a.id} className={cn(rowClass, 'flex flex-col gap-1.5')}>
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{a.name}</span>
                  <Money value={p.currentValue} currency={a.currency} className="text-sm" />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="min-w-0 flex-1 truncate">{[a.ticker, t(`finance.categories.${a.category}`), a.custody].filter(Boolean).join(' · ')}</span>
                  <span className="shrink-0">{p.lastQuote ? t('finance.currentOn', { date: formatDateKey(p.lastQuote.date, settings.locale) }) : t('finance.noQuote')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'tx', asset: a })}>
                    {t('finance.newTx')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'quote', asset: a })}>
                    {t('finance.newQuote')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {dialog?.kind === 'asset' && <AssetDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'tx' && <TxDialog asset={dialog.asset} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'quote' && <QuoteDialog asset={dialog.asset} onClose={() => setDialog(null)} />}
    </>
  );
}

/* ---------- Saldos e movimentações + Diário de Investimentos ---------- */

function journalInputOf(j: JournalEntry): JournalInput {
  return { date: j.date, assetId: j.assetId, decision: j.decision, justification: j.justification, expectation: j.expectation, scenario: j.scenario, risks: j.risks, learning: j.learning, reviewOn: j.reviewOn, outcome: j.outcome, comparison: j.comparison };
}

interface DecisionDraft {
  decision: string;
  assetId: string;
  reviewOn: string;
}

function Journal() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const data = useFinance();
  const all = useLiveQuery(() => getDb().finJournal.toArray(), []);
  const [draft, setDraft] = useStationMemory<DecisionDraft>('finance.decision', () => ({ decision: '', assetId: '', reviewOn: '' }));
  const today = todayKey();
  const assets = [...data.assets, ...data.archived];
  const moves = useMemo(
    () =>
      assets
        .flatMap((a) => data.txsOf(a.id).map((tx) => ({ tx, asset: a })))
        .sort((x, y) => y.tx.date.localeCompare(x.tx.date) || y.tx.createdAt.localeCompare(x.tx.createdAt))
        .slice(0, 8),
    [data],
  );
  if (data.loading || !all) return <LoadingState label={t('common.loading')} lines={3} />;
  const live = all.filter((j) => !j.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
  const toReview = live.filter((j) => !j.reviewedAt && j.reviewOn && j.reviewOn <= today);
  const name = (id: string | null) => (id ? assets.find((a) => a.id === id)?.name : undefined);
  const create = async () => {
    const decision = draft.decision.trim();
    if (!decision) return;
    try {
      await saveJournal(null, { date: today, assetId: draft.assetId || null, decision, justification: '', expectation: '', scenario: '', risks: '', learning: '', reviewOn: draft.reviewOn || null, outcome: '', comparison: null }, today);
      setDraft({ decision: '', assetId: '', reviewOn: '' });
      toast.show(t('finance.saved'));
    } catch {
      toast.show(t('finance.errors.invalid'), 'error');
    }
  };
  const compare = (j: JournalEntry, comparison: JournalEntry['comparison']) =>
    void saveJournal(j.id, { ...journalInputOf(j), comparison }, today).then(
      () => toast.show(t('finance.saved')),
      () => toast.show(t('finance.errors.invalid'), 'error'),
    );
  return (
    <>
      <SectionTitle>{t('finance.transactions')}</SectionTitle>
      {moves.length === 0 ? (
        <Empty>{t('finance.noTx')}</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-line/60">
          {moves.map(({ tx, asset }) => (
            <li key={tx.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="w-16 shrink-0 text-xs text-muted">{formatDateKey(tx.date, settings.locale)}</span>
              <span className="min-w-0 flex-1 truncate text-fg">
                {asset.name} <span className="text-xs text-muted">· {t(`finance.txTypes.${tx.type}`)}</span>
              </span>
              <Money value={tx.type === 'buy' || tx.type === 'sell' ? tx.quantity * tx.price : tx.amount} currency={asset.currency} />
            </li>
          ))}
        </ul>
      )}

      {toReview.length > 0 && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <BellRing className="h-3.5 w-3.5 text-warning" aria-hidden />
              {t('finance.journal.toReview', { count: toReview.length })}
            </span>
          </SectionTitle>
          <ul className="flex flex-col gap-1.5">
            {toReview.map((j) => (
              <li key={j.id} className={cn(rowClass, 'flex flex-col gap-1.5')}>
                <span className="text-sm text-fg">{j.decision}</span>
                <span className="text-xs text-muted">{[formatDateKey(j.date, settings.locale), name(j.assetId)].filter(Boolean).join(' · ')}</span>
                {j.expectation && <span className="text-xs text-muted">{t('finance.journal.expectedLine', { text: j.expectation })}</span>}
                <Select aria-label={`${t('finance.journal.fields.comparison')}: ${j.decision}`} value="" onChange={(e) => e.target.value && compare(j, e.target.value as NonNullable<JournalEntry['comparison']>)} className="h-8 w-auto text-xs">
                  <option value="">{t('finance.journal.fields.comparison')}</option>
                  {(['better', 'asExpected', 'worse'] as const).map((c) => (
                    <option key={c} value={c}>
                      {t(`finance.journal.comparisons.${c}`)}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>{t('finance.journal.new')}</SectionTitle>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input aria-label={t('finance.journal.fields.decision')} placeholder={t('finance.journal.placeholders.decision')} value={draft.decision} maxLength={500} onChange={(e) => setDraft((d) => ({ ...d, decision: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('finance.journal.fields.asset')}
            <Select value={draft.assetId} onChange={(e) => setDraft((d) => ({ ...d, assetId: e.target.value }))}>
              <option value="">—</option>
              {data.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('finance.journal.fields.reviewOn')}
            <Input type="date" min={today} value={draft.reviewOn} onChange={(e) => setDraft((d) => ({ ...d, reviewOn: e.target.value }))} />
          </label>
        </div>
        <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!draft.decision.trim()}>
          {t('finance.journal.new')}
        </Button>
      </form>

      <SectionTitle>{t('park.native.east.finance.recentDecisions')}</SectionTitle>
      {live.length === 0 ? (
        <Empty>{t('finance.journal.empty')}</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {live.slice(0, 5).map((j) => (
            <li key={j.id} className={cn(rowClass, 'flex items-center gap-2')}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{j.decision}</span>
                <span className="block text-xs text-muted">{[formatDateKey(j.date, settings.locale), name(j.assetId)].filter(Boolean).join(' · ')}</span>
              </span>
              {j.comparison ? <Badge tone={j.comparison === 'better' ? 'success' : j.comparison === 'worse' ? 'danger' : 'info'}>{t(`finance.journal.comparisons.${j.comparison}`)}</Badge> : <Badge>{t('finance.journal.open')}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------- Planejamento: orçamento do mês e reserva ---------- */

interface EntryDraft {
  categoryId: string;
  amount: string;
  description: string;
}

interface CategoryDraft {
  name: string;
  kind: 'income' | 'expense';
  planned: string;
}

function Planning() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [prefs, setPrefs] = useState<PlanPrefs | null>(null);
  const cats = useLiveQuery(() => getDb().budgetCategories.toArray(), []);
  const entries = useLiveQuery(() => getDb().budgetEntries.toArray(), []);
  const [entry, setEntry] = useStationMemory<EntryDraft>('finance.entry', () => ({ categoryId: '', amount: '', description: '' }));
  const [cat, setCat] = useStationMemory<CategoryDraft>('finance.category', () => ({ name: '', kind: 'expense', planned: '' }));
  useEffect(() => {
    void loadPlanPrefs().then(setPrefs);
  }, []);
  if (!prefs || !cats || !entries) return <LoadingState label={t('common.loading')} lines={3} />;
  const today = todayKey();
  const month = today.slice(0, 7);
  const liveCats = cats.filter((c) => !c.deletedAt);
  const m = budgetMonth(liveCats, entries.filter((e) => !e.deletedAt), month);
  const cur = prefs.currency;
  const r = reserveTarget(prefs.reserve.monthlyCost, prefs.reserve.months, prefs.reserve.saved);
  const categoryId = liveCats.some((c) => c.id === entry.categoryId) ? entry.categoryId : (liveCats[0]?.id ?? '');
  const enable = () => {
    const next = { ...prefs, budgetEnabled: true };
    void savePlanPrefs(next).then(
      () => setPrefs(next),
      () => toast.show(t('errors.saveFailed'), 'error'),
    );
  };
  const addEntry = async () => {
    try {
      await saveBudgetEntry(null, today, categoryId, num(entry.amount), entry.description, today);
      setEntry((d) => ({ ...d, amount: '', description: '' }));
      toast.show(t('finance.saved'));
    } catch {
      toast.show(t('finance.errors.invalid'), 'error');
    }
  };
  const addCategory = async () => {
    try {
      await saveBudgetCategory(null, cat.name, cat.kind, cat.planned.trim() === '' ? 0 : num(cat.planned));
      setCat({ name: '', kind: cat.kind, planned: '' });
      toast.show(t('finance.saved'));
    } catch (e) {
      toast.show(e instanceof FinanceRuleError && e.code === 'duplicate' ? t('finance.plan.errors.duplicateCategory') : t('finance.errors.invalid'), 'error');
    }
  };
  const monthName = new Intl.DateTimeFormat(settings.locale, { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00`));
  return (
    <>
      {r.target > 0 && (
        <div className={cn(rowClass, 'flex flex-col gap-1.5')}>
          <span className="text-xs font-semibold uppercase tracking-wide text-subtle">{t('finance.plan.reserve')}</span>
          <span className="text-sm text-fg">
            {t('finance.plan.target')}: <Money value={r.target} currency={cur} className="font-semibold" /> · {t('finance.plan.missing')}: <Money value={r.missing} currency={cur} />
          </span>
          <span className="block h-2 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${r.percent ?? 0}%` }} />
          </span>
          <span className="text-xs text-muted">{t('finance.plan.reservePercent', { pct: r.percent ?? 0 })}</span>
        </div>
      )}

      <SectionTitle>{`${t('park.native.east.finance.budgetOf')} ${monthName}`}</SectionTitle>
      {!prefs.budgetEnabled ? (
        <>
          <Empty>{t('park.native.east.finance.budgetOff')}</Empty>
          <Button variant="secondary" className="self-start" onClick={enable}>
            {t('finance.plan.budget')}
          </Button>
        </>
      ) : (
        <>
          {liveCats.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(['income', 'expense'] as const).map((k) => (
                  <div key={k} className={rowClass}>
                    <span className="block text-xs text-muted">{t(`finance.plan.kinds.${k}`)}</span>
                    <Money value={m[k].actual} currency={cur} className="text-base font-semibold" />
                    <span className="block text-xs text-muted">
                      {t('finance.plan.of')} <Money value={m[k].planned} currency={cur} />
                    </span>
                  </div>
                ))}
              </div>
              <ul className="flex flex-col gap-2">
                {m.rows.map(({ category, planned, actual }) => {
                  const over = category.kind === 'expense' && planned > 0 && actual > planned;
                  return (
                    <li key={category.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-fg">{category.name}</span>
                        <span className={cn('text-xs', over ? 'text-danger' : 'text-muted')}>
                          <Money value={actual} currency={cur} /> / <Money value={planned} currency={cur} />
                        </span>
                      </div>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <span className={cn('block h-full rounded-full', over ? 'bg-danger' : category.kind === 'income' ? 'bg-success' : 'bg-brand')} style={{ width: `${planned > 0 ? Math.min(100, (actual / planned) * 100) : actual > 0 ? 100 : 0}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              <SectionTitle>{t('park.native.east.finance.registerToday')}</SectionTitle>
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addEntry();
                }}
              >
                <div className="grid grid-cols-2 gap-2">
                  <Select aria-label={t('finance.plan.category')} value={categoryId} onChange={(e) => setEntry((d) => ({ ...d, categoryId: e.target.value }))}>
                    {liveCats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`${c.name} (${t(`finance.plan.kinds.${c.kind}`)})`}
                      </option>
                    ))}
                  </Select>
                  <Input aria-label={`${t('finance.plan.amount')} (${cur})`} placeholder={`${t('finance.plan.amount')} (${cur})`} inputMode="decimal" value={entry.amount} onChange={(e) => setEntry((d) => ({ ...d, amount: e.target.value }))} />
                </div>
                <Input aria-label={t('finance.plan.description')} placeholder={t('finance.plan.description')} maxLength={200} value={entry.description} onChange={(e) => setEntry((d) => ({ ...d, description: e.target.value }))} />
                <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!categoryId || !(num(entry.amount) > 0)}>
                  {t('finance.plan.newEntry')}
                </Button>
              </form>
            </>
          )}
          <SectionTitle>{t('finance.plan.newCategory')}</SectionTitle>
          {liveCats.length === 0 && <Empty>{t('finance.plan.noCategories')}</Empty>}
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addCategory();
            }}
          >
            <Input aria-label={t('finance.plan.categoryName')} placeholder={t('finance.plan.categoryPlaceholder')} maxLength={80} value={cat.name} onChange={(e) => setCat((d) => ({ ...d, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Select aria-label={t('finance.plan.kind')} value={cat.kind} onChange={(e) => setCat((d) => ({ ...d, kind: e.target.value as 'income' | 'expense' }))}>
                <option value="expense">{t('finance.plan.kinds.expense')}</option>
                <option value="income">{t('finance.plan.kinds.income')}</option>
              </Select>
              <Input aria-label={t('finance.plan.planned')} placeholder={t('finance.plan.planned')} inputMode="decimal" value={cat.planned} onChange={(e) => setCat((d) => ({ ...d, planned: e.target.value }))} />
            </div>
            <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!cat.name.trim()}>
              {t('finance.plan.newCategory')}
            </Button>
          </form>
        </>
      )}
    </>
  );
}

/* ---------- Academia Financeira: estudos em andamento e revisão do glossário ---------- */

function learningInputOf(i: FinLearning) {
  return { kind: i.kind, title: i.title, body: i.body, courseId: i.courseId, status: i.status, provider: i.provider, url: i.url, date: i.date };
}

function Academy() {
  const { t } = useSettings();
  const toast = useToast();
  const items = useLiveQuery(() => getDb().finLearning.toArray(), []);
  const terms = useLiveQuery(() => getDb().finTerms.toArray(), []);
  const [note, setNote] = useStationMemory<string>('finance.learning', () => '');
  const [seen, setSeen] = useState<string[]>([]);
  const [shown, setShown] = useState(false);
  const today = todayKey();
  const liveTerms = useMemo(() => (terms ?? []).filter((x) => !x.deletedAt), [terms]);
  // A fila do dia, sem repetir na mesma visita o que já foi respondido.
  const queue = useMemo(() => sessionQueue(liveTerms, today, { newLimit: 20, reviewLimit: 100 }).filter((x) => !seen.includes(x.id)), [liveTerms, today, seen]);
  if (!items || !terms) return <LoadingState label={t('common.loading')} lines={3} />;
  const live = items.filter((i) => !i.deletedAt);
  const studying = live.filter((i) => (i.kind === 'course' || i.kind === 'lesson') && i.status !== 'done').sort((a, b) => (a.status === 'doing' ? -1 : 1) - (b.status === 'doing' ? -1 : 1) || a.title.localeCompare(b.title));
  const due = liveTerms.filter((x) => isDue(x.srs, today)).length;
  const card = queue[0];
  const setStatus = (i: FinLearning, status: LearnStatus) => void saveLearning(i.id, { ...learningInputOf(i), status }).catch(() => toast.show(t('finance.errors.invalid'), 'error'));
  const answer = (r: Rating) => {
    if (!card) return;
    void answerTerm(card.id, r, today).then(
      () => {
        setSeen((s) => [...s, card.id]);
        setShown(false);
      },
      () => toast.show(t('errors.saveFailed'), 'error'),
    );
  };
  const addLearning = async () => {
    const title = note.trim();
    if (!title) return;
    try {
      await saveLearning(null, { ...emptyLearningInput('learning'), title: title.slice(0, 160), date: today });
      setNote('');
      toast.show(t('finance.saved'));
    } catch {
      toast.show(t('finance.errors.invalid'), 'error');
    }
  };
  return (
    <>
      <SectionTitle>{`${t('finance.academy.reviewTitle')} · ${due}`}</SectionTitle>
      {card ? (
        <div className={cn(rowClass, 'flex flex-col items-center gap-3 p-4 text-center')}>
          <span className="text-lg font-semibold text-fg">{card.term}</span>
          {shown ? (
            <>
              <p className="whitespace-pre-wrap text-sm text-fg">{card.definition}</p>
              {card.example && <p className="text-xs italic text-muted">{card.example}</p>}
              <div className="grid w-full grid-cols-2 gap-1.5">
                {RATINGS.map((r) => (
                  <Button key={r} size="sm" variant="secondary" onClick={() => answer(r)} className="flex-col">
                    <span>{t(`academy.review.ratings.${r}`)}</span>
                    <span className="text-[0.6875rem] text-muted">{t('finance.academy.inDays', { count: previewIntervals(card.srs, today)[r] })}</span>
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-muted">{t('finance.academy.recall')}</span>
              <Button size="sm" variant="primary" onClick={() => setShown(true)}>
                {t('finance.academy.showAnswer')}
              </Button>
            </>
          )}
        </div>
      ) : (
        <Empty>{seen.length ? t('finance.academy.reviewDone', { count: seen.length }) : liveTerms.length ? t('park.native.east.finance.noTermsDue') : t('park.native.east.finance.noTerms')}</Empty>
      )}

      <SectionTitle>{t('park.native.east.finance.studying')}</SectionTitle>
      {studying.length === 0 ? (
        <Empty>{t('park.native.east.finance.noStudying')}</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {studying.map((i) => (
            <li key={i.id} className={cn(rowClass, 'flex items-center gap-2')}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{i.title}</span>
                <span className="block text-xs text-muted">{t(`finance.academy.sections.${i.kind === 'course' ? 'course' : 'lesson'}`)}</span>
              </span>
              <Select aria-label={`${t('finance.academy.fields.status')}: ${i.title}`} value={i.status} onChange={(e) => setStatus(i, e.target.value as LearnStatus)} className="h-8 w-auto text-xs">
                {LEARN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`finance.academy.statuses.${s}`)}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>{t('finance.academy.new.learning')}</SectionTitle>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addLearning();
        }}
      >
        <Input aria-label={t('finance.academy.new.learning')} placeholder={t('park.native.east.finance.learningPlaceholder')} maxLength={160} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!note.trim()}>
          {t('park.native.east.add')}
        </Button>
      </form>
    </>
  );
}

/* ---------- Mercado: registros com fonte (o app não busca nada sozinho) ---------- */

interface MarketDraft {
  kind: MarketKind;
  title: string;
  value: string;
  source: string;
  nature: 'fact' | 'analysis';
}

function Market() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const all = useLiveQuery(() => getDb().marketEntries.toArray(), []);
  const [draft, setDraft] = useStationMemory<MarketDraft>('finance.market', () => ({ kind: 'indicator', title: '', value: '', source: '', nature: 'fact' }));
  const set = (p: Partial<MarketDraft>) => setDraft((d) => ({ ...d, ...p }));
  if (!all) return <LoadingState label={t('common.loading')} lines={3} />;
  const today = todayKey();
  const live = all.filter((e) => !e.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = live.filter((e) => e.kind === 'calendar' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const recent = live.filter((e) => !(e.kind === 'calendar' && e.date >= today)).slice(0, 8);
  const create = async () => {
    try {
      await saveMarket(null, { kind: draft.kind, title: draft.title, value: draft.value, date: today, source: draft.source, url: '', nature: draft.nature, notes: '' });
      setDraft((d) => ({ ...d, title: '', value: '' }));
      toast.show(t('finance.saved'));
    } catch {
      toast.show(t('finance.market.errors.invalid'), 'error');
    }
  };
  return (
    <>
      {upcoming.length > 0 && (
        <>
          <SectionTitle>{t('finance.market.upcoming')}</SectionTitle>
          <ul className="flex flex-col gap-1">
            {upcoming.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="w-20 shrink-0 text-muted">{formatDateKey(e.date, settings.locale)}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{e.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <SectionTitle>{t('park.native.east.finance.recentMarket')}</SectionTitle>
      {recent.length === 0 ? (
        <Empty>{t('finance.market.empty')}</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {recent.map((e) => (
            <li key={e.id} className={cn(rowClass, 'flex flex-col gap-1')}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{e.title}</span>
                {e.value && <span className="text-sm font-semibold tabular-nums text-fg">{e.value}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge tone={e.nature === 'fact' ? 'info' : 'warning'}>{t(`finance.market.natures.${e.nature}`)}</Badge>
                <span>{t(`finance.market.kinds.${e.kind}`)}</span>
                <span>{formatDateKey(e.date, settings.locale)}</span>
                <span className="truncate">{t('finance.market.sourceLine', { source: e.source })}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <SectionTitle>{t('finance.market.new')}</SectionTitle>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label={t('finance.market.fields.kind')} value={draft.kind} onChange={(e) => set({ kind: e.target.value as MarketKind })}>
            {MARKET_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`finance.market.kinds.${k}`)}
              </option>
            ))}
          </Select>
          <Input aria-label={t('finance.market.fields.value')} placeholder={t('finance.market.fields.value')} maxLength={60} value={draft.value} onChange={(e) => set({ value: e.target.value })} />
        </div>
        <Input aria-label={t('finance.market.fields.title')} placeholder={t(`finance.market.placeholders.${draft.kind}`)} maxLength={200} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        <Input aria-label={t('finance.market.fields.source')} placeholder={t('finance.market.sourcePlaceholder')} maxLength={200} value={draft.source} onChange={(e) => set({ source: e.target.value })} />
        <Chips
          label={t('finance.market.fields.nature')}
          value={draft.nature}
          onChange={(nature) => set({ nature })}
          options={[
            { value: 'fact', label: t('finance.market.natures.fact') },
            { value: 'analysis', label: t('finance.market.natures.analysis') },
          ]}
        />
        <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!draft.title.trim() || !draft.source.trim()}>
          {t('finance.market.new')}
        </Button>
      </form>
    </>
  );
}
