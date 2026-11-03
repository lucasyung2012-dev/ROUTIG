import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { getDb } from '@/data/db';
import { saveSettings, SETTINGS_KEY } from '@/data/settingsRepo';
import { defaultSettings, migrateSettings, type Settings } from '@/domain/settings';
import { applyAppearance } from '@/services/theme';
import { translate, translateList, type ListKey, type MessageKey } from '@/i18n';

type Status = 'loading' | 'ready' | 'error';

interface SettingsApi {
  status: Status;
  settings: Settings;
  /** Aplica uma mudança e grava. Rejeita se a gravação falhar. */
  update: (change: (s: Settings) => Settings) => Promise<void>;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  tl: (key: ListKey) => string[];
}

const SettingsContext = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const latest = useRef(settings);
  const pending = useRef(0);

  useEffect(() => {
    // Observa o registro no banco: outras abas também atualizam esta tela.
    const sub = liveQuery(() => getDb().kv.get(SETTINGS_KEY)).subscribe({
      next: (rec) => {
        if (pending.current > 0) return; // ignora o eco da nossa própria gravação
        const s = migrateSettings(rec?.value);
        latest.current = s;
        setSettings(s);
        setStatus('ready');
      },
      error: () => setStatus('error'),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    applyAppearance(settings);
  }, [settings]);

  const update = useCallback<SettingsApi['update']>(async (change) => {
    const next = change(latest.current);
    latest.current = next;
    setSettings(next);
    pending.current++;
    try {
      await saveSettings(next);
    } finally {
      pending.current--;
    }
  }, []);

  const api = useMemo<SettingsApi>(
    () => ({
      status,
      settings,
      update,
      t: (key, vars) => translate(settings.locale, key, vars),
      tl: (key) => translateList(settings.locale, key),
    }),
    [status, settings, update],
  );

  useEffect(() => {
    document.documentElement.lang = settings.locale;
  }, [settings.locale]);

  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings precisa estar dentro de SettingsProvider');
  return ctx;
}

/** Atalho para quem só precisa dos textos. */
export function useT() {
  const { t, tl, settings } = useSettings();
  return { t, tl, locale: settings.locale };
}
