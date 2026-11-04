import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { GRADE_METHODS, modelProblems, newComponent, YEAR_AGGREGATIONS, type CalcStep, type GradeMethod, type GradeResult, type GradingModel, type YearAggregation } from '@/domain/academy';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Switch } from '@/ui/Switch';
import { cn } from '@/ui/cn';
import { formatGrade } from './useAcademyData';

/** Lê número digitado com vírgula ou ponto ("7,5" ou "7.5"). Vazio = null; inválido = NaN. */
export function parseDecimal(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Campo numérico que aceita vírgula (teclado do iPad em português). */
export function DecimalInput({ value, onChange, id, ariaLabel, placeholder, className, allowEmpty = true }: { value: number | null; onChange: (v: number | null) => void; id?: string; ariaLabel?: string; placeholder?: string; className?: string; allowEmpty?: boolean }) {
  const { settings } = useSettings();
  const show = (v: number | null) => (v === null ? '' : new Intl.NumberFormat(settings.locale, { maximumFractionDigits: 2, useGrouping: false }).format(v));
  const [text, setText] = useState(show(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    // Atualiza quando o valor muda por fora (sem atropelar o que está sendo digitado).
    const parsed = parseDecimal(text);
    if (parsed !== value && !(parsed === null && value === null)) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-invalid={bad || undefined}
      className={cn(bad && 'ring-danger', className)}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseDecimal(e.target.value);
        const ok = v === null ? allowEmpty : !Number.isNaN(v) && v >= 0;
        setBad(!ok);
        if (ok) onChange(v);
      }}
    />
  );
}

/* ---------- Nota e explicação do cálculo ---------- */

export function GradeBadge({ result, locale, passing }: { result: GradeResult; locale: string; passing?: number }) {
  const { t } = useSettings();
  if (result.status === 'pending') return <Badge>{t('academy.grade.pending')}</Badge>;
  return (
    <Badge tone={result.passing ? 'success' : 'danger'}>
      {formatGrade(result.value, locale)}
      {passing !== undefined && !result.passing ? ` · ${t('academy.grade.below', { passing: formatGrade(passing, locale) })}` : ''}
    </Badge>
  );
}

function stepText(s: CalcStep, t: ReturnType<typeof useSettings>['t'], f: (v: number) => string): string {
  switch (s.kind) {
    case 'component':
      return s.count > 1 ? t('academy.steps.componentMany', { code: s.code, points: f(s.points), max: f(s.max), count: s.count }) : t('academy.steps.component', { code: s.code, points: f(s.points), max: f(s.max) });
    case 'componentMissing':
      return t('academy.steps.componentMissing', { code: s.code });
    case 'assessment':
      return t('academy.steps.assessment', { name: s.name, value: f(s.normalized), weight: f(s.weight) });
    case 'original':
      return t('academy.steps.original', { value: f(s.value) });
    case 'recovery':
      return t('academy.steps.recovery', { score: f(s.score), cap: f(s.cap), result: f(s.result) });
    case 'recoveryNotNeeded':
      return t('academy.steps.recoveryNotNeeded', { score: f(s.score) });
    case 'bonus':
      return t('academy.steps.bonus', { bonus: f(s.bonus), result: f(s.result) });
    case 'bonusNotEligible':
      return t('academy.steps.bonusNotEligible', { above: f(s.above) });
    case 'bonusCapped':
      return t('academy.steps.bonusCapped', { requested: f(s.requested), max: f(s.max) });
  }
}

/** Mostra como a nota foi calculada, passo a passo (Parte 9.6: histórico do cálculo). */
export function GradeExplanation({ result }: { result: GradeResult }) {
  const { t, settings } = useSettings();
  const f = (v: number) => formatGrade(v, settings.locale);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {result.status === 'pending' && (
        <p className="font-medium text-warning">
          {result.reason === 'model' ? t('academy.grade.pendingModel') : result.reason === 'noScores' ? t('academy.grade.pendingNoScores') : t('academy.grade.pendingMissing', { list: result.missing.join(', ') })}
        </p>
      )}
      {result.steps.length > 0 && (
        <ol className="flex flex-col gap-1 text-muted">
          {result.steps.map((s, i) => (
            <li key={i} className={cn(s.kind === 'original' || s.kind === 'recovery' || s.kind === 'bonus' ? 'font-medium text-fg' : '')}>
              {stepText(s, t, f)}
            </li>
          ))}
        </ol>
      )}
      {result.status === 'ok' && (
        <p className={cn('font-semibold', result.passing ? 'text-success' : 'text-danger')}>
          {t('academy.grade.final', { value: f(result.value) })} · {result.passing ? t('academy.grade.passing') : t('academy.grade.notPassing')}
        </p>
      )}
    </div>
  );
}

