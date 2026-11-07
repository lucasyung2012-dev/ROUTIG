import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import type { ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { LAKE, PARK_BUILDINGS, PARK_RADIUS, PATH_WIDTH, PLAZA_RADIUS, PONDS, lakeRadiusAt, parkPaths } from '@/domain/park';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';
import type { Engine } from './engine';

const ZOOMS = [1, 2, 3.4] as const;
const R = PARK_RADIUS + 70;

/**
 * Minimapa de verdade: uma foto do próprio parque vista de cima (prédios com a forma real,
 * telhados, árvores, praça com a fonte, caminhos, lago, casas), tirada uma vez ao abrir.
 * Por cima: onde você está e para onde olha, o norte, os nomes dos prédios ao aproximar,
 * e tocar num prédio o escolhe. Enquanto a foto não fica pronta (ou se o aparelho não deixar),
 * aparece uma planta desenhada.
 */
export function Minimap({ engine, onPick }: { engine: MutableRefObject<Engine | null>; onPick: (id: ModuleId) => void }) {
  const { t } = useSettings();
  const [zoom, setZoom] = useState(0);
  const [big, setBig] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const cam = useRef<SVGGElement>(null);
  const lake = useMemo(() => Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * Math.PI * 2; const r = lakeRadiusAt(a); return `${(LAKE.x + Math.cos(a) * r).toFixed(1)},${(LAKE.z + Math.sin(a) * r).toFixed(1)}`; }).join(' '), []);
  const paths = useMemo(() => parkPaths().map((p) => ({ w: PATH_WIDTH[p.kind] + 1, pts: p.points.map((q) => `${q.x.toFixed(1)},${q.z.toFixed(1)}`).join(' ') })), []);

  // Foto aérea: espera o parque montar e tira uma vez (meio-dia, sem neblina nem pessoas).
  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      const e = engine.current;
      tries++;
      if (tries > 20) return window.clearInterval(id);
      if (!e) return;
      const shot = e.captureMap(R, 1024);
      if (shot) {
        setPhoto(shot);
        window.clearInterval(id);
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [engine]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const info = engine.current?.cameraInfo();
      if (!info || !svg.current || !cam.current) return;
      const s = ZOOMS[zoom]!;
      const half = R / s;
      const cx = s === 1 ? 0 : Math.max(-R + half, Math.min(R - half, info.x));
      const cz = s === 1 ? 0 : Math.max(-R + half, Math.min(R - half, info.z));
      svg.current.setAttribute('viewBox', `${cx - half} ${cz - half} ${half * 2} ${half * 2}`);
      const deg = (Math.atan2(Math.cos(info.yaw), Math.sin(info.yaw)) * 180) / Math.PI;
      cam.current.setAttribute('transform', `translate(${info.x.toFixed(1)} ${info.z.toFixed(1)}) rotate(${deg.toFixed(1)}) scale(${(1 / s).toFixed(2)})`);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, zoom]);

  const s = ZOOMS[zoom]!;
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1" aria-label={t('park.minimap')}>
      <div className={cn('relative overflow-hidden rounded-2xl bg-[#4E8A49] shadow-lift ring-2 ring-white/40 transition-all', big ? 'h-72 w-72 sm:h-80 sm:w-80' : 'h-44 w-44')}>
        <svg ref={svg} viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} className="h-full w-full" role="img" aria-label={t('park.minimap')}>
          {photo ? (
            <image href={photo} x={-R} y={-R} width={R * 2} height={R * 2} preserveAspectRatio="none" />
          ) : (
            <g>
              <circle cx="0" cy="0" r={PARK_RADIUS + 12} fill="#5E9A55" />
              {paths.map((p, i) => (
                <polyline key={i} points={p.pts} fill="none" stroke="#E7E1D3" strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              <polygon points={lake} fill="#3E8FC9" />
              {PONDS.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.z} r={p.radius} fill="#3E8FC9" />
              ))}
              <circle cx="0" cy="0" r={PLAZA_RADIUS} fill="#EDE8DC" />
              {PARK_BUILDINGS.map((b) => (
                <circle key={b.id} cx={b.x} cy={b.z} r={b.radius * 0.55} fill={b.color} stroke="#fff" strokeWidth="3" />
              ))}
            </g>
          )}
          {/* Prédios tocáveis; com zoom (ou o mapa grande), o nome aparece. */}
          {PARK_BUILDINGS.map((b) => (
            <g key={b.id} onClick={() => onPick(b.id)} style={{ cursor: 'pointer' }}>
              <title>{t(`park.names.${b.id}`)}</title>
              <circle cx={b.x} cy={b.z} r={b.radius * 0.7} fill="transparent" />
              {(s > 1 || big) && (
                <text x={b.x} y={b.z - b.radius * 0.75} textAnchor="middle" fontSize={(big ? 13 : 16) / s} fontWeight={700} fill="#fff" stroke="#0B1026" strokeWidth={3 / s} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                  {t(`modules.${b.id}`)}
                </text>
              )}
            </g>
          ))}
          <g ref={cam}>
            <circle r="20" fill="#FFFFFF" opacity="0.25" />
            <path d="M18 0 L-10 -11 L-5 0 L-10 11 Z" fill="#FFFFFF" stroke="#0B1026" strokeWidth="3" />
          </g>
        </svg>
        <span className="pointer-events-none absolute left-2 top-1.5 rounded bg-black/45 px-1.5 text-[0.65rem] font-bold text-white">N ↑</span>
      </div>
      <div className="flex gap-1">
        <IconButton size="sm" label={big ? t('park.mapSmall') : t('park.mapBig')} icon={big ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} onClick={() => setBig((b) => !b)} className="bg-surface/90" />
        <IconButton size="sm" label={t('park.zoomOut')} icon={<Minus className="h-4 w-4" />} disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))} className="bg-surface/90" />
        <IconButton size="sm" label={t('park.zoomIn')} icon={<Plus className="h-4 w-4" />} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} className="bg-surface/90" />
      </div>
    </div>
  );
}
