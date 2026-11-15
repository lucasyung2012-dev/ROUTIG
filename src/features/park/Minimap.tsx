import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react';
import { ChevronUp, LocateFixed, Map as MapIcon, Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import type { ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { BRIDGE, ISLAND, LAKE, PARK_BUILDINGS, PARK_RADIUS, PARK_REGIONS, PATH_WIDTH, PLAZA_RADIUS, POIS, PONDS, entranceOf, lakeRadiusAt, parkPaths, themeAt, type ParkRegion } from '@/domain/park';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';
import type { Engine } from './engine';

/** Níveis de zoom. O detalhe vem do índice: 0 geral, 1 médio, 2 em diante perto. */
const ZOOMS = [1, 2, 3.4, 5] as const;
const R = PARK_RADIUS + 70;
/** Quanto o ponteiro anda (px) antes de virar arrasto; abaixo disso é toque (escolhe o prédio). */
const DRAG_SLOP = 6;
const COLLAPSED_KEY = 'routig.park.minimapCollapsed';

/** Cor de cada área temática no minimapa (o centro fica sem cor). */
const THEME_COLOR: Record<ParkRegion, string> = { central: 'transparent', knowledge: '#6366F1', planning: '#0EA5E9', growth: '#22C55E', activity: '#F97316', finance: '#EAB308' };
const CELL = 16;
const INK = '#0B1026';

/** Manchas das áreas temáticas (grade de 16 m pela área predominante) e o ponto do nome de cada uma. */
function themeAreas() {
  const d: Record<string, string> = {};
  for (let x = -PARK_RADIUS; x < PARK_RADIUS; x += CELL)
    for (let z = -PARK_RADIUS; z < PARK_RADIUS; z += CELL) {
      if (Math.hypot(x + CELL / 2, z + CELL / 2) > PARK_RADIUS) continue;
      const t = themeAt(x + CELL / 2, z + CELL / 2);
      if (t === 'central') continue;
      d[t] = (d[t] ?? '') + `M${x} ${z}h${CELL}v${CELL}h${-CELL}z`;
    }
  const labels = PARK_REGIONS.filter((t) => t !== 'central').map((t) => {
    const bs = PARK_BUILDINGS.filter((b) => b.region === t);
    return { t, x: bs.reduce((a, b) => a + b.x, 0) / bs.length, z: bs.reduce((a, b) => a + b.z, 0) / bs.length };
  });
  return { d, labels };
}

/** Nome longo em duas linhas equilibradas (o mapa é pequeno; vale para os dois idiomas). */
function twoLines(text: string): string[] {
  const w = text.split(' ');
  if (w.length < 2 || text.length <= 14) return [text];
  let best = 1;
  let bestLen = Infinity;
  for (let i = 1; i < w.length; i++) {
    const m = Math.max(w.slice(0, i).join(' ').length, w.slice(i).join(' ').length);
    if (m < bestLen) {
      bestLen = m;
      best = i;
    }
  }
  return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
}

const clampAbs = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Minimapa de verdade: uma foto do próprio parque vista de cima (prédios com a forma real,
 * telhados, árvores, praça com a fonte, caminhos, lago, casas), tirada uma vez ao abrir.
 * Por cima: onde você está e para onde olha (a seta, sempre na posição real), o norte, as áreas
 * temáticas e, conforme o zoom, entradas, ilha e ponte do Focus, nomes dos prédios e pontos de
 * convivência. Tocar num prédio o escolhe.
 *
 * Compacto: fica no canto e acompanha você; dá para recolher num botão. Grande: navegação livre
 * (arrastar com mouse, dedo ou caneta, setas do teclado, roda do mouse); ao arrastar, a vista para
 * de seguir você até tocar em "Recentralizar". O laço de cada quadro só mexe em atributos do SVG.
 *
 * Desempenho (iPad e celular): o mapa inteiro é desenhado uma vez no tamanho do zoom e a vista anda
 * movendo esse desenho com `transform` (a placa de vídeo só desloca a imagem pronta). Mudar o
 * `viewBox` a cada quadro obrigava o navegador a redesenhar a foto, os caminhos e os nomes em todo
 * movimento, e o arrasto ficava travado.
 */
export function Minimap({ engine, onPick }: { engine: MutableRefObject<Engine | null>; onPick: (id: ModuleId) => void }) {
  const { t } = useSettings();
  const [zoom, setZoom] = useState(0);
  const [big, setBig] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [follow, setFollowState] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [px, setPx] = useState(176);
  const [focusId, setFocusId] = useState<ModuleId | null>(null);
  const hintId = useId();
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const cam = useRef<SVGGElement>(null);
  const edge = useRef<SVGGElement>(null);
  const collapseBtn = useRef<HTMLButtonElement>(null);
  const expandBtn = useRef<HTMLButtonElement>(null);
  const sizeBtn = useRef<HTMLButtonElement>(null);
  /** Largura do mapa em px (lida pelo laço sem medir o DOM a cada quadro). */
  const size = useRef(176);
  /** Centro da vista em metros; seguindo você, o laço o atualiza; solta, o arrasto o move. */
  const view = useRef({ x: 0, z: 0 });
  const following = useRef(true);
  const drag = useRef<{ id: number; x: number; y: number; vx: number; vz: number; k: number; moved: boolean } | null>(null);
  /** O último gesto foi arrasto: o clique que vem junto não escolhe prédio. */
  const dragged = useRef(false);
  /** Para onde o foco do teclado vai depois da próxima renderização (o botão anterior sumiu ou desativou). */
  const want = useRef<'expand' | 'collapse' | 'size' | 'map' | null>(null);
  const lake = useMemo(() => Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * Math.PI * 2; const r = lakeRadiusAt(a); return `${(LAKE.x + Math.cos(a) * r).toFixed(1)},${(LAKE.z + Math.sin(a) * r).toFixed(1)}`; }).join(' '), []);
  const areas = useMemo(themeAreas, []);
  const paths = useMemo(() => parkPaths().map((p) => ({ w: PATH_WIDTH[p.kind] + 1, pts: p.points.map((q) => `${q.x.toFixed(1)},${q.z.toFixed(1)}`).join(' ') })), []);
  // Entradas: a porta fica de frente para o caminho (perpendicular à direção centro → entrada).
  const doors = useMemo(() => PARK_BUILDINGS.map((b) => { const e = entranceOf(b); return { id: b.id, x: e.x, z: e.z, deg: (Math.atan2(e.z - b.z, e.x - b.x) * 180) / Math.PI + 90 }; }), []);

  const setFollow = (on: boolean) => {
    following.current = on;
    setFollowState(on);
  };

  // Foto aérea: espera o parque montar e tira uma vez (meio-dia, sem neblina nem pessoas). Recolhido, espera abrir.
  useEffect(() => {
    if (collapsed || photo) return;
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
  }, [engine, collapsed, photo]);

  // Tamanho real do mapa (muda com mapa grande/pequeno e com a tela): só quando muda, não a cada quadro.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = (w: number) => {
      if (w <= 0) return;
      size.current = w;
      setPx(Math.round(w));
    };
    read(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => read(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed]);

  // Roda do mouse no mapa grande: aproxima e afasta (um passo por gesto, sem pular todos os níveis).
  useEffect(() => {
    const el = box.current;
    if (!el || !big) return;
    let acc = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(acc) < 60) return;
      const dir = acc < 0 ? 1 : -1;
      acc = 0;
      const now = performance.now();
      if (now - last < 220) return;
      last = now;
      setZoom((z) => Math.min(ZOOMS.length - 1, Math.max(0, z + dir)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [big, collapsed]);

  // Laço de cada quadro: só atributos (vista, seta, indicador da borda), nada de estado do React.
  useEffect(() => {
    if (collapsed) return;
    const s = ZOOMS[zoom]!;
    const half = R / s;
    let raf = 0;
    let lastMove = '';
    let lastVis = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = svg.current;
      const info = engine.current?.cameraInfo();
      if (!el || !cam.current || !info) return;
      const u = (half * 2) / (size.current || 1);
      const v = view.current;
      if (!big || following.current) {
        // Seguindo você (sempre no compacto): a vista inteira fica dentro do mapa.
        const lim = R - half;
        v.x = s === 1 ? 0 : clampAbs(info.x, lim);
        v.z = s === 1 ? 0 : clampAbs(info.z, lim);
      } else {
        // Vista livre: o centro fica dentro do mapa, com folga para arrastar mesmo no zoom geral.
        const lim = Math.max(R - half, PARK_RADIUS * 0.5);
        v.x = clampAbs(v.x, lim);
        v.z = clampAbs(v.z, lim);
      }
      // O desenho tem (tamanho × zoom) px; desloca para o centro da vista ficar no meio do mapa.
      const w = (size.current || 1) * s;
      const tx = (size.current || 1) / 2 - ((v.x + R) / (2 * R)) * w;
      const ty = (size.current || 1) / 2 - ((v.z + R) / (2 * R)) * w;
      const mv = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
      if (mv !== lastMove) {
        el.style.transform = mv;
        lastMove = mv;
      }
      const deg = (Math.atan2(Math.cos(info.yaw), Math.sin(info.yaw)) * 180) / Math.PI;
      cam.current.setAttribute('transform', `translate(${info.x.toFixed(1)} ${info.z.toFixed(1)}) rotate(${deg.toFixed(1)}) scale(${u.toFixed(3)})`);
      // Na vista livre, se você saiu da área vista, uma seta na borda aponta para onde você está.
      let vis = 'hidden';
      if (big && !following.current && edge.current) {
        const dx = info.x - v.x;
        const dz = info.z - v.z;
        const lim = half - 22 * u;
        const far = Math.max(Math.abs(dx), Math.abs(dz));
        if (far > lim) {
          const k = lim / far;
          edge.current.setAttribute('transform', `translate(${(v.x + dx * k).toFixed(1)} ${(v.z + dz * k).toFixed(1)}) rotate(${((Math.atan2(dz, dx) * 180) / Math.PI).toFixed(1)}) scale(${u.toFixed(3)})`);
          vis = 'visible';
        }
      }
      if (vis !== lastVis && edge.current) {
        edge.current.setAttribute('visibility', vis);
        lastVis = vis;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, zoom, big, collapsed]);

  // Foco do teclado depois de recolher, abrir, trocar de tamanho ou recentralizar.
  useEffect(() => {
    const w = want.current;
    if (!w) return;
    want.current = null;
    const el = w === 'expand' ? expandBtn.current : w === 'collapse' ? collapseBtn.current : w === 'size' ? sizeBtn.current : box.current;
    el?.focus();
  });

  const setClosed = (closed: boolean) => {
    want.current = closed ? 'expand' : 'collapse';
    setCollapsed(closed);
    try {
      localStorage.setItem(COLLAPSED_KEY, closed ? '1' : '0');
    } catch {
      /* sem armazenamento: só não lembra */
    }
  };
  const toggleBig = () => {
    setBig((b) => !b);
    setFollow(true);
  };
  const zoomBy = (d: number) => setZoom((z) => Math.min(ZOOMS.length - 1, Math.max(0, z + d)));

  /* ---------- Arrastar (só no mapa grande) ---------- */
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!big || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragged.current = false;
    const w = e.currentTarget.clientWidth || 1;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.current.x, vz: view.current.z, k: (2 * R) / ZOOMS[zoom]! / w, moved: false };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      d.moved = true;
      dragged.current = true;
      // A captura só começa no arrasto: um toque parado continua sendo clique no prédio.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ponteiro já liberado */
      }
      if (following.current) setFollow(false);
    }
    view.current.x = d.vx - dx * d.k;
    view.current.z = d.vz - dy * d.k;
  };
  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  /* ---------- Teclado no mapa grande ---------- */
  const onKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (!big || e.altKey || e.ctrlKey || e.metaKey) return;
    const step = (R / ZOOMS[zoom]!) * 0.25;
    let dx = 0;
    let dz = 0;
    switch (e.key) {
      case 'ArrowLeft':
        dx = -step;
        break;
      case 'ArrowRight':
        dx = step;
        break;
      case 'ArrowUp':
        dz = -step;
        break;
      case 'ArrowDown':
        dz = step;
        break;
      case '+':
      case '=':
        zoomBy(1);
        break;
      case '-':
      case '_':
        zoomBy(-1);
        break;
      case 'r':
      case 'R':
      case 'Home':
        setFollow(true);
        break;
      case 'Escape':
        want.current = 'size';
        toggleBig();
        break;
      default:
        return;
    }
    // A tecla é do mapa: não anda com o boneco nem chega aos atalhos do parque.
    e.preventDefault();
    e.stopPropagation();
    if (dx || dz) {
      view.current.x += dx;
      view.current.z += dz;
      if (following.current) setFollow(false);
    }
  };

  if (collapsed)
    return (
      <div className="pointer-events-auto flex justify-end">
        <IconButton ref={expandBtn} label={t('park.mapExpand')} icon={<MapIcon className="h-5 w-5" />} onClick={() => setClosed(false)} className="bg-surface/90 shadow-lift" />
      </div>
    );

  const s = ZOOMS[zoom]!;
  /** Nível de detalhe: 0 geral, 1 médio, 2 perto. */
  const lod = Math.min(2, zoom);
  /** Metros por pixel: textos e marcas têm tamanho fixo na tela em qualquer zoom. */
  const u = (2 * R) / s / Math.max(1, px);
  const showAreas = big || zoom > 0;
  const text = { stroke: INK, strokeWidth: 3 * u, paintOrder: 'stroke', style: { pointerEvents: 'none' as const } };
  const bridgeMid = { x: (BRIDGE.from.x + BRIDGE.to.x) / 2, z: (BRIDGE.from.z + BRIDGE.to.z) / 2 };
  const bridgeLen = Math.hypot(BRIDGE.to.x - BRIDGE.from.x, BRIDGE.to.z - BRIDGE.from.z) || 1;
  // Lado da ponte para o nome (perpendicular a ela).
  const bridgeSide = { x: -(BRIDGE.to.z - BRIDGE.from.z) / bridgeLen, z: (BRIDGE.to.x - BRIDGE.from.x) / bridgeLen };

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1" role="group" aria-label={t('park.minimap')}>
      <div
        ref={box}
        className={cn('relative select-none overflow-hidden rounded-2xl bg-[#4E8A49] shadow-lift ring-2 ring-white/40 transition-all', big ? 'h-72 w-72 cursor-grab active:cursor-grabbing sm:h-80 sm:w-80' : 'h-44 w-44')}
        style={{ touchAction: 'none' }}
        tabIndex={big ? 0 : undefined}
        role={big ? 'group' : undefined}
        aria-label={big ? t('park.mapView') : undefined}
        aria-describedby={big ? hintId : undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDragStart={(e) => e.preventDefault()}
        onKeyDown={onKey}
      >
        <svg ref={svg} viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} className="absolute left-0 top-0 max-w-none origin-top-left will-change-transform" style={{ width: `${px * s}px`, height: `${px * s}px` }} role={big ? undefined : 'img'} aria-label={big ? undefined : t('park.minimap')}>
          {photo ? (
            <image href={photo} x={-R} y={-R} width={R * 2} height={R * 2} preserveAspectRatio="none" />
          ) : (
            <g>
              <circle cx="0" cy="0" r={PARK_RADIUS + 12} fill="#5E9A55" />
              {paths.map((p, i) => (
                <polyline key={i} points={p.pts} fill="none" stroke="#E7E1D3" strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              <polygon points={lake} fill="#3E8FC9" />
              <line x1={BRIDGE.from.x} y1={BRIDGE.from.z} x2={BRIDGE.to.x} y2={BRIDGE.to.z} stroke="#9A7650" strokeWidth={BRIDGE.half * 2} />
              <circle cx={ISLAND.x} cy={ISLAND.z} r={ISLAND.radius} fill="#5E9A55" />
              {PONDS.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.z} r={p.radius} fill="#3E8FC9" />
              ))}
              <circle cx="0" cy="0" r={PLAZA_RADIUS} fill="#EDE8DC" />
              {PARK_BUILDINGS.map((b) => (
                <circle key={b.id} cx={b.x} cy={b.z} r={b.radius * 0.55} fill={b.color} stroke="#fff" strokeWidth="3" />
              ))}
            </g>
          )}
          {/* Zoom geral: manchas das áreas temáticas; com o mapa grande ou com zoom, o nome de cada área, do centro e do lago. */}
          <g style={{ pointerEvents: 'none' }}>
            {Object.entries(areas.d).map(([k, d]) => (
              <path key={k} d={d} fill={THEME_COLOR[k as ParkRegion]} opacity={0.24} shapeRendering="crispEdges" />
            ))}
            {showAreas &&
              areas.labels.map((l) => {
                const lines = twoLines(t(`park.regions.${l.t}`));
                const fs = 11 * u;
                const y0 = l.z - ((lines.length - 1) * fs * 1.1) / 2 + fs * 0.35;
                return (
                  <text key={l.t} x={l.x} y={y0} textAnchor="middle" fontSize={fs} fontWeight={800} fill={THEME_COLOR[l.t]} opacity={lod >= 2 ? 0.7 : 0.95} {...text}>
                    {lines.map((line, i) => (
                      <tspan key={i} x={l.x} dy={i === 0 ? 0 : fs * 1.1}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                );
              })}
            {showAreas && (
              <>
                <text x={0} y={PLAZA_RADIUS + 12 * u} textAnchor="middle" fontSize={10 * u} fontWeight={800} fill="#FFFFFF" {...text}>
                  {t('park.regions.central')}
                </text>
                <text x={LAKE.x} y={LAKE.z + LAKE.radius * 0.72} textAnchor="middle" fontSize={10 * u} fontWeight={700} fontStyle="italic" fill="#DBEAFE" {...text}>
                  {t('park.mapLake')}
                </text>
              </>
            )}
          </g>
          {/* Zoom médio: entradas dos prédios e a ilha e a ponte do Focus. */}
          {lod >= 1 && (
            <g style={{ pointerEvents: 'none' }}>
              {doors.map((d) => (
                <rect key={d.id} x={-4 * u} y={-1.75 * u} width={8 * u} height={3.5 * u} rx={u} fill="#FDE68A" stroke={INK} strokeWidth={1.2 * u} transform={`translate(${d.x.toFixed(1)} ${d.z.toFixed(1)}) rotate(${d.deg.toFixed(1)})`} />
              ))}
              <text x={ISLAND.x} y={ISLAND.z - ISLAND.radius - 5 * u} textAnchor="middle" fontSize={9.5 * u} fontWeight={700} fill="#A7F3D0" {...text}>
                {t('park.mapIsland')}
              </text>
              <text x={bridgeMid.x + bridgeSide.x * 12 * u} y={bridgeMid.z + bridgeSide.z * 12 * u + 3 * u} textAnchor="middle" fontSize={9 * u} fontWeight={700} fill="#F5E6D3" {...text}>
                {t('park.mapBridge')}
              </text>
            </g>
          )}
          {/* Zoom perto: pontos de convivência (cafés, quiosques, mirantes...). */}
          {lod >= 2 && (
            <g style={{ pointerEvents: 'none' }}>
              {POIS.map((p) => (
                <g key={p.id}>
                  <circle cx={p.x} cy={p.z} r={3 * u} fill="#FFFFFF" stroke={INK} strokeWidth={1.2 * u} />
                  <text x={p.x} y={p.z + 13 * u} textAnchor="middle" fontSize={9 * u} fontWeight={600} fill="#FEF3C7" {...text}>
                    {t(`park.poi.${p.kind}`)}
                  </text>
                </g>
              ))}
            </g>
          )}
          {/* Prédios tocáveis (no mapa grande, também pelo teclado); de perto, o nome aparece. */}
          {PARK_BUILDINGS.map((b) => (
            <g
              key={b.id}
              onClick={() => {
                if (!dragged.current) onPick(b.id);
              }}
              onKeyDown={
                big
                  ? (e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      e.stopPropagation();
                      onPick(b.id);
                    }
                  : undefined
              }
              onFocus={(e) => {
                let visible = true;
                try {
                  visible = e.currentTarget.matches(':focus-visible');
                } catch {
                  /* navegador sem :focus-visible: mostra sempre */
                }
                if (visible) setFocusId(b.id);
              }}
              onBlur={() => setFocusId((f) => (f === b.id ? null : f))}
              tabIndex={big ? 0 : undefined}
              role={big ? 'button' : undefined}
              aria-label={big ? t(`park.names.${b.id}`) : undefined}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              <title>{t(`park.names.${b.id}`)}</title>
              <circle cx={b.x} cy={b.z} r={b.radius * 0.7} fill="transparent" />
              {focusId === b.id && <circle cx={b.x} cy={b.z} r={b.radius * 0.7} fill="none" stroke="#FFFFFF" strokeWidth={2.5 * u} strokeDasharray={`${5 * u} ${3 * u}`} style={{ pointerEvents: 'none' }} />}
              {lod >= 2 && (
                <text x={b.x} y={b.z - b.radius * 0.75} textAnchor="middle" fontSize={10 * u} fontWeight={700} fill="#fff" {...text}>
                  {t(`modules.${b.id}`)}
                </text>
              )}
            </g>
          ))}
          {/* Você: a seta fica sempre na sua posição real (o laço a move), separada da área que se vê. */}
          <g ref={cam} style={{ pointerEvents: 'none' }}>
            <circle r="11" fill="#3B82F6" opacity="0.35" />
            <path d="M10 0 L-6 -7 L-3 0 L-6 7 Z" fill="#FFFFFF" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          </g>
          <g ref={edge} visibility="hidden" style={{ pointerEvents: 'none' }}>
            <circle r="8" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="2" />
            <path d="M11 -5 L17 0 L11 5 Z" fill="#FFFFFF" stroke={INK} strokeWidth="1" />
          </g>
        </svg>
        <span className="pointer-events-none absolute left-2 top-1.5 rounded bg-black/45 px-1.5 text-[0.65rem] font-bold text-white">N ↑</span>
        {big && !follow && <span className="pointer-events-none absolute bottom-1.5 left-2 rounded bg-black/55 px-1.5 text-[0.65rem] font-bold text-white">{t('park.mapFree')}</span>}
      </div>
      {big && (
        <p id={hintId} className="sr-only">
          {t('park.mapHint')}
        </p>
      )}
      <div className="flex gap-1">
        <IconButton ref={collapseBtn} size="sm" label={t('park.mapCollapse')} icon={<ChevronUp className="h-4 w-4" />} onClick={() => setClosed(true)} className="bg-surface/90" />
        <IconButton ref={sizeBtn} size="sm" label={big ? t('park.mapSmall') : t('park.mapBig')} icon={big ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} onClick={toggleBig} className="bg-surface/90" />
        {big && (
          <button
            type="button"
            aria-label={t('park.mapRecenter')}
            title={t('park.mapRecenter')}
            disabled={follow}
            onClick={(e) => {
              // O botão desativa ao recentralizar: o foco do teclado passa para o mapa.
              if (document.activeElement === e.currentTarget) want.current = 'map';
              setFollow(true);
            }}
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition duration-150',
              follow ? 'cursor-not-allowed bg-surface/90 text-muted opacity-40' : 'bg-accent text-accent-fg shadow-glow ring-2 ring-white/70',
            )}
          >
            <LocateFixed className="h-4 w-4" />
          </button>
        )}
        <IconButton size="sm" label={t('park.zoomOut')} icon={<Minus className="h-4 w-4" />} disabled={zoom === 0} onClick={() => zoomBy(-1)} className="bg-surface/90" />
        <IconButton size="sm" label={t('park.zoomIn')} icon={<Plus className="h-4 w-4" />} disabled={zoom === ZOOMS.length - 1} onClick={() => zoomBy(1)} className="bg-surface/90" />
      </div>
    </div>
  );
}
