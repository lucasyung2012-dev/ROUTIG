import { useEffect } from 'react';
import { loadSyncState, syncNow } from '@/data/syncRepo';

/**
 * Sincronização automática: ao abrir, a cada 5 minutos e ao sair do app (aba escondida), se a
 * conta estiver ligada neste aparelho. Sem janela do Google: se a sessão expirou, espera o
 * próximo "Sincronizar agora" em Configurações. Erros não interrompem nada.
 */
export function AutoSync() {
  useEffect(() => {
    let running = false;
    const go = () => {
      const s = loadSyncState();
      if (running || !s.auto || !s.key || !s.clientId || !navigator.onLine) return;
      running = true;
      void syncNow(s, false)
        .catch(() => undefined)
        .finally(() => (running = false));
    };
    const first = window.setTimeout(go, 4000);
    const id = window.setInterval(go, 5 * 60 * 1000);
    const vis = () => document.visibilityState === 'hidden' && go();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  return null;
}
