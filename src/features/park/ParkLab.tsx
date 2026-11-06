import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Navigation, Sun, Tag, X } from 'lucide-react';
import { MODULES, type ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { PARK_BUILDINGS } from '@/domain/park';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Field';
import { createPark, type ParkController, type ParkQuality, type ParkStats } from './parkScene';

/** Qualidade inicial pelo aparelho: toque (iPad/iPhone) começa na média. */
function autoQuality(): ParkQuality {
  if (typeof window === 'undefined') return 'medium';
  return window.matchMedia?.('(pointer: coarse)').matches ? 'medium' : 'high';
}

/**
 * Parque 3D — prova técnica da V2 (Etapa 0). Página de teste em #/lab/park,
 * fora do menu: mede desempenho e interação no iPad antes de construir o parque de verdade.
 */
export default function ParkLab() {
  const { t, settings } = useSettings();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const park = useRef<ParkController | null>(null);
  const [quality, setQuality] = useState<ParkQuality>(autoQuality);
  const [night, setNight] = useState(() => {
    const h = new Date().getHours();
    return h < 6 || h >= 19;
  });
  const [labels, setLabels] = useState(true);
  const [stats, setStats] = useState<ParkStats | null>(null);
  const [selected, setSelected] = useState<ModuleId | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      park.current = createPark(canvas, { quality, reduceMotion: settings.reduceMotion, onStats: setStats, onSelect: setSelected });
      park.current.setNight(night);
    } catch {
      setFailed(true);
    }
    // Rótulos em HTML posicionados direto no DOM (sem re-render do React a cada quadro).
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const box = labelsRef.current;
      if (!box || !park.current) return;
      for (const p of park.current.project()) {
        const el = box.querySelector<HTMLElement>(`[data-id="${p.id}"]`);
        if (!el) continue;
        el.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
        el.style.opacity = p.visible ? '1' : '0';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      park.current?.dispose();
      park.current = null;
    };
    // O parque nasce uma vez; qualidade e noite mudam pelo controlador.
  }, []);

  useEffect(() => park.current?.setQuality(quality), [quality]);
  useEffect(() => park.current?.setNight(night), [night]);

  const sel = selected ? PARK_BUILDINGS.find((b) => b.id === selected) : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0B1026] text-fg" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={t('lab.park.canvas')} />

      <div ref={labelsRef} className={labels ? 'pointer-events-none absolute inset-0' : 'hidden'} aria-hidden>
        {PARK_BUILDINGS.map((b) => (
          <span key={b.id} data-id={b.id} className="absolute left-0 top-0 whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[0.7rem] font-semibold text-white transition-opacity">
            {t(`modules.${b.id}`)}
          </span>
        ))}
      </div>

      {failed && (
        <div role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-white">
          {t('lab.park.noWebgl')}
        </div>
      )}

      {/* Barra de cima */}
      <div className="absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-3 safe-top">
        <Link to="/" className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface/90 px-3 text-sm font-medium text-fg shadow-soft">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('lab.park.back')}
        </Link>
        <span className="rounded-xl bg-surface/80 px-3 py-2 text-xs font-semibold text-fg">{t('lab.park.title')}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select aria-label={t('lab.park.goTo')} value="" onChange={(e) => e.target.value && park.current?.flyTo(e.target.value as ModuleId | 'plaza')} className="h-11 w-auto max-w-[11rem] bg-surface/90">
            <option value="">{t('lab.park.goTo')}</option>
            <option value="plaza">{t('lab.park.plaza')}</option>
            {PARK_BUILDINGS.map((b) => (
              <option key={b.id} value={b.id}>
                {t(`modules.${b.id}`)}
              </option>
            ))}
          </Select>
          <IconButton label={night ? t('lab.park.day') : t('lab.park.night')} icon={night ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />} onClick={() => setNight((n) => !n)} className="bg-surface/90" />
          <IconButton label={t('lab.park.labels')} icon={<Tag className="h-5 w-5" />} active={labels} onClick={() => setLabels((l) => !l)} className="bg-surface/90" />
          <Segmented<ParkQuality>
            label={t('lab.park.quality')}
            value={quality}
            onChange={setQuality}
            options={(['low', 'medium', 'high'] as const).map((q) => ({ value: q, label: t(`lab.park.q.${q}`) }))}
            className="bg-surface/90"
          />
        </div>
      </div>

      {/* Medições */}
      <div className="absolute bottom-3 left-3 rounded-xl bg-black/60 px-3 py-2 font-mono text-[0.7rem] leading-relaxed text-white safe-bottom">
        {stats ? (
          <>
            <div>{t('lab.park.fps', { fps: stats.fps })}</div>
            <div>{t('lab.park.calls', { calls: stats.calls })}</div>
            <div>{t('lab.park.tris', { tris: stats.triangles.toLocaleString(settings.locale) })}</div>
          </>
        ) : (
          t('common.loading')
        )}
      </div>
      <p className="absolute bottom-3 right-3 hidden max-w-xs rounded-xl bg-black/50 px-3 py-2 text-[0.7rem] text-white sm:block">{t('lab.park.gestures')}</p>

      {/* Prédio tocado */}
      {sel && (
        <div className="absolute inset-x-3 bottom-20 mx-auto max-w-sm rounded-2xl bg-surface p-4 shadow-lift ring-1 ring-line" role="dialog" aria-label={t(`modules.${sel.id}`)}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-fg">{t(`modules.${sel.id}`)}</div>
              <div className="text-xs text-muted">{t(`lab.park.regions.${sel.region}`)}</div>
            </div>
            <IconButton size="sm" label={t('common.close')} icon={<X className="h-4 w-4" />} onClick={() => setSelected(null)} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" icon={<Navigation className="h-4 w-4" />} onClick={() => park.current?.flyTo(sel.id)}>
              {t('lab.park.flyTo')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => navigate(MODULES[sel.id].path)}>
              {t('common.open')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
