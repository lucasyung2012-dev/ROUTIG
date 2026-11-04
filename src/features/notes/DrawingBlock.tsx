import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Circle,
  Download,
  Eraser,
  Hand,
  Highlighter,
  ImageOff,
  ImagePlus,
  Lasso,
  Maximize2,
  Minimize2,
  Minus,
  MoveUpRight,
  MoveVertical,
  PenLine,
  Redo2,
  Shapes,
  Square,
  Trash2,
  Undo2,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { storeNoteFile } from '@/data/notesRepo';
import {
  DRAWING_BACKGROUNDS,
  dragShapePoints,
  moveStrokes,
  polylinePath,
  recognizeShape,
  strokePath,
  strokesBounds,
  strokesInLasso,
  strokeWidth,
  type DragShape,
  type DrawingBackground,
  type Stroke,
} from '@/domain/notes';
import { useObjectUrl } from '@/features/files/useObjectUrl';
import { saveFile } from '@/features/files/saveFile';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { IconButton } from '@/ui/IconButton';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

/** Paleta do desenho: preto, branco, cinza e tons da identidade do ROUTIG. */
const COLORS = ['#000000', '#5B5F73', '#FFFFFF', '#E5484D', '#F76B15', '#F59E0B', '#16B8A6', '#30A46C', '#438BEA', '#7357F6', '#EC6695', '#8E4EC6', '#A0522D'] as const;
/** Cores clássicas de marca-texto. */
const HIGHLIGHT_COLORS = ['#FFE14D', '#7CF29A', '#7FD6FF', '#FF9BD2', '#FFB86B', '#C7A6FF'] as const;
const SIZES = [2, 4, 8, 14] as const;
const HIGHLIGHT_SIZES = [12, 20, 32] as const;
const BOARD_W = 1000;
const GRID = 40;
const ZOOMS = [1, 1.5, 2, 3, 4] as const;
const PEN_ONLY_KEY = 'routig.notes.penOnly';
const SHAPES_KEY = 'routig.notes.shapes';
/** Tempo parado com a caneta encostada para a forma "se endireitar". */
const HOLD_MS = 550;
const HOLD_MOVE_TOLERANCE = 6;
const HISTORY_LIMIT = 100;

type Tool = 'pen' | 'highlighter' | 'shape' | 'lasso' | 'hand' | 'eraser';
type Pt = [number, number];

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

export interface DrawingPatch {
  strokes?: Stroke[];
  height?: number;
  background?: DrawingBackground;
  imageFileId?: string | null;
}

interface DrawingProps {
  strokes: Stroke[];
  height: number;
  background: DrawingBackground;
  imageFileId: string | null;
  onPatch: (patch: DrawingPatch) => void;
}

