import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from './cn';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  show: (message: string, kind?: ToastKind, action?: ToastItem['action']) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi['show']>(
    (message, kind = 'success', action) => {
      const id = ++seq.current;
      setItems((list) => [...list.slice(-2), { id, kind, message, action }]);
      // Erros ficam mais tempo na tela para dar tempo de ler.
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : action ? 7000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 safe-bottom sm:items-end sm:p-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-2xl bg-surface px-4 py-3 shadow-lift ring-1 ring-line"
          >
            <span
              className={cn(
                'mt-0.5',
                t.kind === 'success' && 'text-success',
                t.kind === 'error' && 'text-danger',
                t.kind === 'info' && 'text-blue',
              )}
            >
              {t.kind === 'success' && <CircleCheck className="h-5 w-5" aria-hidden />}
              {t.kind === 'error' && <TriangleAlert className="h-5 w-5" aria-hidden />}
              {t.kind === 'info' && <Info className="h-5 w-5" aria-hidden />}
            </span>
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-fg">{t.message}</p>
            {t.action && (
              <button
                type="button"
                className="text-sm font-semibold text-accent hover:underline"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label={closeLabel} className="text-subtle hover:text-fg" onClick={() => dismiss(t.id)}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de ToastProvider');
  return ctx;
}
