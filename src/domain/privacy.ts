import type { ModuleId } from '@/app/modules';
import { DEFAULT_SEARCH_HIDDEN, SEARCHABLE_MODULES, type SearchableModule } from './search';

/** Lugares onde cada módulo pode aparecer ou não (Parte 26.1). */
export const PRIVACY_PLACES = ['dashboard', 'search', 'insights'] as const;
export type PrivacyPlace = (typeof PRIVACY_PLACES)[number];

/** Os módulos da tabela de privacidade: os mesmos que a busca conhece. */
export const PRIVACY_MODULES = SEARCHABLE_MODULES;
export type PrivacyModule = SearchableModule;

/** Em que lugar cada módulo existe de verdade (a Library não tem cartão no Dashboard, por exemplo). */
export const PLACE_MODULES: Record<PrivacyPlace, readonly PrivacyModule[]> = {
  dashboard: ['tasks', 'events', 'notes', 'projects', 'goals', 'habits', 'academy', 'languages', 'music', 'sports', 'focus', 'inbox', 'finance'],
  search: SEARCHABLE_MODULES,
  insights: ['focus', 'habits', 'tasks', 'academy', 'languages', 'music', 'sports', 'projects', 'goals', 'finance'],
};

/** O que a privacidade rápida esconde quando está ligada (Parte 26.4). */
export const QUICK_TARGETS = ['dashboard', 'finance', 'notifications', 'insights'] as const;
export type QuickTarget = (typeof QUICK_TARGETS)[number];

export interface PrivacyPrefs {
  /** Módulos que não entram na busca global. */
  searchHidden: PrivacyModule[];
  /** Módulos sem cartão, indicador nem atividade no Dashboard. */
  dashboardHidden: PrivacyModule[];
  /** Módulos fora do Insights e do relatório para imprimir. */
  insightsHidden: PrivacyModule[];
  /** O que a privacidade rápida esconde. */
  quick: QuickTarget[];
}

export const DEFAULT_PRIVACY: PrivacyPrefs = { searchHidden: [...DEFAULT_SEARCH_HIDDEN], dashboardHidden: [], insightsHidden: [], quick: [...QUICK_TARGETS] };

const HIDDEN_KEY: Record<PrivacyPlace, 'searchHidden' | 'dashboardHidden' | 'insightsHidden'> = { dashboard: 'dashboardHidden', search: 'searchHidden', insights: 'insightsHidden' };

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(raw)) return [...fallback];
  return [...new Set(raw.filter((m): m is T => (allowed as readonly string[]).includes(m)))];
}

export function migratePrivacy(raw: unknown): PrivacyPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    searchHidden: pick(r.searchHidden, PLACE_MODULES.search, DEFAULT_PRIVACY.searchHidden),
    dashboardHidden: pick(r.dashboardHidden, PLACE_MODULES.dashboard, DEFAULT_PRIVACY.dashboardHidden),
    insightsHidden: pick(r.insightsHidden, PLACE_MODULES.insights, DEFAULT_PRIVACY.insightsHidden),
    quick: pick(r.quick, QUICK_TARGETS, DEFAULT_PRIVACY.quick),
  };
}

export function isShown(p: PrivacyPrefs, place: PrivacyPlace, m: PrivacyModule): boolean {
  return PLACE_MODULES[place].includes(m) && !p[HIDDEN_KEY[place]].includes(m);
}

export function setShown(p: PrivacyPrefs, place: PrivacyPlace, m: PrivacyModule, shown: boolean): PrivacyPrefs {
  const key = HIDDEN_KEY[place];
  const rest = p[key].filter((x) => x !== m);
  return { ...p, [key]: shown ? rest : [...rest, m] };
}

/** O módulo do menu que corresponde (só "events" tem nome diferente: Calendar). */
export function moduleIdOf(m: PrivacyModule): ModuleId {
  return m === 'events' ? 'calendar' : m;
}

/** Módulos do menu escondidos no Dashboard pela privacidade. */
export function dashboardHiddenIds(p: PrivacyPrefs): ModuleId[] {
  return p.dashboardHidden.map(moduleIdOf);
}