/* ---------- Editor do modelo de nota ---------- */

export function ModelEditor({ value, onChange }: { value: GradingModel; onChange: (m: GradingModel) => void }) {
  const { t, settings } = useSettings();
  const set = (patch: Partial<GradingModel>) => onChange({ ...value, ...patch });
  const problems = modelProblems(value);
  const total = value.components.reduce((a, c) => a + c.max, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('academy.model.method')}>
          {(id) => (
            <Select id={id} value={value.method} onChange={(e) => set({ method: e.target.value as GradeMethod })}>
              {GRADE_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`academy.model.methods.${m}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('academy.model.scale')}>{(id) => <DecimalInput id={id} value={value.scale} allowEmpty={false} onChange={(v) => v !== null && set({ scale: v })} />}</Field>
        <Field label={t('academy.model.passing')}>{(id) => <DecimalInput id={id} value={value.passing} allowEmpty={false} onChange={(v) => v !== null && set({ passing: v })} />}</Field>
      </div>

      {value.method === 'sum' && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-fg">{t('academy.model.components')}</div>
          <ul className="flex flex-col gap-2">
            {value.components.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2">
                <Input aria-label={t('academy.model.code')} value={c.code} maxLength={8} className="w-20 uppercase" onChange={(e) => set({ components: value.components.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)) })} />
                <Input aria-label={t('academy.model.componentName')} value={c.name} maxLength={60} placeholder={t('academy.model.componentName')} className="min-w-0 flex-1" onChange={(e) => set({ components: value.components.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <DecimalInput ariaLabel={t('academy.model.points')} value={c.max} allowEmpty={false} className="w-20" onChange={(v) => v !== null && set({ components: value.components.map((x, j) => (j === i ? { ...x, max: v } : x)) })} />
                <IconButton size="sm" label={t('academy.model.removeComponent', { code: c.code })} icon={<Trash2 className="h-4 w-4" />} onClick={() => set({ components: value.components.filter((_, j) => j !== i) })} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => set({ components: [...value.components, newComponent(`P${value.components.length + 1}`, 0)] })}>
              {t('academy.model.addComponent')}
            </Button>
            <span className={cn('text-sm', problems.includes('componentsDontAddUp') ? 'font-medium text-warning' : 'text-muted')}>
              {t('academy.model.total', { total: formatGrade(total, settings.locale), scale: formatGrade(value.scale, settings.locale) })}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl bg-surface-2/50 p-3">
        <Switch label={t('academy.model.recovery')} hint={t('academy.model.recoveryHint')} checked={value.recovery.enabled} onChange={(enabled) => set({ recovery: { ...value.recovery, enabled } })} />
        {value.recovery.enabled && (
          <Field label={t('academy.model.recoveryCap')}>{(id) => <DecimalInput id={id} value={value.recovery.cap} allowEmpty={false} className="w-28" onChange={(v) => v !== null && set({ recovery: { ...value.recovery, cap: v } })} />}</Field>
        )}
      </div>
      <div className="flex flex-col gap-3 rounded-2xl bg-surface-2/50 p-3">
        <Switch label={t('academy.model.bonus')} hint={t('academy.model.bonusHint')} checked={value.bonus.enabled} onChange={(enabled) => set({ bonus: { ...value.bonus, enabled } })} />
        {value.bonus.enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('academy.model.bonusMax')}>{(id) => <DecimalInput id={id} value={value.bonus.max} allowEmpty={false} onChange={(v) => v !== null && set({ bonus: { ...value.bonus, max: v } })} />}</Field>
            <Field label={t('academy.model.bonusAbove')}>{(id) => <DecimalInput id={id} value={value.bonus.above} allowEmpty={false} onChange={(v) => v !== null && set({ bonus: { ...value.bonus, above: v } })} />}</Field>
          </div>
        )}
      </div>
      <Field label={t('academy.model.yearAggregation')} hint={t('academy.model.yearAggregationHint')}>
        {(id, d) => (
          <Select id={id} aria-describedby={d} value={value.yearAggregation} onChange={(e) => set({ yearAggregation: e.target.value as YearAggregation })}>
            {YEAR_AGGREGATIONS.map((m) => (
              <option key={m} value={m}>
                {t(`academy.model.aggregations.${m}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-2xl bg-warning/10 p-3 text-sm text-fg ring-1 ring-warning/30">
          {problems.map((p) => (
            <li key={p}>{t(`academy.model.problems.${p}`)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
