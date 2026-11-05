import { getDb } from './db';
import { nowIso } from '@/domain/ids';
import { migratePrivacy, type PrivacyPrefs } from '@/domain/privacy';

export { migratePrivacy, type PrivacyPrefs };

/** Preferências de privacidade (Parte 26.1): o que aparece em cada lugar do app. */
const KEY = 'privacy';

export async function loadPrivacy(): Promise<PrivacyPrefs> {
  return migratePrivacy((await getDb().kv.get(KEY))?.value);
}

export async function savePrivacy(p: PrivacyPrefs): Promise<void> {
  await getDb().kv.put({ key: KEY, value: migratePrivacy(p), updatedAt: nowIso() });
}
