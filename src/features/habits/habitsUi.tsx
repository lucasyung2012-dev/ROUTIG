import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Minus, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createHabit, HabitRuleError, restoreHabitLog, setHabitLog, softDeleteHabitLog, updateHabit } from '@/data/habitsRepo';
import { addDays, formatDateKey, parseDateKey, startOfWeek, todayKey, type DateKey } from '@/domain/dates';
import {
  dayState,
  emptyHabitInput,
  HABIT_METHODS,
  HABIT_PERIODS,
  habitInputOf,
  logMeets,
  scheduleAt,
  type DayState,
  type Habit,
  type HabitFrequency,
  type HabitInput,
  type HabitLog,
  type HabitMethod,
} from '@/domain/habits';
import { Button } from '@/ui/Button';
import { ColorPicker } from '@/ui/ColorPicker';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

/* ---------- Textos ---------- */

export function useWeekdayNames(): string[] {
  const { settings } = useSettings();
  // 2026-11-01 é domingo.
  return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(settings.locale, { weekday: 'short' }).format(parseDateKey(addDays('2026-11-01', i))).replace('.', ''));
}

/** "Todo dia", "seg, qua, sex", "3× por semana", "a cada 2 dias", com a meta. */
export function useFrequencyLabel() {
  const { t } = useSettings();
  const names = useWeekdayNames();
  return (f: HabitFrequency, h: Pick<Habit, 'method' | 'unit'>): string => {
    const base =
      f.period === 'day'
        ? f.weekdays.length === 0 || f.weekdays.length === 7
          ? t('habits.freq.everyDay')
          : f.weekdays.map((d) => names[d]).join(', ')
        : f.period === 'interval'
          ? t('habits.freq.everyN', { n: f.intervalDays })
          : t(`habits.freq.times.${f.period}`, { count: f.times });
    if (f.target === null) return base;
    return `${base} · ${h.method === 'duration' ? t('habits.minutes', { min: f.target }) : `${f.target} ${h.unit}`.trim()}`;
  };
}

export function useValueLabel() {
  const { t } = useSettings();
  return (h: Pick<Habit, 'method' | 'unit' | 'scaleMax'>, value: number): string => {
    switch (h.method) {
      case 'check':
        return t('habits.done');
      case 'duration':
        return t('habits.minutes', { min: value });
      case 'scale':
        return `${value}/${h.scaleMax}`;
      default:
        return `${value} ${h.unit}`.trim();
    }
  };
}

/* ---------- Cores dos dias ---------- */

export function dayLook(state: DayState, color: string): { className: string; style?: CSSProperties } {
  switch (state) {
    case 'met':
      return { className: '', style: { background: color } };
    case 'partial':
      return { className: '', style: { background: `${color}66` } };
    case 'empty':
      return { className: 'bg-surface-3' };
    case 'paused':
      return { className: 'bg-surface-2 ring-1 ring-inset ring-line', style: { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, rgb(var(--line) / 0.6) 3px 4px)' } };
    case 'off':
      return { className: 'bg-surface-2/50' };
    default:
      return { className: 'bg-transparent ring-1 ring-inset ring-line/40' };
  }
}

export function Legend() {
  const { t } = useSettings();
  const items: Array<[DayState, string]> = [
    ['met', t('habits.state.met')],
    ['partial', t('habits.state.partial')],
    ['empty', t('habits.state.empty')],
    ['off', t('habits.state.off')],
    ['paused', t('habits.state.paused')],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([s, label]) => {
        const look = dayLook(s, 'rgb(var(--accent))');
        return (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('h-3 w-3 rounded-[4px]', look.className)} style={s === 'met' ? { background: 'rgb(var(--accent))' } : s === 'partial' ? { background: 'rgb(var(--accent) / 0.4)' } : look.style} aria-hidden />
            {label}
          </span>
        );
      })}
    </div>
  );
}

/* ---------- Calendário de consistência (Parte 14.4) ---------- */

