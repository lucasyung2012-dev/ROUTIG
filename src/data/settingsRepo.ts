import { getDb } from './db';
import { migrateSettings, settingsSchema, type Settings } from '@/domain/settings';
import { nowIso } from '@/domain/ids';

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const rec = await getDb().kv.get(KEY);
  return migrateSettings(rec?.value);
}

/**
 * Grava as configurações inteiras, validadas, e registra no histórico quais
 * campos mudaram. Lança erro se o valor for inválido (nada é gravado).
 */
export async function saveSettings(next: Settings): Promise<void> {
  const value = settingsSchema.parse(next);
  const db = getDb();
  await db.transaction('rw', db.kv, db.changelog, async () => {
    const prev = await db.kv.get(KEY);
    const at = nowIso();
    await db.kv.put({ key: KEY, value, updatedAt: at });
    const fields = changedFields(prev?.value, value);
    if (!prev || fields.length > 0) {
      await db.changelog.add({
        at,
        entityType: 'settings',
        entityId: KEY,
        action: prev ? 'update' : 'create',
        fields,
      });
    }
  });
}

export function changedFields(prev: unknown, next: Record<string, unknown>): string[] {
  if (!prev || typeof prev !== 'object') return Object.keys(next);
  const p = prev as Record<string, unknown>;
  return Object.keys(next).filter((k) => JSON.stringify(p[k]) !== JSON.stringify(next[k]));
}

export const SETTINGS_KEY = KEY;
