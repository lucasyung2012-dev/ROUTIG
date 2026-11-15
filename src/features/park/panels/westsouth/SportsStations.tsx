import { useState } from 'react';
import { ListPlus, Plus, Sparkles } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createSports, saveActivity, saveSportItem, SportRuleError } from '@/data/sportsRepo';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import { inRange, sportsInsights } from '@/domain/insights';
import { ACTIVITY_TYPES, emptyActivityInput, OUTCOMES, SPORT_PRESETS, sportStats, type ActivityInput, type ActivityType, type Outcome, type Sport, type SportActivity, type SportItem } from '@/domain/sports';
import { ActivityDialog, Dots, SportItemDialog } from '@/features/sports/sportsUi';
import { useSports, type SportsData } from '@/features/sports/useSports';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { PeriodSwitch, Readout, Row, Screen, SectionTitle, Station, usePeriodRange, type Period } from './station';

/*
 * Centro Esportivo: esportes, atividades e técnicas do Control Room (useSports + sportsRepo). Sem
 * métricas de corpo, calorias ou desempenho inventado: só o que foi registrado (Parte 12.4).
 */

function useSportPick(data: SportsData) {
  const [picked, setPicked] = useState('');
  const sport = data.sports.find((s) => s.id === picked) ?? data.sports[0];
  return [sport, setPicked] as const;
}

