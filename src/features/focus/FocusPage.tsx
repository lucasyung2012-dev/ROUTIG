import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Coffee, Maximize2, Minimize2, Pause, Play, Plus, Settings2, SkipForward, Square, Timer, Trash2, Volume2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { restoreFocusSession, saveFocusSession, softDeleteFocusSession, updateFocusSession } from '@/data/focusRepo';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import {
  ENVIRONMENT_SOUND,
  FOCUS_ENVIRONMENTS,
  FOCUS_KINDS,
  FOCUS_MODES,
  FOCUS_SOUNDS,
  formatClock,
  minutesByKind,
  phaseElapsed,
  phaseRemaining,
  totalFocusMs,
  type FocusConfig,
  type FocusEnvironment,
  type FocusKind,
  type FocusMode,
  type FocusSession,
  type FocusSound,
} from '@/domain/focus';
import type { EntityRef } from '@/domain/entity';
import { isClosedKind, statusKind } from '@/domain/tasks';
import { useTasksData } from '@/features/tasks/useTasksData';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Segmented';
import { LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { useFocus } from './FocusProvider';
import { ENVIRONMENT_LOOK, FOCUS_REF_TYPES, KIND_REF, parseRefKey, REF_PATH, refKeyOf, useFocusRefOptions, type FocusRefType } from './focusUi';
import { sound } from './sound';

/** Focus (Parte 13): um lugar para se concentrar, com timer, ambientes e registro das sessões. */
export function FocusPage() {
  const { t } = useSettings();
  const focus = useFocus();
  const [immersive, setImmersive] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (focus.ended) setFinishing(true);
  }, [focus.ended]);
  useEffect(() => {
    if (!focus.timer) setImmersive(false);
  }, [focus.timer]);

  if (!focus.ready) return <LoadingState label={t('common.loading')} lines={4} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('modules.focus')}
        title={t('modules.focus')}
        description={t('moduleSummary.focus')}
        icon={<Timer className="h-7 w-7" aria-hidden />}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setManual(true)}>
              {t('focus.logManual')}
            </Button>
            <IconButton label={t('focus.settings')} icon={<Settings2 className="h-4 w-4" />} onClick={() => setSettingsOpen(true)} />
          </>
        }
      />

      {focus.timer ? <ActiveSession onImmersive={() => setImmersive(true)} onFinish={() => setFinishing(true)} /> : <Setup />}

      <Stats />
      <History />

      {immersive && focus.timer && <Immersive onClose={() => setImmersive(false)} onFinish={() => setFinishing(true)} />}
      {finishing && focus.timer && <FinishDialog onClose={() => setFinishing(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {manual && <ManualDialog onClose={() => setManual(false)} />}
    </div>
  );
}

/* ---------- Preparar ---------- */

function RefSelect({ value, onChange, kind }: { value: EntityRef | null; onChange: (r: EntityRef | null) => void; kind: FocusKind }) {
  const { t } = useSettings();
  const options = useFocusRefOptions();
  const first = KIND_REF[kind];
  const order: FocusRefType[] = first ? [first, ...FOCUS_REF_TYPES.filter((x) => x !== first)] : [...FOCUS_REF_TYPES];
  return (
    <Field label={t('focus.fields.ref')} optionalLabel={t('common.optional')}>
      {(id) => (
        <Select id={id} value={refKeyOf(value)} onChange={(e) => onChange(parseRefKey(e.target.value))}>
          <option value="">{t('focus.noRef')}</option>
          {order.map((type) =>
            options?.[type]?.length ? (
              <optgroup key={type} label={t(`focus.refTypes.${type}`)}>
                {options[type].map((o) => (
                  <option key={o.id} value={`${type}:${o.id}`}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </Select>
      )}
    </Field>
  );
}

function TaskSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useSettings();
  const tasks = useTasksData();
  const open = tasks.active.filter((x) => x.id === value || !isClosedKind(statusKind(tasks.config, x.statusId))).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <Field label={t('focus.fields.task')} optionalLabel={t('common.optional')} hint={value ? t('focus.taskHint') : undefined}>
      {(id, d) => (
        <Select id={id} aria-describedby={d} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t('focus.noTask')}</option>
          {open.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function Setup() {
  const { t } = useSettings();
  const focus = useFocus();
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<FocusMode>('pomodoro');
  const [kind, setKind] = useState<FocusKind>('study');
  const [customMin, setCustomMin] = useState(45);
  const [taskId, setTaskId] = useState<string | null>(() => params.get('task'));
  const [ref, setRef] = useState<EntityRef | null>(null);
  const [environment, setEnvironment] = useState<FocusEnvironment>('minimal');
  const [snd, setSnd] = useState<FocusSound>('none');
  const task = useLiveQuery(() => (taskId ? getDb().tasks.get(taskId) : undefined), [taskId]);

  // Vindo de uma tarefa (Parte 13.6): já liga a tarefa e o projeto ou a disciplina dela.
  useEffect(() => {
    if (!task || ref) return;
    if (task.subjectId) setRef({ type: 'subject', id: task.subjectId });
    else if (task.projectId) setRef({ type: 'project', id: task.projectId });
    else if (task.goalId) setRef({ type: 'goal', id: task.goalId });
  }, [task, ref]);

  const start = () => {
    focus.start({ mode, kind, taskId, ref, environment, sound: snd, customMin });
    if (params.has('task')) setParams({}, { replace: true });
  };

  return (
    <Surface className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
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
        <TaskSelect value={taskId} onChange={setTaskId} />
        <RefSelect value={ref} onChange={setRef} kind={kind} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-fg">{t('focus.fields.mode')}</h2>
        <Segmented<FocusMode> label={t('focus.fields.mode')} value={mode} onChange={setMode} options={FOCUS_MODES.map((m) => ({ value: m, label: t(`focus.modes.${m}`) }))} />
        <p className="text-xs text-muted">{mode === 'pomodoro' ? t('focus.modeHints.pomodoro', { focus: focus.config.focusMin, short: focus.config.shortBreakMin, long: focus.config.longBreakMin, cycles: focus.config.cyclesBeforeLong }) : t(`focus.modeHints.${mode}`)}</p>
        {mode === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            {[15, 30, 45, 60, 90].map((m) => (
              <Button key={m} size="sm" variant={customMin === m ? 'primary' : 'secondary'} onClick={() => setCustomMin(m)}>
                {t('focus.min', { min: m })}
              </Button>
            ))}
            <Input aria-label={t('focus.fields.minutes')} type="number" inputMode="numeric" min={1} max={480} value={customMin} onChange={(e) => setCustomMin(Math.max(1, Math.min(480, Math.round(Number(e.target.value) || 1))))} className="h-9 w-24" />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-fg">{t('focus.fields.environment')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {FOCUS_ENVIRONMENTS.map((env) => {
            const look = ENVIRONMENT_LOOK[env];
            return (
              <button
                key={env}
                type="button"
                aria-pressed={environment === env}
                onClick={() => {
                  setEnvironment(env);
                  setSnd(ENVIRONMENT_SOUND[env]);
                }}
                className={cn('relative h-20 overflow-hidden rounded-2xl text-left ring-2 transition', environment === env ? 'ring-accent' : 'ring-transparent hover:ring-line')}
                style={look.style}
              >
                <span className="absolute inset-0 scale-[0.6] origin-top-left" aria-hidden>
                  {look.decor}
                </span>
                <span className={cn('absolute bottom-2 left-3 text-sm font-semibold drop-shadow', look.text)}>{t(`focus.environments.${env}`)}</span>
              </button>
            );
          })}
        </div>
        <SoundPicker value={snd} onChange={setSnd} />
      </section>

      <Button variant="primary" size="lg" icon={<Play className="h-5 w-5" />} onClick={start} className="w-full sm:w-fit">
        {t('focus.start')}
      </Button>
    </Surface>
  );
}

function SoundPicker({ value, onChange }: { value: FocusSound; onChange: (s: FocusSound) => void }) {
  const { t } = useSettings();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Volume2 className="h-4 w-4 text-muted" aria-hidden />
      <Select aria-label={t('focus.fields.sound')} value={value} onChange={(e) => onChange(e.target.value as FocusSound)} className="h-9 w-auto">
        {FOCUS_SOUNDS.map((s) => (
          <option key={s} value={s}>
            {t(`focus.sounds.${s}`)}
          </option>
        ))}
      </Select>
      {!sound.available && <span className="text-xs text-muted">{t('focus.noAudio')}</span>}
    </div>
  );
}

/* ---------- Sessão em andamento ---------- */

function useClock() {
  const { timer, now } = useFocus();
  if (!timer) return null;
  const remaining = phaseRemaining(timer, now);
  const elapsed = phaseElapsed(timer, now);
  const progress = timer.phaseMs ? Math.min(1, elapsed / timer.phaseMs) : null;
  return { timer, clock: formatClock(timer.waiting ? (timer.phaseMs ?? 0) : (remaining ?? elapsed)), progress, focusMin: Math.floor(totalFocusMs(timer, now) / 60_000) };
}

function Ring({ progress, size = 240, children, light = false }: { progress: number | null; size?: number; children: ReactNode; light?: boolean }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} className={light ? 'stroke-white/15' : 'stroke-surface-3'} />
        {progress !== null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} className={light ? 'stroke-white/80' : 'stroke-accent'} style={{ transition: 'stroke-dashoffset 0.3s linear' }} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function Controls({ onFinish, light = false }: { onFinish: () => void; light?: boolean }) {
  const { t } = useSettings();
  const focus = useFocus();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const timer = focus.timer;
  if (!timer) return null;
  const variant = light ? 'ghost' : 'secondary';
  const lightCls = light ? 'text-white ring-1 ring-white/30 hover:bg-white/10 hover:text-white' : '';
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {timer.waiting && timer.mode === 'pomodoro' ? (
        <Button variant="primary" icon={<Play className="h-4 w-4" />} onClick={focus.startNext}>
          {timer.phase === 'focus' ? t('focus.startFocus') : t('focus.startBreak')}
        </Button>
      ) : timer.runningSince === null ? (
        <Button variant="primary" icon={<Play className="h-4 w-4" />} onClick={focus.resume}>
          {t('focus.resume')}
        </Button>
      ) : (
        <Button variant={variant} className={lightCls} icon={<Pause className="h-4 w-4" />} onClick={focus.pause}>
          {t('focus.pause')}
        </Button>
      )}
      {timer.mode === 'pomodoro' && !timer.waiting && (
        <Button variant={variant} className={lightCls} icon={timer.phase === 'focus' ? <Coffee className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />} onClick={focus.skip}>
          {timer.phase === 'focus' ? t('focus.breakNow') : t('focus.skipBreak')}
        </Button>
      )}
      <Button variant={variant} className={lightCls} icon={<Square className="h-4 w-4" />} onClick={onFinish}>
        {t('focus.finish')}
      </Button>
      <Button variant="ghost" className={light ? 'text-white/70 hover:bg-white/10 hover:text-white' : ''} icon={<X className="h-4 w-4" />} onClick={() => setConfirmDiscard(true)}>
        {t('focus.discard')}
      </Button>
      <ConfirmDialog open={confirmDiscard} title={t('focus.discardTitle')} body={t('focus.discardBody')} confirmLabel={t('focus.discard')} cancelLabel={t('common.cancel')} danger onCancel={() => setConfirmDiscard(false)} onConfirm={() => (setConfirmDiscard(false), focus.discard())} />
    </div>
  );
}

function PhaseLabel({ light = false }: { light?: boolean }) {
  const { t } = useSettings();
  const { timer } = useFocus();
  if (!timer) return null;
  const label = timer.waiting ? (timer.phase === 'focus' ? t('focus.nextFocus') : t('focus.nextBreak')) : timer.runningSince === null ? t('focus.paused') : t(`focus.phases.${timer.phase}`);
  return <span className={cn('text-sm font-medium uppercase tracking-[0.18em]', light ? 'text-white/70' : 'text-subtle')}>{label}</span>;
}

function SessionInfo() {
  const { t } = useSettings();
  const { timer } = useFocus();
  const task = useLiveQuery(() => (timer?.taskId ? getDb().tasks.get(timer.taskId) : undefined), [timer?.taskId]);
  const options = useFocusRefOptions();
  if (!timer) return null;
  const refType = timer.ref?.type as FocusRefType | undefined;
  const refName = refType && options?.[refType]?.find((o) => o.id === timer.ref?.id)?.name;
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm text-muted">
      <span>{t(`focus.kinds.${timer.kind}`)}</span>
      {task && <span>· {task.title}</span>}
      {refType && refName && (
        <Link to={`${REF_PATH[refType]}${timer.ref!.id}`} className="hover:text-accent">
          · {refName}
        </Link>
      )}
    </div>
  );
}

function ActiveSession({ onImmersive, onFinish }: { onImmersive: () => void; onFinish: () => void }) {
  const { t } = useSettings();
  const focus = useFocus();
  const c = useClock();
  if (!c) return null;
  const { timer } = c;
  return (
    <Surface className="flex flex-col items-center gap-5 py-8">
      <PhaseLabel />
      <Ring progress={c.progress}>
        <span className="text-6xl font-semibold tabular tracking-tight text-fg">{c.clock}</span>
        <span className="mt-1 text-sm text-muted">{timer.mode === 'pomodoro' ? t('focus.cycles', { count: timer.cycles }) : timer.mode === 'continuous' ? t('focus.continuous') : t('focus.of', { min: timer.plannedMin ?? 0 })}</span>
      </Ring>
      <SessionInfo />
      <p className="text-sm text-muted">{t('focus.focusSoFar', { min: c.focusMin })}</p>
      <Controls onFinish={onFinish} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <SoundPicker value={timer.sound} onChange={focus.setSound} />
        <Select aria-label={t('focus.fields.environment')} value={timer.environment} onChange={(e) => focus.setEnvironment(e.target.value as FocusEnvironment)} className="h-9 w-auto">
          {FOCUS_ENVIRONMENTS.map((env) => (
            <option key={env} value={env}>
              {t(`focus.environments.${env}`)}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" icon={<Maximize2 className="h-4 w-4" />} onClick={onImmersive}>
          {timer.environment === 'minimal' ? t('focus.minimalMode') : t('focus.immersiveMode')}
        </Button>
      </div>
    </Surface>
  );
}

/* ---------- Imersivo e minimalista (Parte 13.1) ---------- */

function Immersive({ onClose, onFinish }: { onClose: () => void; onFinish: () => void }) {
  const { t } = useSettings();
  const c = useClock();
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) void el.requestFullscreen().catch(() => undefined);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);
  if (!c) return null;
  const look = ENVIRONMENT_LOOK[c.timer.environment];
  // Portal no <body>: a animação da página criaria um contêiner e a tela cheia não cobriria o menu.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t(`focus.environments.${c.timer.environment}`)} className={cn('fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 overflow-hidden p-6', look.text)} style={look.style}>
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {look.decor}
      </div>
      <button type="button" onClick={onClose} aria-label={t('focus.exitImmersive')} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-white/70 ring-1 ring-white/20 transition hover:bg-white/10 hover:text-white safe-top">
        <Minimize2 className="h-5 w-5" />
      </button>
      <div className="relative flex flex-col items-center gap-6">
        <PhaseLabel light />
        {c.timer.environment === 'minimal' ? (
          <span className="text-[min(28vw,12rem)] font-light leading-none tabular tracking-tight">{c.clock}</span>
        ) : (
          <Ring progress={c.progress} size={300} light>
            <span className="text-7xl font-light tabular tracking-tight">{c.clock}</span>
          </Ring>
        )}
        <Controls onFinish={onFinish} light />
      </div>
    </div>
,
    document.body,
  );
}

/* ---------- Encerrar e registrar (Parte 13.4) ---------- */

function FinishDialog({ onClose }: { onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const focus = useFocus();
  const [notes, setNotes] = useState('');
  const timer = focus.timer;
  if (!timer) return null;
  const min = Math.round(totalFocusMs(timer, focus.now) / 60_000);
  const save = async () => {
    try {
      await focus.finish(notes);
      toast.show(t('focus.saved', { min }));
      onClose();
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('focus.finishTitle')}
      description={t('focus.finishSummary', { min, cycles: timer.cycles })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {focus.ended ? t('common.close') : t('focus.keepGoing')}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('focus.saveSession')}
          </Button>
        </>
      }
    >
      <Field label={t('focus.fields.notes')} optionalLabel={t('common.optional')}>
        {(id) => <Textarea id={id} rows={4} maxLength={4000} value={notes} placeholder={t('focus.notesPlaceholder')} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

function ManualDialog({ onClose }: { onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<FocusKind>('study');
  const [min, setMin] = useState(30);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [ref, setRef] = useState<EntityRef | null>(null);
  const [notes, setNotes] = useState('');
  const save = async () => {
    try {
      const at = new Date(`${date}T12:00`).toISOString();
      await saveFocusSession({ date, startedAt: at, endedAt: at, kind, mode: 'custom', plannedMin: min, actualMin: min, breakMin: 0, cycles: 0, completed: true, taskId, ref, environment: 'minimal', notes, manual: true });
      toast.show(t('focus.saved', { min }));
      onClose();
    } catch {
      toast.show(t('focus.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('focus.logManual')}
      description={t('focus.manualHint')}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('focus.fields.date')}>{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        <Field label={t('focus.fields.minutes')}>{(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={1440} value={min} onChange={(e) => setMin(Math.max(1, Math.round(Number(e.target.value) || 1)))} />}</Field>
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
        <TaskSelect value={taskId} onChange={setTaskId} />
        <RefSelect value={ref} onChange={setRef} kind={kind} />
        <div className="sm:col-span-2">
          <Field label={t('focus.fields.notes')} optionalLabel={t('common.optional')}>
            {(id) => <Textarea id={id} rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const focus = useFocus();
  const [cfg, setCfg] = useState<FocusConfig>(focus.config);
  const num = (k: keyof FocusConfig, label: string, max: number) => (
    <Field label={label}>{(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={max} value={cfg[k] as number} onChange={(e) => setCfg({ ...cfg, [k]: Math.max(1, Math.min(max, Math.round(Number(e.target.value) || 1))) })} />}</Field>
  );
  const save = async () => {
    try {
      await focus.setConfig(cfg);
      toast.show(t('focus.settingsSaved'));
      onClose();
    } catch {
      toast.show(t('focus.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('focus.settings')}
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
        <div className="grid gap-4 sm:grid-cols-2">
          {num('focusMin', t('focus.cfg.focusMin'), 240)}
          {num('shortBreakMin', t('focus.cfg.shortBreakMin'), 60)}
          {num('longBreakMin', t('focus.cfg.longBreakMin'), 120)}
          {num('cyclesBeforeLong', t('focus.cfg.cyclesBeforeLong'), 12)}
        </div>
        <Switch checked={cfg.autoStartBreaks} onChange={(v) => setCfg({ ...cfg, autoStartBreaks: v })} label={t('focus.cfg.autoStartBreaks')} />
        <Switch checked={cfg.autoStartFocus} onChange={(v) => setCfg({ ...cfg, autoStartFocus: v })} label={t('focus.cfg.autoStartFocus')} />
        <Field label={t('focus.cfg.volume', { pct: Math.round(cfg.volume * 100) })}>
          {(id) => <input id={id} type="range" min={0} max={1} step={0.05} value={cfg.volume} onChange={(e) => setCfg({ ...cfg, volume: Number(e.target.value) })} className="w-full accent-[rgb(var(--accent))]" />}
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------- Números e histórico ---------- */

function useSessions(days: number) {
  const from = addDays(todayKey(), -(days - 1));
  return useLiveQuery(async () => (await getDb().focusSessions.where('date').aboveOrEqual(from).toArray()).filter((s) => !s.deletedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [from]);
}

function Stats() {
  const { t, settings } = useSettings();
  const sessions = useSessions(30);
  const today = todayKey();
  const stats = useMemo(() => {
    const list = sessions ?? [];
    const week = list.filter((s) => s.date >= addDays(today, -6));
    const byDay = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i - 6);
      return { d, min: week.filter((s) => s.date === d).reduce((a, s) => a + s.actualMin, 0) };
    });
    return { today: list.filter((s) => s.date === today).reduce((a, s) => a + s.actualMin, 0), week: week.reduce((a, s) => a + s.actualMin, 0), sessions: week.length, byDay, byKind: minutesByKind(list) };
  }, [sessions, today]);
  if (!sessions) return null;
  const top = Math.max(1, ...stats.byDay.map((x) => x.min));
  const kinds = FOCUS_KINDS.filter((k) => stats.byKind[k] > 0).sort((a, b) => stats.byKind[b] - stats.byKind[a]);
  const kindTop = Math.max(1, ...kinds.map((k) => stats.byKind[k]));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Surface className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-2xl font-semibold tabular text-fg">{t('focus.min', { min: stats.today })}</div>
            <div className="text-xs text-muted">{t('focus.stats.today')}</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular text-fg">{t('focus.min', { min: stats.week })}</div>
            <div className="text-xs text-muted">{t('focus.stats.week')}</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular text-fg">{stats.sessions}</div>
            <div className="text-xs text-muted">{t('focus.stats.sessions')}</div>
          </div>
        </div>
        <div className="flex h-28 items-end gap-2" role="img" aria-label={stats.byDay.map((x) => `${formatDateKey(x.d, settings.locale)}: ${x.min} min`).join('; ')}>
          {stats.byDay.map((x) => (
            <div key={x.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[0.625rem] tabular text-muted">{x.min || ''}</span>
              <span className="w-full rounded-t-md bg-brand" style={{ height: `${(x.min / top) * 100}%`, minHeight: x.min ? 3 : 0 }} />
              <span className={cn('text-[0.625rem] capitalize', x.d === today ? 'font-semibold text-accent' : 'text-subtle')}>{new Intl.DateTimeFormat(settings.locale, { weekday: 'short' }).format(new Date(`${x.d}T12:00`)).replace('.', '')}</span>
            </div>
          ))}
        </div>
      </Surface>
      <Surface className="flex flex-col gap-2">
        <h2 className="font-semibold text-fg">{t('focus.stats.byKind')}</h2>
        {kinds.length === 0 ? (
          <p className="text-sm text-muted">{t('focus.noSessions')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {kinds.map((k) => (
              <li key={k} className="flex items-center gap-2 text-sm">
                <span className="w-28 truncate text-fg">{t(`focus.kinds.${k}`)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${(stats.byKind[k] / kindTop) * 100}%` }} />
                </span>
                <span className="w-16 text-right text-xs tabular text-muted">{t('focus.min', { min: stats.byKind[k] })}</span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

function History() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const sessions = useSessions(60);
  const tasks = useTasksData();
  const options = useFocusRefOptions();
  const [editing, setEditing] = useState<FocusSession | null>(null);
  if (!sessions) return null;
  return (
    <Surface className="flex flex-col gap-2">
      <h2 className="font-semibold text-fg">{t('focus.history')}</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted">{t('focus.noSessions')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/60">
          {sessions.slice(0, 40).map((s) => {
            const task = s.taskId ? tasks.byId.get(s.taskId) : undefined;
            const refType = s.ref?.type as FocusRefType | undefined;
            const refName = refType ? options?.[refType]?.find((o) => o.id === s.ref?.id)?.name : undefined;
            return (
              <li key={s.id} className="flex items-start gap-3 py-2.5">
                <div className="w-24 shrink-0 text-sm text-muted">
                  {formatDateKey(s.date, settings.locale)}
                  {!s.manual && <span className="block text-xs">{new Intl.DateTimeFormat(settings.locale, { timeStyle: 'short' }).format(new Date(s.startedAt))}</span>}
                </div>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(s)}>
                  <span className="block text-sm font-medium text-fg">
                    {t(`focus.kinds.${s.kind}`)} · {t('focus.min', { min: s.actualMin })}
                    {s.plannedMin !== null && !s.manual && <span className="font-normal text-muted"> {t('focus.planned', { min: s.plannedMin })}</span>}
                    {!s.completed && <span className="font-normal text-muted"> · {t('focus.stoppedEarly')}</span>}
                    {s.manual && <span className="font-normal text-muted"> · {t('focus.manual')}</span>}
                  </span>
                  {(task || refName) && <span className="block truncate text-xs text-muted">{[task?.title, refName].filter(Boolean).join(' · ')}</span>}
                  {s.notes && <span className="block whitespace-pre-wrap text-sm text-muted">{s.notes}</span>}
                </button>
                <IconButton
                  label={t('focus.removeSession')}
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => void softDeleteFocusSession(s.id).then(() => toast.show(t('focus.sessionRemoved'), 'success', { label: t('notes.undo'), run: () => void restoreFocusSession(s.id) }))}
                />
              </li>
            );
          })}
        </ul>
      )}
      {editing && <EditSessionDialog session={editing} onClose={() => setEditing(null)} />}
    </Surface>
  );
}

function EditSessionDialog({ session, onClose }: { session: FocusSession; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [kind, setKind] = useState<FocusKind>(session.kind);
  const [notes, setNotes] = useState(session.notes);
  const [taskId, setTaskId] = useState<string | null>(session.taskId);
  const [ref, setRef] = useState<EntityRef | null>(session.ref);
  const [min, setMin] = useState(session.actualMin);
  const save = async () => {
    try {
      await updateFocusSession(session.id, { kind, notes: notes.trim(), taskId, ref, actualMin: min });
      toast.show(t('focus.sessionSaved'));
      onClose();
    } catch {
      toast.show(t('focus.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('focus.editSession')}
      description={session.manual ? t('focus.manual') : t('focus.measuredHint', { min: session.actualMin })}
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
      <div className="grid gap-4 sm:grid-cols-2">
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
        {session.manual && <Field label={t('focus.fields.minutes')}>{(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={1440} value={min} onChange={(e) => setMin(Math.max(1, Math.round(Number(e.target.value) || 1)))} />}</Field>}
        <TaskSelect value={taskId} onChange={setTaskId} />
        <RefSelect value={ref} onChange={setRef} kind={kind} />
        <div className="sm:col-span-2">
          <Field label={t('focus.fields.notes')} optionalLabel={t('common.optional')}>
            {(id) => <Textarea id={id} rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
