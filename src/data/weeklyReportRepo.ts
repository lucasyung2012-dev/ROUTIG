import { getDb } from './db';
import { nowIso } from '@/domain/ids';
import { migrateReportPrefs, type ReportPrefs } from '@/domain/weeklyReport';

/** Escolhas do Relatório da semana: no `kv`, como as outras configurações (entram na sincronização e no backup). */
const KEY = 'weeklyReport';

export async function loadReportPrefs(): Promise<ReportPrefs> {
  return migrateReportPrefs((await getDb().kv.get(KEY))?.value);
}

export async function saveReportPrefs(p: ReportPrefs): Promise<void> {
  await getDb().kv.put({ key: KEY, value: migrateReportPrefs(p), updatedAt: nowIso() });
}

export const REPORT_PREFS_KEY = KEY;
