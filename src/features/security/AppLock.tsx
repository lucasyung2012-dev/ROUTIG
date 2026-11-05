import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Lock } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { Logo } from '@/brand/Logo';
import { loadSecurity, tryUnlock } from '@/data/securityRepo';
import { shouldRelock, type SecurityConfig } from '@/domain/security';
import { Button } from '@/ui/Button';
import { Field, Input } from '@/ui/Field';
import { Surface } from '@/ui/Surface';
import { EraseForm } from './securityUi';

interface AppLockApi {
  hasPin: boolean;
  lockNow: () => void;
  /** Relê a configuração depois de mudar o PIN ou o tempo. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppLockApi>({ hasPin: false, lockNow: () => undefined, refresh: async () => undefined });

export function useAppLock(): AppLockApi {
  return useContext(Ctx);
}

/**
 * Bloqueio do app (Parte 26.2): com PIN definido, o ROUTIG abre bloqueado e
 * bloqueia de novo depois do tempo escolhido fora do app. É uma trava de tela,
 * não criptografia (ver Settings → Segurança).
 */
export function AppLock({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<SecurityConfig | null>(null);
  const [locked, setLocked] = useState(true);
  const [opened, setOpened] = useState(false);
  const cfgRef = useRef<SecurityConfig | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const c = await loadSecurity();
    cfgRef.current = c;
    setCfg(c);
  }, []);

  useEffect(() => {
    void loadSecurity()
      .then((c) => {
        cfgRef.current = c;
        setCfg(c);
        if (!c.pin) {
          setLocked(false);
          setOpened(true);
        }
      })
      .catch(() => {
        setLocked(false);
        setOpened(true);
      });
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        return;
      }
      const c = cfgRef.current;
      if (c?.pin && shouldRelock(hiddenAt.current, Date.now(), c.lockAfterMin)) setLocked(true);
      hiddenAt.current = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Com a trava na frente, nada atrás dela recebe toque nem teclado.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (locked) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [locked]);

  const api = useMemo<AppLockApi>(
    () => ({
      hasPin: !!cfg?.pin,
      lockNow: () => cfgRef.current?.pin && setLocked(true),
      refresh,
    }),
    [cfg, refresh],
  );

  const showLock = locked && !!cfg?.pin;
  return (
    <Ctx.Provider value={api}>
      <div ref={wrap} className="h-full" aria-hidden={locked || undefined}>
        {opened && children}
      </div>
      {showLock && (
        <LockScreen
          onUnlock={() => {
            setLocked(false);
            setOpened(true);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useSettings();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (waitUntil <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [waitUntil, now]);

  const waitSec = Math.max(0, Math.ceil((waitUntil - now) / 1000));
  const submit = async () => {
    setBusy(true);
    const r = await tryUnlock(pin).catch(() => ({ ok: false as const, waitSec: 0 }));
    setBusy(false);
    setPin('');
    if (r.ok) return onUnlock();
    setWrong(true);
    const n = Date.now();
    setNow(n);
    setWaitUntil(n + r.waitSec * 1000);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lock-title" className="ambient fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-bg p-4 safe-top">
      <Surface className="flex w-full max-w-sm flex-col items-center gap-4 py-8 text-center">
        {forgot ? (
          <>
            <h1 id="lock-title" className="text-xl font-semibold text-fg">
              {t('security.lock.forgotTitle')}
            </h1>
            <p className="text-sm text-muted">{t('security.lock.forgotBody')}</p>
            <div className="w-full text-left">
              <EraseForm allowExport={false} />
            </div>
            <Button variant="ghost" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setForgot(false)}>
              {t('security.lock.back')}
            </Button>
          </>
        ) : (
          <>
            <Logo size={56} className="h-14 w-14" />
            <div>
              <h1 id="lock-title" className="flex items-center justify-center gap-2 text-xl font-semibold text-fg">
                <Lock className="h-5 w-5" aria-hidden />
                {t('security.lock.title')}
              </h1>
              <p className="mt-1 text-sm text-muted">{t('security.lock.body')}</p>
            </div>
            <form
              className="flex w-full flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Field label={t('security.lock.pin')} error={waitSec > 0 ? t('security.lock.wait', { count: waitSec }) : wrong ? t('security.lock.wrong') : undefined}>
                {(id, d) => (
                  <Input
                    id={id}
                    aria-describedby={d}
                    autoFocus
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={8}
                    value={pin}
                    disabled={waitSec > 0}
                    onChange={(e) => {
                      setPin(e.target.value.replace(/\D/g, ''));
                      setWrong(false);
                    }}
                    className="text-center text-2xl tracking-[0.5em]"
                  />
                )}
              </Field>
              <Button type="submit" variant="primary" loading={busy} disabled={pin.length < 4 || waitSec > 0}>
                {t('security.lock.unlock')}
              </Button>
            </form>
            <button type="button" className="text-sm text-muted hover:text-fg" onClick={() => setForgot(true)}>
              {t('security.lock.forgot')}
            </button>
          </>
        )}
      </Surface>
    </div>
  );
}
