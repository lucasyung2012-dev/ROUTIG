import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wifi, WifiOff } from 'lucide-react';
import { MODULES, NAV_MODULE_IDS } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { isModuleReady } from '@/app/version';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Switch } from '@/ui/Switch';
import { Surface } from '@/ui/Surface';
import { cn } from '@/ui/cn';

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0 sm:max-w-xs">
        <div className="text-[0.9375rem] font-medium text-fg">{title}</div>
        {hint && <p className="mt-1 text-sm leading-relaxed text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ---------- Módulos ---------- */

/** Cada módulo e onde ficam as opções dele (o texto diz o caminho). */
export function ModulesSection() {
  const { settings, t } = useSettings();
  return (
    <div className="flex flex-col gap-6">
      <Surface>
        <p className="text-sm leading-relaxed text-muted">{t('settings.modules.intro')}</p>
        <Link to="/settings/navigation" className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
          {t('settings.modules.toNavigation')}
        </Link>
      </Surface>
      <Surface className="divide-y divide-line/70">
        {NAV_MODULE_IDS.map((id) => {
          const def = MODULES[id];
          const Icon = def.icon;
          const ready = id === 'dashboard' || isModuleReady(id);
          const hidden = settings.nav.hidden.includes(id);
          return (
            <div key={id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{t(`modules.${id}`)}</span>
                  <Badge tone={ready ? 'success' : 'neutral'}>{ready ? t('dashboard.readyLabel') : t('dashboard.stageLabel', { stage: def.stage })}</Badge>
                  {hidden && <Badge>{t('settings.modules.hidden')}</Badge>}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t(`settings.modules.options.${id}`)}</p>
              </div>
              {ready && (
                <Link to={def.path} className="shrink-0 text-sm font-medium text-accent hover:underline">
                  {t('common.open')}
                </Link>
              )}
            </div>
          );
        })}
      </Surface>
    </div>
  );
}

/* ---------- Dispositivos ---------- */

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function DevicesSection() {
  const { t, tl } = useSettings();
  const online = useOnline();
  const installed = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const offlineReady = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
  return (
    <div className="flex flex-col gap-6">
      <Surface className="divide-y divide-line/70">
        <Row title={t('settings.devices.mode')} hint={installed ? t('settings.devices.installedHint') : t('settings.devices.browserHint')}>
          <Badge tone={installed ? 'success' : 'info'}>{installed ? t('settings.devices.installed') : t('settings.devices.browser')}</Badge>
        </Row>
        <Row title={t('settings.devices.connection')}>
          <span className={cn('inline-flex items-center gap-1.5 text-sm', online ? 'text-success' : 'text-warning')}>
            {online ? <Wifi className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
            {online ? t('settings.devices.online') : t('settings.devices.offline')}
          </span>
        </Row>
        <Row title={t('settings.devices.offlineReady')} hint={t('settings.devices.offlineReadyHint')}>
          <Badge tone={offlineReady ? 'success' : 'warning'}>{offlineReady ? t('common.on') : t('common.off')}</Badge>
        </Row>
      </Surface>
      {!installed && (
        <Surface>
          <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.devices.howToInstall')}</h2>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-muted">
            {tl('settings.devices.installSteps').map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Surface>
      )}
      <Surface>
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.devices.dataTitle')}</h2>
        <Bullets items={tl('settings.devices.dataNotes')} dot="bg-warning" />
      </Surface>
    </div>
  );
}

/* ---------- Ajuda ---------- */

export function HelpSection() {
  const { t, tl, settings, update } = useSettings();
  const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  const shortcuts: { keys: string[]; label: string }[] = [
    { keys: [apple ? '⌘' : 'Ctrl', 'K'], label: t('settings.help.keySearch') },
    { keys: ['N'], label: t('settings.help.keyNewTask') },
    { keys: ['Enter'], label: t('settings.help.keyEnter') },
    { keys: ['Esc'], label: t('settings.help.keyEsc') },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Surface className="flex flex-col gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('tips.settingsTitle')}</h2>
        <Switch label={t('tips.show')} hint={t('tips.showHint')} checked={settings.tips.enabled} onChange={(enabled) => void update((s) => ({ ...s, tips: { ...s.tips, enabled } }))} />
        {settings.tips.dismissed.length > 0 && (
          <Button size="sm" variant="secondary" className="w-fit" onClick={() => void update((s) => ({ ...s, tips: { enabled: true, dismissed: [] } }))}>
            {t('tips.reset', { count: settings.tips.dismissed.length })}
          </Button>
        )}
      </Surface>
      <Surface>
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.help.shortcuts')}</h2>
        <p className="mt-1 text-sm text-muted">{t('settings.help.shortcutsHint')}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {shortcuts.map((s) => (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span className="flex w-28 shrink-0 gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="rounded-md bg-surface-2 px-2 py-0.5 font-sans text-xs font-semibold text-fg ring-1 ring-line">
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="text-muted">{s.label}</span>
            </li>
          ))}
        </ul>
      </Surface>
      <Surface>
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.help.howTitle')}</h2>
        <Bullets items={tl('settings.help.how')} dot="bg-accent" />
      </Surface>
      <Surface>
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.help.ipadTitle')}</h2>
        <Bullets items={tl('settings.help.ipad')} dot="bg-teal" />
      </Surface>
    </div>
  );
}

function Bullets({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="mt-3 flex flex-col gap-2.5">
      {items.map((s) => (
        <li key={s} className="flex items-start gap-2 text-sm leading-relaxed text-muted">
          <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden />
          {s}
        </li>
      ))}
    </ul>
  );
}
