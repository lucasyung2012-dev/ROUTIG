import { Check, Construction } from 'lucide-react';
import { MODULES, TONE_CLASSES, type ModuleId, type Stage } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { CURRENT_STAGE } from '@/app/version';
import { Badge } from '@/ui/Badge';
import { PageHeader } from '@/ui/PageHeader';
import { Surface } from '@/ui/Surface';
import { cn } from '@/ui/cn';

const STAGES: Stage[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * Página honesta de um módulo ainda não construído: diz quando ele chega e o
 * que vai ter. Não guarda dados e não tem controles falsos (Parte 34, regra 4).
 */
export function ModuleRoadmapPage({ id }: { id: ModuleId }) {
  const { t, tl } = useSettings();
  const def = MODULES[id];
  const Icon = def.icon;
  const tone = TONE_CLASSES[def.tone];
  const name = t(`modules.${id}`);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={
          <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', tone.soft, tone.text)}>
            <Icon className="h-7 w-7" aria-hidden />
          </div>
        }
        eyebrow={
          <Badge tone="warning" icon={<Construction className="h-3.5 w-3.5" aria-hidden />}>
            {t('roadmap.eyebrow')}
          </Badge>
        }
        title={name}
        description={t(`moduleSummary.${id}`)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Surface>
          <h2 className="text-balance text-lg font-semibold tracking-tight text-fg">
            {t('roadmap.title', { module: name, stage: def.stage, stageName: t(`stages.${def.stage}`) })}
          </h2>
          <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-muted">{t('roadmap.body')}</p>
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('roadmap.planned')}</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            {tl(`moduleFeatures.${id}`).map((f) => (
              <li key={f} className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-fg">
                <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </Surface>

        <Surface tone="flat">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('roadmap.progress')}</h3>
          <ol className="mt-4 flex flex-col">
            {STAGES.map((s) => {
              const done = s < CURRENT_STAGE;
              const current = s === CURRENT_STAGE;
              const mine = s === def.stage;
              return (
                <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
                  {s < 6 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line" aria-hidden />}
                  <span
                    className={cn(
                      'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular',
                      done && 'bg-success/15 text-success',
                      current && 'bg-brand text-white shadow-glow',
                      !done && !current && 'bg-surface-3 text-muted',
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : s}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <div className={cn('text-sm font-medium', mine ? 'text-fg' : 'text-muted')}>{t(`stages.${s}`)}</div>
                    {current && <div className="text-xs text-accent">{t('roadmap.current')}</div>}
                    {mine && !current && <div className={cn('text-xs', tone.text)}>{name}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        </Surface>
      </div>
    </div>
  );
}
