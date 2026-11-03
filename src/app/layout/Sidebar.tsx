import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Star, X } from 'lucide-react';
import { MODULES, TONE_CLASSES, type ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { visibleModules } from '@/domain/settings';
import { Logo } from '@/brand/Logo';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';

interface SidebarProps {
  /** Gaveta aberta no celular. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { settings, update, t } = useSettings();
  const collapsed = settings.nav.collapsed;
  const visible = visibleModules(settings);
  const favorites = visible.filter((id) => settings.nav.favorites.includes(id));
  const others = visible.filter((id) => !settings.nav.favorites.includes(id));

  const toggleCollapsed = () => update((s) => ({ ...s, nav: { ...s.nav, collapsed: !s.nav.collapsed } }));

  const content = (compact: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 shrink-0 items-center gap-3', compact ? 'justify-center px-2' : 'px-5')}>
        <Logo size={34} className="h-[34px] w-[34px]" />
        {!compact && (
          <div className="min-w-0 leading-tight">
            <div className="text-[0.95rem] font-bold tracking-[0.18em] text-fg">{t('app.name')}</div>
            <div className="truncate text-[0.7rem] text-subtle">{t('app.tagline')}</div>
          </div>
        )}
      </div>

      <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
        {favorites.length > 0 && (
          <Group label={t('nav.favorites')} compact={compact}>
            {favorites.map((id) => (
              <Item key={id} id={id} compact={compact} favorite onNavigate={onCloseMobile} />
            ))}
          </Group>
        )}
        <Group label={t('nav.modules')} compact={compact}>
          {others.map((id) => (
            <Item key={id} id={id} compact={compact} onNavigate={onCloseMobile} />
          ))}
        </Group>
      </nav>

      <div className="shrink-0 border-t border-line/70 px-3 py-3">
        <Item id="profile" compact={compact} onNavigate={onCloseMobile} />
        <Item id="settings" compact={compact} onNavigate={onCloseMobile} />
      </div>
    </div>
  );

  return (
    <>
      {/* Tablet e computador: barra fixa, expandida ou compacta. */}
      <aside
        className={cn(
          'relative hidden shrink-0 border-r border-line/70 bg-surface/70 backdrop-blur-xl transition-[width] duration-300 md:block',
          collapsed ? 'w-[76px]' : 'w-[264px]',
        )}
      >
        {content(collapsed)}
        <IconButton
          label={collapsed ? t('nav.expand') : t('nav.collapse')}
          icon={collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          size="sm"
          onClick={toggleCollapsed}
          className="absolute -right-4 top-5 z-10 h-8 w-8 rounded-full bg-surface shadow-soft ring-1 ring-line"
        />
      </aside>

      {/* Celular: gaveta. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm" onClick={onCloseMobile} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[284px] max-w-[85vw] animate-[fade-up_220ms_ease-out_both] bg-surface shadow-lift safe-top">
            <IconButton label={t('nav.closeMenu')} icon={<X className="h-5 w-5" />} onClick={onCloseMobile} className="absolute right-2 top-3" />
            {content(false)}
          </aside>
        </div>
      )}
    </>
  );
}

function Group({ label, compact, children }: { label: string; compact: boolean; children: ReactNode }) {
  return (
    <div className="mt-3 first:mt-1">
      {compact ? (
        <div className="mx-auto my-2 h-px w-6 bg-line" aria-hidden />
      ) : (
        <div className="px-3 pb-1.5 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-subtle">{label}</div>
      )}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function Item({ id, compact, favorite = false, onNavigate }: { id: ModuleId; compact: boolean; favorite?: boolean; onNavigate: () => void }) {
  const { t } = useSettings();
  const def = MODULES[id];
  const Icon = def.icon;
  const label = t(`modules.${id}`);
  const tone = TONE_CLASSES[def.tone];
  return (
    <li className="group/item relative">
      <NavLink
        to={def.path}
        end={def.path === '/'}
        onClick={onNavigate}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
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
            <Icon className={cn('h-[19px] w-[19px] shrink-0', isActive ? tone.text : '')} aria-hidden />
            {!compact && <span className="truncate">{label}</span>}
            {!compact && favorite && <Star className="ml-auto h-3.5 w-3.5 fill-amber text-amber" aria-hidden />}
          </>
        )}
      </NavLink>
    </li>
  );
}
