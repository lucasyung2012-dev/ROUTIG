import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import { MODULES, NAV_MODULE_IDS, TONE_CLASSES } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { toggleIn, type Settings } from '@/domain/settings';
import { Logo } from '@/brand/Logo';
import { ThemePicker } from '@/features/settings/SettingsPage';
import { Button } from '@/ui/Button';
import { Field, Input } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

export const ONBOARDING_STEPS = ['welcome', 'language', 'theme', 'modules', 'profile', 'prefs', 'finish'] as const;

/**
 * Primeiro uso. Cada escolha é gravada na hora, junto com o passo atual:
 * se o app for fechado no meio, ele volta exatamente daqui (Parte 29.5).
 */
export function Onboarding() {
  const { settings, update, t } = useSettings();
  const toast = useToast();
  const step = Math.min(settings.onboarding.step, ONBOARDING_STEPS.length - 1);
  const current = ONBOARDING_STEPS[step]!;
  const [name, setName] = useState(settings.profile.displayName);

  const save = (change: (s: Settings) => Settings) => update(change).catch(() => toast.show(t('errors.saveFailed'), 'error'));
  const goTo = (n: number) => save((s) => ({ ...s, onboarding: { ...s.onboarding, step: Math.max(0, Math.min(n, ONBOARDING_STEPS.length - 1)) } }));
  const next = () => {
    if (current === 'profile') {
      return save((s) => ({ ...s, profile: { ...s.profile, displayName: name.trim().slice(0, 60) }, onboarding: { ...s.onboarding, step: step + 1 } }));
    }
    return goTo(step + 1);
  };
  const finish = () => save((s) => ({ ...s, onboarding: { completed: true, step: ONBOARDING_STEPS.length - 1 } }));
  const skip = () => save((s) => ({ ...s, onboarding: { completed: true, step } }));

  return (
    <div className="ambient flex min-h-full items-center justify-center px-4 py-10 safe-top safe-bottom">
      <div className="w-full max-w-xl">
        {current !== 'welcome' && (
          <div className="mb-6 flex items-center justify-between">
            <div className="text-xs font-medium text-subtle">{t('onboarding.stepOf', { current: step, total: ONBOARDING_STEPS.length - 1 })}</div>
            <div className="flex gap-1.5" aria-hidden>
              {ONBOARDING_STEPS.slice(1).map((s, i) => (
                <span key={s} className={cn('h-1.5 rounded-full transition-all duration-300', i + 1 <= step ? 'w-6 bg-brand' : 'w-1.5 bg-line')} />
              ))}
            </div>
          </div>
        )}

        <div key={current} className="animate-fade-up rounded-3xl bg-surface/90 p-6 shadow-lift ring-1 ring-line/70 backdrop-blur-xl sm:p-10">
          {current === 'welcome' && (
            <div className="flex flex-col items-center text-center">
              <Logo size={112} className="h-28 w-28 shadow-lift" animated />
              <h1 className="mt-8 text-balance text-3xl font-semibold tracking-tight text-fg">{t('onboarding.welcomeTitle')}</h1>
              <p className="mt-2 text-gradient text-lg font-medium">{t('app.tagline')}</p>
              <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-muted">{t('onboarding.welcomeBody')}</p>
              <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-subtle">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                {t('onboarding.localMode')}
              </p>
            </div>
          )}

          {current === 'language' && (
            <Step title={t('onboarding.languageTitle')} body={t('onboarding.languageBody')}>
              <Segmented
                label={t('settings.language.label')}
                value={settings.locale}
                onChange={(locale) => save((s) => ({ ...s, locale }))}
                options={[
                  { value: 'pt-BR', label: t('locale.pt-BR') },
                  { value: 'en', label: t('locale.en') },
                ]}
              />
            </Step>
          )}

          {current === 'theme' && (
            <Step title={t('onboarding.themeTitle')} body={t('onboarding.themeBody')}>
              <ThemePicker value={settings.theme} onChange={(theme) => save((s) => ({ ...s, theme }))} />
            </Step>
          )}

          {current === 'modules' && (
            <Step title={t('onboarding.modulesTitle')} body={t('onboarding.modulesBody')}>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {NAV_MODULE_IDS.map((id) => {
                  const def = MODULES[id];
                  const Icon = def.icon;
                  const on = !settings.nav.hidden.includes(id);
                  const tone = TONE_CLASSES[def.tone];
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={!def.hideable}
                        onClick={() => save((s) => ({ ...s, nav: { ...s.nav, hidden: toggleIn(s.nav.hidden, id) } }))}
                        className={cn(
                          'flex h-12 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium ring-1 transition',
                          on ? 'bg-accent/10 text-fg ring-accent/40' : 'bg-surface-2 text-subtle ring-line',
                          !def.hideable && 'cursor-default',
                        )}
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', on ? tone.text : '')} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{t(`modules.${id}`)}</span>
                        {on && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Step>
          )}

          {current === 'profile' && (
            <Step title={t('onboarding.profileTitle')} body={t('onboarding.profileBody')}>
              <Field label={t('onboarding.displayName')} optionalLabel={t('common.optional')}>
                {(id, d) => (
                  <Input
                    id={id}
                    aria-describedby={d}
                    value={name}
                    maxLength={60}
                    autoComplete="nickname"
                    placeholder={t('onboarding.displayNamePlaceholder')}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void next()}
                  />
                )}
              </Field>
            </Step>
          )}

          {current === 'prefs' && (
            <Step title={t('onboarding.prefsTitle')} body={t('onboarding.prefsBody')}>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-fg">{t('onboarding.weekStart')}</span>
                  <Segmented
                    label={t('onboarding.weekStart')}
                    value={String(settings.weekStartsOn) as '0' | '1'}
                    onChange={(v) => save((s) => ({ ...s, weekStartsOn: v === '0' ? 0 : 1 }))}
                    options={[
                      { value: '1', label: t('weekday.monday') },
                      { value: '0', label: t('weekday.sunday') },
                    ]}
                  />
                </div>
                <Switch label={t('onboarding.tips')} checked={settings.tips.enabled} onChange={(enabled) => save((s) => ({ ...s, tips: { ...s.tips, enabled } }))} />
                <Switch
                  label={t('settings.accessibility.reduceMotion')}
                  hint={t('settings.accessibility.reduceMotionHint')}
                  checked={settings.reduceMotion}
                  onChange={(reduceMotion) => save((s) => ({ ...s, reduceMotion }))}
                />
              </div>
            </Step>
          )}

          {current === 'finish' && (
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-white shadow-glow">
                <Check className="h-8 w-8" aria-hidden />
              </div>
              <h1 className="mt-6 text-balance text-2xl font-semibold tracking-tight text-fg">{t('onboarding.finishTitle')}</h1>
              <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-muted">{t('onboarding.finishBody')}</p>
            </div>
          )}

          <div className={cn('mt-10 flex items-center gap-3', current === 'welcome' || current === 'finish' ? 'justify-center' : 'justify-between')}>
            {current !== 'welcome' && current !== 'finish' && (
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" aria-hidden />} onClick={() => goTo(step - 1)}>
                {t('common.back')}
              </Button>
            )}
            {current === 'welcome' && (
              <Button variant="primary" size="lg" onClick={() => goTo(1)}>
                {t('onboarding.start')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
            {current !== 'welcome' && current !== 'finish' && (
              <Button variant="primary" onClick={() => void next()}>
                {t('common.continue')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
            {current === 'finish' && (
              <Button variant="primary" size="lg" onClick={() => void finish()}>
                {t('onboarding.enter')}
              </Button>
            )}
          </div>
        </div>

        {current !== 'finish' && (
          <div className="mt-5 text-center">
            <button type="button" onClick={() => void skip()} className="text-sm font-medium text-subtle hover:text-fg">
              {t('common.skip')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-balance text-2xl font-semibold tracking-tight text-fg">{title}</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{body}</p>
      <div className="mt-7">{children}</div>
    </div>
  );
}
