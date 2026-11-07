import { useState } from 'react';
import { useSettings } from '@/app/SettingsProvider';
import { Segmented } from '@/ui/Segmented';
import { Switch } from '@/ui/Switch';
import { DEFAULT_FAB, FAB_MAX, FAB_MIN, type FabPlace } from './ParkUi';

const KEY = 'routig.park.prefs';
type Prefs = { graphics?: 'auto' | 'low' | 'medium' | 'high'; stats?: boolean; fab?: FabPlace } & Record<string, unknown>;

function read(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}
function write(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sem armazenamento */
  }
}

/** Configurações → Parque 3D: gráficos, medição de desempenho e o botão da Central (ficam neste aparelho). */
export function ParkSettingsSection() {
  const { t } = useSettings();
  const [p, setP] = useState<Prefs>(read);
  const save = (next: Prefs) => {
    const merged = { ...read(), ...next };
    write(merged);
    setP(merged);
  };
  const fab = { ...DEFAULT_FAB, ...p.fab };
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <p className="text-sm text-muted">{t('park.settings3d.intro')}</p>
      <Segmented
        label={t('park.graphics')}
        value={p.graphics ?? 'auto'}
        onChange={(v) => save({ graphics: v })}
        options={(['auto', 'low', 'medium', 'high'] as const).map((v) => ({ value: v, label: t(`park.gfx.${v}`) }))}
        className="w-full"
      />
      <Switch label={t('park.settings3d.stats')} hint={t('park.settings3d.statsHint')} checked={!!p.stats} onChange={(on) => save({ stats: on })} />
      <label className="flex flex-col gap-1 text-sm text-fg">
        <span className="flex justify-between">
          {t('park.settings3d.fabSize')}
          <span className="tabular-nums text-muted">{fab.size}px</span>
        </span>
        <input type="range" min={FAB_MIN} max={FAB_MAX} step={2} value={fab.size} onChange={(e) => save({ fab: { ...fab, size: Number(e.target.value) } })} className="w-full accent-[rgb(var(--accent))]" />
      </label>
      <button type="button" onClick={() => save({ fab: { ...DEFAULT_FAB, size: fab.size } })} className="self-start rounded-xl px-3 py-2 text-sm font-medium text-fg ring-1 ring-inset ring-line hover:bg-surface-2">
        {t('park.settings3d.fabReset')}
      </button>
    </div>
  );
}
