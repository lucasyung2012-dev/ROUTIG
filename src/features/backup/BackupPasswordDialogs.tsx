import { useId, useState, type FormEvent } from 'react';
import { Download, Lock, TriangleAlert } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { checkBackupPassword, decryptBackupText, MIN_BACKUP_PASSWORD, type DecryptProblem } from '@/domain/backup';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { exportBackup, exportExisting } from './exportFile';

export type ExportSource = { kind: 'now' } | { kind: 'snapshot'; text: string; createdAt: string; checksum: string };

/**
 * Exportar backup: por padrão o arquivo sai protegido por uma senha escolhida
 * agora (com confirmação). Exportar sem senha é uma escolha explícita, com aviso.
 * A senha não é guardada em lugar nenhum.
 */
export function ExportBackupDialog({ source, onClose }: { source: ExportSource; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const formId = useId();
  const [protect, setProtect] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = protect ? checkBackupPassword(password, confirm) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (problem || busy) return;
    setBusy(true);
    const pw = protect ? password : null;
    try {
      const outcome = source.kind === 'now' ? await exportBackup(pw) : await exportExisting(source.text, source.createdAt, source.checksum, pw);
      if (outcome === 'saved') {
        toast.show(t(pw ? 'backup.exportedProtected' : 'backup.exported'));
        onClose();
        return;
      }
    } catch {
      toast.show(t('backup.exportFailed'), 'error');
    }
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      closeLabel={t('common.cancel')}
      title={source.kind === 'now' ? t('backup.export') : t('backup.exportThis')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} variant={protect ? 'primary' : 'danger'} icon={<Download className="h-4 w-4" />} loading={busy}>
            {protect ? t('backup.exportDialog.confirmProtected') : t('backup.exportDialog.confirmPlain')}
          </Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4 text-sm" onSubmit={(e) => void submit(e)} noValidate>
        <Switch label={t('backup.exportDialog.protect')} hint={t('backup.exportDialog.protectHint')} checked={protect} onChange={setProtect} disabled={busy} />
        {protect ? (
          <>
            <Field label={t('backup.exportDialog.password')} hint={t('backup.exportDialog.passwordHint', { min: MIN_BACKUP_PASSWORD })} error={tried && problem === 'too_short' ? t('backup.exportDialog.tooShort', { min: MIN_BACKUP_PASSWORD }) : undefined}>
              {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" autoFocus value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            <Field label={t('backup.exportDialog.confirm')} error={tried && problem === 'mismatch' ? t('backup.exportDialog.mismatch') : undefined}>
              {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={confirm} disabled={busy} onChange={(e) => setConfirm(e.target.value)} />}
            </Field>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl bg-warning/10 p-4 leading-relaxed text-fg ring-1 ring-warning/30">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <p>{t('backup.exportDialog.plainWarning')}</p>
          </div>
        )}
      </form>
    </Dialog>
  );
}

/**
 * Abrir um backup protegido: pede a senha e devolve o texto do backup aberto.
 * Senha errada mostra o erro aqui e nada é restaurado.
 */
export function UnlockBackupDialog({ text, source, onUnlocked, onClose }: { text: string; source: string; onUnlocked: (plain: string) => void; onClose: () => void }) {
  const { t } = useSettings();
  const formId = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<DecryptProblem | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!password) {
      setError('wrong_password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await decryptBackupText(text, password);
      if (r.ok) {
        onUnlocked(r.text);
        return;
      }
      setError(r.problem);
    } catch {
      setError('bad_envelope');
    }
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      closeLabel={t('common.cancel')}
      title={t('backup.unlock.title')}
      description={source}
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" icon={<Lock className="h-4 w-4" />} loading={busy}>
            {t('backup.unlock.open')}
          </Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4 text-sm" onSubmit={(e) => void submit(e)} noValidate>
        <p className="leading-relaxed text-muted">{t('backup.unlock.hint')}</p>
        <Field label={t('backup.unlock.password')} error={error ? t(`backup.unlock.problems.${error}`) : undefined}>
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              aria-invalid={error ? true : undefined}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              disabled={busy}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
