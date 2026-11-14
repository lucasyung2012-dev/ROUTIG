import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Arrastar e soltar com Pointer Events: funciona com mouse, toque (iPhone/iPad)
 * e Apple Pencil, onde o drag-and-drop do HTML5 não funciona.
 *
 * - Mouse e caneta: o arrasto começa depois de mover alguns pixels (um clique
 *   normal continua sendo clique).
 * - Toque: segurar o item por `longPressMs` sem mexer o dedo; se o dedo se
 *   mover antes, é rolagem e o arrasto é abandonado.
 * - O alvo é achado com `elementsFromPoint` pelos atributos de `targetProps`.
 * - Rolagem automática perto das bordas do contêiner rolável e da tela.
 * - Esc cancela.
 */

const MOUSE_THRESHOLD = 4;
const TOUCH_SLOP = 8;
const EDGE = 56;
const MAX_SPEED = 16;
// Sem menu/seleção de texto no toque longo do iOS.
const ITEM_STYLE: CSSProperties = { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' };
const NO_DRAG ='select, input, textarea, option, [contenteditable="true"], [data-no-drag]';

interface Gesture {
  id: string;
  pointerId: number;
  type: string;
  el: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  tx: number;
  ty: number;
  active: boolean;
  timer: number | undefined;
  raf: number | undefined;
  scrollX: HTMLElement | null;
  scrollY: HTMLElement | null;
  cleanup: () => void;
}

export interface PointerDragOptions {
  /** Chamado ao soltar sobre um alvo (inclusive o de origem: ignore se nada mudou). */
  onDrop: (itemId: string, targetId: string) => void;
  /** Tempo de toque parado para começar o arrasto no touch. */
  longPressMs?: number;
}

function scrollParent(el: HTMLElement, axis: 'x' | 'y'): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    const ov = axis === 'x' ? s.overflowX : s.overflowY;
    if ((ov === 'auto' || ov === 'scroll') && (axis === 'x' ? n.scrollWidth > n.clientWidth : n.scrollHeight > n.clientHeight)) return n;
  }
  return null;
}

function edgeSpeed(pos: number, min: number, max: number): number {
  if (pos < min + EDGE) return -Math.ceil(MAX_SPEED * Math.min(1, (min + EDGE - pos) / EDGE));
  if (pos > max - EDGE) return Math.ceil(MAX_SPEED * Math.min(1, (pos - (max - EDGE)) / EDGE));
  return 0;
}

