import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Coffee, Pause, Play, SkipForward, Square, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { restoreFocusSession, softDeleteFocusSession } from '@/data/focusRepo';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import type { EntityRef } from '@/domain/entity';
import { FOCUS_KINDS, FOCUS_MODES, FOCUS_SOUNDS, formatClock, phaseElapsed, phaseRemaining, totalFocusMs, type FocusConfig, type FocusKind, type FocusMode, type FocusSound } from '@/domain/focus';
import { isClosedKind, statusKind } from '@/domain/tasks';
import type { MessageKey } from '@/i18n';
import { useFocus } from '@/features/focus/FocusProvider';
import { useTasksData } from '@/features/tasks/useTasksData';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { Meter, Readout, Row, Screen, SectionTitle, Station } from './station';

/*
 * Jardim da Concentração. Tudo passa pelo FocusProvider (o mesmo do Control Room, montado uma vez em
 * AppProviders): começar aqui e abrir o Focus no Control Room mostra a MESMA sessão, e sair do
 * edifício não para o timer. Nenhum segundo temporizador.
 */

/* ---------- Estação Focus (jardim central) ---------- */

export function FocusStation() {
  const { t } = useSettings();
  const focus = useFocus();
  return (
    <Station building="focus" name={t('park.native.westsouth.focus.station')} hint={t('park.native.westsouth.focus.sharedHint')}>
      {!focus.ready ? <p className="text-sm text-muted">{t('common.loading')}</p> : focus.timer ? <Running /> : <Setup />}
    </Station>
  );
}

