import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BellRing, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { restoreJournal, saveJournal, softDeleteJournal } from '@/data/financePlanRepo';
import { FinanceRuleError } from '@/data/financeRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import type { FinAsset, JournalEntry, JournalInput } from '@/domain/finance';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { EmptyState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

/** Diário de Investimentos (Parte 16.7): decisão, por quê, o que esperava e, depois, o que aconteceu. */
export function JournalArea({ assets }: { assets: FinAsset[] }) {
  const { t, settings } = useSettings();
  const [editing, setEditing] = useState<{ entry?: JournalEntry } | null>(null);
  const all = useLiveQuery(() => getDb().finJournal.toArray(), []) ?? [];
  const today = todayKey();
  const live = all.filter((j) => !j.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
  const toReview = live.filter((j) => !j.reviewedAt && j.reviewOn && j.reviewOn <= today);
  const trash = all.filter((j) => j.deletedAt);
  const assetName = (id: string | null) => (id ? assets.find((a) => a.id === id)?.name : undefined);
  return (
    <div className="flex flex-col gap-4">
      <Button variant="primary" size="sm" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({})}>
        {t('finance.journal.new')}
      </Button>
      <p className="text-sm text-muted">{t('finance.journal.hint')}</p>
      {toReview.length > 0 && (
        <Surface className="flex flex-col gap-2 ring-1 ring-warning/40">
          <h3 className="flex items-center gap-2 font-semibold text-fg">
            <BellRing className="h-4 w-4 text-warning" aria-hidden />
            {t('finance.journal.toReview', { count: toReview.length })}
          </h3>
          <ul className="flex flex-col gap-1">
            {toReview.map((j) => (
              <li key={j.id}>
                <button type="button" onClick={() => setEditing({ entry: j })} className="text-left text-sm text-fg hover:text-accent">
                  {j.decision} · <span className="text-muted">{formatDateKey(j.date, settings.locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Surface>
      )}
      {live.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('finance.journal.emptyTitle')} body={t('finance.journal.empty')} />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-3">
          {live.map((j) => (
            <li key={j.id}>
              <button type="button" onClick={() => setEditing({ entry: j })} className="flex w-full flex-col gap-1.5 rounded-2xl bg-surface p-4 text-left shadow-soft ring-1 ring-line/70 transition hover:shadow-lift">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted">{formatDateKey(j.date, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {assetName(j.assetId) && <Badge>{assetName(j.assetId)}</Badge>}
                  {j.comparison ? <Badge tone={j.comparison === 'better' ? 'success' : j.comparison === 'worse' ? 'danger' : 'info'}>{t(`finance.journal.comparisons.${j.comparison}`)}</Badge> : <Badge>{t('finance.journal.open')}</Badge>}
                </div>
                <span className="font-semibold text-fg">{j.decision}</span>
                {j.expectation && <span className="text-sm text-muted">{t('finance.journal.expectedLine', { text: j.expectation })}</span>}
                {j.outcome && <span className="text-sm text-fg">{t('finance.journal.outcomeLine', { text: j.outcome })}</span>}
                {j.learning && <span className="text-sm text-success">{t('finance.journal.learningLine', { text: j.learning })}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('finance.trash')}</h3>
          {trash.map((j) => (
            <div key={j.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{j.decision}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreJournal(j.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}
      {editing && <JournalDialog entry={editing.entry} assets={assets} onClose={() => setEditing(null)} />}
    </div>
  );
}

function JournalDialog({ entry, assets, onClose }: { entry?: JournalEntry; assets: FinAsset[]; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [input, setInput] = useState<JournalInput>(() =>
    entry
      ? { date: entry.date, assetId: entry.assetId, decision: entry.decision, justification: entry.justification, expectation: entry.expectation, scenario: entry.scenario, risks: entry.risks, learning: entry.learning, reviewOn: entry.reviewOn, outcome: entry.outcome, comparison: entry.comparison }
      : { date: today, assetId: null, decision: '', justification: '', expectation: '', scenario: '', risks: '', learning: '', reviewOn: null, outcome: '', comparison: null },
  );
  const set = (p: Partial<JournalInput>) => setInput((i) => ({ ...i, ...p }));
  const save = async () => {
    try {
      await saveJournal(entry?.id ?? null, input, today);
      toast.show(t('finance.saved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof FinanceRuleError && e.code === 'future' ? t('finance.errors.future') : t('finance.errors.invalid'), 'error');
    }
  };
  const remove = async () => {
    if (!entry) return;
    await softDeleteJournal(entry.id);
    toast.show(t('finance.journal.removed'), 'success', { label: t('notes.undo'), run: () => void restoreJournal(entry.id) });
    onClose();
  };
  const text = (k: 'justification' | 'expectation' | 'scenario' | 'risks', rows = 2) => (
    <Field label={t(`finance.journal.fields.${k}`)} optionalLabel={t('common.optional')}>
      {(id) => <Textarea id={id} rows={rows} maxLength={10000} value={input[k]} placeholder={t(`finance.journal.placeholders.${k}`)} onChange={(e) => set({ [k]: e.target.value })} />}
    </Field>
  );
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={entry ? t('finance.journal.edit') : t('finance.journal.new')}
      footer={
        <>
          {entry && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('finance.remove')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.decision.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('finance.fields.date')}>{(id) => <Input id={id} type="date" value={input.date} max={today} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
          <Field label={t('finance.journal.fields.asset')} optionalLabel={t('common.optional')}>
            {(id) => (
              <Select id={id} value={input.assetId ?? ''} onChange={(e) => set({ assetId: e.target.value || null })}>
                <option value="">—</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('finance.journal.fields.decision')}>{(id) => <Input id={id} autoFocus value={input.decision} maxLength={500} placeholder={t('finance.journal.placeholders.decision')} onChange={(e) => set({ decision: e.target.value })} />}</Field>
        {text('justification', 3)}
        {text('expectation')}
        {text('scenario')}
        {text('risks')}
        <Field label={t('finance.journal.fields.reviewOn')} optionalLabel={t('common.optional')} hint={t('finance.journal.reviewOnHint')}>
          {(id, d) => <Input id={id} aria-describedby={d} type="date" value={input.reviewOn ?? ''} onChange={(e) => set({ reviewOn: e.target.value || null })} className="w-44" />}
        </Field>
        <section className="flex flex-col gap-3 rounded-2xl bg-surface-2/60 p-4">
          <h3 className="text-sm font-semibold text-fg">{t('finance.journal.later')}</h3>
          <Field label={t('finance.journal.fields.outcome')} optionalLabel={t('common.optional')}>
            {(id) => <Textarea id={id} rows={2} maxLength={10000} value={input.outcome} placeholder={t('finance.journal.placeholders.outcome')} onChange={(e) => set({ outcome: e.target.value })} />}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">{t('finance.journal.fields.comparison')}</span>
            <div className="flex flex-wrap gap-1.5">
              {(['better', 'asExpected', 'worse'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={input.comparison === c}
                  onClick={() => set({ comparison: input.comparison === c ? null : c })}
                  className={cn('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', input.comparison === c ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface text-muted ring-line')}
                >
                  {t(`finance.journal.comparisons.${c}`)}
                </button>
              ))}
            </div>
          </div>
          <Field label={t('finance.journal.fields.learning')} optionalLabel={t('common.optional')}>
            {(id) => <Textarea id={id} rows={2} maxLength={10000} value={input.learning} onChange={(e) => set({ learning: e.target.value })} />}
          </Field>
        </section>
      </div>
    </Dialog>
  );
}
