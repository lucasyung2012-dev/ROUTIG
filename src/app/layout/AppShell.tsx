import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { readParkContext } from '@/features/park/parkContext';
import { AutoSync } from '@/app/AutoSync';
import { Menu, Monitor, Moon, Pause, Search, Sun, Timer, Trees, WifiOff } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import type { ThemeSetting } from '@/domain/settings';
import { Logo } from '@/brand/Logo';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';
import { useToast } from '@/ui/toast';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { TaskEditorProvider } from '@/features/tasks/TaskEditor';
import { EventEditorProvider } from '@/features/calendar/EventEditor';
import { QuickCreate } from './QuickCreate';
import { runAutoBackupIfDue } from '@/data/backupRepo';
import { FocusProvider, useFocus } from '@/features/focus/FocusProvider';
import { NotificationsProvider } from '@/features/notifications/NotificationsProvider';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { ModuleTip } from '@/features/help/ModuleTip';
import { QuickPrivacyButton, QuickPrivacyProvider } from '@/features/security/QuickPrivacy';
import { formatClock, phaseElapsed, phaseRemaining } from '@/domain/focus';

const NEXT_THEME: Record<ThemeSetting, ThemeSetting> = { auto: 'light', light: 'dark', dark: 'auto' };

/** Editores e serviços que podem ser abertos de qualquer tela (também de dentro do parque). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TaskEditorProvider>
      <EventEditorProvider>
        <FocusProvider>
          <NotificationsProvider>
            <QuickPrivacyProvider>
              <AutoSync />
              {children}
            </QuickPrivacyProvider>
          </NotificationsProvider>
        </FocusProvider>
      </EventEditorProvider>
    </TaskEditorProvider>
  );
}

export function AppShell() {
  return (
    <AppProviders>
      <Shell />
    </AppProviders>
  );
}

function Shell() {
  const { settings, update, t } = useSettings();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  // Lido depois da montagem: o parque grava o lugar ao desmontar, e isso acontece depois deste render.
  const [fromPark, setFromPark] = useState(() => !!readParkContext());
  useEffect(() => setFromPark(!!readParkContext()), []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Cópia interna diária (Parte 25.2): alguns segundos depois de abrir, sem travar a tela.
  useEffect(() => {
    const id = window.setTimeout(() => void runAutoBackupIfDue().catch(() => toast.show(t('backup.autoFailed'), 'error')), 4000);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const themeIcon = settings.theme === 'auto' ? <Monitor className="h-[18px] w-[18px]" /> : settings.theme === 'light' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />;
  const initial = (settings.profile.displayName.trim()[0] ?? 'R').toUpperCase();

  return (
    <div className="ambient flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        {t('app.skipToContent')}
      </a>

      <Sidebar mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line/60 bg-bg/70 px-3 backdrop-blur-xl safe-top sm:px-6">
          <IconButton label={t('nav.openMenu')} icon={<Menu className="h-5 w-5" />} onClick={() => setMenuOpen(true)} className="md:hidden" />
          <Link to="/" className="hidden items-center gap-2 sm:flex md:hidden" aria-label={t('park.title')}>
            <Logo size={28} className="h-7 w-7" />
          </Link>
          {fromPark && (
            <Link to="/" className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-white shadow-glow">
              <Trees className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t('park.center.back')}</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={t('search.open')}
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center gap-3 rounded-xl bg-surface-2/80 text-sm sm:w-auto sm:min-w-0 sm:shrink sm:justify-start sm:px-3.5 text-subtle ring-1 ring-inset ring-line transition hover:text-fg md:ml-0 md:w-80"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden truncate sm:inline">{t('search.placeholder')}</span>
            <kbd className="ml-auto hidden rounded-md bg-surface px-1.5 py-0.5 text-[0.7rem] ring-1 ring-line md:block">{t('search.hint')}</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <QuickCreate />
            <FocusPill />
            <NotificationBell />
            <QuickPrivacyButton />

            {!online && (
              <span className="mr-1 hidden items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning sm:inline-flex" role="status">
                <WifiOff className="h-3.5 w-3.5" aria-hidden />
                {t('pwa.offline')}
              </span>
            )}
            <IconButton
              label={`${t('settings.appearance.theme')}: ${t(`theme.${settings.theme}`)}`}
              icon={themeIcon}
              onClick={() => update((s) => ({ ...s, theme: NEXT_THEME[s.theme] }))}
              className="hidden sm:inline-flex"
            />
            <Link
              to="/profile"
              aria-label={t('modules.profile')}
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-glow"
            >
              {initial}
            </Link>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
          <div key={location.pathname} className="mx-auto w-full max-w-6xl animate-fade-up px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
            <ModuleTip pathname={location.pathname} />
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/** Timer do Focus visível em qualquer tela, enquanto há uma sessão (leva de volta ao Focus). */
function FocusPill() {
  const { t } = useSettings();
  const { timer, now } = useFocus();
  const location = useLocation();
  if (!timer || location.pathname === '/focus') return null;
  const remaining = phaseRemaining(timer, now);
  const clock = formatClock(timer.waiting ? (timer.phaseMs ?? 0) : (remaining ?? phaseElapsed(timer, now)));
  const paused = timer.runningSince === null;
  return (
    <Link
      to="/focus"
      aria-label={`${t('modules.focus')}: ${t(`focus.phases.${timer.phase}`)} ${clock}`}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold tabular ring-1 ring-inset transition sm:mr-1 sm:px-3',
        paused ? 'bg-surface-2 text-muted ring-line' : 'bg-accent/15 text-accent ring-accent/30 hover:bg-accent/25',
      )}
    >
      {/* No celular só o tempo, para o topo caber; pausado fica cinza. */}
      {paused ? <Pause className="hidden h-3.5 w-3.5 sm:block" aria-hidden /> : <Timer className="hidden h-3.5 w-3.5 sm:block" aria-hidden />}
      {clock}
    </Link>
  );
}
