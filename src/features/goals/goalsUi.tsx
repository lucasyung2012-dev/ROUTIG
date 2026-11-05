import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/app/SettingsProvider';
import { addCheckin, createGoal, GoalRuleError, updateGoal } from '@/data/goalsRepo';
import { todayKey } from '@/domain/dates';
import type { EntityRef } from '@/domain/entity';
import {
  emptyGoalInput,
  GOAL_AREAS,
  GOAL_HORIZONS,
  GOAL_STATUSES,
  GOAL_TYPES,
  goalInputOf,
  goalProgress,
  type Goal,
  type GoalCheckin,
  type GoalInput,
  type GoalStatus,
  type GoalType,
} from '@/domain/goals';
import { newId } from '@/domain/ids';
import { PRIORITIES } from '@/domain/tasks';
import { Badge, type BadgeTone } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { useGoals } from './useGoals';

export const STATUS_TONE: Record<GoalStatus, BadgeTone> = { idea: 'neutral', planned: 'info', active: 'accent', paused: 'warning', done: 'success', cancelled: 'neutral', archived: 'neutral' };

export function StatusBadge({ status }: { status: GoalStatus }) {
  const { t } = useSettings();
  return <Badge tone={STATUS_TONE[status]}>{t(`goals.statuses.${status}`)}</Badge>;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));

function Bar({ percent, className }: { percent: number; className?: string }) {
  return (
    <span className={cn('block h-2 overflow-hidden rounded-full bg-surface-3', className)} aria-hidden>
      <span className="block h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
    </span>
  );
}

/** O progresso de verdade de cada tipo. Qualitativo não ganha porcentagem (Parte 15.3). */
export function GoalProgressView({ goal, checkins, compact = false }: { goal: Goal; checkins: GoalCheckin[]; compact?: boolean }) {
  const { t } = useSettings();
  const p = goalProgress(goal, checkins);
  if (p.kind === 'none') return compact ? <span className="text-xs text-muted">{t('goals.progress.qualitative')}</span> : <p className="text-sm text-muted">{t('goals.progress.qualitativeHint')}</p>;
  if (p.kind === 'stages')
    return p.total === 0 ? (
      <span className="text-xs text-muted">{t('goals.progress.noStages')}</span>
    ) : (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">{t('goals.progress.stages', { done: p.done, total: p.total })}</span>
          <span className="font-medium tabular text-fg">{p.percent}%</span>
        </div>
        <Bar percent={p.percent ?? 0} />
      </div>
    );
  if (p.kind === 'level')
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1" role="img" aria-label={t('goals.progress.levelAria', { current: p.current ?? '—', target: p.target ?? '—', max: p.max })}>
          {Array.from({ length: p.max }, (_, i) => i + 1).map((n) => (
            <span key={n} className={cn('h-2 flex-1 rounded-full', p.current !== null && n <= p.current ? 'bg-brand' : 'bg-surface-3', p.target === n && 'ring-2 ring-accent ring-offset-1 ring-offset-surface')} />
          ))}
        </div>
        <span className="text-xs text-muted">{p.current === null ? t('goals.progress.noLevel') : t('goals.progress.level', { current: p.current, max: p.max })}{p.target !== null && ` · ${t('goals.progress.levelTarget', { target: p.target })}`}</span>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {compact ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate text-muted">{p.parts.length === 1 ? `${fmt(p.parts[0]!.current)} / ${fmt(p.parts[0]!.indicator.target)} ${p.parts[0]!.indicator.unit}` : t('goals.progress.indicators', { count: p.parts.length })}</span>
            <span className="font-medium tabular text-fg">{p.percent}%</span>
          </div>
          <Bar percent={p.percent} />
        </div>
      ) : (
        p.parts.map(({ indicator, current, percent }) => (
          <div key={indicator.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-fg">{indicator.name}</span>
              <span className="tabular text-muted">
                {t('goals.progress.indicator', { start: fmt(indicator.start), current: fmt(current), target: fmt(indicator.target), unit: indicator.unit })} · <span className="font-medium text-fg">{percent}%</span>
              </span>
            </div>
            <Bar percent={percent} />
          </div>
        ))
      )}
    </div>
  );
}

/* ---------- Criar e editar ---------- */

