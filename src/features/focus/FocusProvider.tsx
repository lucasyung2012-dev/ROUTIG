import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadActiveTimer, loadFocusConfig, saveActiveTimer, saveFocusConfig, saveFocusSession } from '@/data/focusRepo';
import { todayKey } from '@/domain/dates';
import {
  DEFAULT_FOCUS_CONFIG,
  isPhaseOver,
  nextPhase,
  pauseTimer,
  resumeTimer,
  sessionFromTimer,
  startTimer,
  startWaitingPhase,
  type FocusConfig,
  type FocusEnvironment,
  type FocusSession,
  type FocusSound,
  type FocusTimer,
} from '@/domain/focus';
import { sound } from './sound';

type StartOptions = Parameters<typeof startTimer>[0];

export interface FocusApi {
  ready: boolean;
  timer: FocusTimer | null;
  /** Relógio atual (atualiza 4× por segundo enquanto corre). */
  now: number;
  config: FocusConfig;
  /** Sessão de tempo definido ou contínua que terminou e espera ser salva. */
  ended: boolean;
  start: (opts: StartOptions) => void;
  pause: () => void;
  resume: () => void;
  /** Pula a fase atual (no Pomodoro) ou encerra a de tempo definido. */
  skip: () => void;
  startNext: () => void;
  finish: (notes: string) => Promise<FocusSession>;
  discard: () => void;
  setSound: (s: FocusSound) => void;
  setEnvironment: (e: FocusEnvironment) => void;
  setConfig: (c: FocusConfig) => Promise<void>;
}

const Ctx = createContext<FocusApi | null>(null);

/** Mantém o timer vivo no app inteiro: dá para trocar de tela sem perder a sessão (Parte 13.2). */
export function FocusProvider({ children }: { children: ReactNode }) {
  const [timer, setTimerState] = useState<FocusTimer | null>(null);
  const [config, setConfigState] = useState<FocusConfig>(DEFAULT_FOCUS_CONFIG);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<FocusTimer | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const setTimer = useCallback((t: FocusTimer | null) => {
    timerRef.current = t;
    setTimerState(t);
    void saveActiveTimer(t).catch(() => undefined);
  }, []);

  useEffect(() => {
    void Promise.all([loadActiveTimer(), loadFocusConfig()])
      .then(([t, c]) => {
        timerRef.current = t;
        setTimerState(t);
        setConfigState(c);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const running = !!timer && timer.runningSince !== null;

  // Relógio: só corre com o timer correndo. As contas usam o horário, então nada atrasa se a aba dormir.
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      const t = timerRef.current;
      if (t && isPhaseOver(t, n)) {
        sound.chime();
        setTimer(nextPhase(t, configRef.current, n).timer);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running, setTimer]);

  // Som só durante o foco correndo.
  useEffect(() => {
    if (timer && timer.runningSince !== null && timer.phase === 'focus' && !timer.waiting) sound.play(timer.sound, config.volume);
    else sound.stop();
  }, [timer, config.volume]);
  useEffect(() => () => sound.stop(), []);

  // Tela acesa durante a sessão (quando o aparelho permite).
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    void (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      .request('screen')
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void lock?.release().catch(() => undefined);
    };
  }, [running]);

  const api = useMemo<FocusApi>(() => {
    const ended = !!timer && timer.mode !== 'pomodoro' && timer.waiting;
    return {
      ready,
      timer,
      now,
      config,
      ended,
      start: (opts) => {
        sound.unlock();
        const n = Date.now();
        setNow(n);
        setTimer(startTimer(opts, configRef.current, n, todayKey()));
      },
      pause: () => timerRef.current && setTimer(pauseTimer(timerRef.current, Date.now())),
      resume: () => {
        sound.unlock();
        if (timerRef.current) setTimer(resumeTimer(timerRef.current, Date.now()));
      },
      skip: () => {
        const t = timerRef.current;
        if (t) setTimer(nextPhase(t, configRef.current, Date.now(), true).timer);
      },
      startNext: () => {
        sound.unlock();
        if (timerRef.current) setTimer(startWaitingPhase(timerRef.current, Date.now()));
      },
      finish: async (notes) => {
        const t = timerRef.current;
        if (!t) throw new Error('no_timer');
        const saved = await saveFocusSession(sessionFromTimer(t, Date.now(), notes));
        setTimer(null);
        return saved;
      },
      discard: () => setTimer(null),
      setSound: (s) => {
        sound.unlock();
        if (timerRef.current) setTimer({ ...timerRef.current, sound: s });
      },
      setEnvironment: (e) => timerRef.current && setTimer({ ...timerRef.current, environment: e }),
      setConfig: async (c) => {
        await saveFocusConfig(c);
        setConfigState(c);
      },
    };
  }, [ready, timer, now, config, setTimer]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFocus(): FocusApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFocus fora do FocusProvider');
  return v;
}
