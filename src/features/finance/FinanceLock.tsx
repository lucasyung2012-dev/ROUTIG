import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { checkFinancePin, hasFinancePin, removeFinancePin, setFinancePin } from '@/data/financePlanRepo';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';

/** Desbloqueado até recarregar o app ou bloquear de novo. */
let unlocked = false;

/** Controle de acesso de Finanças (Parte 16.8): um PIN opcional, só deste aparelho. */
export function FinanceLock({ children }: { children: ReactNode }) {
  const { t } = useSettings();
  const [state, setState] = useState<'checking' | 'locked' | 'open'>(unlocked ? 'open' : 'checking');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [forgot, setForgot] = useState(false);
  useEffect(() => {
    if (unlocked) return;
    void hasFinancePin().then((has) => setState(has ? 'locked' : 'open'));
  }, []);
  if (state === 'checking') return <LoadingState label={t('common.loading')} lines={3} />;
  if (state === 'open') return <>{children}</>;
  const tryPin = async () => {
    if (await checkFinancePin(pin)) {
      unlocked = true;
      setState('open');
    } else {
      setError(true);
      setPin('');
    }
  };
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pt-10">
      <Surface className="flex flex-col items-center gap-4 py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Lock className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold text-fg">{t('finance.lock.title')}</h1>
        <form
          className="flex w-full flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void tryPin();
          }}
        >
          <Field label={t('finance.lock.pin')} error={error ? t('finance.lock.wrong') : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} autoFocus type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => (setPin(e.target.value.replace(/\D/g, '')), setError(false))} className="text-center text-2xl tracking-[0.5em]" />}
          </Field>
          <Button type="submit" variant="primary" disabled={pin.length < 4}>
            {t('finance.lock.unlock')}
          </Button>
        </form>
        <button type="button" className="text-sm text-muted hover:text-fg" onClick={() => setForgot(true)}>
          {t('finance.lock.forgot')}
        </button>
      </Surface>
      <ConfirmDialog
        open={forgot}
        title={t('finance.lock.forgotTitle')}
        body={t('finance.lock.forgotBody')}
        confirmLabel={t('finance.lock.removePin')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setForgot(false)}
        onConfirm={() => {
          setForgot(false);
          void removeFinancePin().then(() => {
            unlocked = true;
            setState('open');
          });
        }}
      />
    </div>
  );
}

/** Bloqueia de novo agora (sem precisar recarregar). */
export function lockFinanceNow() {
  unlocked = false;
}

/** Definir, trocar ou remover o PIN. */
export function PinDialog({ onClose, onLocked }: { onClose: () => void; onLocked: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [has, setHas] = useState<boolean | null>(null);
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  useEffect(() => {
    void hasFinancePin().then(setHas);
  }, []);
  const save = async () => {
    if (has && !(await checkFinancePin(current))) return toast.show(t('finance.lock.wrong'), 'error');
    if (!/^\d{4,8}$/.test(pin)) return toast.show(t('finance.lock.rule'), 'error');
    if (pin !== again) return toast.show(t('finance.lock.mismatch'), 'error');
    await setFinancePin(pin);
    toast.show(t('finance.lock.saved'));
    onClose();
  };
  const remove = async () => {
    if (!(await checkFinancePin(current))) return toast.show(t('finance.lock.wrong'), 'error');
    await removeFinancePin();
    toast.show(t('finance.lock.removed'));
    onClose();
  };
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);
  if (has === null) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={has ? t('finance.lock.change') : t('finance.lock.set')}
      description={t('finance.lock.hint')}
      footer={
        <>
          {has && (
            <>
              <Button variant="ghost" className="mr-auto" onClick={() => (lockFinanceNow(), onLocked(), onClose())}>
                {t('finance.lock.lockNow')}
              </Button>
              <Button variant="danger" onClick={() => void remove()} disabled={current.length < 4}>
                {t('finance.lock.removePin')}
              </Button>
            </>
          )}
          <Button variant="primary" onClick={() => void save()} disabled={pin.length < 4 || (has === true && current.length < 4)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {has && <Field label={t('finance.lock.current')}>{(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(digits(e.target.value))} />}</Field>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('finance.lock.newPin')}>{(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(digits(e.target.value))} />}</Field>
          <Field label={t('finance.lock.repeat')}>{(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="off" value={again} onChange={(e) => setAgain(digits(e.target.value))} />}</Field>
        </div>
      </div>
    </Dialog>
  );
}
