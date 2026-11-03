import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Eraser, Maximize2, Minimize2, MoveVertical, PenLine, Shapes, Trash2, Undo2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { polylinePath, recognizeShape, strokePath, strokeWidth, type Stroke } from '@/domain/notes';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';

/** Paleta do desenho: preto, branco, cinza e tons da identidade do ROUTIG. */
const COLORS = ['#000000', '#5B5F73', '#FFFFFF', '#E5484D', '#F76B15', '#F59E0B', '#16B8A6', '#30A46C', '#438BEA', '#7357F6', '#EC6695', '#8E4EC6', '#A0522D'] as const;
const SIZES = [2, 4, 8, 14] as const;
const BOARD_W = 1000;
const PEN_ONLY_KEY = 'routig.notes.penOnly';
const SHAPES_KEY = 'routig.notes.shapes';
/** Tempo parado com a caneta encostada para a forma "se endireitar". */
const HOLD_MS = 550;
const HOLD_MOVE_TOLERANCE = 6;

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* só nesta sessão */
  }
}

interface DrawingProps {
  strokes: Stroke[];
  height: number;
  onChange: (strokes: Stroke[]) => void;
  onResize: (height: number) => void;
}

/**
 * Desenho e escrita à mão (Parte 17.3). O Apple Pencil chega como
 * `pointerType === 'pen'` com pressão: o traço engrossa com a força.
 * Tem tela cheia (nada em volta para rolar) e formas automáticas: desenhe e
 * segure a caneta parada um instante para virar linha, retângulo, triângulo ou círculo.
 */
export function DrawingBlock(props: DrawingProps) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <>
      <DrawingSurface {...props} fullscreen={false} onToggleFullscreen={() => setFullscreen(true)} />
      {fullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex flex-col bg-surface p-3 safe-top safe-bottom sm:p-4" style={{ overscrollBehavior: 'none' }}>
            <DrawingSurface {...props} fullscreen onToggleFullscreen={() => setFullscreen(false)} />
          </div>,
          document.body,
        )}
    </>
  );
}

