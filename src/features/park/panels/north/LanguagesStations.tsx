import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play, Plus, Shuffle, Sparkles, Volume2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createLanguages, createVocab, LanguageRuleError, saveLanguageSession } from '@/data/languagesRepo';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import { emptyVocabInput, LANGUAGE_ACTIVITIES, LANGUAGE_PRESETS, sessionStats, SKILLS, type Language, type LanguageActivity } from '@/domain/languages';
import { LanguageReviewSession } from '@/features/languages/ReviewsTab';
import { useLanguages, type LanguagesData } from '@/features/languages/useLanguages';
import { useVocab } from '@/features/languages/VocabTab';
import { canSpeak, displayTerm, speak, speakTextOf } from '@/features/languages/vocabUtils';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { ControlRoomLink, Empty, Pane, Station, useStationState } from './station';
import { grammarToReview, withPronunciation } from './stationData';

/** Estações do Centro Internacional de Idiomas: os idiomas, sessões, vocabulário e revisões reais de Idiomas. */
export type LanguagesStationId = 'garden' | 'spaces';

/**
 * `zone`: a sala do andar que abriu a estação. O mural de gramática ('grammar') e as cabines
 * ('booths') abrem a estação própria delas: a gramática para revisar e a lista de pronúncia.
 */
export function LanguagesStation({ id, zone = null }: { id: LanguagesStationId; zone?: string | null }) {
  const { t } = useSettings();
  const toast = useToast();
  const data = useLanguages();
  // O idioma escolhido vale para o jardim e para os espaços, e continua escolhido ao voltar.
  const [currentId, setCurrentId] = useStationState<string | null>('languages.current', null);
  const label = t(`park.languages.sectors.${id}`);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={3} />;
  const current = data.languages.find((l) => l.id === currentId) ?? data.languages.find((l) => !l.native) ?? data.languages[0];

  if (data.languages.length === 0)
    return (
      <Station building="languages" label={label}>
        <Empty>{t('park.languages.none')}</Empty>
        <Button
          variant="primary"
          size="sm"
          className="w-fit"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={() => void createLanguages(LANGUAGE_PRESETS).then((n) => toast.show(t('languages.presetsAdded', { count: n })), () => toast.show(t('errors.saveFailed'), 'error'))}
        >
          {t('languages.addPresets')}
        </Button>
        <ControlRoomLink to="/languages" />
      </Station>
    );

  const room = current && (zone === 'grammar' || zone === 'booths') ? zone : null;
  return (
    <Station building="languages" label={label}>
      {room && current ? (
        <>
          <LangPicker data={data} lang={current} onPick={setCurrentId} />
          {room === 'grammar' ? <GrammarDesk key={current.id} lang={current} /> : <PronunciationDesk key={current.id} lang={current} />}
        </>
      ) : id === 'garden' ? (
        <Garden data={data} current={current} onPick={setCurrentId} />
      ) : (
        current && <Spaces data={data} lang={current} onPick={setCurrentId} />
      )}
      {current && room !== 'grammar' && <LogSession lang={current} />}
      <ControlRoomLink to={current ? `/languages/${current.id}` : '/languages'} />
    </Station>
  );
}

/* ---------- Mural de gramática: as regras do idioma para revisar hoje ---------- */

