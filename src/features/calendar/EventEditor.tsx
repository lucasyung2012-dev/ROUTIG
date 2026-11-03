import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Bell, ListTodo, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import {
  createEvent,
  deleteFollowing,
  deleteOccurrence,
  EventRuleError,
  eventHistory,
  inputOf,
  restoreEvent,
  softDeleteEvent,
  updateEvent,
  updateFollowing,
  updateOccurrence,
} from '@/data/eventsRepo';
import { addDays, diffDays, formatDateKey, type DateKey } from '@/domain/dates';
import { emptyEventInput, fromMinutes, REMINDER_PRESETS, toMinutes, type CalendarEvent, type EditScope, type EventInput, type OccurrenceOverride } from '@/domain/events';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { RecurrenceFields } from './RecurrenceFields';
import { TONE_ITEM, useCalendarData, useCategoryName } from './useCalendarData';

/* ---------- Contexto ---------- */

type EditorTarget = { mode: 'edit'; eventId: string; seriesDate: DateKey } | { mode: 'new'; defaults: Partial<EventInput> };

interface EventEditorApi {
  openEvent: (eventId: string, seriesDate: DateKey) => void;
  newEvent: (defaults?: Partial<EventInput>) => void;
}

const EventEditorContext = createContext<EventEditorApi | null>(null);

export function EventEditorProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const api = useMemo<EventEditorApi>(
    () => ({
      openEvent: (eventId, seriesDate) => setTarget({ mode: 'edit', eventId, seriesDate }),
      newEvent: (defaults = {}) => setTarget({ mode: 'new', defaults }),
    }),
    [],
  );
  return (
    <EventEditorContext.Provider value={api}>
      {children}
      {target && <EventEditorDialog key={target.mode === 'edit' ? `${target.eventId}:${target.seriesDate}` : 'new'} target={target} onClose={() => setTarget(null)} />}
    </EventEditorContext.Provider>
  );
}

export function useEventEditor(): EventEditorApi {
  const ctx = useContext(EventEditorContext);
  if (!ctx) throw new Error('useEventEditor precisa estar dentro de EventEditorProvider');
  return ctx;
}

/* ---------- Janela ---------- */

/** Rascunho mostrado no editor: para uma ocorrência, já com as mudanças só daquela data. */
function draftFor(event: CalendarEvent, seriesDate: DateKey): EventInput {
  const base = inputOf(event);
  if (!event.recurrence) return base;
  const o = event.overrides[seriesDate] ?? {};
  const date = o.date ?? seriesDate;
  return {
    ...base,
    title: o.title ?? base.title,
    location: o.location ?? base.location,
    description: o.description ?? base.description,
    startTime: o.startTime !== undefined ? o.startTime : base.startTime,
    durationMin: o.durationMin ?? base.durationMin,
    start: date,
    endDate: addDays(date, diffDays(base.endDate, base.start)),
  };
}

