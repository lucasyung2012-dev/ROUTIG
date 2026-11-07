import { useState } from 'react';
import { Check, Cloud, Copy, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Field';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { connectGoogle, createSyncKey, disconnect, joinWithCode, loadSyncState, saveSyncState, syncNow, type SyncState } from '@/data/syncRepo';

/**
 * Configurações → Conta e sincronização: entrar com o Google e manter os dados iguais entre
 * iPad, iPhone e computador. Os dados vão criptografados para a pasta oculta do app no Drive.
 */
export function SyncSection() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [s, setS] = useState<SyncState>(loadSyncState);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [shownCode, setShownCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientInput, setClientInput] = useState(s.clientId);

  const fail = (e: unknown) => {
    const m = e instanceof Error ? e.message : '';
    const key = ['no-client-id', 'key-exists', 'bad-code', 'wrong-code', 'no-key', 'popup_closed', 'popup_failed_to_open'].includes(m) ? m : 'generic';
    toast.show(t(`settings.sync.errors.${key}` as 'settings.sync.errors.generic'), 'error');
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const update = (next: SyncState) => {
    saveSyncState(next);
    setS(next);
  };

  const fmt = (iso: string) => (iso ? new Intl.DateTimeFormat(settings.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : t('settings.sync.never'));

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Surface>
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="text-sm leading-relaxed text-muted">
            <p>{t('settings.sync.intro')}</p>
            <p className="mt-2">{t('settings.sync.privacy')}</p>
          </div>
        </div>
      </Surface>

      {/* 1. ID do cliente do Google Cloud (criado pelo dono) */}
      <Surface className="flex flex-col gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.sync.step1')}</h2>
        <p className="text-sm text-muted">{t('settings.sync.clientHint')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={clientInput} onChange={(e) => setClientInput(e.target.value.trim())} placeholder="xxxxxxxx.apps.googleusercontent.com" aria-label={t('settings.sync.clientId')} />
          <Button variant="secondary" disabled={!clientInput.endsWith('.apps.googleusercontent.com')} onClick={() => update({ ...s, clientId: clientInput })}>
            {t('common.save')}
          </Button>
        </div>
      </Surface>

      {/* 2. Entrar com o Google */}
      <Surface className="flex flex-col gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.sync.step2')}</h2>
        {s.email ? (
          <p className="text-sm text-fg">{t('settings.sync.signedAs', { email: s.email })}</p>
        ) : (
          <Button
            variant="primary"
            icon={<LogIn className="h-4 w-4" />}
            disabled={!s.clientId || busy}
            onClick={() =>
              run(async () => {
                const r = await connectGoogle(s);
                setS(r.state);
                setHasKey(r.hasKey);
              })
            }
            className="self-start"
          >
            {t('settings.sync.signIn')}
          </Button>
        )}
      </Surface>

      {/* 3. Chave: criar (primeiro aparelho) ou entrar com o código (os outros) */}
      {s.email && !s.key && (
        <Surface className="flex flex-col gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.sync.step3')}</h2>
          {hasKey !== true && (
            <>
              <p className="text-sm text-muted">{t('settings.sync.firstDevice')}</p>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await createSyncKey(s);
                    setShownCode(r.code);
                    setS(r.state);
                  })
                }
                className="self-start"
              >
                {t('settings.sync.createKey')}
              </Button>
            </>
          )}
          {hasKey !== false && (
            <>
              <p className="text-sm text-muted">{t('settings.sync.otherDevice')}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" aria-label={t('settings.sync.code')} autoComplete="off" />
                <Button variant="primary" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length !== 24} onClick={() => run(async () => setS(await joinWithCode(s, code)))}>
                  {t('settings.sync.join')}
                </Button>
              </div>
            </>
          )}
        </Surface>
      )}

      {shownCode && (
        <Surface className="flex flex-col gap-3 ring-2 ring-warning/40">
          <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.sync.codeTitle')}</h2>
          <p className="text-sm text-muted">{t('settings.sync.codeHint')}</p>
          <code className="select-all rounded-xl bg-surface-2 px-4 py-3 text-center font-mono text-lg tracking-wider text-fg">{shownCode}</code>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void navigator.clipboard?.writeText(shownCode).then(() => toast.show(t('settings.sync.copied'), 'success'))}>
              {t('settings.sync.copy')}
            </Button>
            <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => setShownCode('')}>
              {t('settings.sync.saved')}
            </Button>
          </div>
        </Surface>
      )}

      {/* 4. Sincronizar */}
      {s.key && (
        <Surface className="flex flex-col gap-4">
          <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.sync.step4')}</h2>
          <p className="text-sm text-muted">{t('settings.sync.last', { when: fmt(s.lastSync), count: s.lastChanged })}</p>
          <label className="flex flex-col gap-1 text-sm text-fg">
            {t('settings.sync.deviceName')}
            <Input value={s.deviceName} onChange={(e) => update({ ...s, deviceName: e.target.value.slice(0, 40) })} />
          </label>
          <Switch label={t('settings.sync.auto')} hint={t('settings.sync.autoHint')} checked={s.auto} onChange={(on) => update({ ...s, auto: on })} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<RefreshCw className="h-4 w-4" />}
              loading={busy}
              onClick={() =>
                run(async () => {
                  const r = await syncNow(s, true);
                  setS(r.state);
                  toast.show(t('settings.sync.done', { count: r.changed, devices: r.devices }), 'success');
                })
              }
            >
              {t('settings.sync.now')}
            </Button>
            <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={() => setS(disconnect(s))}>
              {t('settings.sync.disconnect')}
            </Button>
          </div>
          <p className="text-xs text-subtle">{t('settings.sync.limits')}</p>
        </Surface>
      )}
    </div>
  );
}