function GrammarDesk({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const [session, setSession] = useState<{ manual: boolean } | null>(null);
  const rules = useLiveQuery(() => getDb().grammarRules.where('languageId').equals(lang.id).toArray(), [lang.id]);
  if (!rules) return <LoadingState label={t('common.loading')} lines={2} />;
  const { due, fresh } = grammarToReview(rules, todayKey());
  const total = rules.filter((g) => !g.deletedAt).length;
  const list = [...due, ...fresh].slice(0, 8);
  return (
    <Pane title={t('park.native.north.languages.grammarDue')}>
      {total === 0 ? (
        <Empty>{t('park.native.north.languages.grammarNone')}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{t('park.native.north.languages.grammarRules', { count: total })}</Badge>
            {due.length > 0 && <Badge tone="warning">{t('academy.review.dueCount', { count: due.length })}</Badge>}
            {fresh.length > 0 && <Badge tone="info">{t('academy.review.newCount', { count: fresh.length })}</Badge>}
          </div>
          {list.length === 0 ? (
            <Empty>{t('park.native.north.languages.grammarNoneDue')}</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {list.map((g) => (
                <li key={g.id} className="flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 ring-1 ring-inset ring-line/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{g.title}</span>
                    {(g.topic || g.level) && <span className="block truncate text-xs text-muted">{[g.topic, g.level].filter(Boolean).join(' · ')}</span>}
                  </span>
                  {g.srs.due === null ? <Badge tone="info">{t('park.native.north.languages.isNew')}</Badge> : <Badge tone="warning">{t('park.native.north.languages.isDue')}</Badge>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={<Play className="h-4 w-4" />} disabled={due.length === 0 && fresh.length === 0} onClick={() => setSession({ manual: false })}>
              {t('academy.review.review')}
            </Button>
            <Button size="sm" variant="secondary" icon={<Shuffle className="h-4 w-4" />} onClick={() => setSession({ manual: true })}>
              {t('academy.review.practice')}
            </Button>
          </div>
        </>
      )}
      {session && <LanguageReviewSession lang={lang} deck={{ kind: 'grammar' }} manual={session.manual} direction="forward" onClose={() => setSession(null)} />}
    </Pane>
  );
}

/* ---------- Cabines de pronúncia: as palavras com a pronúncia anotada, na voz do aparelho ---------- */

function PronunciationDesk({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const { loading, list } = useVocab(lang.id);
  if (loading) return <LoadingState label={t('common.loading')} lines={2} />;
  const words = withPronunciation(list).slice(0, 12);
  const voice = canSpeak();
  return (
    <Pane title={t('park.native.north.languages.pronunciation')}>
      {words.length === 0 ? (
        <Empty>{t('park.native.north.languages.pronNone')}</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {words.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 ring-1 ring-inset ring-line/50">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{displayTerm(v)}</span>
                <span className="block truncate text-xs text-muted">{[v.pronunciation, v.translation].filter(Boolean).join(' · ')}</span>
              </span>
              {voice && <IconButton size="sm" label={t('park.native.north.languages.listenTo', { term: displayTerm(v) })} icon={<Volume2 className="h-4 w-4" />} onClick={() => speak(speakTextOf(v), lang.code)} />}
            </li>
          ))}
        </ul>
      )}
      {!voice && <p className="text-xs text-muted">{t('languages.pron.noVoice')}</p>}
      <p className="text-xs text-muted">{t('park.native.north.languages.recordElsewhere')}</p>
    </Pane>
  );
}

/* ---------- Jardim Central: um quiosque por idioma ---------- */

function Garden({ data, current, onPick }: { data: LanguagesData; current: Language | undefined; onPick: (id: string) => void }) {
  const { t } = useSettings();
  const weekAgo = addDays(todayKey(), -6);
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {data.languages.map((l) => {
        const week = sessionStats(data.sessionsOf(l.id).filter((s) => s.date >= weekAgo));
        const last = data.sessionsOf(l.id)[0];
        const on = current?.id === l.id;
        return (
          <li key={l.id}>
            <button type="button" aria-pressed={on} onClick={() => onPick(l.id)} className={cn('flex w-full flex-col gap-2 rounded-2xl p-3 text-left ring-1 ring-inset transition', on ? 'bg-surface ring-2' : 'bg-surface-2/70 ring-line/60 hover:bg-surface-3')} style={on ? { boxShadow: `inset 0 0 0 2px ${l.color}` } : undefined}>
              <span className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold uppercase text-white" style={{ background: l.color }}>
                  {(l.code || l.name).slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{l.name}</span>
                  <span className="block truncate text-xs text-muted">{last ? t('languages.lastSession', { activity: t(`languages.activities.${last.activity}`) }) : t('languages.noSessions')}</span>
                </span>
                {l.native ? <Badge tone="success">{t('languages.native')}</Badge> : <Badge tone={l.level ? 'accent' : 'neutral'}>{l.level ?? t('languages.noLevel')}</Badge>}
              </span>
              {!l.native && (
                <span className="grid grid-cols-4 gap-1.5">
                  {SKILLS.map((s) => (
                    <span key={s} className="flex flex-col gap-0.5">
                      <span className="truncate text-[0.625rem] text-muted">{t(`languages.skills.${s}`)}</span>
                      <span className="text-[0.6875rem] font-medium text-fg">{l.skills[s].level ?? '—'}</span>
                    </span>
                  ))}
                </span>
              )}
              <span className="text-xs text-muted">{t('languages.weekSummary', { min: week.total, sessions: week.sessions })}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Espaços dos Idiomas: revisão, vocabulário e sessões do idioma escolhido ---------- */

function LangPicker({ data, lang, onPick }: { data: LanguagesData; lang: Language; onPick: (id: string) => void }) {
  const { t } = useSettings();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('park.native.north.languages.pick')}>
      {data.languages.map((l) => (
        <button key={l.id} type="button" aria-pressed={l.id === lang.id} onClick={() => onPick(l.id)} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ring-inset', l.id === lang.id ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface/70 text-muted ring-line hover:text-fg')}>
          <span className="h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden />
          {l.name}
        </button>
      ))}
    </div>
  );
}

function Spaces({ data, lang, onPick }: { data: LanguagesData; lang: Language; onPick: (id: string) => void }) {
  const { t, settings } = useSettings();
  const recent = data.sessionsOf(lang.id).slice(0, 5);
  return (
    <>
      <LangPicker data={data} lang={lang} onPick={onPick} />
      <ReviewCorner key={lang.id} lang={lang} />
      <QuickVocab key={`v-${lang.id}`} lang={lang} />
      <Pane title={t('languages.recentSessions')}>
        {recent.length === 0 ? (
          <Empty>{t('languages.noSessions')}</Empty>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 text-sm ring-1 ring-inset ring-line/50">
                <span className="min-w-0 flex-1 truncate text-fg">
                  {t(`languages.activities.${s.activity}`)}
                  {s.content && <span className="text-muted"> · {s.content}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {formatDateKey(s.date, settings.locale)} · {t('languages.minutes', { min: s.durationMin })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Pane>
    </>
  );
}

function ReviewCorner({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const [session, setSession] = useState<{ manual: boolean } | null>(null);
  const [direction, setDirection] = useStationState<'forward' | 'backward'>('languages.direction', 'forward');
  const items = useLiveQuery(async () => {
    const db = getDb();
    const [vocab, grammar] = await Promise.all([db.vocab.where('languageId').equals(lang.id).filter((v) => !v.deletedAt).toArray(), db.grammarRules.where('languageId').equals(lang.id).filter((g) => !g.deletedAt).toArray()]);
    return [...vocab.map((v) => v.srs), ...grammar.map((g) => g.srs)];
  }, [lang.id]);
  if (!items) return <LoadingState label={t('common.loading')} lines={2} />;
  const today = todayKey();
  const due = items.filter((s) => s.due !== null && s.due <= today).length;
  const fresh = items.filter((s) => s.due === null).length;
  return (
    <Pane title={t('languages.tabs.reviews')}>
      {items.length === 0 ? (
        <Empty>{t('languages.reviews.empty')}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{t('academy.review.cards', { count: items.length })}</Badge>
            {due > 0 && <Badge tone="warning">{t('academy.review.dueCount', { count: due })}</Badge>}
            {fresh > 0 && <Badge tone="info">{t('academy.review.newCount', { count: fresh })}</Badge>}
          </div>
          <Select aria-label={t('languages.vocab.direction')} value={direction} onChange={(e) => setDirection(e.target.value as 'forward' | 'backward')}>
            <option value="forward">{t('languages.vocab.forward', { lang: lang.name })}</option>
            <option value="backward">{t('languages.vocab.backward', { lang: lang.name })}</option>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={<Play className="h-4 w-4" />} disabled={due === 0 && fresh === 0} onClick={() => setSession({ manual: false })}>
              {t('academy.review.review')}
            </Button>
            <Button size="sm" variant="secondary" icon={<Shuffle className="h-4 w-4" />} onClick={() => setSession({ manual: true })}>
              {t('academy.review.practice')}
            </Button>
          </div>
        </>
      )}
      {session && <LanguageReviewSession lang={lang} deck={{ kind: 'all' }} manual={session.manual} direction={direction} onClose={() => setSession(null)} />}
    </Pane>
  );
}

function QuickVocab({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const add = async () => {
    try {
      await createVocab({ ...emptyVocabInput(lang.id, lang.profile), term, translation });
      setTerm('');
      setTranslation('');
      toast.show(t('park.native.north.languages.wordAdded'));
    } catch (e) {
      toast.show(e instanceof LanguageRuleError && e.code === 'duplicate' ? t('languages.vocab.duplicate') : t('languages.vocab.invalid'), 'error');
    }
  };
  return (
    <Pane title={t('languages.vocab.new')}>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (term.trim() && translation.trim()) void add();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label={t('languages.vocab.term')} placeholder={t('languages.vocab.term')} value={term} maxLength={300} onChange={(e) => setTerm(e.target.value)} />
          <Input aria-label={t('languages.vocab.translation')} placeholder={t('languages.vocab.translation')} value={translation} maxLength={500} onChange={(e) => setTranslation(e.target.value)} />
        </div>
        <Button type="submit" size="sm" variant="secondary" className="w-fit" icon={<Plus className="h-4 w-4" />} disabled={!term.trim() || !translation.trim()}>
          {t('park.native.north.add')}
        </Button>
      </form>
    </Pane>
  );
}

/* ---------- Registrar sessão (mesa de conversação, cabines…) ---------- */

function LogSession({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const toast = useToast();
  const [activity, setActivity] = useStationState<LanguageActivity>('languages.activity', 'conversation');
  const [minutes, setMinutes] = useState(20);
  const [content, setContent] = useState('');
  const save = async () => {
    try {
      await saveLanguageSession(null, { languageId: lang.id, date: todayKey(), activity, durationMin: minutes, content: content.trim(), difficulties: '', result: '', notes: '', noteIds: [] });
      setContent('');
      toast.show(t('park.native.north.languages.sessionLogged', { name: lang.name }));
    } catch {
      toast.show(t('academy.errors.invalid'), 'error');
    }
  };
  return (
    <Pane title={`${t('languages.newSession')} · ${lang.name}`}>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label={t('languages.activity')} value={activity} onChange={(e) => setActivity(e.target.value as LanguageActivity)}>
          {LANGUAGE_ACTIVITIES.map((a) => (
            <option key={a} value={a}>
              {t(`languages.activities.${a}`)}
            </option>
          ))}
        </Select>
        <Input aria-label={t('park.native.north.minutes')} type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(600, Math.round(Number(e.target.value)) || 1)))} />
      </div>
      <Input aria-label={t('languages.content')} placeholder={t('languages.contentPlaceholder')} value={content} maxLength={2000} onChange={(e) => setContent(e.target.value)} />
      <Button size="sm" variant="primary" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={() => void save()}>
        {t('park.native.north.languages.logToday')}
      </Button>
    </Pane>
  );
}
