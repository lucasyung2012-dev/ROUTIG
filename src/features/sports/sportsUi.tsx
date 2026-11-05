import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { restoreActivity, restoreSportItem, saveActivity, saveSportItem, softDeleteActivity, softDeleteSportItem, SportRuleError } from '@/data/sportsRepo';
import { todayKey } from '@/domain/dates';
import {
  ACTIVITY_TYPES,
  activityInputOf,
  emptyActivityInput,
  OUTCOMES,
  type ActivityInput,
  type ActivityType,
  type Sport,
  type SportActivity,
  type SportItem,
  type SportItemCategory,
  type SportItemInput,
} from '@/domain/sports';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

export function Dots({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`${label}: ${n}`}
          onClick={() => onChange(value === n ? null : n)}
          className={cn('h-10 w-10 rounded-xl text-sm font-semibold ring-1 ring-inset transition', value !== null && n <= value ? 'bg-brand text-white ring-transparent' : 'bg-surface-2 text-muted ring-line hover:bg-surface-3')}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Registro rápido (Parte 12.3): tipo, data e duração na frente; o resto em "mais detalhes". */
export function ActivityDialog({ sport, activity, type, items, onClose }: { sport: Sport; activity?: SportActivity; type?: ActivityType; items: SportItem[]; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [input, setInput] = useState<ActivityInput>(() => (activity ? activityInputOf(activity) : emptyActivityInput(sport.id, type ?? 'training', today)));
  const [more, setMore] = useState(!!activity);
  const set = (p: Partial<ActivityInput>) => setInput((i) => ({ ...i, ...p }));
  const competitive = input.type === 'match' || input.type === 'tournament';
  const skillItems = items.filter((i) => i.category !== 'position');
  const positions = items.filter((i) => i.category === 'position');

  const save = async () => {
    try {
      await saveActivity(activity?.id ?? null, input, today);
      toast.show(t('sports.saved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof SportRuleError && e.code === 'future' ? t('sports.errors.future') : t('sports.errors.invalid'), 'error');
    }
  };
  const remove = async () => {
    if (!activity) return;
    await softDeleteActivity(activity.id);
    toast.show(t('sports.activityRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreActivity(activity.id) });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={activity ? t('sports.editActivity') : t('sports.newActivity')}
      description={sport.name}
      footer={
        <>
          {activity && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('sports.remove')}
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
        <Segmented<ActivityType> label={t('sports.fields.type')} value={input.type} onChange={(v) => set({ type: v })} options={ACTIVITY_TYPES.map((a) => ({ value: a, label: t(`sports.types.${a}`) }))} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('sports.fields.date')}>{(id) => <Input id={id} type="date" value={input.date} max={today} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
          <Field label={t('sports.fields.duration')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={1440} value={input.durationMin ?? ''} placeholder="min" onChange={(e) => set({ durationMin: e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null })} />}
          </Field>
          <Field label={input.type === 'training' ? t('sports.fields.trainingType') : input.type === 'match' ? t('sports.fields.matchTitle') : t('sports.fields.eventName')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} value={input.title} maxLength={120} placeholder={t(`sports.titlePlaceholder.${input.type}`)} onChange={(e) => set({ title: e.target.value })} />}
          </Field>
        </div>
        {competitive && (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface-2/60 p-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('sports.fields.outcome')}>
              {OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={input.outcome === o}
                  onClick={() => set({ outcome: input.outcome === o ? null : o })}
                  className={cn('h-10 rounded-xl px-4 text-sm font-medium ring-1 ring-inset transition', input.outcome === o ? (o === 'win' ? 'bg-success text-white ring-transparent' : o === 'loss' ? 'bg-danger text-white ring-transparent' : 'bg-surface-3 text-fg ring-line') : 'bg-surface text-muted ring-line')}
                >
                  {t(`sports.outcomes.${o}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('sports.fields.score')} optionalLabel={t('common.optional')}>
                {(id) => <Input id={id} value={input.score} maxLength={60} placeholder={sport.kind === 'football' ? '3 x 2' : '6-4 6-3'} onChange={(e) => set({ score: e.target.value })} />}
              </Field>
              <Field label={t('sports.fields.opponent')} optionalLabel={t('common.optional')}>
                {(id) => <Input id={id} value={input.opponent} maxLength={120} onChange={(e) => set({ opponent: e.target.value })} />}
              </Field>
            </div>
          </div>
        )}
        <button type="button" className="w-fit text-sm font-medium text-accent hover:underline" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? t('sports.lessDetails') : t('sports.moreDetails')}
        </button>
        {more && (
          <div className="flex flex-col gap-4">
            <Field label={t('sports.fields.location')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} value={input.location} maxLength={120} placeholder={t('sports.locationPlaceholder')} onChange={(e) => set({ location: e.target.value })} />}
            </Field>
            {positions.length > 0 && (
              <Field label={t('sports.fields.position')} optionalLabel={t('common.optional')}>
                {(id) => (
                  <Select id={id} value={input.positionId ?? ''} onChange={(e) => set({ positionId: e.target.value || null })}>
                    <option value="">—</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {skillItems.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-fg">{t('sports.fields.practiced')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {skillItems.map((i) => {
                    const on = input.itemIds.includes(i.id);
                    return (
                      <button
                        key={i.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ itemIds: on ? input.itemIds.filter((x) => x !== i.id) : [...input.itemIds, i.id] })}
                        className={cn('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line hover:text-fg')}
                      >
                        {i.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <Field label={t('sports.fields.feeling')} hint={t('sports.feelingHint')}>
              {() => <Dots value={input.feeling} onChange={(feeling) => set({ feeling })} label={t('sports.fields.feeling')} />}
            </Field>
            <Field label={t('sports.fields.difficulties')} optionalLabel={t('common.optional')}>
              {(id) => <Textarea id={id} rows={2} maxLength={4000} value={input.difficulties} onChange={(e) => set({ difficulties: e.target.value })} />}
            </Field>
            <Field label={t('sports.fields.evolution')} optionalLabel={t('common.optional')}>
              {(id) => <Textarea id={id} rows={2} maxLength={4000} value={input.evolution} placeholder={t('sports.evolutionPlaceholder')} onChange={(e) => set({ evolution: e.target.value })} />}
            </Field>
            <Field label={t('sports.fields.notes')} optionalLabel={t('common.optional')}>
              {(id) => <Textarea id={id} rows={2} maxLength={10000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
            </Field>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function SportItemDialog({ sport, category, item, onClose }: { sport: Sport; category: SportItemCategory; item?: SportItem; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<SportItemInput>(() => (item ? { sportId: item.sportId, category: item.category, name: item.name, confidence: item.confidence, difficulties: item.difficulties, notes: item.notes } : { sportId: sport.id, category, name: '', confidence: null, difficulties: '', notes: '' }));
  const set = (p: Partial<SportItemInput>) => setInput((i) => ({ ...i, ...p }));
  const save = async () => {
    try {
      await saveSportItem(item?.id ?? null, input);
      toast.show(t('sports.saved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof SportRuleError && e.code === 'duplicate' ? t('sports.errors.duplicateItem') : t('sports.errors.invalid'), 'error');
    }
  };
  const remove = async () => {
    if (!item) return;
    await softDeleteSportItem(item.id);
    toast.show(t('sports.itemRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreSportItem(item.id) });
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={item ? t(`sports.editItem.${category}`) : t(`sports.newItem.${category}`)}
      footer={
        <>
          {item && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('sports.remove')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.name.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('sports.fields.name')}>{(id) => <Input id={id} autoFocus value={input.name} maxLength={120} placeholder={t(`sports.itemPlaceholder.${sport.kind}.${category}`)} onChange={(e) => set({ name: e.target.value })} />}</Field>
        <Field label={category === 'position' ? t('sports.fields.comfort') : t('sports.fields.confidence')} hint={t('sports.confidenceHint')}>
          {() => <Dots value={input.confidence} onChange={(confidence) => set({ confidence })} label={t('sports.fields.confidence')} />}
        </Field>
        <Field label={t('sports.fields.difficulties')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={2} maxLength={4000} value={input.difficulties} onChange={(e) => set({ difficulties: e.target.value })} />}
        </Field>
        <Field label={t('sports.fields.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={3} maxLength={20000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}
