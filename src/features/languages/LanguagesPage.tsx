import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Languages, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createLanguage, createLanguages, LanguageRuleError, restoreLanguage } from '@/data/languagesRepo';
import { addDays, todayKey } from '@/domain/dates';
import { LANGUAGE_PRESETS, SKILLS, sessionStats } from '@/domain/languages';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ColorPicker, PALETTE } from '@/ui/ColorPicker';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { useLanguages } from './useLanguages';

/** Idiomas (Parte 10): estudo por conta própria, separado da Academy. */
export function LanguagesPage() {
  const { t } = useSettings();
  const toast = useToast();
  const data = useLanguages();
  const [adding, setAdding] = useState(false);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={4} />;
  const today = todayKey();
  const weekAgo = addDays(today, -6);
  const missing = LANGUAGE_PRESETS.filter((p) => !data.languages.some((l) => l.name.toLowerCase() === p.name.toLowerCase()));

  const addPresets = async () => {
    const n = await createLanguages(missing);
    toast.show(t('languages.presetsAdded', { count: n }));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('modules.languages')}
        title={t('modules.languages')}
        description={t('moduleSummary.languages')}
        icon={<Languages className="h-7 w-7" aria-hidden />}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            {t('languages.add')}
          </Button>
        }
      />

      {data.languages.length === 0 ? (
        <Surface tone="flat">
          <EmptyState
            icon={<Languages className="h-6 w-6" />}
            title={t('languages.emptyTitle')}
            body={t('languages.empty')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={() => void addPresets()}>
                  {t('languages.addPresets')}
                </Button>
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                  {t('languages.addOther')}
                </Button>
              </div>
            }
          />
        </Surface>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.languages.map((l) => {
              const week = sessionStats(data.sessionsOf(l.id).filter((s) => s.date >= weekAgo));
              const last = data.sessionsOf(l.id)[0];
              return (
                <li key={l.id}>
                  <Link to={`/languages/${l.id}`} className="flex h-full flex-col gap-3 rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold uppercase text-white shadow-soft" style={{ background: l.color }}>
                        {(l.code || l.name).slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-lg font-semibold text-fg">{l.name}</div>
                        <div className="text-xs text-muted">{last ? t('languages.lastSession', { activity: t(`languages.activities.${last.activity}`) }) : t('languages.noSessions')}</div>
                      </div>
                      {l.native ? <Badge tone="success">{t('languages.native')}</Badge> : <Badge tone={l.level ? 'accent' : 'neutral'}>{l.level ?? t('languages.noLevel')}</Badge>}
                    </div>
                    {!l.native && (
                      <div className="grid grid-cols-4 gap-2">
                        {SKILLS.map((s) => (
                          <div key={s} className="flex flex-col gap-1">
                            <span className="truncate text-[0.6875rem] text-muted">{t(`languages.skills.${s}`)}</span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-label={`${t(`languages.skills.${s}`)}: ${l.skills[s].confidence ?? '—'}/5`}>
                              <span className="block h-full rounded-full" style={{ width: `${((l.skills[s].confidence ?? 0) / 5) * 100}%`, background: l.color }} />
                            </span>
                            <span className="text-[0.6875rem] font-medium text-fg">{l.skills[s].level ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-muted">{t('languages.weekSummary', { min: week.total, sessions: week.sessions })}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && (
            <Button variant="ghost" size="sm" className="w-fit" icon={<Sparkles className="h-4 w-4" />} onClick={() => void addPresets()}>
              {t('languages.addMissing', { names: missing.map((m) => m.name).join(', ') })}
            </Button>
          )}
        </>
      )}

      {data.trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg">{t('languages.trash')}</h2>
          {data.trash.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{l.name}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreLanguage(l.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}

      {adding && <AddLanguageDialog onClose={() => setAdding(false)} usedColors={data.languages.length} />}
    </div>
  );
}

function AddLanguageDialog({ onClose, usedColors }: { onClose: () => void; usedColors: number }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [native, setNative] = useState(false);
  const [color, setColor] = useState<string>(PALETTE[(usedColors + 4) % PALETTE.length]!);
  const save = async () => {
    try {
      await createLanguage({ name, code, color, native });
      toast.show(t('languages.added'));
      onClose();
    } catch (e) {
      toast.show(e instanceof LanguageRuleError && e.code === 'duplicate' ? t('languages.duplicate') : t('academy.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('languages.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
            {t('languages.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('languages.name')}>{(id) => <Input id={id} autoFocus value={name} maxLength={60} placeholder={t('languages.namePlaceholder')} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={t('languages.code')} hint={t('languages.codeHint')}>
            {(id, d) => <Input id={id} aria-describedby={d} value={code} maxLength={12} placeholder="fr, it, ja…" onChange={(e) => setCode(e.target.value)} />}
          </Field>
        </div>
        <Switch label={t('languages.nativeLabel')} hint={t('languages.nativeHint')} checked={native} onChange={setNative} />
        <ColorPicker value={color} onChange={setColor} label={t('projects.fields.color')} showLabel />
      </div>
    </Dialog>
  );
}
