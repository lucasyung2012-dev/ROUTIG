import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createSport, createSports, restoreSport, SportRuleError } from '@/data/sportsRepo';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import { SPORT_PRESETS, sportStats } from '@/domain/sports';
import { Button } from '@/ui/Button';
import { ColorPicker, PALETTE } from '@/ui/ColorPicker';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { useSports } from './useSports';

/** Esportes (Parte 12): habilidade, experiência e evolução técnica; nada de controle do corpo (Parte 12.4). */
export function SportsPage() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const data = useSports();
  const [adding, setAdding] = useState(false);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={4} />;
  const missing = SPORT_PRESETS.filter((p) => !data.sports.some((s) => s.name.toLowerCase() === p.name.toLowerCase()));
  const addPresets = async () => {
    const n = await createSports(missing.map((p) => ({ ...p, notes: '' })));
    toast.show(t('sports.presetsAdded', { count: n }));
  };
  const monthAgo = addDays(todayKey(), -29);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('modules.sports')}
        title={t('modules.sports')}
        description={t('moduleSummary.sports')}
        icon={<Trophy className="h-7 w-7" aria-hidden />}
        actions={
          data.sports.length > 0 && (
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              {t('sports.addSport')}
            </Button>
          )
        }
      />
      {data.sports.length === 0 ? (
        <Surface tone="flat">
          <EmptyState
            icon={<Trophy className="h-6 w-6" />}
            title={t('sports.emptyTitle')}
            body={t('sports.empty')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={() => void addPresets()}>
                  {t('sports.addPresets')}
                </Button>
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                  {t('sports.addOther')}
                </Button>
              </div>
            }
          />
        </Surface>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.sports.map((s) => {
            const acts = data.activitiesOf(s.id);
            const month = sportStats(acts.filter((a) => a.date >= monthAgo));
            const last = acts[0];
            return (
              <li key={s.id}>
                <Link to={`/sports/${s.id}`} className="flex h-full flex-col gap-3 rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-soft" style={{ background: s.color }}>
                      <Trophy className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold text-fg">{s.name}</div>
                      <div className="text-xs text-muted">{last ? t('sports.lastActivity', { type: t(`sports.types.${last.type}`), date: formatDateKey(last.date, settings.locale) }) : t('sports.noActivities')}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xl font-semibold tabular text-fg">{month.byType.training}</div>
                      <div className="text-[0.6875rem] text-muted">{t('sports.stats.trainings30')}</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold tabular text-fg">{month.byType.match + month.byType.tournament}</div>
                      <div className="text-[0.6875rem] text-muted">{t('sports.stats.matches30')}</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold tabular text-fg">{month.minutes}</div>
                      <div className="text-[0.6875rem] text-muted">{t('sports.stats.minutes30')}</div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {data.sports.length > 0 && missing.length > 0 && (
        <Button variant="ghost" size="sm" className="w-fit" icon={<Sparkles className="h-4 w-4" />} onClick={() => void addPresets()}>
          {t('sports.addMissing', { names: missing.map((m) => m.name).join(', ') })}
        </Button>
      )}
      {data.trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg">{t('sports.trash')}</h2>
          {data.trash.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreSport(s.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}
      {adding && <AddSportDialog used={data.sports.length} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddSportDialog({ used, onClose }: { used: number; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PALETTE[(used + 7) % PALETTE.length]!);
  const save = async () => {
    try {
      const preset = SPORT_PRESETS.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
      await createSport({ name, kind: preset?.kind ?? 'other', color, notes: '' });
      toast.show(t('sports.added'));
      onClose();
    } catch (e) {
      toast.show(e instanceof SportRuleError && e.code === 'duplicate' ? t('sports.errors.duplicateSport') : t('sports.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('sports.addSport')}
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
        <Field label={t('sports.fields.sportName')}>{(id) => <Input id={id} autoFocus value={name} maxLength={80} placeholder={t('sports.sportPlaceholder')} onChange={(e) => setName(e.target.value)} />}</Field>
        <ColorPicker value={color} onChange={setColor} label={t('sports.fields.color')} showLabel />
      </div>
    </Dialog>
  );
}
