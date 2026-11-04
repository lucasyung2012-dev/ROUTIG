import type { ModuleId, Stage } from './modules';

export const APP_VERSION = '0.9.0';

/** Etapa do roadmap em construção agora. Atualize ao concluir cada etapa. */
export const CURRENT_STAGE: Stage = 1;

/**
 * Módulos que já funcionam de verdade. Um módulo só entra aqui com fluxos
 * reais e testes (Parte 31.4); os outros mostram a página de roadmap.
 */
export const READY_MODULES: ReadonlySet<ModuleId> = new Set<ModuleId>(['tasks', 'calendar', 'inbox', 'notes', 'projects']);

export function isModuleReady(id: ModuleId): boolean {
  return READY_MODULES.has(id);
}