function Setup() {
  const { t } = useSettings();
  const focus = useFocus();
  const tasks = useTasksData();
  const [mode, setMode] = useState<FocusMode>('pomodoro');
  const [kind, setKind] = useState<FocusKind>('study');
  const [customMin, setCustomMin] = useState(45);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [snd, setSnd] = useState<FocusSound>('none');
  const open = tasks.active.filter((x) => x.id === taskId || !isClosedKind(statusKind(tasks.config, x.statusId))).sort((a, b) => a.title.localeCompare(b.title));
  const cfg = focus.config;

  const start = () => {
    // Como no Control Room: a tarefa escolhida já liga a sessão ao projeto, à disciplina ou ao objetivo dela.
    const task = taskId ? tasks.byId.get(taskId) : undefined;
    const ref: EntityRef | null = task?.subjectId ? { type: 'subject', id: task.subjectId } : task?.projectId ? { type: 'project', id: task.projectId } : task?.goalId ? { type: 'goal', id: task.goalId } : null;
    focus.start({ mode, kind, taskId, ref, environment: 'nature', sound: snd, customMin });
  };

  return (
    <div className="flex flex-col gap-3">
      <Segmented<FocusMode> label={t('focus.fields.mode')} value={mode} onChange={setMode} options={FOCUS_MODES.map((m) => ({ value: m, label: t(`focus.modes.${m}`) }))} />
      <p className="text-xs text-muted">{mode === 'pomodoro' ? t('focus.modeHints.pomodoro', { focus: cfg.focusMin, short: cfg.shortBreakMin, long: cfg.longBreakMin, cycles: cfg.cyclesBeforeLong }) : t(`focus.modeHints.${mode}`)}</p>
      {mode === 'custom' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[15, 25, 45, 60, 90].map((m) => (
            <Button key={m} size="sm" variant={customMin === m ? 'primary' : 'secondary'} aria-pressed={customMin === m} onClick={() => setCustomMin(m)}>
              {t('focus.min', { min: m })}
            </Button>
          ))}
          <Input aria-label={t('focus.fields.minutes')} type="number" inputMode="numeric" min={1} max={480} value={customMin} onChange={(e) => setCustomMin(Math.max(1, Math.min(480, Math.round(Number(e.target.value) || 1))))} className="h-9 w-20" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('focus.fields.kind')}>
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as FocusKind)}>
              {FOCUS_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`focus.kinds.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('focus.fields.sound')}>
          {(id) => (
            <Select id={id} value={snd} onChange={(e) => setSnd(e.target.value as FocusSound)}>
              {FOCUS_SOUNDS.map((s) => (
                <option key={s} value={s}>
                  {t(`focus.sounds.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label={t('focus.fields.task')} optionalLabel={t('common.optional')} hint={taskId ? t('focus.taskHint') : undefined}>
        {(id, d) => (
          <Select id={id} aria-describedby={d} value={taskId ?? ''} onChange={(e) => setTaskId(e.target.value || null)}>
            <option value="">{t('focus.noTask')}</option>
            {open.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button variant="primary" icon={<Play className="h-4 w-4" />} onClick={start}>
        {t('focus.start')}
      </Button>
    </div>
  );
}

function Running() {
  const { t } = useSettings();
  const toast = useToast();
  const focus = useFocus();
  const tasks = useTasksData();
  const [finishing, setFinishing] = useState(false);
  const [notes, setNotes] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const timer = focus.timer;
  if (!timer) return null;

  const elapsed = phaseElapsed(timer, focus.now);
  const remaining = phaseRemaining(timer, focus.now);
  const clock = formatClock(timer.waiting ? (timer.phaseMs ?? 0) : (remaining ?? elapsed));
  const progress = timer.phaseMs ? Math.min(1, elapsed / timer.phaseMs) : null;
  const focusMin = Math.floor(totalFocusMs(timer, focus.now) / 60_000);
  const phase = timer.waiting ? (timer.phase === 'focus' ? t('focus.nextFocus') : t('focus.nextBreak')) : timer.runningSince === null ? t('focus.paused') : t(`focus.phases.${timer.phase}`);
  const task = timer.taskId ? tasks.byId.get(timer.taskId) : undefined;
  const showFinish = finishing || focus.ended;

  const save = async () => {
    const min = Math.round(totalFocusMs(timer, focus.now) / 60_000);
    try {
      await focus.finish(notes);
      toast.show(t('focus.saved', { min }));
      setNotes('');
      setFinishing(false);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Screen building="focus" className="flex flex-col items-center gap-2 py-5">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">{phase}</span>
        <span role="timer" aria-live="off" className="text-5xl font-light tabular-nums tracking-tight">
          {clock}
        </span>
        <span className="text-xs text-white/60">{timer.mode === 'pomodoro' ? t('focus.cycles', { count: timer.cycles }) : timer.mode === 'continuous' ? t('focus.continuous') : t('focus.of', { min: timer.plannedMin ?? 0 })}</span>
        {progress !== null && <Meter percent={progress * 100} building="focus" dark className="mt-1 w-full max-w-60" />}
        <span className="mt-1 text-center text-xs text-white/70">
          {t(`focus.kinds.${timer.kind}`)}
          {task && ` · ${task.title}`}
        </span>
        <span className="text-xs text-white/60">{t('focus.focusSoFar', { min: focusMin })}</span>
      </Screen>

      {!showFinish && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {timer.waiting && timer.mode === 'pomodoro' ? (
            <Button variant="primary" size="sm" icon={<Play className="h-4 w-4" />} onClick={focus.startNext}>
              {timer.phase === 'focus' ? t('focus.startFocus') : t('focus.startBreak')}
            </Button>
          ) : timer.runningSince === null ? (
            <Button variant="primary" size="sm" icon={<Play className="h-4 w-4" />} onClick={focus.resume}>
              {t('focus.resume')}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={<Pause className="h-4 w-4" />} onClick={focus.pause}>
              {t('focus.pause')}
            </Button>
          )}
          {timer.mode === 'pomodoro' && !timer.waiting && (
            <Button variant="secondary" size="sm" icon={timer.phase === 'focus' ? <Coffee className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />} onClick={focus.skip}>
              {timer.phase === 'focus' ? t('focus.breakNow') : t('focus.skipBreak')}
            </Button>
          )}
          <Button variant="secondary" size="sm" icon={<Square className="h-4 w-4" />} onClick={() => setFinishing(true)}>
            {t('focus.finish')}
          </Button>
          <Button variant="ghost" size="sm" icon={<X className="h-4 w-4" />} onClick={() => setConfirmDiscard(true)}>
            {t('focus.discard')}
          </Button>
        </div>
      )}

      {showFinish && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
          <p className="text-sm font-medium text-fg">{t('focus.finishTitle')}</p>
          <p className="text-xs text-muted">{t('focus.finishSummary', { min: Math.round(totalFocusMs(timer, focus.now) / 60_000), cycles: timer.cycles })}</p>
          <Textarea aria-label={t('focus.fields.notes')} rows={3} maxLength={4000} value={notes} placeholder={t('focus.notesPlaceholder')} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex flex-wrap justify-end gap-2">
            {!focus.ended && (
              <Button size="sm" variant="secondary" onClick={() => setFinishing(false)}>
                {t('focus.keepGoing')}
              </Button>
            )}
            {focus.ended && (
              <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setConfirmDiscard(true)}>
                {t('focus.discard')}
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => void save()}>
              {t('focus.saveSession')}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title={t('focus.discardTitle')}
        body={t('focus.discardBody')}
        confirmLabel={t('focus.discard')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          setFinishing(false);
          focus.discard();
        }}
      />
    </div>
  );
}

/* ---------- Sala de Histórico (sessões registradas) ---------- */

export function FocusHistoryStation() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const tasks = useTasksData();
  const today = todayKey();
  const from = addDays(today, -29);
  const sessions = useLiveQuery(async () => (await getDb().focusSessions.where('date').aboveOrEqual(from).toArray()).filter((s) => !s.deletedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [from]);
  const weekFrom = addDays(today, -6);
  const list = sessions ?? [];
  const week = list.filter((s) => s.date >= weekFrom);
  const sum = (xs: typeof list) => xs.reduce((a, s) => a + s.actualMin, 0);
  const time = new Intl.DateTimeFormat(settings.locale, { timeStyle: 'short' });

  return (
    <Station building="focus" name={t('park.native.westsouth.focus.historyStation')}>
      <Screen building="focus" className="grid grid-cols-3 gap-2">
        <Readout value={t('focus.min', { min: sum(list.filter((s) => s.date === today)) })} label={t('focus.stats.today')} />
        <Readout value={t('focus.min', { min: sum(week) })} label={t('focus.stats.week')} />
        <Readout value={week.length} label={t('focus.stats.sessions')} />
      </Screen>
      <SectionTitle>{t('park.native.westsouth.focus.last30')}</SectionTitle>
      {sessions === undefined ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t('focus.noSessions')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.slice(0, 25).map((s) => {
            const task = s.taskId ? tasks.byId.get(s.taskId) : undefined;
            return (
              <Row key={s.id}>
                <div className="w-16 shrink-0 text-xs text-muted">
                  {formatDateKey(s.date, settings.locale)}
                  {!s.manual && <span className="block">{time.format(new Date(s.startedAt))}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">
                    {t(`focus.kinds.${s.kind}`)} · {t('focus.min', { min: s.actualMin })}
                    {!s.completed && <span className="font-normal text-muted"> · {t('focus.stoppedEarly')}</span>}
                    {s.manual && <span className="font-normal text-muted"> · {t('focus.manual')}</span>}
                  </div>
                  {task && <div className="truncate text-xs text-muted">{task.title}</div>}
                  {s.notes && <div className="line-clamp-2 text-xs text-muted">{s.notes}</div>}
                </div>
                <IconButton
                  size="sm"
                  label={t('focus.removeSession')}
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() =>
                    void softDeleteFocusSession(s.id).then(
                      () => toast.show(t('focus.sessionRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreFocusSession(s.id) }),
                      () => toast.show(t('errors.saveFailed'), 'error'),
                    )
                  }
                />
              </Row>
            );
          })}
        </ul>
      )}
    </Station>
  );
}

/* ---------- Preparação: bloqueio de distrações e ajustes do Pomodoro ---------- */

export function FocusPrepareStation() {
  const { t } = useSettings();
  return (
    <Station building="focus" name={t('park.native.westsouth.focus.prepareStation')}>
      {/* O ROUTIG é um site (PWA): não bloqueia outros apps. Aqui só orienta a configurar o iPad. */}
      <div className="flex flex-col gap-2 text-sm text-fg">
        <p className="text-muted">{t('park.focus.distraction.intro')}</p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>{t(`park.focus.distraction.step${n}` as MessageKey)}</li>
          ))}
        </ol>
        <p className="text-xs text-subtle">{t('park.focus.distraction.limit')}</p>
      </div>
      <SectionTitle>{t('focus.settings')}</SectionTitle>
      <ConfigForm />
    </Station>
  );
}

