import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Check, Maximize2, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { MODULES } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { RoutigMark } from '@/brand/Logo';
import { loadDashboardConfig, saveDashboardConfig } from '@/data/dashboardRepo';
import { capitalizeFirst } from '@/domain/dates';
import {
  CARD_MODULE,
  KPI_METRICS,
  KPI_MODULE,
  LIVE_CARDS,
  PLANNED_CARDS,
  addCard,
  cycleSize,
  isKpi,
  moveCard,
  removeCard,
  type CardId,
  type CardSize,
  type CardSlot,
  type DashboardConfig,
  type DashboardProfile,
  type KpiMetric,
  type LiveCard,
} from '@/domain/dashboard';
import { newId } from '@/domain/ids';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { EmptyState, LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { KpiCard, renderLiveCard } from './cards';

export function greetingKey(hour: number): 'dashboard.morning' | 'dashboard.afternoon' | 'dashboard.evening' {
  if (hour >= 5 && hour < 12) return 'dashboard.morning';
  if (hour >= 12 && hour < 18) return 'dashboard.afternoon';
  return 'dashboard.evening';
}

export { capitalizeFirst } from '@/domain/dates';

/** Largura no grid: pequeno = 1/4, médio = metade, largo = linha inteira (no celular, pequeno = meia linha). */
const SPAN: Record<CardSize, string> = {
  sm: 'col-span-1',
  md: 'col-span-2',
  lg: 'col-span-2 lg:col-span-4',
};

function moduleOf(id: CardId) {
  return isKpi(id) ? KPI_MODULE[id.slice(4) as KpiMetric] : CARD_MODULE[id as LiveCard];
}

/**
 * Dashboard (Parte 5): perfis de painel, cartões e indicadores com dados reais.
 * "Personalizar" edita uma cópia (prévia); só "Aplicar" grava.
 */
export function DashboardPage() {
  const { settings, t } = useSettings();
  const toast = useToast();
  const saved = useLiveQuery(() => loadDashboardConfig(), []);
  const [draft, setDraft] = useState<DashboardConfig | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const now = new Date();
  const greeting = t(greetingKey(now.getHours()));
  const name = settings.profile.displayName.trim();
  const date = capitalizeFirst(new Intl.DateTimeFormat(settings.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now));

  const config = draft ?? saved;
  const editing = draft !== null;
  const profile = config?.profiles.find((p) => p.id === config.activeId) ?? config?.profiles[0];
  const hidden = new Set<string>(settings.nav.hidden);
  const visible = (profile?.cards ?? []).filter((c) => {
    const mod = moduleOf(c.id);
    return !mod || !hidden.has(mod);
  });

  const profileName = (p: DashboardProfile) => (p.builtin ? t(`dashboard.profiles.${p.id as 'complete' | 'studies' | 'projects'}`) : p.name);

  const updateCards = (fn: (cards: CardSlot[]) => CardSlot[]) =>
    setDraft((d) => (d ? { ...d, profiles: d.profiles.map((p) => (p.id === d.activeId ? { ...p, cards: fn(p.cards) } : p)) } : d));

  const switchProfile = async (id: string) => {
    if (!config) return;
    if (editing) setDraft({ ...config, activeId: id });
    else await saveDashboardConfig({ ...config, activeId: id });
  };

  const apply = async () => {
    if (!draft) return;
    await saveDashboardConfig(draft);
    setDraft(null);
    toast.show(t('dashboard.applied'));
  };

  const createProfile = (label: string) => {
    if (!config) return;
    const p: DashboardProfile = { id: newId('dash'), name: label.trim().slice(0, 40), builtin: false, cards: profile ? [...profile.cards] : [] };
    setDraft({ activeId: p.id, profiles: [...config.profiles, p] });
    setNaming(false);
  };

  const deleteProfile = async () => {
    if (!config || !profile || profile.builtin) return;
    const next = { activeId: 'complete', profiles: config.profiles.filter((p) => p.id !== profile.id) };
    if (editing) setDraft(next);
    else await saveDashboardConfig(next);
    setDeleting(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-clip rounded-3xl bg-surface p-6 shadow-soft ring-1 ring-line/70 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-72 w-72 opacity-[0.16] sm:opacity-25" aria-hidden>
          <RoutigMark className="h-full w-full" />
        </div>
        <div className="relative">
          <p className="text-sm font-medium text-muted">{date}</p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{name ? t('dashboard.greetingNamed', { greeting, name }) : greeting}</h1>
          {config && profile && (
            <div className="mt-5 flex flex-wrap items-end gap-2">
              <div className="w-48">
                <Field label={t('dashboard.profile')}>
                  {(id) => (
                    <Select id={id} value={profile.id} onChange={(e) => void switchProfile(e.target.value)}>
                      {config.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {profileName(p)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              {!editing && (
                <Button variant="secondary" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setDraft(structuredClone(config))}>
                  {t('dashboard.customize')}
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {editing && profile && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl bg-surface/95 p-3 shadow-lift ring-1 ring-accent/40 backdrop-blur">
          <p className="min-w-0 flex-1 basis-60 text-sm font-medium text-fg">{t('dashboard.preview')}</p>
          <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCatalogOpen(true)}>
            {t('dashboard.addCard')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setNaming(true)}>
            {t('dashboard.newProfile')}
          </Button>
          {!profile.builtin && (
            <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>
              {t('dashboard.deleteProfile')}
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setDraft(null)}>
            {t('dashboard.discard')}
          </Button>
          <Button size="sm" variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => void apply()}>
            {t('dashboard.apply')}
          </Button>
        </div>
      )}

      {!config ? (
        <LoadingState label={t('common.loading')} lines={4} />
      ) : visible.length === 0 ? (
        <EmptyState title={t('dashboard.emptyProfile')} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
          {visible.map((slot, index) => (
            <div key={slot.id} className={cn('flex min-w-0 flex-col', SPAN[slot.size], editing && 'gap-2 rounded-3xl p-2 outline-dashed outline-2 outline-accent/50')}>
              {editing && (
                <div className="flex flex-wrap justify-end gap-1">
                  <IconButton size="sm" label={t('dashboard.moveUp')} icon={<ArrowUp className="h-4 w-4" />} disabled={index === 0} onClick={() => updateCards((c) => moveCard(c, slot.id, -1))} />
                  <IconButton size="sm" label={t('dashboard.moveDown')} icon={<ArrowDown className="h-4 w-4" />} disabled={index === visible.length - 1} onClick={() => updateCards((c) => moveCard(c, slot.id, 1))} />
                  <IconButton
                    size="sm"
                    label={t('dashboard.size', { size: t(`dashboard.sizes.${slot.size}`) })}
                    icon={<Maximize2 className="h-4 w-4" />}
                    onClick={() => updateCards((c) => c.map((x) => (x.id === slot.id ? { ...x, size: cycleSize(x.size) } : x)))}
                  />
                  <IconButton size="sm" label={t('dashboard.remove')} icon={<X className="h-4 w-4" />} onClick={() => updateCards((c) => removeCard(c, slot.id))} />
                </div>
              )}
              <div className={cn('min-h-0 flex-1', editing && 'pointer-events-none select-none')}>{isKpi(slot.id) ? <KpiCard metric={slot.id.slice(4) as KpiMetric} /> : renderLiveCard(slot.id as LiveCard)}</div>
            </div>
          ))}
        </div>
      )}

      {catalogOpen && profile && <CatalogDialog cards={profile.cards} hidden={hidden} onAdd={(id) => updateCards((c) => addCard(c, id))} onClose={() => setCatalogOpen(false)} />}
      {naming && <NewProfileDialog onCreate={createProfile} onClose={() => setNaming(false)} />}
      <ConfirmDialog
        open={deleting}
        title={t('dashboard.deleteProfile')}
        body={t('dashboard.deleteProfileBody', { name: profile ? profileName(profile) : '' })}
        confirmLabel={t('dashboard.deleteConfirm')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={() => void deleteProfile()}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}

/** Catálogo: cartões vivos, indicadores e os que chegam com módulos futuros. */
function CatalogDialog({ cards, hidden, onAdd, onClose }: { cards: CardSlot[]; hidden: Set<string>; onAdd: (id: CardId) => void; onClose: () => void }) {
  const { t } = useSettings();
  const has = (id: CardId) => cards.some((c) => c.id === id);
  const row = (id: CardId, label: string) => (
    <li key={id} className="flex items-center gap-3 rounded-xl px-2 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{label}</span>
      {has(id) ? (
        <Badge tone="success">{t('dashboard.added')}</Badge>
      ) : (
        <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => onAdd(id)}>
          {t('dashboard.addCard')}
        </Button>
      )}
    </li>
  );
  const allowed = (mod: string | null) => !mod || !hidden.has(mod);
  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} title={t('dashboard.catalog')} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('dashboard.catalogCards')}</h3>
          <ul>{LIVE_CARDS.filter((id) => allowed(CARD_MODULE[id])).map((id) => row(id, t(`dashboard.cards.${id}`)))}</ul>
        </section>
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('dashboard.catalogKpis')}</h3>
          <ul>{KPI_METRICS.filter((m) => allowed(KPI_MODULE[m])).map((m) => row(`kpi:${m}`, t(`dashboard.kpi.${m}`)))}</ul>
        </section>
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('dashboard.catalogSoon')}</h3>
          <ul>
            {PLANNED_CARDS.map((id) => {
              const mod = CARD_MODULE[id]!;
              return (
                <li key={id} className="flex items-center gap-3 rounded-xl px-2 py-2 opacity-70">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{t(`dashboard.cards.${id}`)}</span>
                    <span className="block text-xs text-muted">{t('dashboard.soonHint', { module: t(`modules.${mod}`), stage: MODULES[mod].stage })}</span>
                  </span>
                  <Badge>{t('dashboard.catalogSoon')}</Badge>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Dialog>
  );
}

function NewProfileDialog({ onCreate, onClose }: { onCreate: (name: string) => void; onClose: () => void }) {
  const { t } = useSettings();
  const [value, setValue] = useState('');
  const ok = value.trim().length > 0;
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('dashboard.newProfile')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!ok} onClick={() => onCreate(value)}>
            {t('dashboard.createProfile')}
          </Button>
        </>
      }
    >
      <Field label={t('dashboard.profileName')}>
        {(id) => <Input id={id} autoFocus value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok && onCreate(value)} />}
      </Field>
    </Dialog>
  );
}
