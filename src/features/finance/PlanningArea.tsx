import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Plus, ShieldCheck, Target, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { financeHistory, loadPlanPrefs, restoreBudgetCategory, restoreBudgetEntry, saveBudgetCategory, saveBudgetEntry, savePlanPrefs, softDeleteBudgetCategory, softDeleteBudgetEntry, type PlanPrefs } from '@/data/financePlanRepo';
import { FinanceRuleError } from '@/data/financeRepo';
import { capitalizeFirst, formatDateKey, todayKey } from '@/domain/dates';
import { budgetMonth, reserveTarget, type BudgetCategory } from '@/domain/finance';
import { GoalDialog, GoalProgressView, StatusBadge } from '@/features/goals/goalsUi';
import { useGoals } from '@/features/goals/useGoals';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { Money } from './financeUi';

const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')));

/** Planejamento (Parte 16.6): metas financeiras, reserva de emergência, orçamento (se quiser) e histórico. */
export function PlanningArea() {
  const [prefs, setPrefs] = useState<PlanPrefs | null>(null);
  useEffect(() => {
    void loadPlanPrefs().then(setPrefs);
  }, []);
  if (!prefs) return null;
  const update = (p: PlanPrefs) => {
    setPrefs(p);
    void savePlanPrefs(p);
  };
  return (
    <div className="flex flex-col gap-4">
      <FinancialGoals />
      <Reserve prefs={prefs} onChange={update} />
      <Budget prefs={prefs} onChange={update} />
      <History />
    </div>
  );
}

/* ---------- Metas financeiras: são objetivos do Goals (sem duplicar) ---------- */

