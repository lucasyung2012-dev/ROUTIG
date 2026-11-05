import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, ExternalLink, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { restoreMarket, saveMarket, softDeleteMarket } from '@/data/financeLearnRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import { MARKET_KINDS, type MarketEntry, type MarketInput, type MarketKind } from '@/domain/finance';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { EmptyState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

/**
 * Mercado (Parte 16.5): notícias, indicadores, inflação, juros, moedas, índices, calendário econômico e cenários.
 * Tudo registrado por você, sempre com data e origem, separando fato de análise. Nada é buscado automaticamente.
 */
export function MarketArea() {
  const { t, settings } = useSettings();
  const [kind, setKind] = useState<MarketKind | 'all'>('all');
  const [editing, setEditing] = useState<{ entry?: MarketEntry } | null>(null);
  const all = useLiveQuery(() => getDb().marketEntries.toArray(), []) ?? [];
  const today = todayKey();
  const live = all.filter((e) => !e.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = live.filter((e) => e.kind === 'calendar' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const shown = live.filter((e) => (kind === 'all' ? !(e.kind === 'calendar' && e.date >= today) : e.kind === kind));
  const trash = all.filter((e) => e.deletedAt);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({})}>
          {t('finance.market.new')}
        </Button>
        <Select aria-label={t('finance.market.filter')} value={kind} onChange={(e) => setKind(e.target.value as MarketKind | 'all')} className="h-9 w-auto">
          <option value="all">{t('finance.market.all')}</option>
          {MARKET_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`finance.market.kinds.${k}`)}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-sm text-muted">{t('finance.market.hint')}</p>
      {kind === 'all' && upcoming.length > 0 && (
        <Surface className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-fg">
            <CalendarClock className="h-4 w-4 text-accent" aria-hidden />
            {t('finance.market.upcoming')}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setEditing({ entry: e })} className="flex w-full gap-3 text-left text-sm hover:text-accent">
                  <span className="w-24 shrink-0 text-muted">{formatDateKey(e.date, settings.locale)}</span>
                  <span className="text-fg">{e.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </Surface>
      )}
      {shown.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('finance.market.emptyTitle')} body={t('finance.market.empty')} />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setEditing({ entry: e })} className="flex w-full flex-col gap-1 rounded-2xl bg-surface p-4 text-left shadow-soft ring-1 ring-line/70 transition hover:shadow-lift">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge>{t(`finance.market.kinds.${e.kind}`)}</Badge>
                  <Badge tone={e.nature === 'fact' ? 'info' : 'warning'}>{t(`finance.market.natures.${e.nature}`)}</Badge>
                  <span className="text-xs text-muted">{formatDateKey(e.date, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <span className="font-medium text-fg">
                  {e.title}
                  {e.value && <span className="ml-2 tabular text-accent">{e.value}</span>}
                </span>
                {e.notes && <span className="line-clamp-3 whitespace-pre-wrap text-sm text-muted">{e.notes}</span>}
                <span className="text-xs text-subtle">{t('finance.market.sourceLine', { source: e.source })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('finance.trash')}</h3>
          {trash.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{e.title}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreMarket(e.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}
      {editing && <MarketDialog entry={editing.entry} defaultKind={kind === 'all' ? 'news' : kind} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MarketDialog({ entry, defaultKind, onClose }: { entry?: MarketEntry; defaultKind: MarketKind; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<MarketInput>(() => (entry ? { kind: entry.kind, title: entry.title, value: entry.value, date: entry.date, source: entry.source, url: entry.url, nature: entry.nature, notes: entry.notes } : { kind: defaultKind, title: '', value: '', date: todayKey(), source: '', url: '', nature: 'fact', notes: '' }));
  const set = (p: Partial<MarketInput>) => setInput((i) => ({ ...i, ...p }));
  const save = async () => {
    try {
      await saveMarket(entry?.id ?? null, input);
      toast.show(t('finance.saved'));
      onClose();
    } catch {
      toast.show(t('finance.market.errors.invalid'), 'error');
    }
  };
  const remove = async () => {
    if (!entry) return;
    await softDeleteMarket(entry.id);
    toast.show(t('finance.market.removed'), 'success', { label: t('notes.undo'), run: () => void restoreMarket(entry.id) });
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={entry ? t('finance.market.edit') : t('finance.market.new')}
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
          <Button variant="primary" disabled={!input.title.trim() || !input.source.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('finance.market.fields.kind')}>
            {(id) => (
              <Select id={id} value={input.kind} onChange={(e) => set({ kind: e.target.value as MarketKind })}>
                {MARKET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`finance.market.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={input.kind === 'calendar' ? t('finance.market.fields.eventDate') : t('finance.market.fields.date')}>
            {(id) => <Input id={id} type="date" value={input.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />}
          </Field>
        </div>
        <Field label={t('finance.market.fields.title')}>{(id) => <Input id={id} autoFocus value={input.title} maxLength={200} placeholder={t(`finance.market.placeholders.${input.kind}`)} onChange={(e) => set({ title: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('finance.market.fields.value')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} value={input.value} maxLength={60} placeholder="10,50% a.a." onChange={(e) => set({ value: e.target.value })} />}
          </Field>
          <Field label={t('finance.market.fields.nature')}>
            {() => (
              <Segmented<'fact' | 'analysis'> label={t('finance.market.fields.nature')} value={input.nature} onChange={(nature) => set({ nature })} options={[{ value: 'fact', label: t('finance.market.natures.fact') }, { value: 'analysis', label: t('finance.market.natures.analysis') }]} />
            )}
          </Field>
        </div>
        <p className="text-xs text-muted">{t('finance.market.natureHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('finance.market.fields.source')} hint={t('finance.market.sourceHint')}>
            {(id, d) => <Input id={id} aria-describedby={d} value={input.source} maxLength={200} placeholder={t('finance.market.sourcePlaceholder')} onChange={(e) => set({ source: e.target.value })} />}
          </Field>
          <Field label={t('finance.market.fields.url')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} type="url" inputMode="url" value={input.url} placeholder="https://" onChange={(e) => set({ url: e.target.value.trim() })} />}
          </Field>
        </div>
        <Field label={t('finance.market.fields.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={4} maxLength={10000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
        {entry?.url && (
          <a href={entry.url} target="_blank" rel="noreferrer" className={cn('inline-flex w-fit items-center gap-1 text-sm text-accent hover:underline')}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t('finance.academy.openLink')}
          </a>
        )}
      </div>
    </Dialog>
  );
}