function DrawingSurface({ strokes, height, onChange, onResize, fullscreen, onToggleFullscreen }: DrawingProps & { fullscreen: boolean; onToggleFullscreen: () => void }) {
  const { t } = useSettings();
  const svg = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [size, setSize] = useState<number>(SIZES[1]);
  const [penOnly, setPenOnly] = useState(() => readFlag(PEN_ONLY_KEY, false));
  const [shapes, setShapes] = useState(() => readFlag(SHAPES_KEY, true));
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const activePointer = useRef<number | null>(null);
  const currentRef = useRef<Stroke | null>(null);
  const holdTimer = useRef<number>();
  const lastMove = useRef<[number, number]>([0, 0]);
  const penOnlyRef = useRef(penOnly);
  penOnlyRef.current = penOnly;

  const setStroke = (s: Stroke | null) => {
    currentRef.current = s;
    setCurrent(s);
  };

  // Tela cheia: trava a rolagem da página por trás.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  /*
   * No iPad, só `touch-action: none` não basta: o Safari às vezes começa a rolar a
   * página quando a caneta encosta, mexe a tela e cancela o traço. Bloqueamos o
   * toque direto no elemento (listener não passivo). Com "Só a caneta desenha",
   * o dedo continua rolando a página normalmente.
   */
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      const touches = [...e.touches, ...e.changedTouches];
      const stylus = touches.some((tt) => (tt as Touch & { touchType?: string }).touchType === 'stylus');
      if (!penOnlyRef.current || stylus) e.preventDefault();
    };
    el.addEventListener('touchstart', block, { passive: false });
    el.addEventListener('touchmove', block, { passive: false });
    return () => {
      el.removeEventListener('touchstart', block);
      el.removeEventListener('touchmove', block);
    };
  }, []);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const toBoard = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }): [number, number, number] => {
    const r = svg.current!.getBoundingClientRect();
    const scale = BOARD_W / r.width;
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    return [Math.round((e.clientX - r.left) * scale * 10) / 10, Math.round((e.clientY - r.top) * scale * 10) / 10, Math.round(pressure * 100) / 100];
  };

  const allowed = (e: { pointerType: string }) => !penOnly || e.pointerType === 'pen' || e.pointerType === 'mouse';

  const eraseAt = (x: number, y: number) => {
    const radius = 14;
    const keep = strokes.filter((s) => !s.points.some(([px, py]) => Math.hypot(px - x, py - y) < radius + s.width));
    if (keep.length !== strokes.length) onChange(keep);
  };

  /** Caneta parada por um instante: tenta endireitar a forma. */
  const armHold = () => {
    window.clearTimeout(holdTimer.current);
    if (!shapes) return;
    holdTimer.current = window.setTimeout(() => {
      const s = currentRef.current;
      if (!s || s.shape) return;
      const shape = recognizeShape(s);
      if (shape) {
        setStroke({ ...s, points: shape.points, shape: shape.kind });
        // Pequena vibração quando o aparelho permite (iPhone ignora; alguns Android vibram).
        navigator.vibrate?.(10);
      }
    }, HOLD_MS);
  };

  const commit = () => {
    window.clearTimeout(holdTimer.current);
    activePointer.current = null;
    const done = currentRef.current;
    if (done && done.points.length > 0) onChange([...strokes, done]);
    setStroke(null);
  };

  const viewH = height;
  const pathOf = (s: Stroke) => (s.shape ? polylinePath(s.points) : strokePath(s.points));

  return (
    <div className={cn('flex flex-col gap-2', fullscreen && 'h-full')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <IconButton size="sm" label={t('notes.draw.pen')} active={tool === 'pen'} icon={<PenLine className="h-4 w-4" />} onClick={() => setTool('pen')} />
        <IconButton size="sm" label={t('notes.draw.eraser')} active={tool === 'eraser'} icon={<Eraser className="h-4 w-4" />} onClick={() => setTool('eraser')} />
        <IconButton
          size="sm"
          label={t('notes.draw.shapes')}
          active={shapes}
          icon={<Shapes className="h-4 w-4" />}
          onClick={() => {
            setShapes(!shapes);
            writeFlag(SHAPES_KEY, !shapes);
          }}
        />
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('notes.draw.pen')}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={t('notes.draw.color', { color: c })}
              onClick={() => {
                setColor(c);
                setTool('pen');
              }}
              className={cn('h-7 w-7 rounded-full ring-1 ring-line ring-offset-2 ring-offset-surface transition', color === c && tool === 'pen' && 'ring-2 ring-accent')}
              style={{ background: c }}
            />
          ))}
          <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1 ring-line" title={t('notes.draw.customColor')}>
            <span className="absolute inset-0" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} aria-hidden />
            <input
              type="color"
              aria-label={t('notes.draw.customColor')}
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                setTool('pen');
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label={t('notes.draw.size')}>
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={size === s}
              aria-label={`${t('notes.draw.size')} ${s}`}
              onClick={() => setSize(s)}
              className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition', size === s ? 'bg-accent/15' : 'hover:bg-surface-2')}
            >
              <span className="rounded-full bg-fg" style={{ width: Math.min(s + 2, 14), height: Math.min(s + 2, 14) }} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <IconButton size="sm" label={t('notes.draw.undo')} icon={<Undo2 className="h-4 w-4" />} disabled={strokes.length === 0} onClick={() => onChange(strokes.slice(0, -1))} />
        <IconButton size="sm" label={t('notes.draw.clear')} icon={<Trash2 className="h-4 w-4" />} disabled={strokes.length === 0} onClick={() => setConfirmClear(true)} />
        <IconButton size="sm" label={t('notes.draw.taller')} icon={<MoveVertical className="h-4 w-4" />} disabled={height >= 3000} onClick={() => onResize(Math.min(3000, height + 400))} />
        <label className="flex items-center gap-2 text-xs text-muted" title={t('notes.draw.penOnlyHint')}>
          <input
            type="checkbox"
            checked={penOnly}
            onChange={(e) => {
              setPenOnly(e.target.checked);
              writeFlag(PEN_ONLY_KEY, e.target.checked);
            }}
            className="h-4 w-4 accent-[rgb(var(--accent))]"
          />
          {t('notes.draw.penOnly')}
        </label>
        <IconButton
          size="sm"
          className="ml-auto"
          label={fullscreen ? t('notes.draw.exitFullscreen') : t('notes.draw.fullscreen')}
          icon={fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          onClick={onToggleFullscreen}
        />
      </div>
      {shapes && <p className="text-[0.7rem] text-subtle">{t('notes.draw.shapesHint')}</p>}
      <div className={cn(fullscreen && 'flex min-h-0 flex-1 items-start justify-center overflow-hidden')}>
        <svg
          ref={svg}
          role="img"
          aria-label={t('notes.draw.area')}
          viewBox={`0 0 ${BOARD_W} ${viewH}`}
          className={cn('select-none rounded-2xl bg-white ring-1 ring-line', fullscreen ? 'h-full max-h-full w-auto max-w-full' : 'w-full', tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair')}
          style={{ touchAction: 'none', aspectRatio: `${BOARD_W} / ${viewH}`, WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as CSSProperties}
          onPointerDown={(e) => {
            if (!allowed(e) || activePointer.current !== null) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            activePointer.current = e.pointerId;
            const p = toBoard(e);
            lastMove.current = [e.clientX, e.clientY];
            if (tool === 'eraser') eraseAt(p[0], p[1]);
            else {
              setStroke({ points: [p], color, width: size });
              armHold();
            }
          }}
          onPointerMove={(e) => {
            if (e.pointerId !== activePointer.current) return;
            const native = e.nativeEvent as PointerEvent;
            // Pontos intermediários deixam o traço do Apple Pencil mais suave.
            const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native];
            const pts = events.map((ev) => toBoard(ev));
            if (tool === 'eraser') {
              pts.forEach((p) => eraseAt(p[0], p[1]));
              return;
            }
            const cur = currentRef.current;
            if (!cur || cur.shape) return; // forma já endireitada: fica parada até soltar
            setStroke({ ...cur, points: [...cur.points, ...pts] });
            // Só reinicia a contagem de "parado" quando a caneta realmente se mexe.
            if (Math.hypot(e.clientX - lastMove.current[0], e.clientY - lastMove.current[1]) > HOLD_MOVE_TOLERANCE) {
              lastMove.current = [e.clientX, e.clientY];
              armHold();
            }
          }}
          onPointerUp={(e) => {
            if (e.pointerId === activePointer.current) commit();
          }}
          // Se o navegador cancelar (ex.: tentou rolar), o traço feito até ali é guardado, não perdido.
          onPointerCancel={(e) => {
            if (e.pointerId === activePointer.current) commit();
          }}
        >
          {strokes.map((s, i) => (
            <path key={i} d={pathOf(s)} stroke={s.color} strokeWidth={strokeWidth(s)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {current && <path d={pathOf(current)} stroke={current.color} strokeWidth={strokeWidth(current)} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </div>
      <ConfirmDialog
        open={confirmClear}
        danger
        title={t('notes.draw.clearTitle')}
        body={t('notes.draw.clearBody')}
        confirmLabel={t('notes.draw.clear')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          onChange([]);
        }}
      />
    </div>
  );
}