export function GoalDialog({ goal, preset, refs, onClose, onSaved }: { goal?: Goal; preset?: Partial<GoalInput>; refs?: EntityRef[]; onClose: () => void; onSaved?: (g: Goal) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<GoalInput>(() => (goal ? goalInputOf(goal) : emptyGoalInput(preset)));
  const set = (p: Partial<GoalInput>) => setInput((i) => ({ ...i, ...p }));
  const [msTitle, setMsTitle] = useState('');
  const [msDate, setMsDate] = useState('');

  const save = async () => {
    try {
      const g = goal ? await updateGoal(goal.id, input) : await createGoal(input, refs ?? []);
      toast.show(goal ? t('goals.saved') : t('goals.created'));
      onSaved?.(g);
      onClose();
    } catch (e) {
      toast.show(e instanceof GoalRuleError && e.code === 'duplicate' ? t('goals.errors.duplicate') : input.type === 'measurable' && !input.indicators.length ? t('goals.errors.indicators') : t('goals.errors.invalid'), 'error');
    }
  };
  const addMs = () => {
    if (!msTitle.trim()) return;
    set({ milestones: [...input.milestones, { id: newId('ms'), title: msTitle.trim(), date: msDate || null, done: false, doneAt: null }] });
    setMsTitle('');
    setMsDate('');
  };
  const setInd = (id: string, p: Partial<GoalInput['indicators'][number]>) => set({ indicators: input.indicators.map((i) => (i.id === id ? { ...i, ...p } : i)) });

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={goal ? t('goals.edit') : t('goals.new')}
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
        <Field label={t('goals.fields.name')}>{(id) => <Input id={id} autoFocus value={input.name} maxLength={160} placeholder={t('goals.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}</Field>
        <Field label={t('goals.fields.description')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={2} maxLength={4000} value={input.description} placeholder={t('goals.descriptionPlaceholder')} onChange={(e) => set({ description: e.target.value })} />}
        </Field>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('goals.fields.type')}</h3>
          <Segmented<GoalType> label={t('goals.fields.type')} value={input.type} onChange={(type) => set({ type })} options={GOAL_TYPES.map((ty) => ({ value: ty, label: t(`goals.types.${ty}`) }))} />
          <p className="text-xs text-muted">{t(`goals.typeHints.${input.type}`)}</p>

          {input.type === 'measurable' && (
            <div className="flex flex-col gap-2">
              {input.indicators.map((ind) => (
                <div key={ind.id} className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2/60 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
                  <Field label={t('goals.fields.indicator')}>{(id) => <Input id={id} value={ind.name} maxLength={120} placeholder={t('goals.indicatorPlaceholder')} onChange={(e) => setInd(ind.id, { name: e.target.value })} />}</Field>
                  <Field label={t('goals.fields.unit')}>{(id) => <Input id={id} value={ind.unit} maxLength={30} placeholder={t('goals.unitPlaceholder')} onChange={(e) => setInd(ind.id, { unit: e.target.value })} />}</Field>
                  <Field label={t('goals.fields.start')}>{(id) => <Input id={id} type="number" inputMode="decimal" step="any" value={ind.start} onChange={(e) => setInd(ind.id, { start: Number(e.target.value) })} />}</Field>
                  <Field label={t('goals.fields.target')}>{(id) => <Input id={id} type="number" inputMode="decimal" step="any" value={ind.target} onChange={(e) => setInd(ind.id, { target: Number(e.target.value) })} />}</Field>
                  <IconButton label={t('goals.removeIndicator')} icon={<Trash2 className="h-4 w-4" />} onClick={() => set({ indicators: input.indicators.filter((i) => i.id !== ind.id) })} />
                </div>
              ))}
              <Button size="sm" variant="secondary" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={() => set({ indicators: [...input.indicators, { id: newId('ind'), name: '', unit: '', start: 0, target: 1 }] })}>
                {t('goals.addIndicator')}
              </Button>
              <p className="text-xs text-muted">{t('goals.indicatorHint')}</p>
            </div>
          )}
          {input.type === 'skill' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('goals.fields.levelMax')}>
                {(id) => (
                  <Select id={id} value={input.levelMax} onChange={(e) => set({ levelMax: Number(e.target.value), levelTarget: input.levelTarget && Math.min(input.levelTarget, Number(e.target.value)) })}>
                    {[3, 4, 5, 7, 10].map((n) => (
                      <option key={n} value={n}>
                        {t('goals.scaleOption', { max: n })}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('goals.fields.levelTarget')} optionalLabel={t('common.optional')}>
                {(id) => (
                  <Select id={id} value={input.levelTarget ?? ''} onChange={(e) => set({ levelTarget: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">—</option>
                    {Array.from({ length: input.levelMax }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('goals.fields.area')}>
            {(id) => (
              <Select id={id} value={input.area} onChange={(e) => set({ area: e.target.value as GoalInput['area'] })}>
                {GOAL_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {t(`goals.areas.${a}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('goals.fields.horizon')}>
            {(id) => (
              <Select id={id} value={input.horizon ?? ''} onChange={(e) => set({ horizon: (e.target.value || null) as GoalInput['horizon'] })}>
                <option value="">{t('goals.noHorizon')}</option>
                {GOAL_HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {t(`goals.horizons.${h}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('goals.fields.status')}>
            {(id) => (
              <Select id={id} value={input.status} onChange={(e) => set({ status: e.target.value as GoalStatus })}>
                {GOAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`goals.statuses.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('goals.fields.priority')}>
            {(id) => (
              <Select id={id} value={input.priority} onChange={(e) => set({ priority: e.target.value as GoalInput['priority'] })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`tasks.priority.${p}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('goals.fields.deadline')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} type="date" value={input.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || null })} />}
          </Field>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{input.type === 'stages' ? t('goals.fields.stages') : t('goals.fields.milestones')}</h3>
          {input.type === 'stages' && <p className="text-xs text-muted">{t('goals.stagesHint')}</p>}
          {input.milestones.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {input.milestones.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
                  <span className="w-5 text-xs tabular text-subtle">{i + 1}.</span>
                  <Input aria-label={t('goals.fields.milestoneTitle')} value={m.title} maxLength={200} onChange={(e) => set({ milestones: input.milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)) })} className="h-9" />
                  <Input aria-label={t('goals.fields.milestoneDate')} type="date" value={m.date ?? ''} onChange={(e) => set({ milestones: input.milestones.map((x) => (x.id === m.id ? { ...x, date: e.target.value || null } : x)) })} className="h-9 w-40" />
                  <IconButton label={t('goals.removeMilestone')} icon={<Trash2 className="h-4 w-4" />} onClick={() => set({ milestones: input.milestones.filter((x) => x.id !== m.id) })} />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label={t('goals.fields.milestoneTitle')} value={msTitle} maxLength={200} placeholder={t('goals.milestonePlaceholder')} onChange={(e) => setMsTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMs())} className="min-w-48 flex-1" />
            <Input aria-label={t('goals.fields.milestoneDate')} type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} className="w-40" />
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addMs} disabled={!msTitle.trim()}>
              {t('goals.addMilestone')}
            </Button>
          </div>
        </section>

        <Field label={t('goals.fields.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={3} maxLength={20000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------- Acompanhamento ---------- */

export function CheckinDialog({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [indicatorId, setIndicatorId] = useState<string | null>(goal.type === 'measurable' ? (goal.indicators[0]?.id ?? null) : null);
  const [value, setValue] = useState('');
  const [level, setLevel] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const save = async () => {
    try {
      const v = indicatorId && value.trim() ? Number(value) : null;
      await addCheckin(goal.id, { date, indicatorId: v === null ? null : indicatorId, value: v, level, note });
      toast.show(t('goals.checkinSaved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof GoalRuleError && e.code === 'future' ? t('goals.errors.future') : t('goals.errors.checkin'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('goals.checkinTitle')}
      description={goal.name}
      footer={
        <>
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
        <Field label={t('goals.fields.date')}>{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        {goal.type === 'measurable' && goal.indicators.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {goal.indicators.length > 1 && (
              <Field label={t('goals.fields.indicator')}>
                {(id) => (
                  <Select id={id} value={indicatorId ?? ''} onChange={(e) => setIndicatorId(e.target.value)}>
                    {goal.indicators.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label={t('goals.fields.currentValue', { unit: goal.indicators.find((i) => i.id === indicatorId)?.unit ?? '' })} hint={t('goals.currentValueHint')}>
              {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" step="any" value={value} onChange={(e) => setValue(e.target.value)} />}
            </Field>
          </div>
        )}
        {goal.type === 'skill' && (
          <Field label={t('goals.fields.level')} hint={t('goals.levelHint')}>
            {() => (
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: goal.levelMax }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={level === n}
                    className={cn('h-11 min-w-11 rounded-xl px-3 font-semibold ring-1 ring-inset transition', level === n ? 'bg-brand text-white ring-transparent' : 'bg-surface-2 text-fg ring-line hover:bg-surface-3')}
                    onClick={() => setLevel(level === n ? null : n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
        <Field label={goal.type === 'qualitative' || goal.type === 'stages' ? t('goals.fields.reflection') : t('goals.fields.note')} optionalLabel={goal.type === 'qualitative' || goal.type === 'stages' ? undefined : t('common.optional')}>
          {(id) => <Textarea id={id} rows={4} maxLength={4000} value={note} placeholder={t('goals.reflectionPlaceholder')} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------- Objetivos ligados (do outro lado da ligação) ---------- */

/** Mostra os objetivos que ligam este registro e cria um já ligado. A ligação mora só no objetivo. */
export function LinkedGoals({ refType, refId, preset }: { refType: string; refId: string; preset?: Partial<GoalInput> }) {
  const { t } = useSettings();
  const data = useGoals();
  const [creating, setCreating] = useState(false);
  const goals = data.goalsLinkedTo(refType, refId);
  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-fg">{t('goals.linkedTitle')}</h2>
        <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          {t('goals.newLinked')}
        </Button>
      </div>
      {goals.length === 0 ? (
        <p className="text-sm text-muted">{t('goals.noLinkedGoals')}</p>
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
      {creating && <GoalDialog preset={preset} refs={[{ type: refType, id: refId }]} onClose={() => setCreating(false)} />}
    </Surface>
  );
}
