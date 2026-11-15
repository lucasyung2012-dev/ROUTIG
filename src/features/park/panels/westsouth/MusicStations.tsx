import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Guitar, ListPlus, Plus, Timer } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createInstrument, MusicRuleError, savePractice, updateSong } from '@/data/musicRepo';
import { addDays, diffDays, formatDateKey, todayKey } from '@/domain/dates';
import { inRange, musicInsights } from '@/domain/insights';
import { emptyPracticeInput, GUITAR_PRESET, SONG_STATUSES, songInputOf, type Instrument, type Song, type SongStatus } from '@/domain/music';
import { useFocus } from '@/features/focus/FocusProvider';
import { ChordSheetView, PracticeDialog } from '@/features/music/musicUi';
import { useMusic, type MusicData } from '@/features/music/useMusic';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Field';
import { useToast } from '@/ui/toast';
import { PeriodSwitch, Readout, Row, Screen, SectionTitle, Station, usePeriodRange, type Period } from './station';

/*
 * Conservatório Musical: instrumentos, repertório e práticas do Control Room (useMusic + musicRepo).
 * O piano, a bateria e o violão do salão são interações 3D próprias do edifício (ParkPage) e não
 * passam por aqui. Nenhum número é estimado: minutos e sessões vêm das práticas registradas.
 */

function useInstrumentPick(data: MusicData) {
  const [picked, setPicked] = useState('');
  const ins = data.instruments.find((i) => i.id === picked) ?? data.instruments[0];
  return [ins, setPicked] as const;
}

function InstrumentSelect({ data, value, onChange }: { data: MusicData; value: string; onChange: (id: string) => void }) {
  const { t } = useSettings();
  if (data.instruments.length < 2) return null;
  return (
    <Select aria-label={t('park.native.westsouth.music.instrument')} value={value} onChange={(e) => onChange(e.target.value)}>
      {data.instruments.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </Select>
  );
}

function NoInstruments() {
  const { t } = useSettings();
  const toast = useToast();
  const addGuitar = async () => {
    try {
      await createInstrument({ ...GUITAR_PRESET, startedOn: null, notes: '' });
      toast.show(t('music.instrumentAdded'));
    } catch (e) {
      toast.show(e instanceof MusicRuleError && e.code === 'duplicate' ? t('music.errors.duplicateInstrument') : t('music.errors.invalid'), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-fg">{t('music.emptyTitle')}</p>
      <p className="text-sm text-muted">{t('music.empty')}</p>
      <Button variant="primary" size="sm" className="self-start" icon={<Guitar className="h-4 w-4" />} onClick={() => void addGuitar()}>
        {t('music.addGuitar')}
      </Button>
    </div>
  );
}

/* ---------- Átrio: instrumentos e registro rápido de prática ---------- */

export function MusicAtriumStation() {
  const { t } = useSettings();
  const toast = useToast();
  const data = useMusic();
  const [ins, setPicked] = useInstrumentPick(data);
  const [min, setMin] = useState(30);
  const [practiced, setPracticed] = useState('');
  const [full, setFull] = useState<Instrument | null>(null);
  const today = todayKey();
  const weekAgo = addDays(today, -6);

  const save = async () => {
    if (!ins) return;
    try {
      await savePractice(null, { ...emptyPracticeInput(ins.id, today), durationMin: min, practiced: practiced.trim() });
      toast.show(t('music.practiceSaved', { min }));
      setPracticed('');
    } catch {
      toast.show(t('music.errors.invalid'), 'error');
    }
  };

  return (
    <Station building="music" name={t('park.native.westsouth.music.station')} hint={t('park.native.westsouth.music.instrumentsHint')}>
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : !ins ? (
        <NoInstruments />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {data.instruments.map((i) => {
              const practice = data.practiceOf(i.id);
              const songs = data.songsOf(i.id);
              const last = practice[0];
              return (
                <Row key={i.id} color={i.color}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">{i.name}</div>
                    <div className="text-xs text-muted">{last ? t('music.lastPractice', { days: Math.max(0, diffDays(today, last.date)) }) : t('music.noPractice')}</div>
                  </div>
                  <div className="grid shrink-0 grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-sm font-semibold tabular-nums text-fg">{practice.filter((p) => p.date >= weekAgo).reduce((a, p) => a + p.durationMin, 0)}</div>
                      <div className="text-[0.625rem] text-muted">{t('music.stats.weekMin')}</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular-nums text-fg">{songs.filter((s) => s.status === 'learning' || s.status === 'reviewing').length}</div>
                      <div className="text-[0.625rem] text-muted">{t('music.stats.learning')}</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular-nums text-fg">{songs.filter((s) => s.status === 'mastered').length}</div>
                      <div className="text-[0.625rem] text-muted">{t('music.stats.mastered')}</div>
                    </div>
                  </div>
                </Row>
              );
            })}
          </ul>

          <SectionTitle>{t('music.newPractice')}</SectionTitle>
          <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
            <InstrumentSelect data={data} value={ins.id} onChange={setPicked} />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('music.fields.duration')}>
              {[15, 30, 45, 60].map((m) => (
                <Button key={m} size="sm" variant={min === m ? 'primary' : 'secondary'} aria-pressed={min === m} onClick={() => setMin(m)}>
                  {t('focus.min', { min: m })}
                </Button>
              ))}
              <Input aria-label={t('music.fields.duration')} type="number" inputMode="numeric" min={1} max={1440} value={min} onChange={(e) => setMin(Math.max(1, Math.min(1440, Math.round(Number(e.target.value) || 1))))} className="h-9 w-20" />
            </div>
            <Field label={t('music.fields.practiced')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} value={practiced} maxLength={10000} placeholder={t('music.practicedPlaceholder')} onChange={(e) => setPracticed(e.target.value)} />}
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" icon={<ListPlus className="h-4 w-4" />} onClick={() => setFull(ins)}>
                {t('park.native.westsouth.music.fullForm')}
              </Button>
              <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => void save()}>
                {t('park.native.westsouth.music.logPractice', { name: ins.name, min })}
              </Button>
            </div>
          </div>
        </>
      )}
      {full && <PracticeDialog instrument={full} songs={data.songsOf(full.id)} items={data.itemsOf(full.id)} onClose={() => setFull(null)} />}
    </Station>
  );
}

