import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Building2, ChevronDown, LayoutGrid, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { cn } from '@/ui/cn';

/** Posição e tamanho do botão da Central (frações da tela, para servir em pé e deitado). */
export interface FabPlace {
  x: number;
  y: number;
  size: number;
}
export const DEFAULT_FAB: FabPlace = { x: 0.03, y: 0.5, size: 52 };
export const FAB_MIN = 40;
export const FAB_MAX = 64;

/**
 * Botão flutuante da Central de Módulos: toque abre; arrastar muda o lugar (fica onde a pessoa soltar).
 */
export function FloatingCenterButton({ place, onMove, onOpen, label, hidden }: { place: FabPlace; onMove: (p: FabPlace) => void; onOpen: () => void; label: string; hidden?: boolean }) {
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const s = Math.min(FAB_MAX, Math.max(FAB_MIN, place.size));
  const clampPos = (cx: number, cy: number) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: Math.min(w - s - 8, Math.max(8, cx)), y: Math.min(h - s - 8, Math.max(64, cy)) };
  };
  const pos = live ?? clampPos(place.x * window.innerWidth, place.y * window.innerHeight - s / 2);
  const down = (e: RPointerEvent<HTMLButtonElement>) => {
    drag.current = { id: e.pointerId, x: e.clientX - pos.x, y: e.clientY - pos.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = clampPos(e.clientX - d.x, e.clientY - d.y);
    if (!d.moved && Math.hypot(p.x - pos.x, p.y - pos.y) < 6) return;
    d.moved = true;
    setLive(p);
  };
  const up = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved && live) {
      onMove({ ...place, x: live.x / window.innerWidth, y: (live.y + s / 2) / window.innerHeight });
      setLive(null);
    } else onOpen();
  };
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => ((drag.current = null), setLive(null))}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className={cn('absolute z-10 flex items-center justify-center rounded-2xl bg-brand text-white shadow-glow ring-2 ring-white/30', hidden && 'max-sm:hidden')}
      style={{ left: pos.x, top: pos.y, width: s, height: s, touchAction: 'none' }}
    >
      <LayoutGrid style={{ width: s * 0.45, height: s * 0.45 }} aria-hidden />
    </button>
  );
}

export interface PlaceFloor {
  name: string;
  rooms: Array<{ id: string; label: string; active: boolean; onPick: () => void }>;
  onGo: () => void;
  current: boolean;
}

/**
 * Andares e salas do prédio num botão só (ocupa pouco no iPhone e no iPad): abre uma lista
 * com cada andar e suas salas; tocar numa sala leva até ela e abre o painel.
 */
export function PlacesMenu({ title, floors }: { title: string; floors: PlaceFloor[] }) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const cur = floors.find((f) => f.current);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-10 max-w-[60vw] items-center gap-2 rounded-xl bg-surface/90 px-3 text-sm font-medium text-fg shadow-soft">
        <Building2 className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span className="truncate">{cur ? `${cur.name}` : title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label={t('park.places')} className="absolute left-0 top-12 z-30 flex max-h-[60vh] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl bg-surface shadow-lift ring-1 ring-line">
          <div className="flex items-center justify-between border-b border-line/70 px-3 py-2">
            <span className="text-sm font-semibold text-fg">{title}</span>
            <button type="button" aria-label={t('common.close')} onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-2" style={{ touchAction: 'pan-y' }}>
            {floors.map((f, i) => (
              <section key={i} className="mb-2">
                <button
                  type="button"
                  onClick={() => {
                    f.onGo();
                    setOpen(false);
                  }}
                  className={cn('flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-semibold uppercase tracking-wide', f.current ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2')}
                >
                  {f.name}
                </button>
                <ul className="mt-1 grid grid-cols-1 gap-0.5">
                  {f.rooms.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          r.onPick();
                          setOpen(false);
                        }}
                        className={cn('flex min-h-9 w-full items-center rounded-lg px-3 text-left text-sm', r.active ? 'bg-accent/15 font-semibold text-fg' : 'text-fg hover:bg-surface-2')}
                      >
                        {r.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
