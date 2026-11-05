import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { deviceSupport, gatherAlertInput, loadNotifConfig, loadNotifState, requestDevicePermission, saveNotifConfig, saveNotifState, showDeviceNotification, type DeviceSupport, type NotifState } from '@/data/notificationsRepo';
import { todayKey } from '@/domain/dates';
import { canDeliver, computeAlerts, DEFAULT_NOTIF_CONFIG, localIso, type Alert, type NotifConfig } from '@/domain/notifications';
import { useFocus } from '@/features/focus/FocusProvider';

export interface NotificationsApi {
  config: NotifConfig;
  setConfig: (c: NotifConfig) => Promise<void>;
  /** Avisos que já valem agora, do mais novo ao mais antigo. */
  active: Alert[];
  unread: Alert[];
  dismiss: (key: string) => void;
  dismissAll: () => void;
  support: DeviceSupport;
  requestPermission: () => Promise<DeviceSupport>;
  sendTest: () => Promise<boolean>;
  /** Texto de um aviso, respeitando "ocultar conteúdo" quando pedido. */
  textOf: (a: Alert, forDevice?: boolean) => { title: string; body: string };
}

const Ctx = createContext<NotificationsApi | null>(null);

/**
 * Central de notificações (Parte 23): calcula os avisos com os dados reais, mostra no sino e,
 * se você permitir, avisa pelo aparelho. Roda só no aparelho, sem nuvem (Parte 23.4).
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { t, settings } = useSettings();
  const focus = useFocus();
  const [config, setConfigState] = useState<NotifConfig>(DEFAULT_NOTIF_CONFIG);
  const [state, setState] = useState<NotifState>({ dismissed: {}, delivered: {} });
  const [now, setNow] = useState(() => new Date());
  const [support, setSupport] = useState<DeviceSupport>(() => deviceSupport());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    void Promise.all([loadNotifConfig(), loadNotifState()]).then(([c, s]) => {
      setConfigState(c);
      setState(s);
    });
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Recalcula quando os dados mudam ou o minuto passa. Lê os módulos de uma vez, só o necessário para hoje.
  const minute = Math.floor(now.getTime() / 60_000);
  const changeSeq = useLiveQuery(async () => (await getDb().changelog.orderBy('seq').last())?.seq ?? 0, []);
  const input = useLiveQuery(() => gatherAlertInput(settings.weekStartsOn, new Date()), [settings.weekStartsOn, changeSeq, todayKey(now), Math.floor(minute / 10)]);
  const all = useMemo(() => (input ? computeAlerts(input, config) : []), [input, config]);
  const nowIso = localIso(now);
  const active = useMemo(() => all.filter((a) => a.at <= nowIso).reverse(), [all, nowIso]);
  const unread = useMemo(() => active.filter((a) => !state.dismissed[a.key]), [active, state.dismissed]);

  const persist = useCallback((s: NotifState) => {
    setState(s);
    void saveNotifState(s);
  }, []);

  const textOf = useCallback(
    (a: Alert, forDevice = false) => (forDevice && config.hideContent ? { title: 'ROUTIG', body: t('notif.hidden') } : { title: t(a.title.key as 'notif.hidden', a.title.vars), body: t(a.body.key as 'notif.hidden', a.body.vars) }),
    [config.hideContent, t],
  );

  // Avisa pelo aparelho o que ainda não foi avisado (uma vez por aviso).
  const focusRunning = !!focus.timer && focus.timer.runningSince !== null;
  useEffect(() => {
    if (!canDeliver(config, now, focusRunning) || support !== 'granted') return;
    const fresh = active.filter((a) => !stateRef.current.delivered[a.key] && !stateRef.current.dismissed[a.key]);
    if (!fresh.length) return;
    const today = todayKey(now);
    void (async () => {
      const delivered = { ...stateRef.current.delivered };
      for (const a of fresh.slice(0, 5)) {
        const { title, body } = textOf(a, true);
        if (await showDeviceNotification(title, body, a.key)) delivered[a.key] = today;
      }
      persist({ ...stateRef.current, delivered });
    })();
  }, [active, config, now, focusRunning, support, textOf, persist]);

  const api = useMemo<NotificationsApi>(
    () => ({
      config,
      setConfig: async (c) => {
        await saveNotifConfig(c);
        setConfigState(c);
      },
      active,
      unread,
      dismiss: (key) => persist({ ...stateRef.current, dismissed: { ...stateRef.current.dismissed, [key]: todayKey() } }),
      dismissAll: () => persist({ ...stateRef.current, dismissed: { ...stateRef.current.dismissed, ...Object.fromEntries(active.map((a) => [a.key, todayKey()])) } }),
      support,
      requestPermission: async () => {
        const s = await requestDevicePermission();
        setSupport(s);
        return s;
      },
      sendTest: () => showDeviceNotification('ROUTIG', config.hideContent ? t('notif.hidden') : t('notif.testBody'), `test:${Date.now()}`),
      textOf,
    }),
    [config, active, unread, support, persist, t, textOf],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotificationsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications fora do NotificationsProvider');
  return v;
}
