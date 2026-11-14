import { useEffect, useRef, useState } from 'react';
import { Check, Cloud, Copy, ExternalLink, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { connectDropbox, connectGoogle, createSyncKey, disconnect, joinWithCode, loadSyncState, saveSyncState, syncNow, type SyncProvider, type SyncState } from '@/data/syncRepo';
import { dropboxRedirectUri, startDropboxLogin, takeDropboxReturn } from '@/services/dropbox';

const KNOWN_ERRORS = ['no-client-id', 'no-app-key', 'key-exists', 'bad-code', 'wrong-code', 'no-key', 'popup_closed', 'popup_failed_to_open', 'dbx-state', 'dbx-expired', 'dbx-denied'];

/**
 * Configurações → Conta e sincronização: manter os dados iguais entre iPad, iPhone e computador.
 * Os dados vão criptografados para a pasta do app no Dropbox (principal) ou no Google Drive.
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
  const [appKeyInput, setAppKeyInput] = useState(s.dbxKey);
  const [pasteMode, setPasteMode] = useState(false);
  const [dbxCode, setDbxCode] = useState('');

  const fail = (e: unknown) => {
    const m = e instanceof Error ? e.message : '';
    const key = KNOWN_ERRORS.includes(m) ? m : 'generic';
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
  const finishDropbox = (c: string) =>
    run(async () => {
      const r = await connectDropbox(s, c);
      setS(r.state);
      setHasKey(r.hasKey);
      setPasteMode(false);
      setDbxCode('');
    });

  // Volta do login do Dropbox: termina sozinho com o código que veio no endereço (só ao abrir a tela).
  const returned = useRef(false);
  useEffect(() => {
    if (returned.current) return;
    returned.current = true;
    const back = takeDropboxReturn();
    if (back?.code) void finishDropbox(back.code);
    else if (back?.error) fail(new Error('dbx-denied'));
  }, []);

  const fmt = (iso: string) => (iso ? new Intl.DateTimeFormat(settings.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : t('settings.sync.never'));
  const connected = !!s.email;
  const dropbox = s.provider === 'dropbox';

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Surface>
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="text-sm leading-relaxed text-muted">
            <p>{t('settings.sync.intro')}</p>
            <p className="mt-2">{t(dropbox ? 'settings.sync.privacyDropbox' : 'settings.sync.privacy')}</p>
          </div>
        </div>
      </Surface>

      {/* Onde guardar: só antes de conectar (cada provedor tem a sua chave e os seus arquivos). */}
      {!connected && (
        <Surface className="flex flex-col gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.sync.providerTitle')}</h2>
          <Segmented<SyncProvider>
            label={t('settings.sync.providerTitle')}
            value={s.provider}
            onChange={(p) => update({ ...s, provider: p })}
            options={[
              { value: 'dropbox', label: t('settings.sync.providers.dropbox') },
              { value: 'google', label: t('settings.sync.providers.google') },
            ]}
            className="w-full sm:w-auto"
          />
          <p className="text-sm text-muted">{t(dropbox ? 'settings.sync.providerDropboxHint' : 'settings.sync.providerGoogleHint')}</p>
        </Surface>
      )}

      {dropbox ? (
        <>
          {/* 1. Chave do app no Dropbox (criada pelo dono) */}
          {!connected && (
            <Surface className="flex flex-col gap-3">
              <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.sync.dbxStep1')}</h2>
              <p className="text-sm text-muted">{t('settings.sync.dbxKeyHint')}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={appKeyInput} onChange={(e) => setAppKeyInput(e.target.value.trim())} placeholder="abc123def456ghi" aria-label={t('settings.sync.dbxKey')} autoComplete="off" />
                <Button variant="secondary" disabled={!/^[a-z0-9]{8,}$/i.test(appKeyInput)} onClick={() => update({ ...s, dbxKey: appKeyInput })}>
                  {t('common.save')}
                </Button>
              </div>
              <p className="text-xs text-subtle">
                {t('settings.sync.dbxRedirect')} <code className="select-all break-all rounded bg-surface-2 px-1.5 py-0.5 text-fg">{dropboxRedirectUri()}</code>
              </p>
            </Surface>
          )}

          {/* 2. Entrar com o Dropbox */}
          <Surface className="flex flex-col gap-3">
            <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.sync.dbxStep2')}</h2>
            {connected ? (
              <p className="text-sm text-fg">{t('settings.sync.signedAs', { email: s.email })}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={<LogIn className="h-4 w-4" />} disabled={!s.dbxKey || busy} onClick={() => run(() => startDropboxLogin(s.dbxKey, 'redirect'))}>
                    {t('settings.sync.dbxSignIn')}
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<ExternalLink className="h-4 w-4" />}
                    disabled={!s.dbxKey || busy}
                    onClick={() =>
                      run(async () => {
                        await startDropboxLogin(s.dbxKey, 'code');
                        setPasteMode(true);
                      })
                    }
                  >
                    {t('settings.sync.dbxWithCode')}
                  </Button>
                </div>
                <p className="text-xs text-subtle">{t('settings.sync.dbxSignInHint')}</p>
                {pasteMode && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={dbxCode} onChange={(e) => setDbxCode(e.target.value.trim())} placeholder={t('settings.sync.dbxCodePlaceholder')} aria-label={t('settings.sync.dbxCodePlaceholder')} autoComplete="off" />
                    <Button variant="primary" disabled={busy || dbxCode.length < 10} onClick={() => void finishDropbox(dbxCode)}>
                      {t('settings.sync.dbxConfirm')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Surface>
        </>
      ) : (
        <>
          {/* 1. ID do cliente do Google Cloud (criado pelo dono) */}
          {!connected && (
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
          )}

          {/* 2. Entrar com o Google */}
          <Surface className="flex flex-col gap-3">
            <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.sync.step2')}</h2>
            {connected ? (
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
        </>
      )}

      {/* 3. Chave: criar (primeiro aparelho) ou entrar com o código (os outros) */}
      {connected && !s.key && (
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
          <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} disabled={busy} onClick={() => run(async () => setS(await disconnect(s)))} className="self-start">
            {t('settings.sync.disconnect')}
          </Button>
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
            <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} disabled={busy} onClick={() => run(async () => setS(await disconnect(s)))}>
              {t('settings.sync.disconnect')}
            </Button>
          </div>
          <p className="text-xs text-subtle">{t('settings.sync.limits')}</p>
        </Surface>
      )}
    </div>
  );
}
