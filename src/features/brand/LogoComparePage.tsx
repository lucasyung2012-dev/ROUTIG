import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, Undo2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { RoutigMark, logoPngUrl, useVectorApproved } from '@/brand/Logo';
import { VECTOR_APPROVED_AT } from '@/brand/mark';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Segmented';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { nowIso } from '@/domain/ids';

type Mode = 'overlay' | 'side' | 'diff';

/**
 * Comparação do vetor com o PNG original no mesmo quadro de 1024 × 1024.
 * A aprovação é do usuário; nada troca o logo sem ela.
 */
export function LogoComparePage() {
  const { settings, update, t } = useSettings();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('overlay');
  const [opacity, setOpacity] = useState(60);
  const approved = useVectorApproved();
  const productDate = VECTOR_APPROVED_AT
    ? new Intl.DateTimeFormat(settings.locale, { dateStyle: 'long' }).format(new Date(`${VECTOR_APPROVED_AT}T12:00:00`))
    : '';

  const setApproved = (value: boolean) =>
    update((s) => ({ ...s, brand: { vectorApproved: value, approvedAt: value ? nowIso() : null } })).then(
      () => toast.show(value ? t('logo.approved') : t('logo.revoked'), 'success'),
      () => toast.show(t('errors.saveFailed'), 'error'),
    );

  return (
    <div className="flex flex-col gap-6">
      <Link to="/settings/about" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t('settings.sections.about')}
      </Link>
      <PageHeader
        title={t('logo.title')}
        description={t('logo.body')}
        actions={
          <Badge tone={approved ? 'success' : 'warning'}>{approved ? t('logo.statusApproved') : t('logo.statusPending')}</Badge>
        }
      />

      <Surface className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <Segmented
            label={t('logo.title')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'overlay', label: t('logo.modeOverlay') },
              { value: 'side', label: t('logo.modeSide') },
              { value: 'diff', label: t('logo.modeDiff') },
            ]}
          />
          {mode === 'overlay' && (
            <label className="flex min-w-[220px] flex-1 items-center gap-3 text-sm text-muted">
              {t('logo.opacity')}
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="flex-1 accent-[rgb(var(--accent))]"
              />
              <span className="w-10 text-right tabular">{opacity}%</span>
            </label>
          )}
        </div>

        {mode === 'side' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Frame label={t('logo.original')}>
              <img src={logoPngUrl} alt={t('logo.original')} className="h-full w-full" />
            </Frame>
            <Frame label={t('logo.vector')}>
              <div className="h-full w-full bg-[#110428]">
                <RoutigMark full className="h-full w-full" title={t('logo.vector')} />
              </div>
            </Frame>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[560px]">
            <Frame label={mode === 'diff' ? t('logo.modeDiff') : t('logo.modeOverlay')}>
              <div className="relative h-full w-full" style={{ isolation: 'isolate' }}>
                <img src={logoPngUrl} alt={t('logo.original')} className="absolute inset-0 h-full w-full" />
                <div
                  className="absolute inset-0"
                  style={mode === 'diff' ? { mixBlendMode: 'difference' } : { opacity: opacity / 100 }}
                >
                  <RoutigMark full className="h-full w-full" />
                </div>
              </div>
            </Frame>
            {mode === 'diff' && <p className="mt-3 text-sm text-muted">{t('logo.diffHint')}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/70 pt-5">
          {productDate ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              <Check className="h-4 w-4 text-success" aria-hidden />
              {t('logo.approvedProduct', { date: productDate })}
            </p>
          ) : approved ? (
            <Button variant="secondary" icon={<Undo2 className="h-4 w-4" aria-hidden />} onClick={() => setApproved(false)}>
              {t('logo.revoke')}
            </Button>
          ) : (
            <Button variant="primary" icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => setApproved(true)}>
              {t('logo.approve')}
            </Button>
          )}
        </div>
      </Surface>
    </div>
  );
}

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="aspect-square w-full max-w-full overflow-hidden rounded-2xl ring-1 ring-line">{children}</div>
      <figcaption className="text-center text-xs font-medium text-subtle">{label}</figcaption>
    </figure>
  );
}
