import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, Trees } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { CAMPUS_PATH, controlPath } from '@/app/experience';
import { cn } from '@/ui/cn';

/**
 * Seletor discreto entre Control Room (2D) e Campus (3D), sem voltar ao Home. Os dois usam os mesmos
 * dados e serviços (montados uma vez só, em App.tsx): o Focus em andamento, os avisos e a
 * sincronização seguem; o Campus volta ao lugar onde estava e o Control Room à última tela aberta.
 */
export function ExperienceSwitch({ current, className }: { current: 'control' | 'campus'; className?: string }) {
  const { t } = useSettings();
  // O ambiente atual aponta para a tela em que a pessoa já está (tocar nele não muda nada).
  const { pathname, search } = useLocation();
  const here = pathname + search;
  const item = (active: boolean) =>
    cn(
      'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold transition',
      active ? 'bg-brand text-white shadow-glow' : 'text-muted hover:bg-surface-2 hover:text-fg',
    );
  return (
    <nav aria-label={t('home.switch.label')} className={cn('flex shrink-0 items-center gap-0.5 rounded-xl bg-surface/90 p-0.5 ring-1 ring-line', className)}>
      <Link to={current === 'control' ? here : controlPath()} aria-current={current === 'control' ? 'page' : undefined} className={item(current === 'control')} title={t('home.xp.control.name')}>
        <LayoutGrid className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{t('home.xp.control.short')}</span>
      </Link>
      <Link to={current === 'campus' ? here : CAMPUS_PATH} aria-current={current === 'campus' ? 'page' : undefined} className={item(current === 'campus')} title={t('home.xp.campus.name')}>
        <Trees className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{t('home.xp.campus.short')}</span>
      </Link>
    </nav>
  );
}