export function usePointerDrag({ onDrop, longPressMs = 350 }: PointerDragOptions) {
  const scope = useId();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const overRef = useRef<string | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  // Bloqueia a rolagem nativa durante o arrasto (precisa ser não-passivo) e o
  // menu de contexto do toque longo.
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (g && (g.active || g.type === 'pen') && e.cancelable) e.preventDefault();
    };
    const onContextMenu = (e: Event) => {
      const g = gesture.current;
      if (g && g.type !== 'mouse') e.preventDefault();
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('contextmenu', onContextMenu);
      gesture.current?.cleanup();
    };
  }, []);

  const setOver = useCallback((id: string | null) => {
    if (overRef.current === id) return;
    overRef.current = id;
    setOverId(id);
  }, []);

  const onPointerDown = useCallback(
    (id: string, e: ReactPointerEvent<HTMLElement>) => {
      if (gesture.current || !e.isPrimary) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest(NO_DRAG)) return;
      const el = e.currentTarget;

      const position = (g: Gesture) => {
        // Posição "natural" (sem o transform atual) segue o conteúdo quando algo rola.
        const r = g.el.getBoundingClientRect();
        g.tx = g.x - g.grabX - (r.left - g.tx);
        g.ty = g.y - g.grabY - (r.top - g.ty);
        g.el.style.transform = `translate(${g.tx}px, ${g.ty}px)`;
      };

      const hitTest = (g: Gesture) => {
        let target: string | null = null;
        for (const node of document.elementsFromPoint(g.x, g.y)) {
          if (g.el.contains(node)) continue;
          const zone = node.closest<HTMLElement>('[data-drop-target]');
          if (zone && zone.dataset.dropScope === scope) target = zone.dataset.dropTarget ?? null;
          break;
        }
        setOver(target);
      };

      const frame = () => {
        const g = gesture.current;
        if (!g || !g.active) return;
        if (g.scrollX) {
          const r = g.scrollX.getBoundingClientRect();
          const v = edgeSpeed(g.x, r.left, r.right);
          if (v) g.scrollX.scrollLeft += v;
        }
        const sy = g.scrollY;
        if (sy) {
          const r = sy.getBoundingClientRect();
          const v = edgeSpeed(g.y, Math.max(r.top, 0), Math.min(r.bottom, window.innerHeight));
          if (v) sy.scrollTop += v;
        } else {
          const v = edgeSpeed(g.y, 0, window.innerHeight);
          if (v) window.scrollBy(0, v);
        }
        position(g);
        hitTest(g);
        g.raf = requestAnimationFrame(frame);
      };

      const start = () => {
        const g = gesture.current;
        if (!g || g.active) return;
        g.active = true;
        g.timer = undefined;
        const r = el.getBoundingClientRect();
        g.grabX = g.startX - r.left;
        g.grabY = g.startY - r.top;
        g.scrollX = scrollParent(el, 'x');
        g.scrollY = scrollParent(el, 'y');
        // scroll-snap brigaria com a rolagem automática em passos pequenos.
        if (g.scrollX) g.scrollX.style.scrollSnapType = 'none';
        try {
          el.setPointerCapture(g.pointerId);
        } catch {
          /* ponteiro já liberado */
        }
        el.style.willChange = 'transform';
        if (g.type === 'touch' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(10);
          } catch {
            /* sem vibração */
          }
        }
        setDraggingId(g.id);
        g.raf = requestAnimationFrame(frame);
      };

      const suppressNextClick = () => {
        const swallow = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
          window.removeEventListener('click', swallow, true);
        };
        window.addEventListener('click', swallow, true);
        window.setTimeout(() => window.removeEventListener('click', swallow, true), 400);
      };

      const finish = (drop: boolean) => {
        const g = gesture.current;
        if (!g) return;
        g.cleanup();
        if (!g.active) return;
        const target = overRef.current;
        suppressNextClick();
        setOver(null);
        setDraggingId(null);
        if (drop && target !== null) onDropRef.current(g.id, target);
      };

      const onMove = (ev: PointerEvent) => {
        const g = gesture.current;
        if (!g || ev.pointerId !== g.pointerId) return;
        g.x = ev.clientX;
        g.y = ev.clientY;
        if (g.active) {
          ev.preventDefault();
          return;
        }
        const dist = Math.hypot(g.x - g.startX, g.y - g.startY);
        if (g.type === 'touch') {
          if (dist > TOUCH_SLOP) finish(false); // é rolagem
        } else if (dist > MOUSE_THRESHOLD) start();
      };
      const onUp = (ev: PointerEvent) => {
        if (gesture.current && ev.pointerId === gesture.current.pointerId) finish(true);
      };
      const onCancel = (ev: PointerEvent) => {
        if (gesture.current && ev.pointerId === gesture.current.pointerId) finish(false);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape' && gesture.current?.active) {
          ev.preventDefault();
          finish(false);
        }
      };

      const g: Gesture = {
        id,
        pointerId: e.pointerId,
        type: e.pointerType,
        el,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        grabX: 0,
        grabY: 0,
        tx: 0,
        ty: 0,
        active: false,
        timer: undefined,
        raf: undefined,
        scrollX: null,
        scrollY: null,
        cleanup: () => {
          if (g.timer !== undefined) window.clearTimeout(g.timer);
          if (g.raf !== undefined) cancelAnimationFrame(g.raf);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onCancel);
          window.removeEventListener('keydown', onKey, true);
          try {
            if (el.hasPointerCapture(g.pointerId)) el.releasePointerCapture(g.pointerId);
          } catch {
            /* nada a liberar */
          }
          el.style.transform = '';
          el.style.willChange = '';
          if (g.scrollX) g.scrollX.style.scrollSnapType = '';
          if (gesture.current === g) gesture.current = null;
        },
      };
      gesture.current = g;
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
      if (g.type === 'touch') g.timer = window.setTimeout(start, longPressMs);
    },
    [longPressMs, scope, setOver],
  );

  /** Props do item arrastável (o elemento que se move). */
  const itemProps = useCallback(
    (id: string) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(id, e),
      // Impede o arrasto nativo (links/imagens) de competir com o nosso.
      onDragStart: (e: ReactDragEvent<HTMLElement>) => e.preventDefault(),
      style: ITEM_STYLE,
    }),
    [onPointerDown],
  );

  /** Props da área que recebe o item. */
  const targetProps = useCallback((id: string) => ({ 'data-drop-target': id, 'data-drop-scope': scope }), [scope]);

  return { draggingId, overId, itemProps, targetProps };
}