/* ---------- Espaços dos instrumentos: repertório em andamento e prática ---------- */

export function MusicInstrumentsStation() {
  const { t } = useSettings();
  const toast = useToast();
  const data = useMusic();
  const focus = useFocus();
  const [ins, setPicked] = useInstrumentPick(data);
  const [reading, setReading] = useState<Song | null>(null);
  const [practice, setPractice] = useState(false);

  if (data.loading)
    return (
      <Station building="music" name={t('park.native.westsouth.music.roomsStation')}>
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </Station>
    );
  if (!ins)
    return (
      <Station building="music" name={t('park.native.westsouth.music.roomsStation')}>
        <NoInstruments />
      </Station>
    );

  const songs = data.songsOf(ins.id).filter((s) => s.status !== 'archived' && s.status !== 'mastered');
  const setStatus = (s: Song, status: SongStatus) =>
    void updateSong(s.id, { ...songInputOf(s), status }).then(
      () => toast.show(t('music.saved')),
      () => toast.show(t('music.errors.invalid'), 'error'),
    );

  return (
    <Station building="music" name={t('park.native.westsouth.music.roomsStation')} to={`/music/${ins.id}`}>
      <InstrumentSelect data={data} value={ins.id} onChange={setPicked} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setPractice(true)}>
          {t('music.newPractice')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Timer className="h-4 w-4" />}
          disabled={!focus.ready || !!focus.timer}
          onClick={() => {
            focus.start({ mode: 'continuous', kind: 'music', taskId: null, ref: { type: 'instrument', id: ins.id }, environment: 'minimal', sound: 'none' });
            toast.show(t('park.native.westsouth.music.focusStarted', { name: ins.name }));
          }}
        >
          {t('music.useFocus')}
        </Button>
      </div>
      {focus.timer && <p className="text-xs text-muted">{t('park.native.westsouth.music.focusRunning')}</p>}

      <SectionTitle>{t('music.inProgress')}</SectionTitle>
      {songs.length === 0 ? (
        <p className="text-sm text-muted">{t('park.native.westsouth.music.noSongs')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {songs.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">{s.name}</div>
                {(s.artist || s.chords.length > 0) && <div className="truncate text-xs text-muted">{[s.artist, s.chords.join(' ')].filter(Boolean).join(' · ')}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select aria-label={`${t('park.native.westsouth.music.songStatus')}: ${s.name}`} value={s.status} onChange={(e) => setStatus(s, e.target.value as SongStatus)} className="h-9 w-auto">
                  {SONG_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {t(`music.songStatuses.${st}`)}
                    </option>
                  ))}
                </Select>
                {s.chordSheet.trim() && (
                  <Button size="sm" variant="ghost" icon={<BookOpen className="h-4 w-4" />} onClick={() => setReading(s)}>
                    {t('music.readSheet')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {reading && <ChordSheetView song={reading} onClose={() => setReading(null)} />}
      {practice && <PracticeDialog instrument={ins} songs={data.songsOf(ins.id)} items={data.itemsOf(ins.id)} onClose={() => setPractice(false)} />}
    </Station>
  );
}

/* ---------- Estudo musical: análise das práticas registradas ---------- */

export function MusicAnalysisStation() {
  const { t, settings } = useSettings();
  const data = useMusic();
  const [period, setPeriod] = useState<Period>('week');
  const range = usePeriodRange(period);
  const changes = useLiveQuery(() => getDb().changelog.where('entityType').equals('song').toArray(), []);
  const practice = data.instruments.flatMap((i) => data.practiceOf(i.id));
  const songs = data.instruments.flatMap((i) => data.songsOf(i.id));
  const ins = musicInsights(data.instruments, practice, songs, changes ?? [], range);
  const inPeriod = practice.filter((p) => inRange(p.date, range)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <Station building="music" name={t('park.native.westsouth.music.analysisStation')}>
      <PeriodSwitch value={period} onChange={setPeriod} />
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : !ins.has ? (
        <NoInstruments />
      ) : (
        <>
          <Screen building="music" className="grid grid-cols-3 gap-2">
            <Readout value={ins.minutes} label={t('park.native.westsouth.music.minutes')} />
            <Readout value={ins.sessions} label={t('music.stats.sessions')} />
            <Readout value={ins.masteredInPeriod} label={t('park.native.westsouth.music.masteredInPeriod')} />
          </Screen>
          <p className="text-xs text-muted">{t('park.native.westsouth.music.repertoire', { total: ins.repertoire.total, learning: ins.repertoire.learning, mastered: ins.repertoire.mastered })}</p>
          <SectionTitle>{t('park.native.westsouth.music.byInstrument')}</SectionTitle>
          <ul className="flex flex-col gap-2">
            {data.instruments.map((i) => {
              const mine = inPeriod.filter((p) => p.instrumentId === i.id);
              return (
                <Row key={i.id} color={i.color}>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{i.name}</span>
                  <span className="text-xs tabular-nums text-muted">{t('park.native.westsouth.music.minSessions', { min: mine.reduce((a, p) => a + p.durationMin, 0), count: mine.length })}</span>
                </Row>
              );
            })}
          </ul>
          <SectionTitle>{t('music.recentPractice')}</SectionTitle>
          {inPeriod.length === 0 ? (
            <p className="text-sm text-muted">{t('park.native.westsouth.music.noPracticeInPeriod')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {inPeriod.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-start gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <span className="w-16 shrink-0 text-xs text-muted">{formatDateKey(p.date, settings.locale)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">
                      {data.byId.get(p.instrumentId)?.name ?? ''} · {t('focus.min', { min: p.durationMin })}
                    </span>
                    {(p.practiced || p.goal) && <span className="block line-clamp-2 text-xs text-muted">{p.practiced || p.goal}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Station>
  );
}
