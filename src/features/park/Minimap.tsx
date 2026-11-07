import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { LAKE, PARK_BUILDINGS, PARK_RADIUS, PATH_WIDTH, PLAZA_RADIUS, PONDS, lakeRadiusAt, parkPaths } from '@/domain/park';
import { IconButton } from '@/ui/IconButton';
import type { Engine } from './engine';

const ZOOMS = [1, 2, 3.4] as const;
const R = PARK_RADIUS + 20;

/**
 * Minimapa em maquete (prompt 3.6): regiões, prédios, caminhos, lago, praça, posição e direção da
 * câmera, três níveis de aproximação. Tocar num prédio o escolhe (o cartão mostra "Ir até lá").
 * Desenhado em SVG inclinado (perspectiva), sem um segundo 3D: leve no iPad.
 */
export function Minimap({ engine, onPick }: { engine: MutableRefObject<Engine | null>; onPick: (id: ModuleId) => void }) {
  const { t } = useSettings();
  const [zoom, setZoom] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const cam = useRef<SVGGElement>(null);
  const lake = useMemo(() => Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; const r = lakeRadiusAt(a); return `${(LAKE.x + Math.cos(a) * r).toFixed(1)},${(LAKE.z + Math.sin(a) * r).toFixed(1)}`; }).join(' '), []);
  const paths = useMemo(() => parkPaths().map((p) => ({ w: PATH_WIDTH[p.kind] + 1.5, pts: p.points.map((q) => `${q.x.toFixed(1)},${q.z.toFixed(1)}`).join(' ') })), []);

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

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1" aria-label={t('park.minimap')}>
      <div className="h-44 w-44 overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/25 backdrop-blur-sm" style={{ perspective: '420px' }}>
        <svg ref={svg} viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} className="h-full w-full" style={{ transform: 'rotateX(38deg) scale(1.12)', transformOrigin: '50% 60%' }} role="img" aria-label={t('park.minimap')}>
          <circle cx="0" cy="0" r={PARK_RADIUS + 12} fill="#5E9A55" />
          <circle cx="0" cy="0" r={PARK_RADIUS - 40} fill="#6DAA5E" />
          {paths.map((p, i) => (
            <polyline key={i} points={p.pts} fill="none" stroke="#E7E1D3" strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <polygon points={lake} fill="#3E8FC9" />
          {PONDS.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.z} r={p.radius} fill="#3E8FC9" />
          ))}
          <circle cx="0" cy="0" r={PLAZA_RADIUS} fill="#EDE8DC" />
          <circle cx="0" cy="0" r={5} fill="#7B3FF6" />
          {PARK_BUILDINGS.map((b) => (
            <g key={b.id} onClick={() => onPick(b.id)} style={{ cursor: 'pointer' }}>
              <title>{t(`park.names.${b.id}`)}</title>
              <circle cx={b.x} cy={b.z} r={b.radius * 0.95} fill="#000" opacity="0.12" />
              <circle cx={b.x} cy={b.z} r={b.radius * 0.6} fill={b.color} stroke="#fff" strokeWidth="3" />
            </g>
          ))}
          <g ref={cam}>
            <path d="M18 0 L-10 -11 L-5 0 L-10 11 Z" fill="#FFFFFF" stroke="#0B1026" strokeWidth="3" />
          </g>
        </svg>
      </div>
      <div className="flex gap-1">
        <IconButton size="sm" label={t('park.zoomOut')} icon={<Minus className="h-4 w-4" />} disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))} className="bg-surface/90" />
        <IconButton size="sm" label={t('park.zoomIn')} icon={<Plus className="h-4 w-4" />} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} className="bg-surface/90" />
      </div>
    </div>
  );
}