/**
 * Desenho e escrita à mão (Parte 17.3). O Apple Pencil chega como
 * `pointerType === 'pen'` com pressão: o traço engrossa com a força.
 * Ferramentas: caneta, marca-texto, formas, laço (selecionar e mover), mão
 * (mover a folha com zoom) e borracha; fundo pautado, quadriculado ou pontilhado;
 * imagem de fundo; desfazer e refazer; salvar como imagem; tela cheia.
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

function DrawingSurface({ strokes, height, background, imageFileId, onPatch, fullscreen, onToggleFullscreen }: DrawingProps & { fullscreen: boolean; onToggleFullscreen: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const uid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageUrl = useObjectUrl(imageFileId);

  const [tool, setTool] = useState<Tool>('pen');
  const [shapeKind, setShapeKind] = useState<DragShape>('line');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [hlColor, setHlColor] = useState<string>(HIGHLIGHT_COLORS[0]);
  const [size, setSize] = useState<number>(SIZES[1]);
  const [hlSize, setHlSize] = useState<number>(HIGHLIGHT_SIZES[1]);
  const [penOnly, setPenOnly] = useState(() => readFlag(PEN_ONLY_KEY, false));
  const [autoShapes, setAutoShapes] = useState(() => readFlag(SHAPES_KEY, true));
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [lasso, setLasso] = useState<Pt[] | null>(null);
  const [selection, setSelection] = useState<number[]>([]);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<Pt>([0, 0]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [past, setPast] = useState<Stroke[][]>([]);
  const [future, setFuture] = useState<Stroke[][]>([]);

  const activePointer = useRef<number | null>(null);
  const currentRef = useRef<Stroke | null>(null);
  const holdTimer = useRef<number>();
  const lastMove = useRef<Pt>([0, 0]);
  const gesture = useRef<{ kind: 'draw' | 'shape' | 'lasso' | 'move' | 'pan' | 'erase'; start: Pt; base: Stroke[]; client: Pt; pan: Pt } | null>(null);
  const latest = useRef(strokes);
  latest.current = strokes;
  const penOnlyRef = useRef(penOnly);
  penOnlyRef.current = penOnly;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const viewW = BOARD_W / zoom;
  const viewH = height / zoom;
  const clampPan = ([x, y]: Pt, z = zoom): Pt => [Math.max(0, Math.min(BOARD_W - BOARD_W / z, x)), Math.max(0, Math.min(height - height / z, y))];

  const setStroke = (s: Stroke | null) => {
    currentRef.current = s;
    setCurrent(s);
  };

  /** Muda os traços guardando o estado anterior para desfazer. */
  const commitChange = (next: Stroke[], before: Stroke[] = latest.current) => {
    if (next === before) return;
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), before]);
    setFuture([]);
    latest.current = next;
    onPatch({ strokes: next });
  };
  /** Mudança durante um gesto (apagar, mover): a entrada no histórico é feita no fim. */
  const liveChange = (next: Stroke[]) => {
    latest.current = next;
    onPatch({ strokes: next });
  };

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture((f) => [latest.current, ...f]);
    setSelection([]);
    liveChange(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast((p) => [...p, latest.current]);
    setSelection([]);
    liveChange(next);
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
   * o dedo continua rolando a página, a não ser com zoom (aí o dedo move a folha).
   */
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      const touches = [...e.touches, ...e.changedTouches];
      const stylus = touches.some((tt) => (tt as Touch & { touchType?: string }).touchType === 'stylus');
      if (!penOnlyRef.current || stylus || zoomRef.current > 1) e.preventDefault();
    };
    el.addEventListener('touchstart', block, { passive: false });
    el.addEventListener('touchmove', block, { passive: false });
    return () => {
      el.removeEventListener('touchstart', block);
      el.removeEventListener('touchmove', block);
    };
  }, []);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  // Trocar de ferramenta desfaz a seleção do laço.
  useEffect(() => {
    if (tool !== 'lasso') setSelection([]);
  }, [tool]);

  // Tela cheia no iPad em pé: a folha cresce para ocupar a altura da tela (no máximo 3000).
  useEffect(() => {
    if (!fullscreen || !svg.current) return;
    const box = svg.current.getBoundingClientRect();
    if (box.width === 0) return;
    const fits = Math.round((box.height / box.width) * BOARD_W);
    if (fits > height + 20) onPatch({ height: Math.min(3000, fits) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  /**
   * Posição da caneta na folha. Usa a matriz real do SVG (getScreenCTM): funciona
   * com zoom, com a folha movida e quando fica centralizada na tela cheia.
   */
  const toBoard = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }): [number, number, number] => {
    const el = svg.current!;
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    const m = el.getScreenCTM();
    let x: number;
    let y: number;
    if (m) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      x = p.x;
      y = p.y;
    } else {
      const r = el.getBoundingClientRect();
      x = pan[0] + ((e.clientX - r.left) * viewW) / r.width;
      y = pan[1] + ((e.clientY - r.top) * viewW) / r.width;
    }
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100) / 100];
  };

  /** Com "Só a caneta", o dedo não risca; com zoom, o dedo move a folha. */
  const fingerPans = (e: { pointerType: string }) => penOnly && e.pointerType === 'touch' && zoom > 1;
  const allowed = (e: { pointerType: string }) => !penOnly || e.pointerType === 'pen' || e.pointerType === 'mouse' || fingerPans(e);

  const eraseAt = (x: number, y: number) => {
    const radius = 14;
    const cur = latest.current;
    const keep = cur.filter((s) => !s.points.some(([px, py]) => Math.hypot(px - x, py - y) < radius + s.width));
    if (keep.length !== cur.length) liveChange(keep);
  };

  /** Caneta parada por um instante: tenta endireitar a forma. */
  const armHold = () => {
    window.clearTimeout(holdTimer.current);
    if (!autoShapes) return;
    holdTimer.current = window.setTimeout(() => {
      const s = currentRef.current;
      if (!s || s.shape || s.highlight) return;
      const shape = recognizeShape(s);
      if (shape) {
        setStroke({ ...s, points: shape.points, shape: shape.kind });
        navigator.vibrate?.(10);
      }
    }, HOLD_MS);
  };

  const selected = selection.map((i) => latest.current[i]).filter((s): s is Stroke => !!s);
  const selBox = strokesBounds(selected);
  const inSelection = (x: number, y: number) => !!selBox && x >= selBox.x - 12 && x <= selBox.x + selBox.w + 12 && y >= selBox.y - 12 && y <= selBox.y + selBox.h + 12;

  const finishGesture = () => {
    window.clearTimeout(holdTimer.current);
    activePointer.current = null;
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'draw' || g.kind === 'shape') {
      const done = currentRef.current;
      setStroke(null);
      if (done && done.points.length > 0 && !(g.kind === 'shape' && done.points.length < 2)) commitChange([...latest.current, done]);
    } else if (g.kind === 'erase' || g.kind === 'move') {
      if (latest.current !== g.base) commitChange(latest.current, g.base);
    } else if (g.kind === 'lasso') {
      setSelection(lasso ? strokesInLasso(latest.current, lasso) : []);
      setLasso(null);
    }
  };

  /* ---------- Salvar como imagem ---------- */

  const saveImage = async () => {
    const el = svg.current;
    if (!el) return;
    try {
      const clone = el.cloneNode(true) as SVGSVGElement;
      clone.querySelectorAll('[data-ui]').forEach((n) => n.remove());
      clone.setAttribute('viewBox', `0 0 ${BOARD_W} ${height}`);
      const scale = 2;
      clone.setAttribute('width', String(BOARD_W * scale));
      clone.setAttribute('height', String(height * scale));
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      // A imagem de fundo precisa ir embutida: um SVG desenhado como imagem não carrega links.
      const img = clone.querySelector('image');
      if (img && imageUrl) {
        const blob = await fetch(imageUrl).then((r) => r.blob());
        const dataUrl = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(fr.error);
          fr.readAsDataURL(blob);
        });
        img.setAttribute('href', dataUrl);
      }
      const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      const pic = new Image();
      await new Promise<void>((res, rej) => {
        pic.onload = () => res();
        pic.onerror = () => rej(new Error('svg'));
        pic.src = svgUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = BOARD_W * scale;
      canvas.height = height * scale;
      canvas.getContext('2d')!.drawImage(pic, 0, 0);
      URL.revokeObjectURL(svgUrl);
      const png = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
      const d = new Date();
      const p2 = (n: number) => String(n).padStart(2, '0');
      const name = `routig-desenho-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`;
      if ((await saveFile(new File([png], name, { type: 'image/png' }))) === 'saved') toast.show(t('notes.draw.imageSaved'));
    } catch {
      toast.show(t('notes.draw.imageFailed'), 'error');
    }
  };

  const chooseImage = (f: File) =>
    void storeNoteFile(f, f.name).then(
      (s) => {
        // A folha cresce para a imagem caber inteira na largura.
        const probe = new Image();
        const url = URL.createObjectURL(f);
        probe.onload = () => {
          const fit = Math.round((probe.naturalHeight / Math.max(1, probe.naturalWidth)) * BOARD_W);
          URL.revokeObjectURL(url);
          onPatch({ imageFileId: s.id, height: Math.min(3000, Math.max(height, fit)) });
        };
        probe.onerror = () => {
          URL.revokeObjectURL(url);
          onPatch({ imageFileId: s.id });
        };
        probe.src = url;
      },
      () => toast.show(t('errors.saveFailed'), 'error'),
    );

  const setZoomKeepingCenter = (z: number) => {
    const cx = pan[0] + viewW / 2;
    const cy = pan[1] + viewH / 2;
    setZoom(z);
    setPan(clampPan([cx - BOARD_W / z / 2, cy - height / z / 2], z));
  };
  const zoomIndex = ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]);

  const pathOf = (s: Stroke) => (s.shape ? polylinePath(s.points) : strokePath(s.points));
  const renderStroke = (s: Stroke, key: string | number, dim = false) => (
    <path
      key={key}
      d={pathOf(s)}
      stroke={s.color}
      strokeWidth={strokeWidth(s)}
      strokeOpacity={s.highlight ? 0.4 : dim ? 0.6 : 1}
      style={s.highlight ? { mixBlendMode: 'multiply' } : undefined}
      fill="none"
      strokeLinecap={s.highlight ? 'square' : 'round'}
      strokeLinejoin="round"
    />
  );

  const highlighting = tool === 'highlighter';
  const palette = highlighting ? HIGHLIGHT_COLORS : COLORS;
  const activeColor = highlighting ? hlColor : color;
  const sizes = highlighting ? HIGHLIGHT_SIZES : SIZES;
  const activeSize = highlighting ? hlSize : size;

  const toolButton = (id: Tool, label: string, icon: ReactNode) => <IconButton size="sm" label={label} active={tool === id} icon={icon} onClick={() => setTool(id)} />;

  return (
    <div className={cn('flex flex-col gap-2', fullscreen && 'h-full')}>
      <div className="flex flex-wrap items-center gap-1.5">
        {toolButton('pen', t('notes.draw.pen'), <PenLine className="h-4 w-4" />)}
        {toolButton('highlighter', t('notes.draw.highlighter'), <Highlighter className="h-4 w-4" />)}
        {toolButton('shape', t('notes.draw.shapeTool'), <Shapes className="h-4 w-4" />)}
        {toolButton('lasso', t('notes.draw.lasso'), <Lasso className="h-4 w-4" />)}
        {toolButton('hand', t('notes.draw.hand'), <Hand className="h-4 w-4" />)}
        {toolButton('eraser', t('notes.draw.eraser'), <Eraser className="h-4 w-4" />)}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <IconButton size="sm" label={t('notes.draw.undo')} icon={<Undo2 className="h-4 w-4" />} disabled={past.length === 0} onClick={undo} />
        <IconButton size="sm" label={t('notes.draw.redo')} icon={<Redo2 className="h-4 w-4" />} disabled={future.length === 0} onClick={redo} />
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <IconButton size="sm" label={t('notes.draw.zoomOut')} icon={<ZoomOut className="h-4 w-4" />} disabled={zoomIndex <= 0} onClick={() => setZoomKeepingCenter(ZOOMS[Math.max(0, zoomIndex - 1)]!)} />
        <button type="button" className="h-8 min-w-[3rem] rounded-lg px-1 text-xs font-medium tabular text-muted hover:bg-surface-2" aria-label={t('notes.draw.zoomReset')} onClick={() => (setZoom(1), setPan([0, 0]))}>
          {Math.round(zoom * 100)}%
        </button>
        <IconButton size="sm" label={t('notes.draw.zoomIn')} icon={<ZoomIn className="h-4 w-4" />} disabled={zoomIndex >= ZOOMS.length - 1} onClick={() => setZoomKeepingCenter(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)]!)} />
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <select
          aria-label={t('notes.draw.background')}
          value={background}
          onChange={(e) => onPatch({ background: e.target.value as DrawingBackground })}
          className="h-8 rounded-lg bg-surface-2 px-2 text-xs font-medium text-fg ring-1 ring-inset ring-line"
        >
          {DRAWING_BACKGROUNDS.map((b) => (
            <option key={b} value={b}>
              {t(`notes.draw.backgrounds.${b}`)}
            </option>
          ))}
        </select>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) chooseImage(f);
          }}
        />
        <IconButton size="sm" label={imageFileId ? t('notes.draw.replaceImage') : t('notes.draw.addImage')} icon={<ImagePlus className="h-4 w-4" />} onClick={() => imageInput.current?.click()} />
        {imageFileId && <IconButton size="sm" label={t('notes.draw.removeImage')} icon={<ImageOff className="h-4 w-4" />} onClick={() => onPatch({ imageFileId: null })} />}
        <IconButton size="sm" label={t('notes.draw.saveImage')} icon={<Download className="h-4 w-4" />} onClick={() => void saveImage()} />
        <IconButton size="sm" label={t('notes.draw.clear')} icon={<Trash2 className="h-4 w-4" />} disabled={strokes.length === 0} onClick={() => setConfirmClear(true)} />
        <IconButton size="sm" label={t('notes.draw.taller')} icon={<MoveVertical className="h-4 w-4" />} disabled={height >= 3000} onClick={() => onPatch({ height: Math.min(3000, height + 400) })} />
        <IconButton
          size="sm"
          className="ml-auto"
          label={fullscreen ? t('notes.draw.exitFullscreen') : t('notes.draw.fullscreen')}
          icon={fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          onClick={onToggleFullscreen}
        />
      </div>

      {/* Segunda linha: opções da ferramenta escolhida. */}
      <div className="flex min-h-8 flex-wrap items-center gap-1.5">
        {(tool === 'pen' || tool === 'highlighter' || tool === 'shape') && (
          <>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('notes.draw.colors')}>
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={activeColor === c}
                  aria-label={t('notes.draw.color', { color: c })}
                  onClick={() => (highlighting ? setHlColor(c) : setColor(c))}
                  className={cn('h-7 w-7 rounded-full ring-1 ring-line ring-offset-2 ring-offset-surface transition', activeColor === c && 'ring-2 ring-accent')}
                  style={{ background: c }}
                />
              ))}
              <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1 ring-line" title={t('notes.draw.customColor')}>
                <span className="absolute inset-0" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} aria-hidden />
                <input
                  type="color"
                  aria-label={t('notes.draw.customColor')}
                  value={activeColor}
                  onChange={(e) => (highlighting ? setHlColor(e.target.value) : setColor(e.target.value))}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label={t('notes.draw.size')}>
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={activeSize === s}
                  aria-label={`${t('notes.draw.size')} ${s}`}
                  onClick={() => (highlighting ? setHlSize(s) : setSize(s))}
                  className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition', activeSize === s ? 'bg-accent/15' : 'hover:bg-surface-2')}
                >
                  <span className={cn(highlighting ? 'rounded-sm' : 'rounded-full', 'bg-fg')} style={{ width: Math.min(s / (highlighting ? 2 : 1) + 2, 16), height: Math.min(s / (highlighting ? 2 : 1) + 2, 16) }} />
                </button>
              ))}
            </div>
          </>
        )}
        {tool === 'shape' && (
          <div className="flex gap-1" role="radiogroup" aria-label={t('notes.draw.shapeTool')}>
            {(
              [
                ['line', <Minus key="l" className="h-4 w-4" />],
                ['arrow', <MoveUpRight key="a" className="h-4 w-4" />],
                ['rectangle', <Square key="r" className="h-4 w-4" />],
                ['ellipse', <Circle key="c" className="h-4 w-4" />],
              ] as const
            ).map(([k, icon]) => (
              <IconButton key={k} size="sm" label={t(`notes.draw.shapeKinds.${k}`)} active={shapeKind === k} icon={icon} onClick={() => setShapeKind(k)} />
            ))}
          </div>
        )}
        {tool === 'pen' && (
          <IconButton
            size="sm"
            label={t('notes.draw.shapes')}
            active={autoShapes}
            icon={<Wand2 className="h-4 w-4" />}
            onClick={() => {
              setAutoShapes(!autoShapes);
              writeFlag(SHAPES_KEY, !autoShapes);
            }}
          />
        )}
        {tool === 'lasso' && (
          <>
            <span className="text-xs text-muted">{selection.length ? t('notes.draw.selected', { count: selection.length }) : t('notes.draw.lassoHint')}</span>
            {selection.length > 0 && (
              <>
                <IconButton
                  size="sm"
                  label={t('notes.draw.deleteSelection')}
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => {
                    const set = new Set(selection);
                    commitChange(latest.current.filter((_, i) => !set.has(i)));
                    setSelection([]);
                  }}
                />
                <IconButton size="sm" label={t('notes.draw.clearSelection')} icon={<X className="h-4 w-4" />} onClick={() => setSelection([])} />
              </>
            )}
          </>
        )}
        {tool === 'hand' && <span className="text-xs text-muted">{zoom > 1 ? t('notes.draw.handHint') : t('notes.draw.handNeedsZoom')}</span>}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted" title={t('notes.draw.penOnlyHint')}>
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
      </div>
      {tool === 'pen' && autoShapes && <p className="text-[0.7rem] text-subtle">{t('notes.draw.shapesHint')}</p>}

      <div className={cn(fullscreen && 'flex min-h-0 flex-1 items-start justify-center overflow-hidden')}>
        <svg
          ref={svg}
          role="img"
          aria-label={t('notes.draw.area')}
          viewBox={`${pan[0]} ${pan[1]} ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMin meet"
          className={cn(
            'select-none',
            fullscreen ? 'h-full w-full' : 'w-full overflow-hidden rounded-2xl ring-1 ring-line',
            tool === 'eraser' ? 'cursor-cell' : tool === 'hand' ? 'cursor-grab' : tool === 'lasso' ? 'cursor-default' : 'cursor-crosshair',
          )}
          style={{ touchAction: 'none', aspectRatio: fullscreen ? undefined : `${BOARD_W} / ${height}`, WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as CSSProperties}
          onPointerDown={(e) => {
            if (!allowed(e) || activePointer.current !== null) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            activePointer.current = e.pointerId;
            const p = toBoard(e);
            const pt: Pt = [p[0], p[1]];
            const base = latest.current;
            const client: Pt = [e.clientX, e.clientY];
            lastMove.current = client;
            const effective: Tool = fingerPans(e) ? 'hand' : tool;
            if (effective === 'hand') gesture.current = { kind: 'pan', start: pt, base, client, pan };
            else if (effective === 'eraser') {
              gesture.current = { kind: 'erase', start: pt, base, client, pan };
              eraseAt(p[0], p[1]);
            } else if (effective === 'lasso') {
              if (selection.length && inSelection(p[0], p[1])) gesture.current = { kind: 'move', start: pt, base, client, pan };
              else {
                setSelection([]);
                setLasso([pt]);
                gesture.current = { kind: 'lasso', start: pt, base, client, pan };
              }
            } else if (effective === 'shape') {
              gesture.current = { kind: 'shape', start: pt, base, client, pan };
              setStroke({ points: [p], color, width: size, shape: shapeKind });
            } else {
              gesture.current = { kind: 'draw', start: pt, base, client, pan };
              setStroke(effective === 'highlighter' ? { points: [p], color: hlColor, width: hlSize, highlight: true } : { points: [p], color, width: size });
              if (effective === 'pen') armHold();
            }
          }}
          onPointerMove={(e) => {
            if (e.pointerId !== activePointer.current) return;
            const g = gesture.current;
            if (!g) return;
            if (g.kind === 'pan') {
              // Arrastar para a direita mostra o que está à esquerda.
              const r = e.currentTarget.getBoundingClientRect();
              const k = viewW / Math.max(1, Math.min(r.width, (r.height * BOARD_W) / height));
              setPan(clampPan([g.pan[0] - (e.clientX - g.client[0]) * k, g.pan[1] - (e.clientY - g.client[1]) * k]));
              return;
            }
            const native = e.nativeEvent as PointerEvent;
            // Pontos intermediários deixam o traço do Apple Pencil mais suave.
            const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native];
            const pts = events.map((ev) => toBoard(ev));
            const last = pts[pts.length - 1]!;
            if (g.kind === 'erase') {
              pts.forEach((p) => eraseAt(p[0], p[1]));
              return;
            }
            if (g.kind === 'lasso') {
              setLasso((l) => [...(l ?? []), ...pts.map((p) => [p[0], p[1]] as Pt)]);
              return;
            }
            if (g.kind === 'move') {
              liveChange(moveStrokes(g.base, selection, last[0] - g.start[0], last[1] - g.start[1]));
              return;
            }
            const cur = currentRef.current;
            if (!cur) return;
            if (g.kind === 'shape') {
              setStroke({ ...cur, points: dragShapePoints(shapeKind, g.start, [last[0], last[1]], cur.points[0]![2]) });
              return;
            }
            if (cur.shape) return; // forma já endireitada: fica parada até soltar
            setStroke({ ...cur, points: [...cur.points, ...pts] });
            // Só reinicia a contagem de "parado" quando a caneta realmente se mexe.
            if (!cur.highlight && Math.hypot(e.clientX - lastMove.current[0], e.clientY - lastMove.current[1]) > HOLD_MOVE_TOLERANCE) {
              lastMove.current = [e.clientX, e.clientY];
              armHold();
            }
          }}
          onPointerUp={(e) => {
            if (e.pointerId === activePointer.current) finishGesture();
          }}
          // Se o navegador cancelar (ex.: tentou rolar), o que foi feito até ali é guardado, não perdido.
          onPointerCancel={(e) => {
            if (e.pointerId === activePointer.current) finishGesture();
          }}
        >
          <defs>
            <pattern id={`lined-${uid}`} width={BOARD_W} height={GRID} patternUnits="userSpaceOnUse">
              <line x1={0} y1={GRID - 0.5} x2={BOARD_W} y2={GRID - 0.5} stroke="#C9D3E6" strokeWidth={1.2} />
            </pattern>
            <pattern id={`grid-${uid}`} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <path d={`M${GRID} 0 L0 0 L0 ${GRID}`} fill="none" stroke="#D5DCEB" strokeWidth={1.2} />
            </pattern>
            <pattern id={`dots-${uid}`} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <circle cx={GRID / 2} cy={GRID / 2} r={2} fill="#B4BED3" />
            </pattern>
          </defs>
          {/* A folha: só esta área recebe traços; na tela cheia, o resto fica com a cor do app. */}
          <rect x={0} y={0} width={BOARD_W} height={height} rx={fullscreen ? 12 : 0} fill="#FFFFFF" />
          {background !== 'blank' && <rect x={0} y={0} width={BOARD_W} height={height} fill={`url(#${background}-${uid})`} />}
          {imageUrl && <image href={imageUrl} x={0} y={0} width={BOARD_W} height={height} preserveAspectRatio="xMidYMin meet" />}
          {strokes.map((s, i) => renderStroke(s, i, selection.includes(i)))}
          {current && renderStroke(current, 'current')}
          {lasso && lasso.length > 1 && <path data-ui d={polylinePath(lasso.map(([x, y]) => [x, y, 0.5]))} fill="rgba(115,87,246,0.08)" stroke="#7357F6" strokeWidth={2 / zoom} strokeDasharray={`${8 / zoom} ${6 / zoom}`} />}
          {selBox && (
            <rect data-ui x={selBox.x - 10} y={selBox.y - 10} width={selBox.w + 20} height={selBox.h + 20} rx={8} fill="rgba(115,87,246,0.06)" stroke="#7357F6" strokeWidth={2 / zoom} strokeDasharray={`${8 / zoom} ${6 / zoom}`} />
          )}
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
          setSelection([]);
          commitChange([]);
        }}
      />
    </div>
  );
}