/** Espera os dados carregarem antes de montar o formulário, para o rascunho nascer certo. */
function EventEditorDialog({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const cal = useCalendarData();
  if (cal.loading) return null;
  if (target.mode === 'edit' && !cal.events.some((e) => e.id === target.eventId)) return null;
  return <EventEditorForm target={target} onClose={onClose} cal={cal} />;
}

function EventEditorForm({ target, onClose, cal }: { target: EditorTarget; onClose: () => void; cal: ReturnType<typeof useCalendarData> }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const categoryName = useCategoryName();
  const taskEditor = useTaskEditor();
  const event = target.mode === 'edit' ? cal.events.find((e) => e.id === target.eventId) : undefined;
  const seriesDate = target.mode === 'edit' ? target.seriesDate : null;

  const initial = useMemo(
    () => (event && seriesDate ? draftFor(event, seriesDate) : emptyEventInput(target.mode === 'new' ? target.defaults : {})),
    // O rascunho nasce uma vez; mudanças vindas do banco não atropelam a edição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event?.id],
  );
  const [draft, setDraft] = useState<EventInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<null | 'save' | 'delete'>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const recurring = !!event?.recurrence;

  const change = (patch: Partial<EventInput>) => {
    setError(null);
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (patch.start && !patch.endDate) next.endDate = addDays(patch.start, diffDays(d.endDate, d.start));
      if (next.endDate < next.start) next.endDate = next.start;
      return next;
    });
  };

  const startMin = draft.startTime ? toMinutes(draft.startTime) : 0;
  const endTime = fromMinutes(startMin + draft.durationMin);

  // Conflitos do rascunho com outros eventos do mesmo dia (só aviso).
  const conflicts = useMemo(() => {
    if (draft.allDay || !draft.startTime) return [];
    const s = toMinutes(draft.startTime);
    const e = s + draft.durationMin;
    return cal
      .itemsInRange(draft.start, draft.start, { showTasks: false, categoryId: null })
      .filter((i) => i.kind === 'event' && i.start !== null && i.end !== null && !(event && i.occurrence?.event.id === event.id && i.occurrence.seriesDate === seriesDate))
      .filter((i) => i.start! < e && s < i.end!)
      .map((i) => i.title);
  }, [cal, draft.allDay, draft.start, draft.startTime, draft.durationMin, event, seriesDate]);

  const fail = (e: unknown) => setError(e instanceof EventRuleError && e.code === 'invalid' ? t('calendar.editor.invalid') : t('errors.saveFailed'));

  const validTitle = () => {
    if (draft.title.trim()) return true;
    setError(t('calendar.editor.titleRequired'));
    return false;
  };

  const save = async (s?: EditScope) => {
    if (!validTitle()) return;
    try {
      if (!event) {
        await createEvent(draft);
        toast.show(t('calendar.editor.created'));
      } else if (!recurring) {
        await updateEvent(event.id, draft);
        toast.show(t('calendar.editor.saved'));
      } else if (!s) {
        setScope('save');
        return;
      } else if (s === 'this') {
        // Só guarda o que difere da série, para a ocorrência continuar acompanhando o resto.
        const base = inputOf(event);
        const o: OccurrenceOverride = {};
        if (draft.title !== base.title) o.title = draft.title;
        if (draft.location !== base.location) o.location = draft.location;
        if (draft.description !== base.description) o.description = draft.description;
        if (draft.startTime !== base.startTime) o.startTime = draft.startTime;
        if (draft.durationMin !== base.durationMin) o.durationMin = draft.durationMin;
        if (draft.start !== seriesDate) o.date = draft.start;
        await updateOccurrence(event.id, seriesDate!, o);
        toast.show(t('calendar.editor.saved'));
      } else if (s === 'following') {
        await updateFollowing(event.id, seriesDate!, { ...draft, overrides: {} });
        toast.show(t('calendar.editor.saved'));
      } else {
        // Toda a série: desloca o início da série pelo mesmo tanto que a data desta ocorrência mudou.
        const shift = diffDays(draft.start, seriesDate!);
        const start = addDays(event.start, shift);
        await updateEvent(event.id, { ...draft, start, endDate: addDays(start, diffDays(draft.endDate, draft.start)), overrides: shift ? {} : event.overrides });
        toast.show(t('calendar.editor.saved'));
      }
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (s?: EditScope) => {
    if (!event) return;
    try {
      if (recurring && !s) {
        setScope('delete');
        return;
      }
      if (recurring && s === 'this') await deleteOccurrence(event.id, seriesDate!);
      else if (recurring && s === 'following') await deleteFollowing(event.id, seriesDate!);
      else {
        await softDeleteEvent(event.id);
        toast.show(t('calendar.editor.deleted'), 'success', { label: t('calendar.editor.undo'), run: () => void restoreEvent(event.id) });
        onClose();
        return;
      }
      toast.show(t('calendar.editor.deleted'));
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  const tryClose = () => (dirty ? setConfirmDiscard(true) : onClose());
  const linkedTask = draft.moduleRef?.module === 'tasks' ? cal.tasks.byId.get(draft.moduleRef.id) : undefined;
  const reminderLabel = (m: number) =>
    m === 0 ? t('calendar.editor.reminderAtStart') : m < 60 ? t('calendar.editor.reminderMin', { n: m }) : m < 1440 ? t('calendar.editor.reminderHour', { n: m / 60 }) : t('calendar.editor.reminderDay', { n: m / 1440 });


  return (
    <>
      <Dialog
        open
        size="lg"
        onClose={tryClose}
        closeLabel={t('common.close')}
        title={event ? t('calendar.editor.editTitle') : t('calendar.editor.newTitle')}
        description={recurring && seriesDate ? t('calendar.editor.occurrenceOf', { date: formatDateKey(seriesDate, settings.locale, { dateStyle: 'full' }) }) : undefined}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {event ? (
              <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => void remove()}>
                {t('calendar.editor.delete')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={tryClose}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={() => void save()}>
                {event ? t('calendar.editor.save') : t('calendar.editor.create')}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <label htmlFor="event-title" className="sr-only">
              {t('calendar.editor.titleLabel')}
            </label>
            <input
              id="event-title"
              autoFocus={!event}
              value={draft.title}
              maxLength={300}
              placeholder={t('calendar.editor.titlePlaceholder')}
              onChange={(e) => change({ title: e.target.value })}
              className="w-full rounded-xl bg-transparent px-1 py-1.5 text-xl font-semibold tracking-tight text-fg placeholder:text-subtle focus:bg-surface-2 focus:outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <Switch label={t('calendar.editor.allDay')} hint={t('calendar.editor.allDayHint')} checked={draft.allDay} onChange={(allDay) => change({ allDay, startTime: allDay ? null : draft.startTime ?? '09:00' })} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('calendar.editor.date')}>
              {(id) => <Input id={id} type="date" value={draft.start} onChange={(e) => e.target.value && change({ start: e.target.value })} />}
            </Field>
            {draft.allDay ? (
              <Field label={t('calendar.editor.endDate')}>
                {(id) => <Input id={id} type="date" min={draft.start} value={draft.endDate} onChange={(e) => e.target.value && change({ endDate: e.target.value })} />}
              </Field>
            ) : (
              <>
                <Field label={t('calendar.editor.startTime')}>
                  {(id) => <Input id={id} type="time" value={draft.startTime ?? ''} onChange={(e) => e.target.value && change({ startTime: e.target.value })} />}
                </Field>
                <Field label={t('calendar.editor.endTime')}>
                  {(id) => (
                    <Input
                      id={id}
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const d = toMinutes(e.target.value) - startMin;
                        if (d < 5) setError(t('calendar.editor.invalid'));
                        else change({ durationMin: d });
                      }}
                    />
                  )}
                </Field>
              </>
            )}
          </div>

          {conflicts.length > 0 && (
            <div role="status" className="flex items-start gap-2.5 rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-fg ring-1 ring-warning/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <div>
                <div className="font-medium">{t('calendar.conflictWith', { titles: conflicts.join(', ') })}</div>
                <div className="text-xs text-muted">{t('calendar.conflictHint')}</div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('calendar.editor.category')}>
              {(id) => (
                <Select id={id} value={draft.categoryId} onChange={(e) => change({ categoryId: e.target.value })}>
                  {cal.config.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryName(c)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('calendar.editor.location')}>
              {(id) => <Input id={id} value={draft.location} maxLength={300} placeholder={t('calendar.editor.locationPlaceholder')} onChange={(e) => change({ location: e.target.value })} />}
            </Field>
          </div>

          <div className="flex flex-wrap gap-1.5" aria-hidden>
            {cal.config.categories.map((c) => (
              <span key={c.id} className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] text-muted', c.id === draft.categoryId && 'bg-surface-2 text-fg')}>
                <span className={cn('h-2 w-2 rounded-full', TONE_ITEM[c.tone].dot)} />
                {categoryName(c)}
              </span>
            ))}
          </div>

          <Field label={t('calendar.editor.description')}>
            {(id) => <Textarea id={id} rows={3} value={draft.description} onChange={(e) => change({ description: e.target.value })} />}
          </Field>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg">{t('tasks.editor.recurrence')}</h3>
            {recurring && seriesDate && <p className="text-xs text-subtle">{t('calendar.editor.occurrenceOf', { date: formatDateKey(seriesDate, settings.locale) })}</p>}
            <RecurrenceFields value={draft.recurrence} start={draft.start} onChange={(recurrence) => change({ recurrence })} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Bell className="h-4 w-4 text-muted" aria-hidden />
              {t('calendar.editor.reminders')}
            </h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('calendar.editor.reminders')}>
              {REMINDER_PRESETS.map((m) => {
                const on = draft.reminders.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => change({ reminders: on ? draft.reminders.filter((x) => x !== m) : [...draft.reminders, m].sort((a, b) => a - b) })}
                    className={cn('h-9 rounded-lg px-3 text-sm font-medium ring-1 transition', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line')}
                  >
                    {reminderLabel(m)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-subtle">{t('calendar.editor.remindersLater')}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg">{t('calendar.editor.link')}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={t('calendar.editor.link')}
                value={draft.moduleRef?.module === 'tasks' ? draft.moduleRef.id : ''}
                onChange={(e) => change({ moduleRef: e.target.value ? { module: 'tasks', id: e.target.value } : null })}
                className="min-w-[14rem]"
              >
                <option value="">{t('calendar.editor.noLink')}</option>
                {cal.tasks.active.map((task) => (
                  <option key={task.id} value={task.id}>
                    {t('calendar.kindTask')}: {task.title}
                  </option>
                ))}
              </Select>
              {linkedTask && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ListTodo className="h-4 w-4" aria-hidden />}
                  onClick={() => {
                    onClose();
                    taskEditor.openTask(linkedTask.id);
                  }}
                >
                  {t('calendar.editor.openTask')}
                </Button>
              )}
            </div>
            <p className="text-xs text-subtle">{t('calendar.editor.linkHint')}</p>
          </section>

          <Field label={t('calendar.editor.notes')}>
            {(id) => <Textarea id={id} rows={2} value={draft.notes} onChange={(e) => change({ notes: e.target.value })} />}
          </Field>

          {event && <EventHistory eventId={event.id} rev={event.rev} />}
        </div>
      </Dialog>

      <Dialog
        open={scope !== null}
        size="sm"
        onClose={() => setScope(null)}
        closeLabel={t('common.cancel')}
        title={scope === 'delete' ? t('calendar.scope.deleteTitle') : t('calendar.scope.editTitle')}
        description={t('calendar.scope.body')}
      >
        <div className="flex flex-col gap-2 pb-2">
          {(['this', 'following', 'all'] as const).map((s) => (
            <Button
              key={s}
              variant={scope === 'delete' ? 'danger' : 'secondary'}
              className="justify-start"
              onClick={() => {
                const action = scope;
                setScope(null);
                void (action === 'delete' ? remove(s) : save(s));
              }}
            >
              {t(`calendar.scope.${s}`)}
            </Button>
          ))}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        title={t('calendar.editor.discardTitle')}
        body={t('calendar.editor.discardBody')}
        confirmLabel={t('calendar.editor.discard')}
        cancelLabel={t('calendar.editor.keepEditing')}
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}

function EventHistory({ eventId, rev }: { eventId: string; rev: number }) {
  const { t, settings } = useSettings();
  const entries = useLiveQuery(() => eventHistory(eventId), [eventId, rev]);
  const fmt = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'short', timeStyle: 'short' });
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-fg">{t('calendar.editor.history')}</h3>
      {!entries?.length ? (
        <p className="text-sm text-subtle">{t('tasks.editor.historyEmpty')}</p>
      ) : (
        <ol className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
          {entries.slice(0, 40).map((e) => (
            <li key={e.seq} className="flex gap-3 text-sm">
              <span className="w-28 shrink-0 tabular text-subtle">{fmt.format(new Date(e.at))}</span>
              <span className="text-muted">
                {e.action === 'update' ? t('tasks.history.update', { fields: (e.fields ?? []).join(', ') }) : e.action === 'skip' ? t('tasks.history.skip', { note: e.note ? formatDateKey(e.note, settings.locale) : '' }) : t(`tasks.history.${e.action}`)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
