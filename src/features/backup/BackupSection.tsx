import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArchiveRestore, Download, FileUp, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import {
  currentCounts,
  deleteOldAutoCopies,
  deleteSnapshot,
  listExports,
  listSnapshots,
  loadBackupPrefs,
  previewRecovery,
  readBackup,
  recoverFromBackup,
  restoreBackup,
  saveBackupPrefs,
  saveSnapshot,
  snapshotText,
  type SnapshotInfo,
} from '@/data/backupRepo';
import {
  daysSince,
  hasUserData,
  isBackupStale,
  KEEP_AUTO_OPTIONS,
  MAIN_TABLES,
  oldAutoCopies,
  RECOVER_GROUP_IDS,
  REMINDER_OPTIONS,
  type BackupFile,
  type BackupPrefs,
  type KeepAuto,
  type RecoverGroup,
  type RecoveryPlan,
  type ReminderDays,
} from '@/domain/backup';
import { formatBytes } from '@/services/storage';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { exportBackup, exportExisting } from './exportFile';

/** Settings → Backup (Parte 25): exportar, cópias internas, restaurar, histórico e avisos. */
export function BackupSection() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const prefs = useLiveQuery(() => loadBackupPrefs(), []);
  const snapshots = useLiveQuery(() => listSnapshots(), []);
  const exports = useLiveQuery(() => listExports(), []);
  const counts = useLiveQuery(() => currentCounts(), []);
  const [busy, setBusy] = useState<'export' | 'snapshot' | 'read' | null>(null);
  const [preview, setPreview] = useState<{ backup: BackupFile; source: string; ignored: string[] } | null>(null);
  const [deleting, setDeleting] = useState<SnapshotInfo | null>(null);
  const [pruning, setPruning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!prefs || !snapshots || !exports || !counts) return <LoadingState label={t('common.loading')} lines={4} />;

  const now = new Date();
  const lastExport = exports[0]?.at ?? null;
  const lastAuto = snapshots.find((s) => s.kind === 'auto')?.createdAt ?? null;
  const stale = isBackupStale(lastExport, { ...prefs, snoozedUntil: null }, hasUserData(counts), now);
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const ago = (iso: string | null) => {
    const d = daysSince(iso, now);
    return d === null ? t('backup.never') : d === 0 ? t('backup.today') : t('backup.daysAgo', { count: d });
  };
  const setPrefs = (p: Partial<BackupPrefs>) => void saveBackupPrefs({ ...prefs, ...p });

  const doExport = async () => {
    setBusy('export');
    try {
      const r = await exportBackup();
      if (r === 'saved') toast.show(t('backup.exported'));
    } catch {
      toast.show(t('backup.exportFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const doSnapshot = async () => {
    setBusy('snapshot');
    try {
      await saveSnapshot('manual');
      toast.show(t('backup.snapshotDone'));
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const openPreview = async (text: string, source: string) => {
    setBusy('read');
    try {
      const r = await readBackup(text);
      if (r.ok) setPreview({ backup: r.backup, source, ignored: r.ignoredTables });
      else toast.show(t(`backup.problems.${r.problem}`), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Surface className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stale ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
            {stale ? <TriangleAlert className="h-5 w-5" aria-hidden /> : <ShieldCheck className="h-5 w-5" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-fg">{stale ? t('backup.staleTitle') : t('backup.okTitle')}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {t('backup.lastExport', { when: ago(lastExport) })} · {t('backup.lastAuto', { when: ago(lastAuto) })}
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted">{t('backup.exportHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Download className="h-4 w-4" />} loading={busy === 'export'} onClick={() => void doExport()}>
            {t('backup.export')}
          </Button>
          <Button variant="secondary" loading={busy === 'snapshot'} onClick={() => void doSnapshot()}>
            {t('backup.snapshotNow')}
          </Button>
        </div>
      </Surface>

      <Surface className="flex flex-col gap-4">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('backup.automatic')}</h2>
        <Switch label={t('backup.autoDaily')} hint={t('backup.autoDailyHint')} checked={prefs.autoDaily} onChange={(autoDaily) => setPrefs({ autoDaily })} />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[0.9375rem] font-medium text-fg">{t('backup.reminder')}</div>
            <p className="mt-1 text-sm text-muted">{t('backup.reminderHint')}</p>
          </div>
          <div className="w-full shrink-0 sm:w-56">
            <Select aria-label={t('backup.reminder')} value={prefs.reminderDays} onChange={(e) => setPrefs({ reminderDays: Number(e.target.value) as ReminderDays })}>
              {REMINDER_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? t('backup.reminderOff') : t('backup.reminderDays', { count: d })}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('backup.restoreTitle')}</h2>
        <p className="text-sm leading-relaxed text-muted">{t('backup.restoreHint')}</p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void f.text().then((text) => openPreview(text, f.name));
          }}
        />
        <Button variant="secondary" className="w-fit" icon={<FileUp className="h-4 w-4" />} loading={busy === 'read'} onClick={() => fileInput.current?.click()}>
          {t('backup.restoreFromFile')}
        </Button>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('backup.snapshots')}</h2>
        <p className="text-sm leading-relaxed text-muted">{t('backup.snapshotsHint')}</p>
        {snapshots.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t('backup.snapshotsTotal', { count: snapshots.length, size: formatBytes(snapshots.reduce((n, s) => n + s.size, 0), settings.locale) })}</span>
            {oldAutoCopies(snapshots, KEEP_AUTO_OPTIONS[0]).length > 0 && (
              <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setPruning(true)}>
                {t('backup.prune')}
              </Button>
            )}
          </div>
        )}
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted">{t('backup.snapshotsEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/70">
            {snapshots.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                    {fmtDate(s.createdAt)}
                    <Badge tone={s.kind === 'beforeRestore' ? 'warning' : s.kind === 'manual' ? 'accent' : 'neutral'}>{t(`backup.kinds.${s.kind}`)}</Badge>
                  </div>
                  <div className="text-xs text-muted">
                    {formatBytes(s.size, settings.locale)} · {summary(s.counts, t)}
                  </div>
                </div>
                <IconButton
                  size="sm"
                  label={t('backup.restoreThis')}
                  icon={<ArchiveRestore className="h-4 w-4" />}
                  onClick={() =>
                    void snapshotText(s.id).then((text) => {
                      if (text) void openPreview(text, t(`backup.kinds.${s.kind}`));
                    })
                  }
                />
                <IconButton
                  size="sm"
                  label={t('backup.exportThis')}
                  icon={<Download className="h-4 w-4" />}
                  onClick={() =>
                    void snapshotText(s.id).then(async (text) => {
                      if (text && (await exportExisting(text, s.createdAt, s.checksum)) === 'saved') toast.show(t('backup.exported'));
                    })
                  }
                />
                <IconButton size="sm" label={t('backup.deleteThis')} icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(s)} />
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-fg">{t('backup.history')}</h2>
        {exports.length === 0 ? (
          <p className="text-sm text-muted">{t('backup.historyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {exports.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="text-fg">{fmtDate(e.at)}</span>
                <span className="min-w-0 truncate text-xs text-muted">
                  {e.fileName} · {formatBytes(e.size, settings.locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      {pruning && <PruneDialog snapshots={snapshots} onClose={() => setPruning(false)} />}
      {preview && <RestorePreview {...preview} current={counts} onClose={() => setPreview(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title={t('backup.deleteTitle')}
        body={t('backup.deleteBody', { date: deleting ? fmtDate(deleting.createdAt) : '' })}
        confirmLabel={t('backup.deleteThis')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={() => {
          if (deleting) void deleteSnapshot(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

type Translate = ReturnType<typeof useSettings>['t'];

function summary(counts: Record<string, number>, t: Translate): string {
  return (['tasks', 'notes', 'events', 'projects'] as const).map((k) => `${counts[k] ?? 0} ${t(`backup.tables.${k}`).toLowerCase()}`).join(' · ');
}

function RestorePreview({ backup, source, ignored, current, onClose }: { backup: BackupFile; source: string; ignored: string[]; current: Record<string, number>; onClose: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [mode, setMode] = useState<'recover' | 'replace'>('recover');
  const [agreed, setAgreed] = useState(false);
  const [running, setRunning] = useState(false);
  const [all, setAll] = useState<RecoveryPlan | null>(null);
  const [groups, setGroups] = useState<RecoverGroup[]>([]);
  const [plan, setPlan] = useState<RecoveryPlan | null>(null);

  // O que cada módulo recuperaria; começam marcados os que têm algo a recuperar.
  useEffect(() => {
    void previewRecovery(backup, RECOVER_GROUP_IDS).then((p) => {
      setAll(p);
      setGroups(RECOVER_GROUP_IDS.filter((g) => p.perGroup[g] > 0));
    });
  }, [backup]);
  useEffect(() => {
    void previewRecovery(backup, groups).then(setPlan);
  }, [backup, groups]);
  const recoverCount = plan ? Object.values(plan.perGroup).reduce((a, b) => a + b, 0) : 0;

  const recover = async () => {
    setRunning(true);
    try {
      const r = await recoverFromBackup(backup, groups);
      toast.show(t('backup.recovered', { count: Object.values(r.plan.perGroup).reduce((a, b) => a + b, 0) }));
      // As telas recarregam com o que voltou.
      window.setTimeout(() => window.location.reload(), 1200);
    } catch {
      setRunning(false);
      toast.show(t('backup.restoreFailed'), 'error');
    }
  };
  const created = backup.createdAt ? new Intl.DateTimeFormat(settings.locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(backup.createdAt)) : '—';

  const restore = async () => {
    setRunning(true);
    try {
      await restoreBackup(backup);
      toast.show(t('backup.restored'));
      // As telas e as configurações recarregam do banco restaurado.
      window.setTimeout(() => window.location.reload(), 1200);
    } catch {
      setRunning(false);
      toast.show(t('backup.restoreFailed'), 'error');
    }
  };

  return (
    <Dialog
      open
      onClose={running ? () => undefined : onClose}
      closeLabel={t('common.cancel')}
      title={t('backup.previewTitle')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" disabled={running} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {mode === 'replace' ? (
            <Button variant="danger" disabled={!agreed} loading={running} onClick={() => void restore()}>
              {t('backup.restoreConfirm')}
            </Button>
          ) : (
            <Button variant="primary" disabled={recoverCount === 0} loading={running} onClick={() => void recover()}>
              {t('backup.recoverConfirm', { count: recoverCount })}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="success" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            {t('backup.integrityOk')}
          </Badge>
          <span className="text-muted">{t('backup.previewMeta', { date: created, version: backup.appVersion, source })}</span>
        </div>
        <Segmented<'recover' | 'replace'>
          label={t('backup.mode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'recover', label: t('backup.modeRecover') },
            { value: 'replace', label: t('backup.modeReplace') },
          ]}
        />
        {mode === 'recover' ? <RecoverPanel all={all} plan={plan} groups={groups} setGroups={setGroups} /> : <ReplacePanel backup={backup} current={current} ignored={ignored} agreed={agreed} setAgreed={setAgreed} />}
      </div>
    </Dialog>
  );
}

function ReplacePanel({ backup, current, ignored, agreed, setAgreed }: { backup: BackupFile; current: Record<string, number>; ignored: string[]; agreed: boolean; setAgreed: (v: boolean) => void }) {
  const { t } = useSettings();
  const others = (c: Record<string, number>) => Object.entries(c).reduce((sum, [k, n]) => ((MAIN_TABLES as readonly string[]).includes(k) ? sum : sum + n), 0);
  const rows: { key: string; label: string; from: number; now: number }[] = [
    ...MAIN_TABLES.map((k) => ({ key: k, label: t(`backup.tables.${k}`), from: backup.counts[k] ?? 0, now: current[k] ?? 0 })),
    { key: 'other', label: t('backup.tables.other'), from: others(backup.counts), now: others(current) },
  ];
  return (
      <div className="flex flex-col gap-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-subtle">
              <th className="py-1 font-medium">{t('backup.colWhat')}</th>
              <th className="py-1 text-right font-medium">{t('backup.colBackup')}</th>
              <th className="py-1 text-right font-medium">{t('backup.colNow')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line/70">
                <td className="py-1.5 text-fg">{r.label}</td>
                <td className="py-1.5 text-right tabular text-fg">{r.from}</td>
                <td className={cn('py-1.5 text-right tabular', r.now > r.from ? 'font-semibold text-warning' : 'text-muted')}>{r.now}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ignored.length > 0 && <p className="text-xs text-muted">{t('backup.ignored', { tables: ignored.join(', ') })}</p>}
        <div className="rounded-2xl bg-warning/10 p-4 text-sm leading-relaxed text-fg ring-1 ring-warning/30">
          <p className="font-semibold">{t('backup.consequenceTitle')}</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted">
            <li>{t('backup.consequenceReplace')}</li>
            <li>{t('backup.consequenceSafety')}</li>
            <li>{t('backup.consequenceSettings')}</li>
            <li>{t('backup.consequencePins')}</li>
          </ul>
        </div>
        <label className="flex items-start gap-3 text-sm text-fg">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[rgb(var(--accent))]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          {t('backup.agree')}
        </label>
      </div>
  );
}

function RecoverPanel({ all, plan, groups, setGroups }: { all: RecoveryPlan | null; plan: RecoveryPlan | null; groups: RecoverGroup[]; setGroups: (g: RecoverGroup[]) => void }) {
  const { t } = useSettings();
  if (!all || !plan) return <LoadingState label={t('common.loading')} lines={3} />;
  const available = RECOVER_GROUP_IDS.filter((g) => all.perGroup[g] > 0);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="leading-relaxed text-muted">{t('backup.recoverHint')}</p>
      {available.length === 0 ? (
        <p className="rounded-2xl bg-surface-2/70 p-4 text-fg">{t('backup.recoverNothing')}</p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {available.map((g) => (
              <li key={g}>
                <label className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-fg hover:bg-surface-2">
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={groups.includes(g)} onChange={(e) => setGroups(e.target.checked ? [...groups, g] : groups.filter((x) => x !== g))} />
                  <span className="min-w-0 flex-1">{t(`backup.groups.${g}`)}</span>
                  <span className="tabular text-muted">{all.perGroup[g]}</span>
                </label>
              </li>
            ))}
          </ul>
          {plan.files > 0 && <p className="text-muted">{t('backup.recoverFiles', { count: plan.files })}</p>}
        </>
      )}
      <p className="text-xs text-muted">{t('backup.recoverTrash')}</p>
    </div>
  );
}

/** Apagar cópias automáticas antigas: só quando o usuário pede, vendo quantas vão embora. */
function PruneDialog({ snapshots, onClose }: { snapshots: SnapshotInfo[]; onClose: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [keep, setKeep] = useState<KeepAuto>(KEEP_AUTO_OPTIONS[0]);
  const [busy, setBusy] = useState(false);
  const old = oldAutoCopies(snapshots, keep);
  const size = formatBytes(old.reduce((n, s) => n + s.size, 0), settings.locale);
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('backup.pruneTitle')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={old.length === 0}
            loading={busy}
            onClick={() => {
              setBusy(true);
              void deleteOldAutoCopies(keep).then((n) => {
                toast.show(t('backup.pruned', { count: n }));
                onClose();
              });
            }}
          >
            {t('backup.pruneConfirm', { count: old.length })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="leading-relaxed text-muted">{t('backup.pruneHint')}</p>
        <Select aria-label={t('backup.pruneKeep')} value={keep} onChange={(e) => setKeep(Number(e.target.value) as KeepAuto)}>
          {KEEP_AUTO_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {t('backup.pruneKeepN', { count: k })}
            </option>
          ))}
        </Select>
        <p className="text-fg">{old.length === 0 ? t('backup.pruneNone') : t('backup.pruneWill', { count: old.length, size })}</p>
      </div>
    </Dialog>
  );
}
