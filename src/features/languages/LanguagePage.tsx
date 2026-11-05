import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, PenLine, Plus, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { languageHistory, LanguageRuleError, restoreLanguage, restoreLanguageSession, saveLanguageSession, softDeleteLanguage, softDeleteLanguageSession, updateLanguage } from '@/data/languagesRepo';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import { CEFR_LEVELS, LANGUAGE_ACTIVITIES, languageInputOf, profileForCode, SKILLS, sessionStats, type CefrLevel, type Language, type LanguageActivity, type LanguageInput, type LanguageSession, type LanguageSessionInput, type Skill } from '@/domain/languages';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ColorPicker } from '@/ui/ColorPicker';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { useLanguages, type LanguagesData } from './useLanguages';
import { GrammarTab } from './GrammarTab';
import { MaterialsTab, PronunciationTab } from './PronunciationTab';
import { ReviewsTab } from './ReviewsTab';
import { VocabTab } from './VocabTab';
import { LinkedGoals } from '@/features/goals/goalsUi';

const TABS = ['overview', 'vocab', 'grammar', 'reviews', 'skills', 'sessions', 'pronunciation', 'materials', 'history'] as const;
type Tab = (typeof TABS)[number];

export function LanguagePage() {
  const { id } = useParams();
  const { t } = useSettings();
  const data = useLanguages();
  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  const lang = id ? data.byId.get(id) : undefined;
  if (!lang || lang.deletedAt)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-muted">{t('languages.notFound')}</p>
      </div>
    );
  return <LanguageDetail key={lang.id} lang={lang} data={data} />;
}

function BackLink() {
  const { t } = useSettings();
  return (
    <Link to="/languages" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('languages.back')}
    </Link>
  );
}

/** Salva uma mudança no idioma (e avisa se falhar). */
function useSaveLanguage(lang: Language) {
  const { t } = useSettings();
  const toast = useToast();
  return (patch: Partial<LanguageInput>) =>
    updateLanguage(lang.id, { ...languageInputOf(lang), ...patch }).catch((e) => toast.show(e instanceof LanguageRuleError && e.code === 'duplicate' ? t('languages.duplicate') : t('errors.saveFailed'), 'error'));
}

