import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, TriangleAlert } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { currentCounts, listExports, loadBackupPrefs, saveBackupPrefs } from '@/data/backupRepo';
import { daysSince, hasUserData, isBackupStale } from '@/domain/backup';
import { Button } from '@/ui/Button';
import { ExportBackupDialog } from './BackupPasswordDialogs';

/** Aviso de backup desatualizado (Parte 25.7). Some quando o backup é exportado ou adiado. */
export function BackupReminder() {
  const { t } = useSettings();
  const [exporting, setExporting] = useState(false);
  const state = useLiveQuery(async () => {
    const [prefs, exports, counts] = await Promise.all([loadBackupPrefs(), listExports(), currentCounts()]);
    return { prefs, lastExport: exports[0]?.at ?? null, hasData: hasUserData(counts) };
  }, []);
  if (!state) return null;
  const now = new Date();
  if (!isBackupStale(state.lastExport, state.prefs, state.hasData, now)) return null;
  const d = daysSince(state.lastExport, now);

  const snooze = () => {
    const until = new Date(now.getTime() + 86_400_000).toISOString();
    void saveBackupPrefs({ ...state.prefs, snoozedUntil: until });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-warning/10 p-4 ring-1 ring-warning/30 sm:flex-row sm:items-center">
      <TriangleAlert className="hidden h-5 w-5 shrink-0 text-warning sm:block" aria-hidden />
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-fg">
        {d === null ? t('backup.reminderNever') : t('backup.reminderOld', { count: d })}{' '}
        <Link to="/settings/backup" className="font-medium text-accent hover:underline">
          {t('backup.seeBackup')}
        </Link>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={snooze}>
          {t('backup.snooze')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<Download className="h-4 w-4" />}
          onClick={() => setExporting(true)}
        >
          {t('backup.export')}
        </Button>
      </div>
      {exporting && <ExportBackupDialog source={{ kind: 'now' }} onClose={() => setExporting(false)} />}
    </div>
  );
}
