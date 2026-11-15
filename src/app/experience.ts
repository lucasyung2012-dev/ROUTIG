/**
 * As experiências do ROUTIG (Home, Control Room, Campus e District) e a memória de onde a pessoa
 * estava no Control Room, para o Home e o seletor "continuarem" de lá em vez de recomeçar.
 */
import { MODULES, isNavModuleId } from './modules';

export type Experience = 'home' | 'control' | 'campus' | 'district';

/** Endereço do Campus (o parque 3D). */
export const CAMPUS_PATH = '/campus';
const LAST_KEY = 'routig.control.last';
/** Primeira tela do Control Room quando ainda não há onde continuar (a visão geral dele). */
const CONTROL_DEFAULT = MODULES.dashboard.path;

/** Guarda a tela atual do Control Room (só telas de módulos; Perfil e Configurações são do Home). */
export function rememberControlPath(path: string) {
  const first = path.split('/')[1] ?? '';
  if (!isNavModuleId(first)) return;
  try {
    localStorage.setItem(LAST_KEY, path);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/** Onde o Control Room continua (a última tela de módulo aberta) ou a primeira tela. */
export function controlPath(): string {
  try {
    return localStorage.getItem(LAST_KEY) || CONTROL_DEFAULT;
  } catch {
    return CONTROL_DEFAULT;
  }
}

/** Já esteve no Control Room neste aparelho (o Home oferece "Continuar"). */
export function hasControlHistory(): boolean {
  try {
    return !!localStorage.getItem(LAST_KEY);
  } catch {
    return false;
  }
}
