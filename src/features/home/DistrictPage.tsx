import { Compass } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { Surface } from '@/ui/Surface';

/**
 * District no Home: o que já foi decidido e em que fase está. O jogo ainda não existe; esta página
 * não finge que existe (nada de botão "Jogar").
 */
export function DistrictPage() {
  const { t } = useSettings();
  const phases = [1, 2, 3, 4, 5] as const;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Compass className="h-6 w-6 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold text-fg">{t('home.xp.district.name')}</h1>
          <p className="text-sm text-muted">{t('home.xp.district.badge')}</p>
        </div>
      </header>
      <Surface className="flex flex-col gap-2">
        <p className="text-sm text-fg">{t('home.district.what')}</p>
        <p className="text-sm text-muted">{t('home.district.status')}</p>
      </Surface>
      <Surface className="flex flex-col gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('home.district.phasesTitle')}</h2>
        <ol className="flex flex-col gap-2">
          {phases.map((n) => (
            <li key={n} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{n}</span>
              <span className="text-muted">{t(`home.district.phase${n}`)}</span>
            </li>
          ))}
        </ol>
      </Surface>
    </div>
  );
}