function ConfigForm() {
  const { t } = useSettings();
  const toast = useToast();
  const focus = useFocus();
  const [cfg, setCfg] = useState<FocusConfig>(focus.config);
  // O provider carrega a configuração do banco depois do primeiro desenho.
  useEffect(() => setCfg(focus.config), [focus.config]);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(focus.config);
  const num = (key: 'focusMin' | 'shortBreakMin' | 'longBreakMin' | 'cyclesBeforeLong', max: number) => (
    <Field label={t(`focus.cfg.${key}`)}>
      {(id) => <Input id={id} type="number" inputMode="numeric" min={key === 'cyclesBeforeLong' ? 2 : 1} max={max} value={cfg[key]} onChange={(e) => setCfg({ ...cfg, [key]: Math.max(key === 'cyclesBeforeLong' ? 2 : 1, Math.min(max, Math.round(Number(e.target.value) || 1))) })} />}
    </Field>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {num('focusMin', 240)}
        {num('shortBreakMin', 60)}
        {num('longBreakMin', 120)}
        {num('cyclesBeforeLong', 12)}
      </div>
      <Switch checked={cfg.autoStartBreaks} onChange={(v) => setCfg({ ...cfg, autoStartBreaks: v })} label={t('focus.cfg.autoStartBreaks')} />
      <Switch checked={cfg.autoStartFocus} onChange={(v) => setCfg({ ...cfg, autoStartFocus: v })} label={t('focus.cfg.autoStartFocus')} />
      <Button
        variant="primary"
        size="sm"
        disabled={!dirty}
        className="self-end"
        onClick={() =>
          void focus.setConfig(cfg).then(
            () => toast.show(t('focus.settingsSaved')),
            () => toast.show(t('focus.errors.invalid'), 'error'),
          )
        }
      >
        {t('common.save')}
      </Button>
    </div>
  );
}
