import { getDb } from './db';
import { nowIso } from '@/domain/ids';
import { DEFAULT_SEARCH_HIDDEN, SEARCHABLE_MODULES, type SearchableModule } from '@/domain/search';

/** Preferências de privacidade (Parte 26.1): o que aparece em cada lugar do app. */
export interface PrivacyPrefs {
  /** Módulos que não entram na busca global. */
  searchHidden: SearchableModule[];
}

const KEY = 'privacy';

export function migratePrivacy(raw: unknown): PrivacyPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Partial<PrivacyPrefs>) : {};
  const hidden = Array.isArray(r.searchHidden) ? r.searchHidden.filter((m): m is SearchableModule => (SEARCHABLE_MODULES as readonly string[]).includes(m)) : [...DEFAULT_SEARCH_HIDDEN];
  return { searchHidden: hidden };
}

export async function loadPrivacy(): Promise<PrivacyPrefs> {
  return migratePrivacy((await getDb().kv.get(KEY))?.value);
}

export async function savePrivacy(p: PrivacyPrefs): Promise<void> {
  await getDb().kv.put({ key: KEY, value: migratePrivacy(p), updatedAt: nowIso() });
}
