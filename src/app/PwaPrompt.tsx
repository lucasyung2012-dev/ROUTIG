import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useSettings } from '@/app/SettingsProvider';
import { useToast } from '@/ui/toast';

/**
 * Registra o service worker (funcionamento offline) e avisa quando há
 * versão nova. A atualização só acontece quando o usuário toca em "Atualizar".
 */
export function PwaPrompt() {
  const { t } = useSettings();
  const toast = useToast();
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();

  // Os textos mudam a cada configuração salva; o aviso deve sair uma vez só.
  const latest = useRef({ t, toast, updateServiceWorker });
  latest.current = { t, toast, updateServiceWorker };

  useEffect(() => {
    if (!needRefresh) return;
    const { t: tr, toast: ts, updateServiceWorker: update } = latest.current;
    ts.show(tr('pwa.updateReady'), 'info', { label: tr('pwa.update'), run: () => void update(true) }, { persistent: true });
  }, [needRefresh]);

  useEffect(() => {
    if (!offlineReady) return;
    const { t: tr, toast: ts } = latest.current;
    ts.show(tr('pwa.offlineReady'), 'success');
  }, [offlineReady]);

  return null;
}