function LanguageDetail({ lang, data }: { lang: Language; data: LanguagesData }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const save = useSaveLanguage(lang);

  const trash = async () => {
    await softDeleteLanguage(lang.id);
    toast.show(t('languages.moved'), 'success', { label: t('notes.undo'), run: () => void restoreLanguage(lang.id) });
    navigate('/languages');
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <div className="h-2" style={{ background: lang.color }} aria-hidden />
        <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold uppercase text-white shadow-soft" style={{ background: lang.color }}>
            {(lang.code || lang.name).slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1 basis-56">
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{lang.name}</h1>
            <p className="text-sm text-muted">{[lang.code.toUpperCase(), lang.profile !== 'generic' ? t(`languages.profiles.${lang.profile}`) : ''].filter(Boolean).join(' · ')}</p>
          </div>
          {lang.native ? (
            <Badge tone="success">{t('languages.native')}</Badge>
          ) : (
            <div className="w-52">
              <Select aria-label={t('languages.level')} value={lang.level ?? ''} onChange={(e) => void save({ level: (e.target.value || null) as CefrLevel | null })}>
                <option value="">{t('languages.levelUnset')}</option>
                {CEFR_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t('languages.levelValue', { level: l, name: t(`languages.cefr.${l}`) })}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <IconButton label={t('languages.edit')} icon={<PenLine className="h-4 w-4" />} onClick={() => setEditing(true)} />
          <IconButton label={t('languages.moveToTrash')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void trash()} />
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label={lang.name} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
          {TABS.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition', tab === id ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg')}
            >
              {t(`languages.tabs.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <Overview lang={lang} data={data} onTab={setTab} />}
      {tab === 'vocab' && <VocabTab lang={lang} />}
      {tab === 'grammar' && <GrammarTab lang={lang} />}
      {tab === 'reviews' && <ReviewsTab lang={lang} />}
      {tab === 'skills' && <SkillsTab lang={lang} />}
      {tab === 'sessions' && <SessionsTab lang={lang} data={data} />}
      {tab === 'pronunciation' && <PronunciationTab lang={lang} />}
      {tab === 'materials' && <MaterialsTab lang={lang} />}
      {tab === 'history' && <HistoryTab lang={lang} data={data} />}

      {editing && <EditLanguageDialog lang={lang} onClose={() => setEditing(false)} />}
    </div>
  );
}

/* ---------- Visão geral (Parte 10.2) ---------- */

function Overview({ lang, data, onTab }: { lang: Language; data: LanguagesData; onTab: (t: Tab) => void }) {
  const { t, settings } = useSettings();
  const save = useSaveLanguage(lang);
  const [goal, setGoal] = useState('');
  const today = todayKey();
  const all = data.sessionsOf(lang.id);
  const week = sessionStats(all.filter((s) => s.date >= addDays(today, -6)));
  const month = sessionStats(all.filter((s) => s.date >= addDays(today, -29)));
  const total = sessionStats(all);
  const maxSkill = Math.max(1, ...SKILLS.map((s) => month.bySkill[s]));
  const stat = (label: string, value: ReactNode) => (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line/70">
      <div className="text-2xl font-semibold tabular text-fg">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
  const addGoal = () => {
    const g = goal.trim();
    if (!g || lang.goals.includes(g)) return;
    void save({ goals: [...lang.goals, g] });
    setGoal('');
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat(t('languages.stats.week'), t('languages.minutes', { min: week.total }))}
        {stat(t('languages.stats.month'), t('languages.minutes', { min: month.total }))}
        {stat(t('languages.stats.days'), month.days)}
        {stat(t('languages.stats.total'), t('languages.minutes', { min: total.total }))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Surface className="flex flex-col gap-3">
          <h2 className="font-semibold text-fg">{t('languages.goals')}</h2>
          {lang.goals.length === 0 ? (
            <p className="text-sm text-muted">{t('languages.goalsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {lang.goals.map((g) => (
                <li key={g} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm text-fg">
                  <span className="min-w-0 flex-1">{g}</span>
                  <IconButton size="sm" label={t('languages.removeGoal')} icon={<X className="h-4 w-4" />} onClick={() => void save({ goals: lang.goals.filter((x) => x !== g) })} />
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input aria-label={t('languages.addGoal')} placeholder={t('languages.goalPlaceholder')} value={goal} maxLength={200} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGoal()} />
            <IconButton label={t('languages.addGoal')} icon={<Plus className="h-4 w-4" />} disabled={!goal.trim()} onClick={addGoal} />
          </div>
          <p className="text-xs text-subtle">{t('languages.goalsHint')}</p>
        </Surface>
        <LinkedGoals refType="language" refId={lang.id} preset={{ area: 'learning' }} />
        <Surface className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 font-semibold text-fg">{t('languages.skillTime')}</h2>
            <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => onTab('skills')}>
              {t('languages.tabs.skills')}
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {SKILLS.map((s) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-muted">{t(`languages.skills.${s}`)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${(month.bySkill[s] / maxSkill) * 100}%`, background: lang.color }} />
                </span>
                <span className="w-16 text-right tabular text-fg">{t('languages.minutes', { min: month.bySkill[s] })}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-subtle">{t('languages.skillTimeHint')}</p>
        </Surface>
      </div>
      <Surface className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 font-semibold text-fg">{t('languages.recentSessions')}</h2>
          <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => onTab('sessions')}>
            {t('languages.tabs.sessions')}
          </button>
        </div>
        {all.length === 0 ? (
          <p className="text-sm text-muted">{t('languages.noSessions')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {all.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs capitalize text-muted">{formatDateKey(s.date, settings.locale, { weekday: 'short', day: 'numeric' })}</span>
                <span className="min-w-0 flex-1 truncate text-fg">
                  {t(`languages.activities.${s.activity}`)}
                  {s.content ? ` · ${s.content}` : ''}
                </span>
                <span className="text-xs text-muted">{t('languages.minutes', { min: s.durationMin })}</span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
      <Field label={t('languages.notes')}>{(id) => <Textarea id={id} rows={3} defaultValue={lang.notes} onBlur={(e) => e.target.value !== lang.notes && void save({ notes: e.target.value })} />}</Field>
    </div>
  );
}

/* ---------- Habilidades (Parte 10.5) ---------- */

function SkillsTab({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const save = useSaveLanguage(lang);
  const setSkill = (s: Skill, patch: Partial<Language['skills'][Skill]>) => void save({ skills: { ...lang.skills, [s]: { ...lang.skills[s], ...patch } } });
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-2xl bg-surface-2/60 p-3 text-sm text-muted">{t('languages.selfAssessment')}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {SKILLS.map((s) => (
          <Surface key={s} className="flex flex-col gap-3">
            <h2 className="font-semibold text-fg">{t(`languages.skills.${s}`)}</h2>
            <p className="text-xs text-muted">{t(`languages.skillHints.${s}`)}</p>
            <Field label={t('languages.level')}>
              {(id) => (
                <Select id={id} value={lang.skills[s].level ?? ''} onChange={(e) => setSkill(s, { level: (e.target.value || null) as CefrLevel | null })}>
                  <option value="">{t('languages.levelUnset')}</option>
                  {CEFR_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {t('languages.levelValue', { level: l, name: t(`languages.cefr.${l}`) })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">{t('languages.confidence')}</span>
              <div className="flex gap-1.5" role="radiogroup" aria-label={t('languages.confidence')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={lang.skills[s].confidence === n}
                    aria-label={t(`languages.confidenceLevels.c${n}` as 'languages.confidenceLevels.c1')}
                    title={t(`languages.confidenceLevels.c${n}` as 'languages.confidenceLevels.c1')}
                    onClick={() => setSkill(s, { confidence: lang.skills[s].confidence === n ? null : n })}
                    className={cn('h-10 flex-1 rounded-xl text-sm font-semibold ring-1 ring-line transition', (lang.skills[s].confidence ?? 0) >= n ? 'text-white' : 'bg-surface-2 text-muted')}
                    style={(lang.skills[s].confidence ?? 0) >= n ? { background: lang.color } : undefined}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted">{lang.skills[s].confidence ? t(`languages.confidenceLevels.c${lang.skills[s].confidence}` as 'languages.confidenceLevels.c1') : t('languages.confidenceUnset')}</span>
            </div>
            <Field label={t('languages.skillNotes')}>{(id) => <Textarea id={id} rows={2} defaultValue={lang.skills[s].notes} onBlur={(e) => e.target.value !== lang.skills[s].notes && setSkill(s, { notes: e.target.value })} />}</Field>
          </Surface>
        ))}
      </div>
    </div>
  );
}

/* ---------- Sessões (Parte 10.6) ---------- */

function SessionsTab({ lang, data }: { lang: Language; data: LanguagesData }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [editing, setEditing] = useState<LanguageSession | 'new' | null>(null);
  const list = data.sessionsOf(lang.id);
  return (
    <div className="flex flex-col gap-4">
      <Button variant="primary" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
        {t('languages.newSession')}
      </Button>
      {list.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('languages.sessionsEmptyTitle')} body={t('languages.sessionsEmpty')} />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setEditing(s)} className="flex w-full flex-col gap-1 rounded-2xl bg-surface p-4 text-left shadow-soft ring-1 ring-line/70 transition hover:bg-surface-2">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                  <span className="capitalize text-muted">{formatDateKey(s.date, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <Badge>{t(`languages.activities.${s.activity}`)}</Badge>
                  <span className="text-xs text-muted">{t('languages.minutes', { min: s.durationMin })}</span>
                </span>
                {s.content && <span className="text-sm text-fg">{s.content}</span>}
                {s.result && <span className="text-xs text-success">{t('languages.resultShort', { text: s.result })}</span>}
                {s.difficulties && <span className="text-xs text-warning">{t('academy.lessons.difficultiesShort', { text: s.difficulties })}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <SessionDialog
          lang={lang}
          session={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDeleted={(id) => toast.show(t('languages.sessionMoved'), 'success', { label: t('notes.undo'), run: () => void restoreLanguageSession(id) })}
        />
      )}
    </div>
  );
}

function SessionDialog({ lang, session, onClose, onDeleted }: { lang: Language; session: LanguageSession | null; onClose: () => void; onDeleted: (id: string) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<LanguageSessionInput>(() =>
    session
      ? { languageId: session.languageId, date: session.date, activity: session.activity, durationMin: session.durationMin, content: session.content, difficulties: session.difficulties, result: session.result, notes: session.notes, noteIds: session.noteIds }
      : { languageId: lang.id, date: todayKey(), activity: 'vocabulary', durationMin: 20, content: '', difficulties: '', result: '', notes: '', noteIds: [] },
  );
  const set = (p: Partial<LanguageSessionInput>) => setInput((i) => ({ ...i, ...p }));
  const notes = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt).toArray(), []) ?? [];
  const save = async () => {
    try {
      await saveLanguageSession(session?.id ?? null, input);
      toast.show(t('common.saved'));
      onClose();
    } catch {
      toast.show(t('academy.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={session ? t('languages.editSession') : t('languages.newSession')}
      size="lg"
      footer={
        <>
          {session && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void softDeleteLanguageSession(session.id).then(() => (onDeleted(session.id), onClose()))}>
              {t('academy.assessment.moveToTrash')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('academy.lessons.date')}>{(id) => <Input id={id} type="date" value={input.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
          <Field label={t('languages.activity')}>
            {(id) => (
              <Select id={id} value={input.activity} onChange={(e) => set({ activity: e.target.value as LanguageActivity })}>
                {LANGUAGE_ACTIVITIES.map((a) => (
                  <option key={a} value={a}>
                    {t(`languages.activities.${a}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('academy.plan.duration')}>
            {(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={600} value={input.durationMin} onChange={(e) => set({ durationMin: Math.max(1, Math.min(600, Math.round(Number(e.target.value) || 1))) })} />}
          </Field>
        </div>
        <Field label={t('languages.content')}>{(id) => <Input id={id} value={input.content} maxLength={2000} placeholder={t('languages.contentPlaceholder')} onChange={(e) => set({ content: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('languages.result')}>{(id) => <Textarea id={id} rows={2} value={input.result} placeholder={t('languages.resultPlaceholder')} onChange={(e) => set({ result: e.target.value })} />}</Field>
          <Field label={t('academy.lessons.difficulties')}>{(id) => <Textarea id={id} rows={2} value={input.difficulties} onChange={(e) => set({ difficulties: e.target.value })} />}</Field>
        </div>
        <Field label={t('academy.lessons.observations')}>{(id) => <Textarea id={id} rows={2} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>
        <Field label={t('academy.assessment.materials')}>
          {(id) => (
            <div className="flex flex-col gap-2">
              {input.noteIds.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {input.noteIds.map((nid) => (
                    <li key={nid} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-sm text-fg ring-1 ring-line">
                      {notes.find((n) => n.id === nid)?.title || t('notes.untitled')}
                      <button type="button" aria-label={t('profile.sections.unlink')} className="text-subtle hover:text-fg" onClick={() => set({ noteIds: input.noteIds.filter((x) => x !== nid) })}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Select id={id} value="" onChange={(e) => e.target.value && set({ noteIds: [...input.noteIds, e.target.value] })}>
                <option value="">{t('profile.sections.linkNote')}</option>
                {notes
                  .filter((n) => !input.noteIds.includes(n.id))
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title || t('notes.untitled')}
                    </option>
                  ))}
              </Select>
            </div>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------- Histórico ---------- */

function HistoryTab({ lang, data }: { lang: Language; data: LanguagesData }) {
  const { t, settings } = useSettings();
  const entries = useLiveQuery(() => languageHistory(lang.id), [lang.id, lang.rev]);
  const fmt = new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short', year: 'numeric' });
  if (!entries) return <LoadingState label={t('common.loading')} lines={3} />;
  // Linha do tempo: mudanças de nível e de habilidade + sessões registradas.
  const items = [
    ...entries
      .filter((e) => e.action === 'create' || e.note)
      .map((e) => ({
        at: e.at,
        text:
          e.action === 'create'
            ? t('languages.history.created')
            : (e.note ?? '')
                .split(' ')
                .map((part) => {
                  const [k, v] = part.split(':');
                  if (k === 'level') return t('languages.history.level', { level: v === '-' ? t('languages.levelUnset') : (v ?? '') });
                  const [lv, cf] = (v ?? '').split('/');
                  return t('languages.history.skill', { skill: t(`languages.skills.${k as Skill}`), level: lv === '-' ? '—' : (lv ?? '—'), confidence: cf === '-' ? '—' : (cf ?? '—') });
                })
                .join(' · '),
      })),
    ...data.sessionsOf(lang.id).map((s) => ({ at: `${s.date}T12:00:00`, text: t('languages.history.session', { activity: t(`languages.activities.${s.activity}`), min: s.durationMin }) })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Surface>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('academy.history.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((i, n) => (
            <li key={n} className="flex items-baseline gap-3 text-sm">
              <span className="w-28 shrink-0 text-xs tabular text-subtle">{fmt.format(new Date(i.at))}</span>
              <span className="min-w-0 text-fg">{i.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

/* ---------- Editar idioma ---------- */

function EditLanguageDialog({ lang, onClose }: { lang: Language; onClose: () => void }) {
  const { t } = useSettings();
  const save = useSaveLanguage(lang);
  const [name, setName] = useState(lang.name);
  const [code, setCode] = useState(lang.code);
  const [native, setNative] = useState(lang.native);
  const [color, setColor] = useState(lang.color);
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('languages.edit')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void save({ name, code, native, color, profile: profileForCode(code) }).then(onClose)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('languages.name')}>{(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={t('languages.code')} hint={t('languages.codeHint')}>
            {(id, d) => <Input id={id} aria-describedby={d} value={code} maxLength={12} onChange={(e) => setCode(e.target.value)} />}
          </Field>
        </div>
        <Switch label={t('languages.nativeLabel')} hint={t('languages.nativeHint')} checked={native} onChange={setNative} />
        <ColorPicker value={color} onChange={setColor} label={t('projects.fields.color')} showLabel />
      </div>
    </Dialog>
  );
}
