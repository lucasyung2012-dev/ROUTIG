import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { cn } from './cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  size?: 'sm' | 'md' | 'lg';
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Janela modal acessível: foco preso, Esc fecha, foco volta ao elemento de origem. */
export function Dialog({ open, onClose, title, description, children, footer, closeLabel, size = 'md' }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
        if (items.length === 0) return;
        const firstItem = items[0]!;
        const lastItem = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-[fade-up_200ms_ease-out_both] bg-bg/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full animate-scale-in flex-col overflow-hidden rounded-t-3xl bg-surface shadow-lift ring-1 ring-line sm:rounded-3xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-3xl',
        )}
      >
        <div className="flex items-start gap-3 px-6 pb-2 pt-6">
          <div className="min-w-0 flex-1">
            <h2 id="dialog-title" className="text-lg font-semibold tracking-tight text-fg">
              {title}
            </h2>
            {description && <div className="mt-1 text-sm leading-relaxed text-muted">{description}</div>}
          </div>
          <IconButton label={closeLabel} icon={<X className="h-5 w-5" />} size="sm" onClick={onClose} />
        </div>
        {children && <div className="overflow-y-auto px-6 py-4">{children}</div>}
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 px-6 py-4 safe-bottom">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
