import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { MODULES, TONE_CLASSES } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { CURRENT_STAGE } from '@/app/version';
import { visibleModules } from '@/domain/settings';
import { RoutigMark } from '@/brand/Logo';
import { Badge } from '@/ui/Badge';
import { cn } from '@/ui/cn';

export function greetingKey(hour: number): 'dashboard.morning' | 'dashboard.afternoon' | 'dashboard.evening' {
  if (hour >= 5 && hour < 12) return 'dashboard.morning';
  if (hour >= 12 && hour < 18) return 'dashboard.afternoon';
  return 'dashboard.evening';
}

/**
 * Dashboard da Etapa 0. Ainda não existem dados de módulos, então ele não
 * mostra números: só a saudação, a data e o mapa dos módulos.
 */
export function DashboardPage() {
  const { settings, t } = useSettings();
  const locale = settings.locale;
  const now = new Date();
  const greeting = t(greetingKey(now.getHours()));
  const name = settings.profile.displayName.trim();
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const modules = visibleModules(settings).filter((id) => id !== 'dashboard');

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-3xl bg-surface p-6 shadow-soft ring-1 ring-line/70 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-72 w-72 opacity-[0.16] sm:opacity-25" aria-hidden>
          <RoutigMark className="h-full w-full" />
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-medium capitalize text-muted">{date}</p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            {name ? t('dashboard.greetingNamed', { greeting, name }) : greeting}
          </h1>
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-surface-2/70 p-4 ring-1 ring-line/60">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
            <div>
              <div className="text-[0.9375rem] font-semibold text-fg">{t('dashboard.foundationTitle')}</div>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t('dashboard.foundationBody')}</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="dash-modules">
        <h2 id="dash-modules" className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-subtle">
          {t('dashboard.yourModules')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((id) => {
            const def = MODULES[id];
            const Icon = def.icon;
            const tone = TONE_CLASSES[def.tone];
            const ready = def.stage <= CURRENT_STAGE;
            return (
              <li key={id}>
                <Link
                  to={def.path}
                  className="group flex h-full items-start gap-4 rounded-2xl bg-surface/80 p-4 ring-1 ring-line/70 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-lift"
                >
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tone.soft, tone.text)}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-fg">{t(`modules.${id}`)}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted">{t(`moduleSummary.${id}`)}</span>
                    <span className="mt-2.5 block">
                      <Badge tone={ready ? 'success' : 'neutral'}>
                        {ready ? t('dashboard.readyLabel') : `${t('dashboard.buildingLabel')} · ${t('dashboard.stageLabel', { stage: def.stage })}`}
                      </Badge>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
