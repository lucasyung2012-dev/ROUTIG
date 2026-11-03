import { Link } from 'react-router-dom';
import { Lock, PenLine } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { PageHeader } from '@/ui/PageHeader';
import { Surface } from '@/ui/Surface';

export function ProfilePage() {
  const { settings, t, tl } = useSettings();
  const name = settings.profile.displayName.trim();
  const initial = (name[0] ?? 'R').toUpperCase();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={t('modules.profile')} title={t('profile.title')} description={t('moduleSummary.profile')} />

      <Surface className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-brand text-3xl font-semibold text-white shadow-glow">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold tracking-tight text-fg">{name || t('profile.noName')}</div>
          {settings.profile.bio && <p className="mt-1 max-w-prose text-[0.9375rem] leading-relaxed text-muted">{settings.profile.bio}</p>}
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-subtle">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {t('profile.private')}
          </p>
        </div>
        <Link
          to="/settings/profile"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-4 text-[0.9375rem] font-medium text-fg ring-1 ring-inset ring-line transition hover:bg-surface-3"
        >
          <PenLine className="h-4 w-4" aria-hidden />
          {t('profile.editInSettings')}
        </Link>
      </Surface>

      <Surface tone="flat">
        <p className="text-sm text-muted">{t('settings.profile.interestsLater')}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {tl('moduleFeatures.profile').map((f) => (
            <li key={f} className="flex items-start gap-3 text-sm text-fg">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}
