import { useEffect } from 'react';
import { liveQuery } from 'dexie';
import { getDb } from '@/data/db';
import { loadSyncState, syncNow, syncReady } from '@/data/syncRepo';

/** Espera depois de uma alteração antes de enviar (junta várias mudanças seguidas numa ida só). */
const AFTER_CHANGE_MS = 8000;
/** Com o app na tela, busca as mudanças dos outros aparelhos a cada minuto (barato: só baixa o que mudou). */
const VISIBLE_EVERY_MS = 60_000;

/**
 * Sincronização automática, se a conta estiver ligada neste aparelho:
 * - poucos segundos depois de cada alteração feita aqui (criar, editar, concluir, apagar);
 * - ao abrir o app, ao voltar para ele, ao voltar a internet e ao sair dele;
 * - a cada minuto enquanto o app está na tela, para receber o que mudou nos outros aparelhos.
 * Sem janela de login (no Dropbox o acesso não expira; no Google, se expirou, espera o próximo
 * "Sincronizar agora"). Erros não interrompem nada.
 */
export function AutoSync() {
  useEffect(() => {
    let running = false;
    let again = false;
    let timer = 0;
    const go = () => {
      const s = loadSyncState();
      if (!s.auto || !syncReady(s) || !navigator.onLine) return;
      // Já sincronizando: roda de novo no fim, para levar o que mudou no meio.
      if (running) {
        again = true;
        return;
      }
      running = true;
      void syncNow(s, false)
        .catch(() => undefined)
        .finally(() => {
          running = false;
          if (again) {
            again = false;
            go();
          }
        });
    };
    const soon = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(go, ms);
    };

    soon(4000);
    const id = window.setInterval(() => document.visibilityState === 'visible' && go(), VISIBLE_EVERY_MS);
    const vis = () => (document.visibilityState === 'hidden' ? go() : soon(1000));
    const online = () => soon(1000);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', online);

    // Alteração local (o changelog só recebe o que foi feito neste aparelho, não o que chega da nuvem).
    let lastSeq: number | null = null;
    const sub = liveQuery(async () => (await getDb().changelog.orderBy('seq').last())?.seq ?? 0).subscribe({
      next: (seq) => {
        if (lastSeq !== null && seq !== lastSeq) soon(AFTER_CHANGE_MS);
        lastSeq = seq;
      },
      error: () => undefined,
    });

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', online);
      sub.unsubscribe();
    };
  }, []);
  return null;
}
