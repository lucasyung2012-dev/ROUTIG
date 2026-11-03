import { useEffect } from 'react';
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

  useEffect(() => {
    if (needRefresh) toast.show(t('pwa.updateReady'), 'info', { label: t('pwa.update'), run: () => void updateServiceWorker(true) });
  }, [needRefresh, t, toast, updateServiceWorker]);

  useEffect(() => {
    if (offlineReady) toast.show(t('pwa.offlineReady'), 'success');
  }, [offlineReady, t, toast]);

  return null;
}
