import { NotificationsSection } from '@/features/notifications/NotificationsSection';
import { PrivacySection } from './PrivacySection';
import { SecuritySection } from '@/features/security/securityUi';
import { TransferSection } from '@/features/transfer/TransferSection';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, EyeOff, Monitor, Moon, RotateCcw, Star, Sun } from 'lucide-react';
import { MODULES, NAV_MODULE_IDS } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { APP_VERSION } from '@/app/version';
import { DB_SCHEMA_VERSION } from '@/data/db';
import { moveModule, toggleIn, type Settings } from '@/domain/settings';
import { RoutigMark, logoPngUrl, useVectorApproved } from '@/brand/Logo';
import { VECTOR_APPROVED_AT } from '@/brand/mark';
import { formatBytes, getStorageStatus, requestPersistence, type StorageStatus } from '@/services/storage';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Field, Input, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Segmented';
import { LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { DevicesSection, HelpSection, ModulesSection } from './moreSections';
import { BackupSection } from '@/features/backup/BackupSection';
import { SETTINGS_SECTIONS, isSettingsSection, type SettingsSectionId } from './sections';

/** Grava uma mudança e avisa se falhar. */
function useSave() {
  const { update, t } = useSettings();
  const toast = useToast();
  return (change: (s: Settings) => Settings, successMessage?: string) =>
    update(change).then(
      () => successMessage && toast.show(successMessage, 'success'),
      () => toast.show(t('errors.saveFailed'), 'error'),
    );
}

export function SettingsIndexPage() {
  const { t } = useSettings();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SETTINGS_SECTIONS.map(({ id, icon: Icon }) => (
          <li key={id}>
            <Link
              to={`/settings/${id}`}
              className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="flex-1 font-medium text-fg">{t(`settings.sections.${id}`)}</span>
              <ChevronRight className="h-4 w-4 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsSectionPage() {
  const { section } = useParams();
  const { t } = useSettings();
  if (!isSettingsSection(section)) return <Navigate to="/settings" replace />;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
      <nav aria-label={t('settings.title')} className="hidden lg:block">
        <div className="sticky top-6 flex flex-col gap-0.5">
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('settings.title')}</div>
          {SETTINGS_SECTIONS.map(({ id, icon: Icon }) => (
            <NavLink
              key={id}
              to={`/settings/${id}`}
              className={({ isActive }) =>
                cn('flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition', isActive ? 'bg-accent/10 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(`settings.sections.${id}`)}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="min-w-0">
        <Link to="/settings" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg lg:hidden">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {t('settings.title')}
        </Link>
        <PageHeader eyebrow={t('settings.title')} title={t(`settings.sections.${section}`)} className="mb-6" />
        <SectionBody id={section} />
      </div>
    </div>
  );
}

function SectionBody({ id }: { id: SettingsSectionId }) {
  switch (id) {
    case 'profile':
      return <ProfileSection />;
    case 'appearance':
      return <AppearanceSection />;
    case 'language':
      return <LanguageSection />;
    case 'region':
      return <RegionSection />;
    case 'navigation':
      return <NavigationSection />;
    case 'accessibility':
      return <AccessibilitySection />;
    case 'storage':
      return <StorageSection />;
    case 'notifications':
      return <NotificationsSection />;
    case 'privacy':
      return <PrivacySection />;
    case 'security':
      return <SecuritySection />;
    case 'modules':
      return <ModulesSection />;
    case 'backup':
      return <BackupSection />;
    case 'transfer':
      return <TransferSection />;
    case 'devices':
      return <DevicesSection />;
    case 'help':
      return <HelpSection />;
    case 'about':
      return <AboutSection />;
  }
}

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

function ProfileSection() {
  const { settings, t } = useSettings();
  const save = useSave();
  const [name, setName] = useState(settings.profile.displayName);
  const [bio, setBio] = useState(settings.profile.bio);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<number>();

  // Salva sozinho meio segundo depois da última tecla.
  useEffect(() => {
    if (name === settings.profile.displayName && bio === settings.profile.bio) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void save((s) => ({ ...s, profile: { ...s.profile, displayName: name.slice(0, 60), bio: bio.slice(0, 280) } })).then(() => setSavedAt(Date.now()));
    }, 500);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, bio]);

  return (
    <Surface className="flex flex-col gap-5">
      <Field label={t('settings.profile.displayName')}>
        {(id, d) => <Input id={id} aria-describedby={d} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('onboarding.displayNamePlaceholder')} />}
      </Field>
      <Field label={t('settings.profile.bio')} optionalLabel={t('common.optional')}>
        {(id, d) => <Textarea id={id} aria-describedby={d} value={bio} maxLength={280} onChange={(e) => setBio(e.target.value)} placeholder={t('settings.profile.bioPlaceholder')} />}
      </Field>
      <div className="flex items-center justify-between text-xs text-subtle">
        <span>{t('profile.private')}</span>
        <span aria-live="polite">{savedAt ? t('common.saved') : ''}</span>
      </div>
    </Surface>
  );
}

export function ThemePicker({ value, onChange }: { value: Settings['theme']; onChange: (v: Settings['theme']) => void }) {
  const { t } = useSettings();
  return (
    <Segmented
      label={t('settings.appearance.theme')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'auto', label: t('theme.auto'), icon: <Monitor className="h-4 w-4" aria-hidden /> },
        { value: 'light', label: t('theme.light'), icon: <Sun className="h-4 w-4" aria-hidden /> },
        { value: 'dark', label: t('theme.dark'), icon: <Moon className="h-4 w-4" aria-hidden /> },
      ]}
    />
  );
}

function AppearanceSection() {
  const { settings, t } = useSettings();
  const save = useSave();
  return (
    <Surface>
      <Row title={t('settings.appearance.theme')} hint={t('settings.appearance.themeHint')}>
        <ThemePicker value={settings.theme} onChange={(theme) => save((s) => ({ ...s, theme }))} />
      </Row>
    </Surface>
  );
}

function LanguageSection() {
  const { settings, t } = useSettings();
  const save = useSave();
  return (
    <Surface>
      <Row title={t('settings.language.label')} hint={t('settings.language.hint')}>
        <Segmented
          label={t('settings.language.label')}
          value={settings.locale}
          onChange={(locale) => save((s) => ({ ...s, locale }))}
          options={[
            { value: 'pt-BR', label: t('locale.pt-BR') },
            { value: 'en', label: t('locale.en') },
          ]}
        />
      </Row>
    </Surface>
  );
}

function RegionSection() {
  const { settings, t } = useSettings();
  const save = useSave();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const example = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  return (
    <Surface className="divide-y divide-line/70">
      <Row title={t('settings.region.weekStart')}>
        <Segmented
          label={t('settings.region.weekStart')}
          value={String(settings.weekStartsOn) as '0' | '1'}
          onChange={(v) => save((s) => ({ ...s, weekStartsOn: v === '0' ? 0 : 1 }))}
          options={[
            { value: '1', label: t('weekday.monday') },
            { value: '0', label: t('weekday.sunday') },
          ]}
        />
      </Row>
      <Row title={t('settings.region.timezone')}>
        <span className="text-sm text-muted">{tz}</span>
      </Row>
      <Row title={t('settings.region.dateExample')}>
        <span className="text-sm text-muted">{example}</span>
      </Row>
    </Surface>
  );
}

function NavigationSection() {
  const { settings, t } = useSettings();
  const save = useSave();
  const order = settings.nav.order;

  return (
    <div className="flex flex-col gap-6">
      <Surface>
        <Switch
          label={t('settings.navigation.compact')}
          hint={t('settings.navigation.compactHint')}
          checked={settings.nav.collapsed}
          onChange={(collapsed) => save((s) => ({ ...s, nav: { ...s.nav, collapsed } }))}
        />
      </Surface>

      <Surface padded={false}>
        <div className="flex flex-col gap-3 p-5 pb-3 sm:flex-row sm:items-start sm:justify-between sm:p-6 sm:pb-3">
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.navigation.orderTitle')}</h2>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">{t('settings.navigation.orderHint')}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="h-4 w-4" aria-hidden />}
            onClick={() => save((s) => ({ ...s, nav: { ...s.nav, order: [...NAV_MODULE_IDS] } }), t('settings.navigation.resetDone'))}
          >
            {t('settings.navigation.reset')}
          </Button>
        </div>
        <ol className="px-2 pb-2 sm:px-3 sm:pb-3">
          {order.map((id, index) => {
            const def = MODULES[id];
            const Icon = def.icon;
            const hidden = settings.nav.hidden.includes(id);
            const fav = settings.nav.favorites.includes(id);
            const name = t(`modules.${id}`);
            return (
              <li key={id} className={cn('flex items-center gap-2 rounded-xl px-2 py-1.5 sm:px-3', hidden && 'opacity-50')}>
                <span className="w-6 text-right text-xs tabular text-subtle">{index + 1}</span>
                <Icon className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-fg">{name}</span>
                <IconButton
                  size="sm"
                  label={`${t('common.moveUp')}: ${name}`}
                  icon={<ArrowUp className="h-4 w-4" />}
                  disabled={index === 0}
                  onClick={() => save((s) => ({ ...s, nav: { ...s.nav, order: moveModule(s.nav.order, id, -1) } }))}
                />
                <IconButton
                  size="sm"
                  label={`${t('common.moveDown')}: ${name}`}
                  icon={<ArrowDown className="h-4 w-4" />}
                  disabled={index === order.length - 1}
                  onClick={() => save((s) => ({ ...s, nav: { ...s.nav, order: moveModule(s.nav.order, id, 1) } }))}
                />
                <IconButton
                  size="sm"
                  label={`${fav ? t('common.unfavorite') : t('common.favorite')}: ${name}`}
                  active={fav}
                  icon={<Star className={cn('h-4 w-4', fav && 'fill-amber text-amber')} />}
                  onClick={() => save((s) => ({ ...s, nav: { ...s.nav, favorites: toggleIn(s.nav.favorites, id) } }))}
                />
                {def.hideable ? (
                  <IconButton
                    size="sm"
                    label={`${hidden ? t('common.show') : t('common.hide')}: ${name}`}
                    icon={hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    onClick={() => save((s) => ({ ...s, nav: { ...s.nav, hidden: toggleIn(s.nav.hidden, id) } }))}
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center" title={t('settings.navigation.alwaysVisible')}>
                    <Eye className="h-4 w-4 text-subtle" aria-label={t('settings.navigation.alwaysVisible')} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Surface>
    </div>
  );
}

function AccessibilitySection() {
  const { settings, t } = useSettings();
  const save = useSave();
  return (
    <Surface className="divide-y divide-line/70">
      <Row title={t('settings.accessibility.fontSize')}>
        <Segmented
          label={t('settings.accessibility.fontSize')}
          value={settings.fontSize}
          onChange={(fontSize) => save((s) => ({ ...s, fontSize }))}
          options={[
            { value: 'small', label: t('settings.accessibility.small') },
            { value: 'normal', label: t('settings.accessibility.normal') },
            { value: 'large', label: t('settings.accessibility.large') },
            { value: 'xlarge', label: t('settings.accessibility.xlarge') },
          ]}
        />
      </Row>
      <div className="pt-5">
        <Switch
          label={t('settings.accessibility.reduceMotion')}
          hint={t('settings.accessibility.reduceMotionHint')}
          checked={settings.reduceMotion}
          onChange={(reduceMotion) => save((s) => ({ ...s, reduceMotion }))}
        />
      </div>
    </Surface>
  );
}

function StorageSection() {
  const { settings, t } = useSettings();
  const toast = useToast();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getStorageStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  const persistLabel =
    status?.persisted === true ? t('settings.storage.persistedYes') : status?.persisted === false ? t('settings.storage.persistedNo') : t('settings.storage.persistedUnknown');

  return (
    <div className="flex flex-col gap-6">
      <Surface>
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.storage.where')}</h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">{t('settings.storage.whereBody')}</p>
      </Surface>
      <Surface className="divide-y divide-line/70">
        {!status ? (
          <LoadingState label={t('common.loading')} lines={2} />
        ) : (
          <>
            {status.supported ? (
              <>
                <Row title={t('settings.storage.usage')}>
                  <span className="text-sm tabular text-muted">{formatBytes(status.usageBytes, settings.locale)}</span>
                </Row>
                <Row title={t('settings.storage.quota')}>
                  <span className="text-sm tabular text-muted">{formatBytes(status.quotaBytes, settings.locale)}</span>
                </Row>
              </>
            ) : (
              <p className="pb-5 text-sm text-muted">{t('settings.storage.unsupported')}</p>
            )}
            <Row title={t('settings.storage.persisted')} hint={persistLabel}>
              {status.persisted !== true && (
                <Button
                  size="sm"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    const granted = await requestPersistence();
                    setBusy(false);
                    setStatus(await getStorageStatus());
                    toast.show(granted ? t('settings.storage.persistGranted') : t('settings.storage.persistDenied'), granted ? 'success' : 'info');
                  }}
                >
                  {t('settings.storage.requestPersist')}
                </Button>
              )}
            </Row>
            <Row title={t('settings.storage.schema')}>
              <span className="text-sm tabular text-muted">v{DB_SCHEMA_VERSION}</span>
            </Row>
          </>
        )}
      </Surface>
      <p className="text-sm text-subtle">{t('settings.storage.backupLater')}</p>
    </div>
  );
}

function AboutSection() {
  const { settings, t, tl } = useSettings();
  const vectorApproved = useVectorApproved();
  const approvedIso = VECTOR_APPROVED_AT ? `${VECTOR_APPROVED_AT}T12:00:00` : settings.brand.approvedAt;
  const approvedAt = approvedIso ? new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(approvedIso)) : '';
  return (
    <div className="flex flex-col gap-6">
      <Surface className="flex flex-col gap-5 xl:flex-row xl:items-center">
        <div className="flex shrink-0 gap-3">
          <img src={logoPngUrl} alt="" className="h-20 w-20 rounded-2xl" />
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#080B1C] p-2">
            <RoutigMark className="h-full w-full" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.about.logoTitle')}</h2>
            <Badge tone={vectorApproved ? 'success' : 'warning'}>
              {vectorApproved ? t('logo.statusApproved') : t('logo.statusPending')}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('settings.about.logoBody')}</p>
          <p className="mt-1 text-xs text-subtle">
            {vectorApproved ? t('settings.about.logoStatusVector', { date: approvedAt }) : t('settings.about.logoStatusPng')}
          </p>
        </div>
        <Link to="/settings/logo" className="inline-flex h-11 w-fit shrink-0 items-center rounded-xl bg-brand px-4 text-[0.9375rem] font-medium text-white shadow-glow hover:brightness-110">
          {t('settings.about.logoCompare')}
        </Link>
      </Surface>

      <Surface className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-[0.9375rem] font-semibold text-fg">{t('settings.about.designSystem')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('settings.about.designSystemBody')}</p>
        </div>
        <Link to="/design" className="inline-flex h-11 shrink-0 items-center rounded-xl bg-surface-2 px-4 text-[0.9375rem] font-medium text-fg ring-1 ring-inset ring-line hover:bg-surface-3">
          {t('settings.about.openDesignSystem')}
        </Link>
      </Surface>

      <Surface className="divide-y divide-line/70">
        <div className="pb-5">
          <div className="text-[0.9375rem] font-medium text-fg">{t('settings.about.version')}</div>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            <span className="tabular font-medium text-fg">{APP_VERSION}</span> · {t('settings.about.build')}
          </p>
        </div>
        <div className="py-5">
          <div className="text-[0.9375rem] font-medium text-fg">{t('settings.about.upcoming')}</div>
          <p className="mt-1 text-sm text-muted">{t('settings.about.upcomingBody')}</p>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {tl('settings.about.upcomingItems').map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-subtle" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="pt-5">
          <div className="text-[0.9375rem] font-medium text-fg">{t('settings.about.limitsTitle')}</div>
          <ul className="mt-3 flex flex-col gap-2.5">
            {tl('settings.about.limits').map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Surface>
    </div>
  );
}
