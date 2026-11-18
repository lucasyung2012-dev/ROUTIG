import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { currentCounts, listExports, listSnapshots, loadBackupPrefs, saveSnapshot } from '@/data/backupRepo';
import { daysSince, hasUserData, isBackupStale } from '@/domain/backup';
import { ExportBackupDialog } from '@/features/backup/BackupPasswordDialogs';
import { TransferExports } from '@/features/transfer/TransferSection';
import { Button } from '@/ui/Button';
import { LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { ControlRoomLink, Pane, Station } from './station';

/*
 * Arquivo da Biblioteca (preservação e transferência): as mesmas cópias de segurança e exportações
 * do Settings, pelas mesmas funções (backupRepo, ExportBackupDialog e TransferExports). Restaurar uma
 * cópia, as cópias automáticas e importar arquivos (com a prévia do que entra) ficam no Control Room.
 */

/** Preservação: quando foi o último backup exportado e a última cópia interna, e os dois botões de sempre. */
export function PreserveStation() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const prefs = useLiveQuery(() => loadBackupPrefs(), []);
  const snapshots = useLiveQuery(() => listSnapshots(), []);
  const exports = useLiveQuery(() => listExports(), []);
  const counts = useLiveQuery(() => currentCounts(), []);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = t('park.library.sectors.preserve');
  if (!prefs || !snapshots || !exports || !counts)
    return (
      <Station building="library" label={label}>
        <LoadingState label={t('common.loading')} lines={3} />
      </Station>
    );
  const now = new Date();
  const lastExport = exports[0]?.at ?? null;
  const lastAuto = snapshots.find((s) => s.kind === 'auto')?.createdAt ?? null;
  // A mesma conta do Settings → Backup (sem o adiamento do aviso).
  const stale = isBackupStale(lastExport, { ...prefs, snoozedUntil: null }, hasUserData(counts), now);
  const ago = (iso: string | null) => {
    const d = daysSince(iso, now);
    return d === null ? t('backup.never') : d === 0 ? t('backup.today') : t('backup.daysAgo', { count: d });
  };
  const fmt = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const snapshot = async () => {
    setBusy(true);
    try {
      await saveSnapshot('manual');
      toast.show(t('backup.snapshotDone'));
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Station building="library" label={label}>
      <p className="text-sm text-muted">{t('park.library.preserveHint')}</p>
      <Pane title={t('park.native.north.library.backupTitle')}>
        <div className="flex items-start gap-2">
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', stale ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
            {stale ? <TriangleAlert className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-fg">{stale ? t('backup.staleTitle') : t('backup.okTitle')}</span>
            <span className="block text-xs text-muted">
              {t('backup.lastExport', { when: ago(lastExport) })}
              {lastExport && ` (${fmt.format(new Date(lastExport))})`} · {t('backup.lastAuto', { when: ago(lastAuto) })}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={<Download className="h-4 w-4" />} onClick={() => setExporting(true)}>
            {t('backup.export')}
          </Button>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void snapshot()}>
            {t('backup.snapshotNow')}
          </Button>
        </div>
        <p className="text-xs text-muted">{t('park.native.north.library.restoreElsewhere')}</p>
      </Pane>
      <ControlRoomLink to="/settings/backup" />
      {exporting && <ExportBackupDialog source={{ kind: 'now' }} onClose={() => setExporting(false)} />}
    </Station>
  );
}

/** Transferência: exportar para outros apps (os mesmos arquivos do Settings); importar fica no Control Room. */
export function TransferStation() {
  const { t } = useSettings();
  return (
    <Station building="library" label={t('park.library.sectors.transfer')}>
      <Pane title={t('transfer.export.title')}>
        <p className="text-xs text-muted">{t('transfer.export.hint')}</p>
        <TransferExports />
      </Pane>
      <p className="text-xs text-muted">{t('park.native.north.library.importElsewhere')}</p>
      <ControlRoomLink to="/settings/transfer" />
    </Station>
  );
}