function SportSelect({ data, value, onChange }: { data: SportsData; value: string; onChange: (id: string) => void }) {
  const { t } = useSettings();
  if (data.sports.length < 2) return null;
  return (
    <Select aria-label={t('sports.fields.sportName')} value={value} onChange={(e) => onChange(e.target.value)}>
      {data.sports.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

function NoSports({ data }: { data: SportsData }) {
  const { t } = useSettings();
  const toast = useToast();
  const missing = SPORT_PRESETS.filter((p) => !data.sports.some((s) => s.name.toLowerCase() === p.name.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-fg">{t('sports.emptyTitle')}</p>
      <p className="text-sm text-muted">{t('sports.empty')}</p>
      {missing.length > 0 && (
        <Button
          variant="primary"
          size="sm"
          className="self-start"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={() =>
            void createSports(missing.map((p) => ({ ...p, notes: '' }))).then(
              (n) => toast.show(t('sports.presetsAdded', { count: n })),
              () => toast.show(t('sports.errors.invalid'), 'error'),
            )
          }
        >
          {t('sports.addPresets')}
        </Button>
      )}
    </div>
  );
}

function ActivityLine({ a, sport }: { a: SportActivity; sport: Sport | undefined }) {
  const { t, settings } = useSettings();
  const bits = [sport?.name, t(`sports.types.${a.type}`), a.title, a.outcome ? t(`sports.outcomes.${a.outcome}`) : '', a.score, a.durationMin ? t('focus.min', { min: a.durationMin }) : ''].filter(Boolean);
  return (
    <>
      <span className="w-16 shrink-0 text-xs text-muted">{formatDateKey(a.date, settings.locale)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{bits.join(' · ')}</span>
    </>
  );
}

/* ---------- Átrio esportivo: registro rápido de atividade ---------- */

export function SportsAtriumStation() {
  const { t } = useSettings();
  const toast = useToast();
  const data = useSports();
  const [sport, setPicked] = useSportPick(data);
  const today = todayKey();
  const [type, setType] = useState<ActivityType>('training');
  const [duration, setDuration] = useState<number | null>(60);
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [score, setScore] = useState('');
  const [opponent, setOpponent] = useState('');
  const [dialog, setDialog] = useState<{ sport: Sport; activity?: SportActivity; type?: ActivityType } | null>(null);
  const competitive = type === 'match' || type === 'tournament';
  const recent = data.sports.flatMap((s) => data.activitiesOf(s.id)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  const save = async () => {
    if (!sport) return;
    const input: ActivityInput = { ...emptyActivityInput(sport.id, type, today), durationMin: duration, title: title.trim(), outcome: competitive ? outcome : null, score: competitive ? score.trim() : '', opponent: competitive ? opponent.trim() : '' };
    try {
      await saveActivity(null, input, today);
      toast.show(t('sports.saved'));
      setTitle('');
      setOutcome(null);
      setScore('');
      setOpponent('');
    } catch (e) {
      toast.show(e instanceof SportRuleError && e.code === 'future' ? t('sports.errors.future') : t('sports.errors.invalid'), 'error');
    }
  };

  return (
    <Station building="sports" name={t('park.native.westsouth.sports.station')} hint={t('sports.healthNote')}>
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : !sport ? (
        <NoSports data={data} />
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
            <SportSelect data={data} value={sport.id} onChange={setPicked} />
            <Segmented<ActivityType> label={t('sports.fields.type')} value={type} onChange={setType} options={ACTIVITY_TYPES.map((a) => ({ value: a, label: t(`sports.types.${a}`) }))} />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('sports.fields.duration')}>
              {[30, 60, 90].map((m) => (
                <Button key={m} size="sm" variant={duration === m ? 'primary' : 'secondary'} aria-pressed={duration === m} onClick={() => setDuration(m)}>
                  {t('focus.min', { min: m })}
                </Button>
              ))}
              <Input aria-label={t('sports.fields.duration')} type="number" inputMode="numeric" min={1} max={1440} value={duration ?? ''} placeholder="min" onChange={(e) => setDuration(e.target.value ? Math.max(1, Math.min(1440, Math.round(Number(e.target.value) || 1))) : null)} className="h-9 w-20" />
            </div>
            <Field label={type === 'training' ? t('sports.fields.trainingType') : type === 'match' ? t('sports.fields.matchTitle') : t('sports.fields.eventName')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} value={title} maxLength={120} placeholder={t(`sports.titlePlaceholder.${type}`)} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            {competitive && (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('sports.fields.outcome')}>
                  {OUTCOMES.map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={outcome === o}
                      onClick={() => setOutcome(outcome === o ? null : o)}
                      className={cn('h-9 rounded-lg px-3 text-sm font-medium ring-1 ring-inset transition', outcome === o ? (o === 'win' ? 'bg-success text-white ring-transparent' : o === 'loss' ? 'bg-danger text-white ring-transparent' : 'bg-surface-3 text-fg ring-line') : 'bg-surface text-muted ring-line')}
                    >
                      {t(`sports.outcomes.${o}`)}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('sports.fields.score')} optionalLabel={t('common.optional')}>
                    {(id) => <Input id={id} value={score} maxLength={60} onChange={(e) => setScore(e.target.value)} />}
                  </Field>
                  <Field label={t('sports.fields.opponent')} optionalLabel={t('common.optional')}>
                    {(id) => <Input id={id} value={opponent} maxLength={120} onChange={(e) => setOpponent(e.target.value)} />}
                  </Field>
                </div>
              </>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" icon={<ListPlus className="h-4 w-4" />} onClick={() => setDialog({ sport, type })}>
                {t('sports.moreDetails')}
              </Button>
              <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => void save()}>
                {t(`sports.new.${type}`)}
              </Button>
            </div>
          </div>

          <SectionTitle>{t('sports.recent')}</SectionTitle>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">{t('sports.noActivities')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recent.map((a) => {
                const s = data.byId.get(a.sportId);
                return (
                  <li key={a.id}>
                    <button type="button" className="flex w-full items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-left hover:bg-surface-3" onClick={() => s && setDialog({ sport: s, activity: a })}>
                      <ActivityLine a={a} sport={s} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {dialog && <ActivityDialog sport={dialog.sport} activity={dialog.activity} type={dialog.type} items={data.itemsOf(dialog.sport.id)} onClose={() => setDialog(null)} />}
    </Station>
  );
}

/* ---------- Pavilhão de Modalidades: cada esporte, técnicas e confiança ---------- */

export function SportsModalitiesStation() {
  const { t } = useSettings();
  const toast = useToast();
  const data = useSports();
  const [sport, setPicked] = useSportPick(data);
  const [newItem, setNewItem] = useState(false);
  const [editItem, setEditItem] = useState<SportItem | null>(null);
  const monthAgo = addDays(todayKey(), -29);

  const setConfidence = (i: SportItem, confidence: number | null) =>
    void saveSportItem(i.id, { sportId: i.sportId, category: i.category, name: i.name, confidence, difficulties: i.difficulties, notes: i.notes }).catch(() => toast.show(t('sports.errors.invalid'), 'error'));

  return (
    <Station building="sports" name={t('park.native.westsouth.sports.modalitiesStation')} to={sport ? `/sports/${sport.id}` : undefined}>
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : !sport ? (
        <NoSports data={data} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {data.sports.map((s) => {
              const st = sportStats(data.activitiesOf(s.id).filter((a) => a.date >= monthAgo));
              const decided = st.record.win + st.record.loss + st.record.draw;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={s.id === sport.id}
                    onClick={() => setPicked(s.id)}
                    className={cn('flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 ring-inset transition', s.id === sport.id ? 'bg-surface-3 ring-line' : 'bg-surface-2 ring-line/60 hover:bg-surface-3')}
                  >
                    <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{s.name}</span>
                      <span className="block text-xs text-muted">
                        {t('sports.cardLine', { trainings: st.byType.training, matches: st.byType.match + st.byType.tournament })}
                        {decided > 0 && ` · ${t('sports.recordLine', st.record)}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <SectionTitle>{t('park.native.westsouth.sports.skills', { name: sport.name })}</SectionTitle>
          {data.itemsOf(sport.id).filter((i) => i.category !== 'position').length === 0 ? (
            <p className="text-sm text-muted">{t('park.native.westsouth.sports.noSkills')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data
                .itemsOf(sport.id)
                .filter((i) => i.category !== 'position')
                .map((i) => (
                  <li key={i.id} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
                    <button type="button" className="text-left" onClick={() => setEditItem(i)}>
                      <span className="block truncate text-sm font-medium text-fg">{i.name}</span>
                      <span className="block text-xs text-muted">{t(`sports.tabs.${i.category}`)}</span>
                    </button>
                    <Dots value={i.confidence} onChange={(v) => setConfidence(i, v)} label={`${t('sports.fields.confidence')} · ${i.name}`} />
                  </li>
                ))}
            </ul>
          )}
          <Button size="sm" variant="secondary" className="self-start" icon={<Plus className="h-4 w-4" />} onClick={() => setNewItem(true)}>
            {t(`sports.newItem.${sport.kind === 'football' ? 'skill' : 'technique'}`)}
          </Button>
        </>
      )}
      {sport && newItem && <SportItemDialog sport={sport} category={sport.kind === 'football' ? 'skill' : 'technique'} onClose={() => setNewItem(false)} />}
      {sport && editItem && <SportItemDialog sport={sport} category={editItem.category} item={editItem} onClose={() => setEditItem(null)} />}
    </Station>
  );
}

/* ---------- Galeria de Análises / consulta de registros ---------- */

export function SportsAnalysisStation() {
  const { t } = useSettings();
  const data = useSports();
  const [period, setPeriod] = useState<Period>('month');
  const range = usePeriodRange(period);
  const acts = data.sports.flatMap((s) => data.activitiesOf(s.id));
  const ins = sportsInsights(data.sports, acts, range);
  const inPeriod = acts.filter((a) => inRange(a.date, range)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const decided = ins.record.win + ins.record.loss + ins.record.draw;

  return (
    <Station building="sports" name={t('park.native.westsouth.sports.analysisStation')} hint={t('sports.healthNote')}>
      <PeriodSwitch value={period} onChange={setPeriod} />
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : !ins.has ? (
        <NoSports data={data} />
      ) : (
        <>
          <Screen building="sports" className="grid grid-cols-3 gap-2">
            <Readout value={ins.activities} label={t('park.native.westsouth.sports.activities')} />
            <Readout value={ins.activeDays} label={t('park.native.westsouth.sports.activeDays')} />
            <Readout value={ins.minutes} label={t('park.native.westsouth.sports.minutes')} />
          </Screen>
          <p className="text-xs text-muted">
            {t('park.native.westsouth.sports.split', { trainings: ins.trainings, games: ins.games })}
            {decided > 0 && ` · ${t('sports.recordLine', ins.record)}`}
          </p>
          <SectionTitle>{t('park.native.westsouth.sports.inPeriod')}</SectionTitle>
          {inPeriod.length === 0 ? (
            <p className="text-sm text-muted">{t('park.native.westsouth.sports.noneInPeriod')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {inPeriod.slice(0, 12).map((a) => (
                <Row key={a.id} className="py-2">
                  <ActivityLine a={a} sport={data.byId.get(a.sportId)} />
                </Row>
              ))}
            </ul>
          )}
        </>
      )}
    </Station>
  );
}