function FinancialGoals() {
  const { t } = useSettings();
  const data = useGoals();
  const [creating, setCreating] = useState(false);
  const goals = data.goals.filter((g) => g.area === 'financial');
  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-fg">
          <Target className="h-4 w-4 text-accent" aria-hidden />
          {t('finance.plan.goals')}
        </h3>
        <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          {t('finance.plan.newGoal')}
        </Button>
      </div>
      <p className="text-xs text-muted">{t('finance.plan.goalsHint')}</p>
      {goals.length === 0 ? (
        <p className="text-sm text-muted">{t('finance.plan.noGoals')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => (
            <li key={g.id}>
              <Link to={`/goals/${g.id}`} className="flex flex-col gap-1.5 rounded-2xl px-2 py-1.5 transition hover:bg-surface-2/70">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{g.name}</span>
                  <StatusBadge status={g.status} />
                </span>
                <GoalProgressView goal={g} checkins={data.checkinsOf(g.id)} compact />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <GoalDialog preset={{ area: 'financial', type: 'measurable' }} onClose={() => setCreating(false)} />}
    </Surface>
  );
}

/* ---------- Reserva de emergência (educação) ---------- */

function Reserve({ prefs, onChange }: { prefs: PlanPrefs; onChange: (p: PlanPrefs) => void }) {
  const { t } = useSettings();
  const r = prefs.reserve;
  const [cost, setCost] = useState(r.monthlyCost ? String(r.monthlyCost) : '');
  const [saved, setSaved] = useState(r.saved ? String(r.saved) : '');
  const calc = reserveTarget(num(cost), r.months, num(saved));
  const commit = (p: Partial<PlanPrefs['reserve']>) => onChange({ ...prefs, reserve: { ...r, monthlyCost: num(cost), saved: num(saved), ...p } });
  return (
    <Surface className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-semibold text-fg">
        <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
        {t('finance.plan.reserve')}
      </h3>
      <div className="flex flex-col gap-2 rounded-2xl bg-surface-2/60 p-4 text-sm text-fg">
        <p>{t('finance.plan.reserveWhat')}</p>
        <p>{t('finance.plan.reserveHow')}</p>
        <p className="text-muted">{t('finance.plan.reserveWhere')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('finance.plan.monthlyCost', { currency: prefs.currency })}>
          {(id) => <Input id={id} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} onBlur={() => commit({})} />}
        </Field>
        <Field label={t('finance.plan.months')}>
          {(id) => (
            <Select id={id} value={r.months} onChange={(e) => commit({ months: Number(e.target.value) })}>
              {[3, 4, 6, 9, 12].map((m) => (
                <option key={m} value={m}>
                  {t('finance.plan.monthsOption', { n: m })}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('finance.plan.saved', { currency: prefs.currency })}>{(id) => <Input id={id} inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} onBlur={() => commit({})} />}</Field>
      </div>
      {calc.target > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-fg">
              {t('finance.plan.target')}: <Money value={calc.target} currency={prefs.currency} className="font-semibold" />
            </span>
            <span className="text-muted">
              {t('finance.plan.missing')}: <Money value={calc.missing} currency={prefs.currency} />
            </span>
          </div>
          <span className="block h-2 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${calc.percent ?? 0}%` }} />
          </span>
          <span className="text-xs text-muted">{t('finance.plan.reservePercent', { pct: calc.percent ?? 0 })}</span>
        </div>
      ) : (
        <p className="text-xs text-muted">{t('finance.plan.reserveFill')}</p>
      )}
    </Surface>
  );
}

/* ---------- Orçamento (se desejado) ---------- */

function Budget({ prefs, onChange }: { prefs: PlanPrefs; onChange: (p: PlanPrefs) => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [catDialog, setCatDialog] = useState<{ cat?: BudgetCategory } | null>(null);
  const [entryDialog, setEntryDialog] = useState(false);
  const cats = (useLiveQuery(() => getDb().budgetCategories.toArray(), []) ?? []).filter((c) => !c.deletedAt);
  const entries = (useLiveQuery(() => getDb().budgetEntries.toArray(), []) ?? []).filter((e) => !e.deletedAt);
  const m = budgetMonth(cats, entries, month);
  const shift = (n: number) => {
    const [y, mo] = month.split('-').map(Number);
    const d = new Date(y!, mo! - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const cur = prefs.currency;
  const monthEntries = entries.filter((e) => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Surface className="flex flex-col gap-3">
      <Switch checked={prefs.budgetEnabled} onChange={(v) => onChange({ ...prefs, budgetEnabled: v })} label={t('finance.plan.budget')} hint={t('finance.plan.budgetHint')} />
      {prefs.budgetEnabled && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label={t('habits.prev')} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => shift(-1)} />
            <span className="min-w-36 text-center text-sm font-semibold text-fg">{capitalizeFirst(new Intl.DateTimeFormat(settings.locale, { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00`)))}</span>
            <IconButton label={t('habits.next')} icon={<ChevronRight className="h-4 w-4" />} onClick={() => shift(1)} />
            <Select aria-label={t('finance.fields.currency')} value={cur} onChange={(e) => onChange({ ...prefs, currency: e.target.value as PlanPrefs['currency'] })} className="h-9 w-auto">
              {(['BRL', 'USD', 'EUR'] as const).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <span className="flex-1" />
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCatDialog({})}>
              {t('finance.plan.newCategory')}
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!cats.length} onClick={() => setEntryDialog(true)}>
              {t('finance.plan.newEntry')}
            </Button>
          </div>
          {cats.length === 0 ? (
            <p className="text-sm text-muted">{t('finance.plan.noCategories')}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {(['income', 'expense'] as const).map((k) => (
                  <div key={k} className="rounded-2xl bg-surface-2/60 p-3">
                    <span className="block text-xs text-muted">{t(`finance.plan.kinds.${k}`)}</span>
                    <Money value={m[k].actual} currency={cur} className="text-lg font-semibold" />
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
                        <button type="button" className="min-w-0 flex-1 truncate text-left text-fg hover:text-accent" onClick={() => setCatDialog({ cat: category })}>
                          {category.name}
                        </button>
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
              {monthEntries.length > 0 && (
                <ul className="flex flex-col divide-y divide-line/60">
                  {monthEntries.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="w-20 text-muted">{formatDateKey(e.date, settings.locale)}</span>
                      <span className="min-w-0 flex-1 truncate text-fg">{e.description || cats.find((c) => c.id === e.categoryId)?.name}</span>
                      <Money value={e.amount} currency={cur} />
                      <IconButton label={t('finance.remove')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void softDeleteBudgetEntry(e.id).then(() => toast.show(t('finance.plan.entryRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreBudgetEntry(e.id) }))} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
      {catDialog && <CategoryDialog cat={catDialog.cat} onClose={() => setCatDialog(null)} />}
      {entryDialog && <EntryDialog cats={cats} onClose={() => setEntryDialog(false)} />}
    </Surface>
  );
}

function CategoryDialog({ cat, onClose }: { cat?: BudgetCategory; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState(cat?.name ?? '');
  const [kind, setKind] = useState<'income' | 'expense'>(cat?.kind ?? 'expense');
  const [planned, setPlanned] = useState(cat ? String(cat.planned) : '');
  const save = async () => {
    try {
      await saveBudgetCategory(cat?.id ?? null, name, kind, num(planned));
      toast.show(t('finance.saved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof FinanceRuleError && e.code === 'duplicate' ? t('finance.plan.errors.duplicateCategory') : t('finance.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={cat ? t('finance.plan.editCategory') : t('finance.plan.newCategory')}
      footer={
        <>
          {cat && (
            <Button
              variant="danger"
              className="mr-auto"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() =>
                void softDeleteBudgetCategory(cat.id).then(() => {
                  toast.show(t('finance.plan.categoryRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreBudgetCategory(cat.id) });
                  onClose();
                })
              }
            >
              {t('finance.remove')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('finance.plan.categoryName')}>{(id) => <Input id={id} autoFocus value={name} maxLength={80} placeholder={t('finance.plan.categoryPlaceholder')} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('finance.plan.kind')}>
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as 'income' | 'expense')}>
              <option value="expense">{t('finance.plan.kinds.expense')}</option>
              <option value="income">{t('finance.plan.kinds.income')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('finance.plan.planned')}>{(id) => <Input id={id} inputMode="decimal" value={planned} onChange={(e) => setPlanned(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

function EntryDialog({ cats, onClose }: { cats: BudgetCategory[]; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const save = async () => {
    try {
      await saveBudgetEntry(null, date, categoryId, num(amount), description, today);
      toast.show(t('finance.saved'));
      onClose();
    } catch {
      toast.show(t('finance.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('finance.plan.newEntry')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!amount.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('finance.fields.date')}>{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        <Field label={t('finance.plan.category')}>
          {(id) => (
            <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {t(`finance.plan.kinds.${c.kind}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('finance.plan.amount')}>{(id) => <Input id={id} autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label={t('finance.plan.description')} optionalLabel={t('common.optional')}>
          {(id) => <Input id={id} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------- Histórico ---------- */

function History() {
  const { t, settings } = useSettings();
  const changes = useLiveQuery(() => financeHistory(60), []) ?? [];
  return (
    <Surface className="flex flex-col gap-2">
      <h3 className="font-semibold text-fg">{t('finance.plan.history')}</h3>
      {changes.length === 0 ? (
        <p className="text-sm text-muted">{t('finance.plan.noHistory')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {changes.map((c) => (
            <li key={c.seq ?? c.at} className="flex gap-3 text-sm">
              <span className="w-28 shrink-0 text-muted">{new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(c.at))}</span>
              <span className="text-fg">
                {t(`finance.plan.entities.${c.entityType as 'finAsset'}`)} · {t(`finance.plan.actions.${(['create', 'delete', 'restore'].includes(c.action) ? c.action : 'update') as 'create'}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
