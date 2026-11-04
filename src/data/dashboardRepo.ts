import { getDb } from './db';
import { nowIso } from '@/domain/ids';
import { migrateDashboardConfig, type DashboardConfig } from '@/domain/dashboard';

const KEY = 'dashboard.config';

export async function loadDashboardConfig(): Promise<DashboardConfig> {
  const rec = await getDb().kv.get(KEY);
  return migrateDashboardConfig(rec?.value);
}

/** Grava a configuração do painel (só quando o usuário aplica a prévia ou troca de perfil). */
export async function saveDashboardConfig(config: DashboardConfig): Promise<void> {
  const db = getDb();
  const clean = migrateDashboardConfig(config);
  await db.transaction('rw', db.kv, db.changelog, async () => {
    const at = nowIso();
    await db.kv.put({ key: KEY, value: clean, updatedAt: at });
    await db.changelog.add({ at, entityType: 'dashboard', entityId: KEY, action: 'update' });
  });
}
