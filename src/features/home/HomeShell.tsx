import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CircleHelp, Compass, Home, LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, Settings, Trees, UserRound, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { CAMPUS_PATH, controlPath } from '@/app/experience';
import { Logo } from '@/brand/Logo';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';

interface NavDef {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

/**
 * Moldura do ROUTIG Home: barra lateral com Início, Control Room, Campus e District e, separados
 * embaixo, Perfil, Configurações e Ajuda. No computador e no iPad, expandida ou só com ícones; no
 * iPhone, uma barra compacta no topo com o menu em gaveta.
 */
export function HomeShell() {
  const { settings, update, t } = useSettings();
  const collapsed = settings.nav.collapsed;
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const main: NavDef[] = [
    { to: '/', label: t('home.nav.home'), icon: <Home className="h-[19px] w-[19px]" />, end: true },
    { to: controlPath(), label: t('home.xp.control.name'), icon: <LayoutGrid className="h-[19px] w-[19px]" /> },
    { to: CAMPUS_PATH, label: t('home.xp.campus.name'), icon: <Trees className="h-[19px] w-[19px]" /> },
    { to: '/district', label: t('home.xp.district.name'), icon: <Compass className="h-[19px] w-[19px]" /> },
  ];
  const personal: NavDef[] = [
    { to: '/profile', label: t('home.nav.profile'), icon: <UserRound className="h-[19px] w-[19px]" /> },
    { to: '/settings', label: t('home.nav.settings'), icon: <Settings className="h-[19px] w-[19px]" /> },
    { to: '/help', label: t('home.nav.help'), icon: <CircleHelp className="h-[19px] w-[19px]" /> },
  ];

  const content = (compact: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 shrink-0 items-center gap-3', compact ? 'justify-center px-2' : 'px-5')}>
        <NavLink to="/" end aria-label={t('home.nav.home')} title={t('home.nav.home')} className="shrink-0 rounded-xl">
          <Logo size={34} className="h-[34px] w-[34px]" />
        </NavLink>
        {!compact && (
          <div className="min-w-0 leading-tight">
            <div className="text-[0.95rem] font-bold tracking-[0.18em] text-fg">{t('app.name')}</div>
            <div className="truncate text-[0.7rem] text-subtle">{t('app.tagline')}</div>
          </div>
        )}
      </div>
      <nav aria-label={t('home.nav.label')} className="flex min-h-0 flex-1 flex-col">
        <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3 pt-1">
          {main.map((n) => (
            <Item key={n.label} n={n} compact={compact} />
          ))}
        </ul>
        {/* Área pessoal e suporte, separada embaixo (também na barra recolhida). */}
        <ul aria-label={t('home.nav.personal')} className="flex shrink-0 flex-col gap-0.5 border-t border-line/70 px-3 py-3">
          {personal.map((n) => (
            <Item key={n.label} n={n} compact={compact} />
          ))}
        </ul>
      </nav>
    </div>
  );

  return (
    <div className="ambient flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        {t('app.skipToContent')}
      </a>
      <aside className={cn('relative hidden shrink-0 border-r border-line/70 bg-surface/70 backdrop-blur-xl transition-[width] duration-300 md:block', collapsed ? 'w-[76px]' : 'w-[248px]')}>
        {content(collapsed)}
        <IconButton
          label={collapsed ? t('nav.expand') : t('nav.collapse')}
          icon={collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          size="sm"
          onClick={() => update((s) => ({ ...s, nav: { ...s.nav, collapsed: !s.nav.collapsed } }))}
          className="absolute -right-4 top-5 z-10 h-8 w-8 rounded-full bg-surface shadow-soft ring-1 ring-line"
        />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[268px] max-w-[85vw] animate-[fade-up_220ms_ease-out_both] bg-surface shadow-lift safe-top">
            <IconButton label={t('nav.closeMenu')} icon={<X className="h-5 w-5" />} onClick={() => setOpen(false)} className="absolute right-2 top-3" />
            {content(false)}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* iPhone: barra compacta com o menu e o logo (o logo sempre volta ao Início). */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line/60 bg-bg/70 px-3 backdrop-blur-xl safe-top md:hidden">
          <IconButton label={t('nav.openMenu')} icon={<Menu className="h-5 w-5" />} onClick={() => setOpen(true)} />
          <NavLink to="/" end aria-label={t('home.nav.home')} className="flex items-center gap-2">
            <Logo size={26} className="h-[26px] w-[26px]" />
            <span className="text-sm font-bold tracking-[0.18em] text-fg">{t('app.name')}</span>
          </NavLink>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
          {/* Início: tela de menu com o cenário de ponta a ponta. Demais páginas: conteúdo centralizado. */}
          {location.pathname === '/' ? (
            <Outlet />
          ) : (
            <div key={location.pathname} className="mx-auto w-full max-w-6xl animate-fade-up px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Item({ n, compact }: { n: NavDef; compact: boolean }) {
  return (
    <li>
      <NavLink
        to={n.to}
        end={n.end}
        aria-label={compact ? n.label : undefined}
        title={compact ? n.label : undefined}
        className={({ isActive }) =>
          cn(
            'relative flex h-11 items-center gap-3 rounded-xl text-[0.9rem] font-medium transition duration-150',
            compact ? 'justify-center px-0' : 'px-3',
            isActive ? 'bg-accent/10 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && <span className="absolute left-0 top-2 h-7 w-[3px] rounded-full bg-brand" aria-hidden />}
            <span aria-hidden className="shrink-0">
              {n.icon}
            </span>
            {!compact && <span className="truncate">{n.label}</span>}
          </>
        )}
      </NavLink>
    </li>
  );
}
