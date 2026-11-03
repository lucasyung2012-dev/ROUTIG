import { useState } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { formatDateKey, type DateKey } from '@/domain/dates';
import { upcomingOccurrences, type Recurrence } from '@/domain/tasks';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Campos de recorrência (mesmas regras das tarefas): frequência, intervalo, dias, fim e pausas. */
export function RecurrenceFields({ value, start, onChange }: { value: Recurrence | null; start: DateKey; onChange: (r: Recurrence | null) => void }) {
  const { t, settings } = useSettings();
  const [pause, setPause] = useState({ from: '', to: '', label: '' });
  const r = value;
  const weekdayName = (d: number) => new Intl.DateTimeFormat(settings.locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + d, 12));
  const upcoming = r ? upcomingOccurrences({ dueDate: start, recurrence: r }, 5) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('tasks.editor.recurrence')}>
          {(id) => (
            <Select
              id={id}
              value={r?.freq ?? ''}
              onChange={(e) =>
                onChange(e.target.value ? { ...(r ?? { interval: 1, weekdays: [], pauses: [], exceptions: [], until: null, freq: 'daily' }), freq: e.target.value as Recurrence['freq'] } : null)
              }
            >
              <option value="">{t('tasks.editor.noRepeat')}</option>
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`tasks.editor.freqName.${f}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {r && (
          <>
            <Field label={t('tasks.editor.every')}>
              {(id) => (
                <div className="flex items-center gap-2">
                  <Input id={id} type="number" min={1} max={365} value={r.interval} className="w-20" onChange={(e) => onChange({ ...r, interval: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />
                  <span className="text-sm text-muted">{t(`tasks.editor.freq.${r.freq}`)}</span>
                </div>
              )}
            </Field>
            <Field label={t('tasks.editor.until')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} type="date" min={start} value={r.until ?? ''} onChange={(e) => onChange({ ...r, until: e.target.value || null })} />}
            </Field>
          </>
        )}
      </div>

      {r?.freq === 'weekly' && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('tasks.editor.weekdays')}>
          <span className="mr-1 text-sm text-muted">{t('tasks.editor.weekdays')}</span>
          {WEEKDAY_ORDER.map((d) => {
            const on = r.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...r, weekdays: on ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d] })}
                className={cn('h-9 min-w-[2.75rem] rounded-lg px-2 text-sm font-medium capitalize ring-1 transition', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line')}
              >
                {weekdayName(d)}
              </button>
            );
          })}
        </div>
      )}

      {r && upcoming.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{t('tasks.editor.nextDates')}:</span>
          {upcoming.map((d) => (
            <span key={d} className="rounded-md bg-surface-2 px-2 py-0.5 tabular text-fg">
              {formatDateKey(d, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          ))}
        </div>
      )}

      {r && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2/60 p-3 ring-1 ring-line/60">
          <div className="text-sm font-medium text-fg">{t('tasks.editor.pauses')}</div>
          {r.pauses.map((p, i) => (
            <div key={`${p.from}-${i}`} className="flex items-center gap-2 text-sm text-muted">
              <span className="tabular text-fg">
                {formatDateKey(p.from, settings.locale)} – {formatDateKey(p.to, settings.locale)}
              </span>
              {p.label && <span>· {p.label}</span>}
              <IconButton size="sm" label={t('tasks.editor.removeItem')} icon={<X className="h-4 w-4" />} onClick={() => onChange({ ...r, pauses: r.pauses.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" aria-label={t('tasks.editor.pauseFrom')} value={pause.from} onChange={(e) => setPause({ ...pause, from: e.target.value })} className="w-auto" />
            <Input type="date" aria-label={t('tasks.editor.pauseTo')} value={pause.to} onChange={(e) => setPause({ ...pause, to: e.target.value })} className="w-auto" />
            <Input aria-label={t('tasks.editor.pauseLabel')} placeholder={t('tasks.editor.pauseLabel')} value={pause.label} maxLength={80} onChange={(e) => setPause({ ...pause, label: e.target.value })} className="w-40" />
            <Button
              size="sm"
              disabled={!pause.from || !pause.to || pause.from > pause.to}
              onClick={() => {
                onChange({ ...r, pauses: [...r.pauses, { ...pause, label: pause.label.trim() }] });
                setPause({ from: '', to: '', label: '' });
              }}
            >
              {t('tasks.editor.addPause')}
            </Button>
          </div>
          {r.exceptions.length > 0 && (
            <div className="text-xs text-subtle">
              {t('tasks.editor.exceptions')}: {r.exceptions.map((d) => formatDateKey(d, settings.locale)).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
