import { useState } from 'react';
import { Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { addEventCategory, purgeEvent, removeEventCategory, restoreEvent, updateEventCategory } from '@/data/eventsRepo';
import type { CalendarEvent, EventCategory, EventTone } from '@/domain/events';
import { formatDateKey } from '@/domain/dates';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Input } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { EmptyState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { EVENT_TONES, toneLook, useCategoryName, type CalendarData } from './useCalendarData';
import { ColorPicker } from '@/ui/ColorPicker';

export function CalendarTrashDialog({ open, onClose, cal }: { open: boolean; onClose: () => void; cal: CalendarData }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [purging, setPurging] = useState<CalendarEvent | null>(null);
  return (
    <>
      <Dialog open={open} onClose={onClose} title={t('calendar.trash.title')} description={t('calendar.trash.body')} closeLabel={t('common.close')}>
        {cal.trash.length === 0 ? (
          <EmptyState icon={<Trash2 className="h-6 w-6" aria-hidden />} title={t('calendar.trash.empty')} />
        ) : (
          <ul className="flex flex-col divide-y divide-line/60">
            {cal.trash.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.9375rem] font-medium text-fg">{e.title}</div>
                  <div className="text-xs text-subtle">{formatDateKey(e.start, settings.locale, { dateStyle: 'medium' })}</div>
                </div>
                <Button size="sm" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => void restoreEvent(e.id).then(() => toast.show(t('calendar.trash.restored')))}>
                  {t('calendar.trash.restore')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setPurging(e)}>
                  {t('calendar.trash.purge')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!purging}
        danger
        title={purging ? t('calendar.trash.purgeTitle', { title: purging.title }) : ''}
        body={t('calendar.trash.purgeBody')}
        confirmLabel={t('calendar.trash.purge')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          const target = purging;
          setPurging(null);
          if (target) void purgeEvent(target.id).then(() => toast.show(t('calendar.trash.purged')));
        }}
      />
    </>
  );
}

export function CalendarConfigDialog({ open, onClose, cal }: { open: boolean; onClose: () => void; cal: CalendarData }) {
  const { t } = useSettings();
  const toast = useToast();
  const categoryName = useCategoryName();
  const [name, setName] = useState('');
  const [tone, setTone] = useState<EventTone>('blue');
  const [color, setColor] = useState<string | null>(null);
  const [removing, setRemoving] = useState<EventCategory | null>(null);
  const fail = () => toast.show(t('errors.saveFailed'), 'error');

  return (
    <>
      <Dialog open={open} onClose={onClose} title={t('calendar.config.title')} description={t('calendar.config.hint')} closeLabel={t('common.close')} footer={<Button variant="primary" onClick={onClose}>{t('common.done')}</Button>}>
        <ul className="flex flex-col gap-2">
          {cal.config.categories.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl bg-surface-2/50 p-2.5">
              <div className="flex items-center gap-2">
                <span className={cn('h-3 w-3 shrink-0 rounded-full', toneLook(c.tone, c.color).dot.className)} style={toneLook(c.tone, c.color).dot.style} aria-hidden />
                <Input
                  aria-label={t('tasks.config.rename')}
                  defaultValue={categoryName(c)}
                  maxLength={40}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== categoryName(c)) void updateEventCategory(c.id, { name: v }).catch(fail);
                  }}
                  className="min-w-0 flex-1"
                />
                {c.builtin ? <span className="h-9 w-9" aria-hidden /> : <IconButton size="sm" label={t('calendar.config.remove', { name: categoryName(c) })} icon={<X className="h-4 w-4" />} onClick={() => setRemoving(c)} />}
              </div>
              <CategoryColor
                tone={c.tone}
                color={c.color ?? null}
                label={categoryName(c)}
                onTone={(v) => void updateEventCategory(c.id, { tone: v, color: null }).catch(fail)}
                onColor={(v) => void updateEventCategory(c.id, { color: v }).catch(fail)}
              />
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2 rounded-xl p-2.5 ring-1 ring-line">
          <div className="flex items-center gap-2">
            <Input aria-label={t('calendar.config.name')} placeholder={t('calendar.config.name')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
            <Button icon={<Plus className="h-4 w-4" aria-hidden />} disabled={!name.trim()} onClick={() => void addEventCategory(name, tone, color).then(() => setName(''), fail)}>
              {t('calendar.config.add')}
            </Button>
          </div>
          <CategoryColor tone={tone} color={color} label={t('calendar.config.color')} onTone={(v) => (setTone(v), setColor(null))} onColor={setColor} />
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        danger
        title={removing ? t('calendar.config.removeTitle', { name: categoryName(removing) }) : ''}
        body={t('calendar.config.removeBody')}
        confirmLabel={removing ? t('calendar.config.remove', { name: categoryName(removing) }) : ''}
        cancelLabel={t('common.cancel')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target) void removeEventCategory(target.id).catch(fail);
        }}
      />
    </>
  );
}

/**
 * Cor da categoria: primeiro os tons do tema (mudam com claro/escuro), depois a
 * paleta do app e "Outra cor". Escolher um tom tira a cor própria.
 */
function CategoryColor({ tone, color, label, onTone, onColor }: { tone: EventTone; color: string | null; label: string; onTone: (t: EventTone) => void; onColor: (hex: string) => void }) {
  const { t } = useSettings();
  return (
    <ColorPicker
      size="sm"
      value={color}
      label={label}
      onChange={onColor}
      extra={
        <>
          {EVENT_TONES.map((tn) => (
            <button
              key={tn}
              type="button"
              role="radio"
              aria-checked={!color && tone === tn}
              aria-label={t('calendar.config.themeTone', { tone: t(`calendar.config.tones.${tn}`) })}
              onClick={() => onTone(tn)}
              className={cn('h-6 w-6 shrink-0 rounded-full ring-offset-2 ring-offset-surface transition', toneLook(tn).dot.className, !color && tone === tn && 'ring-2 ring-fg')}
            />
          ))}
          <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />
        </>
      }
    />
  );
}