/** Semanas em colunas, dias em linhas, como um mapa de calor. Sem sequência: só o que aconteceu. */
export function Heatmap({ habit, logs, from, to, onPick }: { habit: Habit; logs: ReadonlyMap<DateKey, HabitLog>; from: DateKey; to: DateKey; onPick?: (date: DateKey) => void }) {
  const { settings } = useSettings();
  const today = todayKey();
  const label = useValueLabel();
  const names = useWeekdayNames();
  const first = startOfWeek(from, settings.weekStartsOn);
  const weeks: DateKey[][] = [];
  for (let w = first; w <= to; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  const month = new Intl.DateTimeFormat(settings.locale, { month: 'short' });
  // Abre mostrando o fim (os dias mais recentes); o começo fica a um deslize.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [from, to]);
  return (
    <div ref={scroller} className="overflow-x-auto pb-1">
      <div className="inline-flex gap-[3px]">
        <div className="mr-1 flex flex-col gap-[3px] text-[0.625rem] leading-[11px] text-subtle" aria-hidden>
          <span className="h-[11px]" />
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="h-[11px]">
              {i % 2 === 0 ? names[(i + settings.weekStartsOn) % 7] : ''}
            </span>
          ))}
        </div>
        {weeks.map((days) => (
          <div key={days[0]} className="flex flex-col gap-[3px]">
            <span className="relative h-[11px] w-[11px] text-[0.625rem] leading-[11px] text-subtle" aria-hidden>
              {days.some((d) => d.endsWith('-01') && d >= from && d <= to) && <span className="absolute left-0 whitespace-nowrap">{month.format(parseDateKey(days.find((d) => d.endsWith('-01'))!)).replace('.', '')}</span>}
            </span>
            {days.map((d) => {
              if (d < from || d > to) return <span key={d} className="h-[11px] w-[11px]" />;
              const log = logs.get(d);
              const state = dayState(habit, log, d, today);
              const look = dayLook(state, habit.color);
              const title = `${formatDateKey(d, settings.locale)}${log ? ` · ${label(habit, log.value)}` : ''}`;
              return onPick && d <= today && d >= habit.startDate ? (
                <button key={d} type="button" title={title} aria-label={title} className={cn('h-[11px] w-[11px] rounded-[3px] transition hover:scale-125', look.className)} style={look.style} onClick={() => onPick(d)} />
              ) : (
                <span key={d} title={title} className={cn('h-[11px] w-[11px] rounded-[3px]', look.className)} style={look.style} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Registro rápido ---------- */

/** O controle de hoje: um toque para concluir, a nota da escala, ou abrir o registro de quantidade e duração. */
export function QuickLog({ habit, log, date, onOpen }: { habit: Habit; log: HabitLog | undefined; date: DateKey; onOpen: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const label = useValueLabel();
  const s = scheduleAt(habit, date);
  const met = !!log && logMeets(habit.method, s, log.value);

  const fail = (e: unknown) => toast.show(e instanceof HabitRuleError && e.code === 'future' ? t('habits.errors.future') : t('errors.saveFailed'), 'error');

  if (habit.method === 'check') {
    return (
      <Button
        size="sm"
        variant={met ? 'primary' : 'secondary'}
        icon={<Check className="h-4 w-4" />}
        aria-pressed={met}
        onClick={() => {
          if (log) {
            const id = log.id;
            void softDeleteHabitLog(id).then(() => toast.show(t('habits.unchecked'), 'success', { label: t('notes.undo'), run: () => void restoreHabitLog(id) }));
          } else void setHabitLog(habit.id, date, 1, '').catch(fail);
        }}
      >
        {met ? t('habits.done') : t('habits.markDone')}
      </Button>
    );
  }
  if (habit.method === 'scale') {
    return (
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('habits.rate')}>
        {Array.from({ length: habit.scaleMax }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={log?.value === n}
            className={cn('h-9 min-w-9 rounded-lg px-2 text-sm font-medium ring-1 ring-inset transition', log?.value === n ? 'text-white ring-transparent' : 'bg-surface-2 text-fg ring-line hover:bg-surface-3')}
            style={log?.value === n ? { background: habit.color } : undefined}
            onClick={() => void setHabitLog(habit.id, date, n, log?.note ?? '').catch(fail)}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }
  return (
    <Button size="sm" variant={met ? 'primary' : 'secondary'} icon={met ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />} onClick={onOpen}>
      {log ? label(habit, log.value) : t('habits.log')}
    </Button>
  );
}

/* ---------- Registro de um dia ---------- */

export function LogDialog({ habit, date: initialDate, log: initialLog, logs, onClose }: { habit: Habit; date: DateKey; log?: HabitLog; logs: ReadonlyMap<DateKey, HabitLog>; onClose: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [date, setDate] = useState(initialDate);
  const existing = date === initialDate ? (initialLog ?? logs.get(date)) : logs.get(date);
  const [value, setValue] = useState<number>(existing?.value ?? (habit.method === 'check' ? 1 : (scheduleAt(habit, date)?.target ?? 0)));
  const [note, setNote] = useState(existing?.note ?? '');
  const s = scheduleAt(habit, date);

  const save = async () => {
    try {
      await setHabitLog(habit.id, date, value, note);
      toast.show(t('habits.logged'));
      onClose();
    } catch (e) {
      toast.show(e instanceof HabitRuleError && e.code === 'future' ? t('habits.errors.future') : t('habits.errors.value'), 'error');
    }
  };
  const remove = async () => {
    if (!existing) return;
    const id = existing.id;
    await softDeleteHabitLog(id);
    toast.show(t('habits.logRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreHabitLog(id) });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={habit.name}
      description={formatDateKey(date, settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })}
      footer={
        <>
          {existing && (
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()} className="mr-auto">
              {t('habits.removeLog')}
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
        <Field label={t('habits.fields.date')}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={date}
              min={habit.startDate}
              max={today}
              onChange={(e) => {
                const d = e.target.value;
                if (!d) return;
                setDate(d);
                const l = logs.get(d);
                setValue(l?.value ?? (habit.method === 'check' ? 1 : (scheduleAt(habit, d)?.target ?? 0)));
                setNote(l?.note ?? '');
              }}
            />
          )}
        </Field>
        {habit.method === 'check' && <p className="text-sm text-muted">{t('habits.checkHint')}</p>}
        {(habit.method === 'quantity' || habit.method === 'duration') && (
          <Field label={habit.method === 'duration' ? t('habits.fields.minutes') : t('habits.fields.amount', { unit: habit.unit || t('habits.fields.units') })} hint={s?.target ? t('habits.targetHint', { target: s.target }) : undefined}>
            {(id, d) => (
              <div className="flex items-center gap-2">
                <Button variant="secondary" aria-label={t('habits.less')} icon={<Minus className="h-4 w-4" />} onClick={() => setValue((v) => Math.max(0, v - (habit.method === 'duration' ? 5 : 1)))} />
                <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min={0} step="any" value={value || ''} onChange={(e) => setValue(Number(e.target.value))} className="text-center" />
                <Button variant="secondary" aria-label={t('habits.more')} icon={<Plus className="h-4 w-4" />} onClick={() => setValue((v) => v + (habit.method === 'duration' ? 5 : 1))} />
              </div>
            )}
          </Field>
        )}
        {habit.method === 'scale' && (
          <Field label={t('habits.rate')}>
            {() => (
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: habit.scaleMax }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={value === n}
                    className={cn('h-11 min-w-11 rounded-xl px-3 font-semibold ring-1 ring-inset transition', value === n ? 'text-white ring-transparent' : 'bg-surface-2 text-fg ring-line hover:bg-surface-3')}
                    style={value === n ? { background: habit.color } : undefined}
                    onClick={() => setValue(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
        <Field label={t('habits.fields.note')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={3} maxLength={2000} value={note} placeholder={t('habits.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------- Criar e editar (Partes 14.1 e 14.2) ---------- */

/** Exemplos da própria especificação: abrem o formulário preenchido, nada é criado sem salvar. */
export const HABIT_EXAMPLES: Array<{ key: 'german' | 'reading' | 'guitar' | 'focus'; input: Partial<HabitInput> }> = [
  { key: 'german', input: { method: 'check', color: '#F59E0B', category: 'Idiomas' } },
  { key: 'reading', input: { method: 'quantity', unit: 'páginas', color: '#438BEA', category: 'Leitura', frequency: { period: 'day', times: 1, weekdays: [], intervalDays: 2, target: 20 } } },
  { key: 'guitar', input: { method: 'duration', color: '#EC6695', category: 'Música', frequency: { period: 'week', times: 4, weekdays: [], intervalDays: 2, target: 30 } } },
  { key: 'focus', input: { method: 'scale', color: '#16B8A6', category: 'Estudos', scaleMax: 5 } },
];

export function HabitDialog({ habit, preset, hasLogs, categories, onClose, onSaved }: { habit?: Habit; preset?: Partial<HabitInput>; hasLogs?: boolean; categories: string[]; onClose: () => void; onSaved?: (h: Habit) => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const names = useWeekdayNames();
  const [input, setInput] = useState<HabitInput>(() => (habit ? habitInputOf(habit) : emptyHabitInput(todayKey(), preset)));
  const set = (p: Partial<HabitInput>) => setInput((i) => ({ ...i, ...p }));
  const setFreq = (p: Partial<HabitFrequency>) => setInput((i) => ({ ...i, frequency: { ...i.frequency, ...p } }));
  const f = input.frequency;
  const order = Array.from({ length: 7 }, (_, i) => (i + settings.weekStartsOn) % 7);

  const save = async () => {
    try {
      const h = habit ? await updateHabit(habit.id, input) : await createHabit(input);
      toast.show(habit ? t('habits.saved') : t('habits.created'));
      onSaved?.(h);
      onClose();
    } catch (e) {
      const code = e instanceof HabitRuleError ? e.code : 'invalid';
      toast.show(code === 'duplicate' ? t('habits.errors.duplicate') : code === 'method_locked' ? t('habits.errors.methodLocked') : t('habits.errors.invalid'), 'error');
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={habit ? t('habits.edit') : t('habits.new')}
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
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('habits.fields.name')}>{(id) => <Input id={id} autoFocus value={input.name} maxLength={120} placeholder={t('habits.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}</Field>
          <Field label={t('habits.fields.category')} optionalLabel={t('common.optional')}>
            {(id) => (
              <>
                <Input id={id} list={`${id}-cats`} value={input.category} maxLength={60} placeholder={t('habits.categoryPlaceholder')} onChange={(e) => set({ category: e.target.value })} />
                <datalist id={`${id}-cats`}>
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
        <Field label={t('habits.fields.description')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={2} maxLength={2000} value={input.description} placeholder={t('habits.descriptionPlaceholder')} onChange={(e) => set({ description: e.target.value })} />}
        </Field>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('habits.fields.method')}</h3>
          <Segmented<HabitMethod>
            label={t('habits.fields.method')}
            value={input.method}
            onChange={(method) => (habit && hasLogs ? toast.show(t('habits.errors.methodLocked'), 'error') : set({ method }))}
            options={HABIT_METHODS.map((m) => ({ value: m, label: t(`habits.methods.${m}`) }))}
          />
          <p className="text-xs text-muted">{t(`habits.methodHints.${input.method}`)}</p>
          {habit && hasLogs && <p className="text-xs text-muted">{t('habits.methodLockedHint')}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {input.method === 'quantity' && (
              <Field label={t('habits.fields.unit')}>{(id) => <Input id={id} value={input.unit} maxLength={30} placeholder={t('habits.unitPlaceholder')} onChange={(e) => set({ unit: e.target.value })} />}</Field>
            )}
            {(input.method === 'quantity' || input.method === 'duration') && (
              <Field label={input.method === 'duration' ? t('habits.fields.targetMinutes') : t('habits.fields.target')} optionalLabel={t('common.optional')} hint={t('habits.targetFieldHint')}>
                {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min={0} step="any" value={f.target ?? ''} onChange={(e) => setFreq({ target: e.target.value ? Number(e.target.value) : null })} />}
              </Field>
            )}
            {input.method === 'scale' && (
              <Field label={t('habits.fields.scaleMax')}>
                {(id) => (
                  <Select id={id} value={input.scaleMax} onChange={(e) => set({ scaleMax: Number(e.target.value) })}>
                    {[3, 4, 5, 7, 10].map((n) => (
                      <option key={n} value={n}>
                        {t('habits.scaleOption', { max: n })}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-fg">{t('habits.fields.frequency')}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('habits.fields.period')}>
              {(id) => (
                <Select id={id} value={f.period} onChange={(e) => setFreq({ period: e.target.value as HabitFrequency['period'] })}>
                  {HABIT_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {t(`habits.periods.${p}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {(f.period === 'week' || f.period === 'month' || f.period === 'year') && (
              <Field label={t(`habits.fields.timesPer.${f.period}`)}>
                {(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={f.period === 'week' ? 7 : f.period === 'month' ? 31 : 366} value={f.times} onChange={(e) => setFreq({ times: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />}
              </Field>
            )}
            {f.period === 'interval' && (
              <Field label={t('habits.fields.intervalDays')}>
                {(id) => <Input id={id} type="number" inputMode="numeric" min={2} max={365} value={f.intervalDays} onChange={(e) => setFreq({ intervalDays: Math.max(2, Math.round(Number(e.target.value) || 2)) })} />}
              </Field>
            )}
          </div>
          {f.period === 'day' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">{t('habits.fields.weekdays')}</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('habits.fields.weekdays')}>
                {order.map((d) => {
                  const on = f.weekdays.length === 0 || f.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      className={cn('h-10 min-w-12 rounded-xl px-3 text-sm font-medium capitalize ring-1 ring-inset transition', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line')}
                      onClick={() => {
                        const cur = f.weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : f.weekdays;
                        const next = on ? cur.filter((x) => x !== d) : [...cur, d];
                        if (next.length === 0) return;
                        setFreq({ weekdays: next.length === 7 ? [] : next });
                      }}
                    >
                      {names[d]}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted">{t('habits.weekdaysHint')}</p>
            </div>
          )}
          {habit && <p className="text-xs text-muted">{t('habits.frequencyChangeHint')}</p>}
          <Field label={t('habits.fields.startDate')}>{(id) => <Input id={id} type="date" value={input.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} />}</Field>
        </section>

        <section className="flex flex-col gap-3">
          <Switch checked={input.showInCalendar} onChange={(v) => set({ showInCalendar: v })} label={t('habits.fields.showInCalendar')} hint={f.period === 'day' || f.period === 'interval' ? t('habits.calendarHint') : t('habits.calendarHintPeriod')} />
          {input.showInCalendar && (
            <Field label={t('habits.fields.time')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} type="time" value={input.time ?? ''} onChange={(e) => set({ time: e.target.value || null })} className="w-40" />}
            </Field>
          )}
          <ColorPicker value={input.color} onChange={(color) => set({ color })} label={t('habits.fields.color')} showLabel />
        </section>

        <Field label={t('habits.fields.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={3} maxLength={20000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}
