import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, EyeOff } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { loadPrivacy } from '@/data/privacyRepo';
import { DEFAULT_PRIVACY, QUICK_TARGETS, type PrivacyPrefs, type QuickTarget } from '@/domain/privacy';
import { IconButton } from '@/ui/IconButton';

const KEY = 'routig.quickPrivacy';

interface QuickPrivacyApi {
  on: boolean;
  toggle: () => void;
  /** Esta parte está escondida agora? */
  hides: (target: QuickTarget) => boolean;
  prefs: PrivacyPrefs;
}

const Ctx = createContext<QuickPrivacyApi>({ on: false, toggle: () => undefined, hides: () => false, prefs: DEFAULT_PRIVACY });

function readOn(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Privacidade rápida (Parte 26.4): um toque esconde o que foi escolhido em
 * Settings → Privacidade. É temporária: vale até fechar o app.
 */
export function QuickPrivacyProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(readOn);
  const prefs = useLiveQuery(() => loadPrivacy(), []) ?? DEFAULT_PRIVACY;
  const quick = prefs.quick;

  // As partes marcadas com data-private ficam borradas pelo CSS (classe qp-<parte> no <html>).
  useEffect(() => {
    const root = document.documentElement;
    for (const target of QUICK_TARGETS) root.classList.toggle(`qp-${target}`, on && quick.includes(target));
    return () => QUICK_TARGETS.forEach((target) => root.classList.remove(`qp-${target}`));
  }, [on, quick]);

  const api = useMemo<QuickPrivacyApi>(
    () => ({
      on,
      prefs,
      hides: (target) => on && quick.includes(target),
      toggle: () =>
        setOn((v) => {
          try {
            if (v) sessionStorage.removeItem(KEY);
            else sessionStorage.setItem(KEY, '1');
          } catch {
            /* sem sessionStorage: vale só enquanto a tela estiver aberta */
          }
          return !v;
        }),
    }),
    [on, prefs, quick],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useQuickPrivacy(): QuickPrivacyApi {
  return useContext(Ctx);
}

export function QuickPrivacyButton() {
  const { t } = useSettings();
  const qp = useQuickPrivacy();
  return (
    <IconButton
      label={qp.on ? t('privacy.quick.turnOff') : t('privacy.quick.turnOn')}
      aria-pressed={qp.on}
      icon={qp.on ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
      onClick={qp.toggle}
      active={qp.on}
    />
  );
}
