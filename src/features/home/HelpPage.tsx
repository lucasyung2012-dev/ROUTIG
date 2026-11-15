import { CircleHelp, Compass, Home, LayoutGrid, Trees } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { SectionBody } from '@/features/settings/SettingsPage';
import { Surface } from '@/ui/Surface';

/**
 * Ajuda (no Home): o que é cada experiência, como andar e usar o Campus, e os atalhos e dicas
 * (a mesma seção de ajuda que existia em Configurações, agora aqui).
 */
export function HelpPage() {
  const { t } = useSettings();
  const items = [
    { icon: Home, name: t('home.nav.home'), body: t('home.help.home') },
    { icon: LayoutGrid, name: t('home.xp.control.name'), body: t('home.help.control') },
    { icon: Trees, name: t('home.xp.campus.name'), body: t('home.help.campus') },
    { icon: Compass, name: t('home.xp.district.name'), body: t('home.help.district') },
  ];
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <CircleHelp className="h-6 w-6 text-accent" aria-hidden />
        <h1 className="text-2xl font-semibold text-fg">{t('home.nav.help')}</h1>
      </header>
      <Surface className="flex flex-col gap-4">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('home.help.experiences')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.name} className="flex gap-3 rounded-xl bg-surface-2/60 p-3">
              <i.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <div>
                <p className="font-semibold text-fg">{i.name}</p>
                <p className="text-sm text-muted">{i.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Surface>
      <Surface className="flex flex-col gap-2">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('home.help.campusHow')}</h2>
        <p className="text-sm text-muted">{t('park.walkHint')}</p>
        <p className="text-sm text-muted">{t('home.help.touch')}</p>
        <p className="text-sm text-muted">{t('park.gestures')}</p>
        <p className="text-sm text-muted">{t('home.help.switch')}</p>
      </Surface>
      <SectionBody id="help" />
    </div>
  );
}
