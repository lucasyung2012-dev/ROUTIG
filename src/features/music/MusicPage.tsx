import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Guitar, Plus, RotateCcw } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createInstrument, MusicRuleError, restoreInstrument } from '@/data/musicRepo';
import { addDays, diffDays, todayKey } from '@/domain/dates';
import { GUITAR_PRESET } from '@/domain/music';
import { Button } from '@/ui/Button';
import { ColorPicker, PALETTE } from '@/ui/ColorPicker';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { useMusic } from './useMusic';

/** Música (Parte 11): só aparecem os instrumentos adicionados; o violão vem primeiro. */
export function MusicPage() {
  const { t } = useSettings();
  const toast = useToast();
  const data = useMusic();
  const [adding, setAdding] = useState(false);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={4} />;
  const weekAgo = addDays(todayKey(), -6);
  const hasGuitar = data.instruments.some((i) => i.kind === 'guitar');

  const addGuitar = async () => {
    try {
      await createInstrument({ ...GUITAR_PRESET, startedOn: null, notes: '' });
      toast.show(t('music.instrumentAdded'));
    } catch (e) {
      toast.show(e instanceof MusicRuleError && e.code === 'duplicate' ? t('music.errors.duplicateInstrument') : t('music.errors.invalid'), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('modules.music')}
        title={t('modules.music')}
        description={t('moduleSummary.music')}
        icon={<Guitar className="h-7 w-7" aria-hidden />}
        actions={
          data.instruments.length > 0 && (
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              {t('music.addInstrument')}
            </Button>
          )
        }
      />

      {data.instruments.length === 0 ? (
        <Surface tone="flat">
          <EmptyState
            icon={<Guitar className="h-6 w-6" />}
            title={t('music.emptyTitle')}
            body={t('music.empty')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<Guitar className="h-4 w-4" />} onClick={() => void addGuitar()}>
                  {t('music.addGuitar')}
                </Button>
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                  {t('music.addOther')}
                </Button>
              </div>
            }
          />
        </Surface>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.instruments.map((ins) => {
            const week = data.practiceOf(ins.id).filter((p) => p.date >= weekAgo);
            const songs = data.songsOf(ins.id);
            const learning = songs.filter((s) => s.status === 'learning' || s.status === 'reviewing').length;
            const mastered = songs.filter((s) => s.status === 'mastered').length;
            const last = data.practiceOf(ins.id)[0];
            return (
              <li key={ins.id}>
                <Link to={`/music/${ins.id}`} className="flex h-full flex-col gap-3 rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-soft" style={{ background: ins.color }}>
                      <Guitar className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold text-fg">{ins.name}</div>
                      <div className="text-xs text-muted">{last ? t('music.lastPractice', { days: Math.max(0, diffDays(todayKey(), last.date)) }) : t('music.noPractice')}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xl font-semibold tabular text-fg">{week.reduce((a, p) => a + p.durationMin, 0)}</div>
                      <div className="text-[0.6875rem] text-muted">{t('music.stats.weekMin')}</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold tabular text-fg">{learning}</div>
                      <div className="text-[0.6875rem] text-muted">{t('music.stats.learning')}</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold tabular text-fg">{mastered}</div>
                      <div className="text-[0.6875rem] text-muted">{t('music.stats.mastered')}</div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {data.instruments.length > 0 && !hasGuitar && (
        <Button variant="ghost" size="sm" className="w-fit" icon={<Guitar className="h-4 w-4" />} onClick={() => void addGuitar()}>
          {t('music.addGuitar')}
        </Button>
      )}

      {data.trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg">{t('music.trash')}</h2>
          {data.trash.map((i) => (
            <div key={i.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{i.name}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreInstrument(i.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}

      {adding && <AddInstrumentDialog onClose={() => setAdding(false)} used={data.instruments.length} />}
    </div>
  );
}

function AddInstrumentDialog({ onClose, used }: { onClose: () => void; used: number }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState('');
  const [tuning, setTuning] = useState('');
  const [strings, setStrings] = useState(0);
  const [color, setColor] = useState<string>(PALETTE[(used + 9) % PALETTE.length]!);
  const save = async () => {
    try {
      await createInstrument({ name, kind: 'other', color, tuning, strings, startedOn: null, notes: '' });
      toast.show(t('music.instrumentAdded'));
      onClose();
    } catch (e) {
      toast.show(e instanceof MusicRuleError && e.code === 'duplicate' ? t('music.errors.duplicateInstrument') : t('music.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('music.addInstrument')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('music.fields.instrumentName')}>{(id) => <Input id={id} autoFocus value={name} maxLength={80} placeholder={t('music.instrumentPlaceholder')} onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('music.fields.tuning')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} value={tuning} maxLength={60} placeholder="E A D G" onChange={(e) => setTuning(e.target.value)} />}
          </Field>
          <Field label={t('music.fields.strings')} hint={t('music.stringsHint')}>
            {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="numeric" min={0} max={12} value={strings} onChange={(e) => setStrings(Math.max(0, Math.min(12, Math.round(Number(e.target.value) || 0))))} />}
          </Field>
        </div>
        <ColorPicker value={color} onChange={setColor} label={t('music.fields.color')} showLabel />
      </div>
    </Dialog>
  );
}
