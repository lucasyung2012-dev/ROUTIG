import { useRef, useState } from 'react';
import { Eraser, PenLine, Trash2, Undo2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { strokePath, strokeWidth, type Stroke } from '@/domain/notes';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';

const COLORS = ['#16131F', '#7357F6', '#438BEA', '#16B8A6', '#F59E0B', '#EC6695'] as const;
const SIZES = [2, 4, 8] as const;
const BOARD_W = 1000;
const PEN_ONLY_KEY = 'routig.notes.penOnly';

function readPenOnly(): boolean {
  try {
    return localStorage.getItem(PEN_ONLY_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Desenho e escrita à mão (Parte 17.3). Usa Pointer Events: o Apple Pencil chega
 * como `pointerType === 'pen'` com pressão, então o traço engrossa com a força.
 * Com "Só a caneta desenha", toques de dedo e palma são ignorados.
 */
export function DrawingBlock({ strokes, height, onChange }: { strokes: Stroke[]; height: number; onChange: (strokes: Stroke[]) => void }) {
  const { t } = useSettings();
  const svg = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState<string>(COLORS[1]);
  const [size, setSize] = useState<number>(SIZES[1]);
  const [penOnly, setPenOnly] = useState(readPenOnly);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const activePointer = useRef<number | null>(null);

  const toBoard = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }): [number, number, number] => {
    const r = svg.current!.getBoundingClientRect();
    const scale = BOARD_W / r.width;
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    return [Math.round((e.clientX - r.left) * scale * 10) / 10, Math.round((e.clientY - r.top) * scale * 10) / 10, Math.round(pressure * 100) / 100];
  };

  // O traço em andamento também fica numa ref: o "soltar" lê o valor mais novo, sem esperar a tela.
  const currentRef = useRef<Stroke | null>(null);
  const setStroke = (s: Stroke | null) => {
    currentRef.current = s;
    setCurrent(s);
  };

  const allowed = (e: { pointerType: string }) => !penOnly || e.pointerType === 'pen' || e.pointerType === 'mouse';

  const eraseAt = (x: number, y: number) => {
    const radius = 14;
    const keep = strokes.filter((s) => !s.points.some(([px, py]) => Math.hypot(px - x, py - y) < radius + s.width));
    if (keep.length !== strokes.length) onChange(keep);
  };

  const viewH = height;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <IconButton size="sm" label={t('notes.draw.pen')} active={tool === 'pen'} icon={<PenLine className="h-4 w-4" />} onClick={() => setTool('pen')} />
        <IconButton size="sm" label={t('notes.draw.eraser')} active={tool === 'eraser'} icon={<Eraser className="h-4 w-4" />} onClick={() => setTool('eraser')} />
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <div className="flex gap-1" role="radiogroup" aria-label={t('notes.draw.pen')}>
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
              className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition', color === c && tool === 'pen' && 'ring-2 ring-accent')}
              style={{ background: c }}
            />
          ))}
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
              <span className="rounded-full bg-fg" style={{ width: s + 2, height: s + 2 }} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <IconButton size="sm" label={t('notes.draw.undo')} icon={<Undo2 className="h-4 w-4" />} disabled={strokes.length === 0} onClick={() => onChange(strokes.slice(0, -1))} />
        <IconButton size="sm" label={t('notes.draw.clear')} icon={<Trash2 className="h-4 w-4" />} disabled={strokes.length === 0} onClick={() => setConfirmClear(true)} />
        <label className="ml-auto flex items-center gap-2 text-xs text-muted" title={t('notes.draw.penOnlyHint')}>
          <input
            type="checkbox"
            checked={penOnly}
            onChange={(e) => {
              setPenOnly(e.target.checked);
              try {
                localStorage.setItem(PEN_ONLY_KEY, e.target.checked ? '1' : '0');
              } catch {
                /* só nesta sessão */
              }
            }}
            className="h-4 w-4 accent-[rgb(var(--accent))]"
          />
          {t('notes.draw.penOnly')}
        </label>
      </div>
      <svg
        ref={svg}
        role="img"
        aria-label={t('notes.draw.area')}
        viewBox={`0 0 ${BOARD_W} ${viewH}`}
        className={cn('w-full rounded-2xl bg-white ring-1 ring-line', tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair')}
        // touch-action none: o dedo/caneta desenha em vez de rolar a página.
        style={{ touchAction: 'none', aspectRatio: `${BOARD_W} / ${viewH}` }}
        onPointerDown={(e) => {
          if (!allowed(e) || activePointer.current !== null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          activePointer.current = e.pointerId;
          const p = toBoard(e);
          if (tool === 'eraser') eraseAt(p[0], p[1]);
          else setStroke({ points: [p], color, width: size });
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== activePointer.current) return;
          const native = e.nativeEvent as PointerEvent;
          // Pontos intermediários deixam o traço do Apple Pencil mais suave.
          const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native];
          const pts = events.map((ev) => toBoard(ev));
          if (tool === 'eraser') pts.forEach((p) => eraseAt(p[0], p[1]));
          else if (currentRef.current) setStroke({ ...currentRef.current, points: [...currentRef.current.points, ...pts] });
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== activePointer.current) return;
          activePointer.current = null;
          const done = currentRef.current;
          if (done && done.points.length > 0) onChange([...strokes, done]);
          setStroke(null);
        }}
        onPointerCancel={() => {
          activePointer.current = null;
          setStroke(null);
        }}
      >
        {strokes.map((s, i) => (
          <path key={i} d={strokePath(s.points)} stroke={s.color} strokeWidth={strokeWidth(s)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {current && <path d={strokePath(current.points)} stroke={current.color} strokeWidth={strokeWidth(current)} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
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
