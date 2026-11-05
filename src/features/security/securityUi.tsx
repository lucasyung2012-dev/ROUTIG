import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Download, Lock, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { PinError, eraseAllData, loadSecurity, removeAppPin, setAppPin, setLockAfter } from '@/data/securityRepo';
import { LOCK_AFTER, isValidPin, type LockAfter } from '@/domain/security';
import { exportBackup } from '@/features/backup/exportFile';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select } from '@/ui/Field';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { useAppLock } from './AppLock';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);

/** Settings → Segurança (Parte 26.2, 26.3 e 26.5). */
export function SecuritySection() {
  const { t } = useSettings();
  const toast = useToast();
  const lock = useAppLock();
  const cfg = useLiveQuery(() => loadSecurity(), []);
  const [pinOpen, setPinOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  if (!cfg) return null;
  const has = !!cfg.pin;
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('security.app.title')}</h2>
        <p className="text-sm text-muted">{has ? t('security.app.on') : t('security.app.off')}</p>
        {has && (
          <Field label={t('security.app.after')}>
            {(id) => (
              <Select
                id={id}
                className="max-w-xs"
                value={cfg.lockAfterMin}
                onChange={(e) =>
                  void setLockAfter(Number(e.target.value) as LockAfter)
                    .then(lock.refresh)
                    .then(() => toast.show(t('security.saved')))
                }
              >
                {LOCK_AFTER.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? t('security.app.always') : t('security.app.minutes', { count: m })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant={has ? 'secondary' : 'primary'} icon={<Lock className="h-4 w-4" />} onClick={() => setPinOpen(true)}>
            {has ? t('security.app.change') : t('security.app.set')}
          </Button>
          {has && (
            <Button variant="ghost" onClick={lock.lockNow}>
              {t('security.app.lockNow')}
            </Button>
          )}
        </div>
      </Surface>

      <Surface className="flex flex-col gap-2">
        <h2 className="font-semibold text-fg">{t('security.finance.title')}</h2>
        <p className="text-sm text-muted">{t('security.finance.body')}</p>
        <Link to="/finance" className="w-fit text-sm font-medium text-accent hover:underline">
          {t('security.finance.open')}
        </Link>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('security.limits.title')}</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-fg">
          {(['protects', 'notEncrypted', 'device', 'hash', 'biometrics', 'forgot'] as const).map((k) => (
            <li key={k}>{t(`security.limits.${k}`)}</li>
          ))}
        </ul>
      </Surface>

      <Surface className="flex flex-col gap-3 ring-1 ring-inset ring-danger/40">
        <h2 className="flex items-center gap-2 font-semibold text-danger">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {t('security.erase.title')}
        </h2>
        <p className="text-sm text-muted">{t('security.erase.intro')}</p>
        <Button variant="danger" className="w-fit" icon={<Trash2 className="h-4 w-4" />} onClick={() => setEraseOpen(true)}>
          {t('security.erase.open')}
        </Button>
      </Surface>

      {pinOpen && <AppPinDialog has={has} onClose={() => setPinOpen(false)} />}
      <Dialog open={eraseOpen} onClose={() => setEraseOpen(false)} closeLabel={t('common.close')} title={t('security.erase.title')}>
        <EraseForm allowExport />
      </Dialog>
    </div>
  );
}

/** Definir, trocar ou remover o PIN do app. */
function AppPinDialog({ has, onClose }: { has: boolean; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const lock = useAppLock();
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      await lock.refresh();
      toast.show(done, 'success');
      onClose();
    } catch (e) {
      toast.show(e instanceof PinError && e.code === 'wrong' ? t('security.pin.wrong') : t('security.pin.rule'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!isValidPin(pin)) return toast.show(t('security.pin.rule'), 'error');
    if (pin !== again) return toast.show(t('security.pin.mismatch'), 'error');
    void run(() => setAppPin(pin, has ? current : undefined), t('security.pin.saved'));
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={has ? t('security.app.change') : t('security.app.set')}
      description={t('security.pin.hint')}
      footer={
        <>
          {has && (
            <Button variant="danger" className="mr-auto" disabled={current.length < 4 || busy} onClick={() => void run(() => removeAppPin(current), t('security.pin.removed'))}>
              {t('security.pin.remove')}
            </Button>
          )}
          <Button variant="primary" loading={busy} disabled={pin.length < 4 || (has && current.length < 4)} onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {has && <Field label={t('security.pin.current')}>{(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(digits(e.target.value))} />}</Field>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('security.pin.new')}>{(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(digits(e.target.value))} />}</Field>
          <Field label={t('security.pin.repeat')}>{(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="off" value={again} onChange={(e) => setAgain(digits(e.target.value))} />}</Field>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Apagar todos os dados deste aparelho, com confirmação forte: marcar que
 * entendeu e digitar a palavra. Depois, o app recomeça do zero.
 */
export function EraseForm({ allowExport }: { allowExport: boolean }) {
  const { t } = useSettings();
  const toast = useToast();
  const [understood, setUnderstood] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = understood && word.trim().toUpperCase() === t('security.erase.word');
  const erase = async () => {
    setBusy(true);
    try {
      await eraseAllData();
      window.location.hash = '#/';
      window.location.reload();
    } catch {
      setBusy(false);
      toast.show(t('security.erase.failed'), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-medium text-fg">{t('security.erase.whatGoes')}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-fg">
        {(['records', 'files', 'snapshots', 'settings'] as const).map((k) => (
          <li key={k}>{t(`security.erase.items.${k}`)}</li>
        ))}
      </ul>
      <p className="text-muted">{t('security.erase.stays')}</p>
      {allowExport && (
        <Button
          variant="secondary"
          className="w-fit"
          icon={<Download className="h-4 w-4" />}
          onClick={() => void exportBackup().then((o) => o === 'saved' && toast.show(t('security.erase.exported'), 'success'), () => toast.show(t('security.erase.exportFailed'), 'error'))}
        >
          {t('security.erase.exportFirst')}
        </Button>
      )}
      <label className="flex items-start gap-3 text-fg">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--danger))]" />
        {t('security.erase.understand')}
      </label>
      <Field label={t('security.erase.typeWord', { word: t('security.erase.word') })}>
        {(id) => <Input id={id} autoComplete="off" autoCapitalize="characters" value={word} onChange={(e) => setWord(e.target.value)} />}
      </Field>
      <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} loading={busy} disabled={!ready || busy} onClick={() => void erase()}>
        {t('security.erase.confirm')}
      </Button>
    </div>
  );
}
