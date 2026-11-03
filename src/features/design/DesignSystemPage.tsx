import { useState, type ReactNode } from 'react';
import { Inbox, Plus } from 'lucide-react';
import { MODULES, NAV_MODULE_IDS, TONE_CLASSES } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { RoutigMark } from '@/brand/Logo';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Segmented';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

const SWATCHES = [
  { token: 'violet', hex: '#7357F6', cls: 'bg-violet' },
  { token: 'teal', hex: '#16B8A6', cls: 'bg-teal' },
  { token: 'amber', hex: '#F59E0B', cls: 'bg-amber' },
  { token: 'rose', hex: '#EC6695', cls: 'bg-rose' },
  { token: 'blue', hex: '#438BEA', cls: 'bg-blue' },
  { token: 'bg', hex: '#080B1C', cls: 'bg-[#080B1C]' },
] as const;

const NEUTRALS = ['bg-bg', 'bg-surface', 'bg-surface-2', 'bg-surface-3', 'bg-line', 'bg-subtle', 'bg-muted', 'bg-fg'] as const;

/** Vitrine do design system, para aprovação visual (Etapa 0). */
export function DesignSystemPage() {
  const { t } = useSettings();
  const toast = useToast();
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
  const [on, setOn] = useState(true);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title={t('design.title')} description={t('design.subtitle')} />

      <section className="relative overflow-hidden rounded-3xl bg-[#080B1C] p-8 text-white sm:p-10">
        <div className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(40rem 24rem at 90% 10%, rgba(238,75,122,.25), transparent 60%), radial-gradient(36rem 24rem at 0% 100%, rgba(115,87,246,.35), transparent 60%)' }} aria-hidden />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <RoutigMark className="h-28 w-28" animated />
          <div>
            <div className="text-3xl font-bold tracking-[0.22em]">ROUTIG</div>
            <div className="mt-1 text-gradient text-lg font-medium">{t('app.tagline')}</div>
          </div>
        </div>
      </section>

      <Block title={t('design.colors')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SWATCHES.map((s) => (
            <div key={s.token} className="overflow-hidden rounded-2xl ring-1 ring-line">
              <div className={cn('h-20', s.cls)} />
              <div className="bg-surface px-3 py-2">
                <div className="text-sm font-medium text-fg">{s.token}</div>
                <div className="text-xs tabular text-subtle">{s.hex}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 h-14 rounded-2xl bg-brand" aria-label="gradient" />
        <div className="mt-4 flex overflow-hidden rounded-2xl ring-1 ring-line">
          {NEUTRALS.map((n) => (
            <div key={n} className={cn('h-12 flex-1', n)} title={n.replace('bg-', '')} />
          ))}
        </div>
      </Block>

      <Block title={t('design.typography')}>
        <Surface className="flex flex-col gap-3">
          <div className="text-4xl font-semibold tracking-tight text-fg">{t('design.sampleHeading')}</div>
          <div className="text-2xl font-semibold tracking-tight text-fg">{t('design.sampleHeading')}</div>
          <div className="text-lg font-semibold text-fg">{t('design.sampleHeading')}</div>
          <p className="max-w-prose text-[0.9375rem] leading-relaxed text-muted">{t('design.sampleBody')}</p>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t('design.weights')}</div>
        </Surface>
      </Block>

      <Block title={t('design.buttons')} hint={t('design.buttonsHint')}>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden />}>
            {t('design.primary')}
          </Button>
          <Button variant="secondary">{t('design.secondary')}</Button>
          <Button variant="ghost">{t('design.ghost')}</Button>
          <Button variant="danger">{t('design.danger')}</Button>
          <Button variant="primary" loading>
            {t('common.loading')}
          </Button>
          <Button variant="secondary" onClick={() => toast.show(t('design.successToast'), 'success')}>
            {t('design.showToast')}
          </Button>
        </div>
      </Block>

      <Block title={t('design.inputs')}>
        <Surface className="grid gap-5 sm:grid-cols-2">
          <Field label={t('design.sampleInput')} hint={t('design.sampleBody')}>
            {(id, d) => <Input id={id} aria-describedby={d} placeholder={t('design.sampleInput')} />}
          </Field>
          <Field label={t('design.sampleSelect')}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} defaultValue="a">
                <option value="a">{t('theme.auto')}</option>
                <option value="b">{t('theme.light')}</option>
                <option value="c">{t('theme.dark')}</option>
              </Select>
            )}
          </Field>
          <Segmented
            label={t('design.sampleSelect')}
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'a', label: t('theme.auto') },
              { value: 'b', label: t('theme.light') },
              { value: 'c', label: t('theme.dark') },
            ]}
          />
          <Switch label={t('design.sampleSwitch')} checked={on} onChange={setOn} />
        </Surface>
      </Block>

      <Block title={t('design.states')} hint={t('design.statesHint')}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Surface>
            <div className="mb-2 text-sm font-medium text-fg">{t('design.loadingTitle')}</div>
            <LoadingState label={t('common.loading')} />
          </Surface>
          <Surface padded={false}>
            <EmptyState icon={<Inbox className="h-6 w-6" aria-hidden />} title={t('design.emptyTitle')} body={t('design.emptyBody')} />
          </Surface>
          <Surface padded={false}>
            <ErrorState title={t('design.errorTitle')} body={t('design.errorBody')} action={<Button size="sm">{t('common.retry')}</Button>} />
          </Surface>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>{t('design.badgeNeutral')}</Badge>
          <Badge tone="accent">{t('design.badgeAccent')}</Badge>
          <Badge tone="success">{t('design.badgeSuccess')}</Badge>
          <Badge tone="warning">{t('design.badgeWarning')}</Badge>
          <Badge tone="danger">{t('design.badgeDanger')}</Badge>
          <Badge tone="info">{t('design.badgeInfo')}</Badge>
        </div>
      </Block>

      <Block title={t('design.moduleTones')} hint={t('design.tonesHint')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {NAV_MODULE_IDS.map((id) => {
            const def = MODULES[id];
            const Icon = def.icon;
            const tone = TONE_CLASSES[def.tone];
            return (
              <div key={id} className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line/70">
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tone.soft, tone.text)}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="truncate text-xs font-medium text-muted">{t(`modules.${id}`)}</span>
              </div>
            );
          })}
        </div>
      </Block>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4" />
      {children}
    </section>
  );
}
