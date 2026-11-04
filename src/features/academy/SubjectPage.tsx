import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, PenLine, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { gradeHistory, purgeAssessment, restoreAssessment, restoreSubject, setPeriodResult, softDeleteSubject } from '@/data/academyRepo';
import { getDb } from '@/data/db';
import { formatDateKey } from '@/domain/dates';
import type { AcademicPeriod, Assessment, Subject } from '@/domain/academy';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Field } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { AssessmentRow, currentPeriodId } from './AcademyPage';
import { DecimalInput, GradeBadge, GradeExplanation } from './academyUi';
import { AssessmentDialog, SubjectDialog } from './dialogs';
import { formatGrade, useAcademyData, type AcademyData } from './useAcademyData';

const TABS = ['overview', 'assessments', 'history'] as const;
type Tab = (typeof TABS)[number];

export function SubjectPage() {
  const { id } = useParams();
  const { t } = useSettings();
  const subject = useLiveQuery(() => (id ? getDb().subjects.get(id) : undefined), [id], null);
  const data = useAcademyData(subject?.yearId ?? null);
  if (subject === null || data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  if (!subject || subject.deletedAt)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-muted">{t('academy.subject.notFound')}</p>
      </div>
    );
  return <SubjectDetail key={subject.id} subject={subject} data={data} />;
}

function BackLink() {
  const { t } = useSettings();
  return (
    <Link to="/academy" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted hover:text-fg">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('academy.subject.back')}
    </Link>
  );
}

function SubjectDetail({ subject, data }: { subject: Subject; data: AcademyData }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | 'new' | null>(null);
  const [newPeriod, setNewPeriod] = useState<string | null>(null);
  const model = data.modelOf(subject);
  const teacher = subject.teacherId ? data.teacherById.get(subject.teacherId) : null;
  const yg = data.yearGradeOf(subject);

  const trash = async () => {
    await softDeleteSubject(subject.id);
    toast.show(t('academy.subject.moved'), 'success', { label: t('notes.undo'), run: () => void restoreSubject(subject.id) });
    navigate('/academy');
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <div className="h-2" style={{ background: subject.color }} aria-hidden />
        <div className="flex flex-wrap items-start gap-3 p-5 sm:p-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{subject.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {subject.kind !== 'subject' && `${t(`academy.subject.kinds.${subject.kind}`)} · `}
              {teacher?.name ?? t('academy.subject.noTeacher')} · {data.year?.label}
              {subject.model ? ` · ${t('academy.subject.ownModelShort')}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={yg.status === 'ok' ? (yg.passing ? 'success' : 'danger') : 'neutral'}>{t('academy.dash.yearGrade', { value: yg.status === 'ok' ? formatGrade(yg.value, settings.locale) : t('academy.grade.pending') })}</Badge>
            <IconButton label={t('academy.subject.edit')} icon={<PenLine className="h-4 w-4" />} onClick={() => setEditing(true)} />
            <IconButton label={t('academy.subject.moveToTrash')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void trash()} />
          </div>
        </div>
      </div>

      <Segmented value={tab} onChange={setTab} label={subject.name} options={TABS.map((v) => ({ value: v, label: t(`academy.subject.tabs.${v}`) }))} className="w-full sm:w-fit" />

      {tab === 'overview' && (
        <div className="flex flex-col gap-4">
          {(data.year?.periods ?? []).length === 0 && <p className="text-sm text-muted">{t('academy.subject.noPeriods')}</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            {(data.year?.periods ?? []).map((p) => (
              <PeriodCard key={p.id} subject={subject} period={p} data={data} current={p.id === currentPeriodId(data.year)} onAdd={() => setNewPeriod(p.id)} onOpen={(a) => setAssessment(a)} />
            ))}
          </div>
          <p className="text-xs text-subtle">{t('academy.subject.modelSummary', { method: t(`academy.model.methods.${model.method}`), passing: formatGrade(model.passing, settings.locale), scale: formatGrade(model.scale, settings.locale) })}</p>
        </div>
      )}

      {tab === 'assessments' && <AssessmentsTab subject={subject} data={data} onOpen={(a) => setAssessment(a)} onNew={() => setNewPeriod(currentPeriodId(data.year) ?? '')} />}
      {tab === 'history' && <HistoryTab subject={subject} data={data} />}

      {editing && <SubjectDialog data={data} subject={subject} onClose={() => setEditing(false)} />}
      {assessment && assessment !== 'new' && <AssessmentDialog data={data} assessment={assessment} subjectId={subject.id} periodId={assessment.periodId} onClose={() => setAssessment(null)} />}
      {newPeriod !== null && <AssessmentDialog data={data} assessment={null} subjectId={subject.id} periodId={newPeriod || null} onClose={() => setNewPeriod(null)} />}
    </div>
  );
}

/** Um período: nota, como foi calculada, recuperação e bônus. */
function PeriodCard({ subject, period, data, current, onAdd, onOpen }: { subject: Subject; period: AcademicPeriod; data: AcademyData; current: boolean; onAdd: () => void; onOpen: (a: Assessment) => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const model = data.modelOf(subject);
  const g = data.gradeOf(subject, period.id);
  const res = data.resultOf(subject.id, period.id);
  const list = data.assessmentsOf(subject.id, period.id);
  const fail = () => toast.show(t('errors.saveFailed'), 'error');
  // Recuperação só faz sentido abaixo da média; bônus só acima (regras do modelo).
  const showRecovery = model.recovery.enabled && (res?.recoveryScore != null || (g.status === 'ok' && g.original < model.passing));
  const showBonus = model.bonus.enabled && (res?.bonus != null || (g.status === 'ok' && g.original > model.bonus.above));

  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-semibold text-fg">
          {period.name}
          {current && <span className="ml-2 text-xs font-medium text-accent">{t('academy.subject.currentPeriod')}</span>}
        </h2>
        <GradeBadge result={g} locale={settings.locale} passing={model.passing} />
      </div>
      <GradeExplanation result={g} />
      {(showRecovery || showBonus) && (
        <div className="grid gap-3 rounded-2xl bg-surface-2/50 p-3 sm:grid-cols-2">
          {showRecovery && (
            <Field label={t('academy.subject.recovery')} hint={t('academy.subject.recoveryHint', { cap: formatGrade(model.recovery.cap, settings.locale) })}>
              {(id) => <DecimalInput id={id} value={res?.recoveryScore ?? null} placeholder="—" onChange={(v) => void setPeriodResult(subject.id, period.id, { recoveryScore: v }).catch(fail)} />}
            </Field>
          )}
          {showBonus && (
            <Field label={t('academy.subject.bonus')} hint={t('academy.subject.bonusHint', { max: formatGrade(model.bonus.max, settings.locale) })}>
              {(id) => <DecimalInput id={id} value={res?.bonus ?? null} placeholder="—" onChange={(v) => void setPeriodResult(subject.id, period.id, { bonus: v }).catch(fail)} />}
            </Field>
          )}
        </div>
      )}
      <ul className="flex flex-col">
        {list.map((a) => (
          <AssessmentRow key={a.id} a={a} data={data} label={a.date ? formatDateKey(a.date, settings.locale, { day: 'numeric', month: 'short' }) : '—'} onOpen={() => onOpen(a)} />
        ))}
      </ul>
      <Button size="sm" variant="secondary" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
        {t('academy.assessment.new')}
      </Button>
    </Surface>
  );
}

function AssessmentsTab({ subject, data, onOpen, onNew }: { subject: Subject; data: AcademyData; onOpen: (a: Assessment) => void; onNew: () => void }) {
  const { t, settings } = useSettings();
  const [purging, setPurging] = useState<Assessment | null>(null);
  const all = data.assessmentsOf(subject.id);
  const trash = data.assessmentsTrash.filter((a) => a.subjectId === subject.id);
  const groups = [...(data.year?.periods ?? []).map((p) => ({ id: p.id as string | null, name: p.name })), { id: null, name: t('academy.assessment.noPeriod') }];
  return (
    <div className="flex flex-col gap-4">
      <Button variant="primary" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={onNew}>
        {t('academy.assessment.new')}
      </Button>
      {all.length === 0 && <p className="text-sm text-muted">{t('academy.subject.noAssessments')}</p>}
      {groups.map((g) => {
        const list = all.filter((a) => a.periodId === g.id);
        if (!list.length) return null;
        return (
          <Surface key={g.id ?? 'none'} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg">{g.name}</h3>
            <ul className="flex flex-col">
              {list.map((a) => (
                <AssessmentRow key={a.id} a={a} data={data} label={a.date ? formatDateKey(a.date, settings.locale, { day: 'numeric', month: 'short' }) : '—'} onOpen={() => onOpen(a)} />
              ))}
            </ul>
          </Surface>
        );
      })}
      {trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('academy.assessment.trash')}</h3>
          <ul className="flex flex-col gap-1">
            {trash.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted">{a.name}</span>
                <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreAssessment(a.id)}>
                  {t('academy.assessment.restore')}
                </Button>
                <IconButton size="sm" label={t('academy.assessment.purge')} icon={<Trash2 className="h-4 w-4" />} onClick={() => setPurging(a)} />
              </li>
            ))}
          </ul>
        </Surface>
      )}
      <ConfirmDialog
        open={!!purging}
        danger
        title={t('academy.assessment.purgeTitle', { name: purging?.name ?? '' })}
        body={t('academy.assessment.purgeBody')}
        confirmLabel={t('academy.assessment.purge')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          if (purging) void purgeAssessment(purging.id);
          setPurging(null);
        }}
      />
    </div>
  );
}

/** Histórico das notas, recuperações e bônus (Parte 9.6). */
function HistoryTab({ subject, data }: { subject: Subject; data: AcademyData }) {
  const { t, settings } = useSettings();
  const entries = useLiveQuery(() => gradeHistory(subject.id), [subject.id, data.assessments, data.resultOf]);
  const fmt = new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (!entries) return <LoadingState label={t('common.loading')} lines={3} />;
  const nameOf = (id: string) => data.assessments.find((a) => a.id === id)?.name ?? data.assessmentsTrash.find((a) => a.id === id)?.name ?? t('dashboard.removed');
  const periodOf = (id: string) => data.year?.periods.find((p) => id.endsWith(`:${p.id}`))?.name ?? '';
  const describe = (e: (typeof entries)[number]) => {
    if (e.entityType === 'subject') return t(`dashboard.actions.${e.action}`) + ' ' + t('academy.history.subject');
    if (e.entityType === 'periodResult') {
      const [, rec, bonus] = /rec:([^ ]+) bonus:(.+)/.exec(e.note ?? '') ?? [];
      return t('academy.history.periodResult', { period: periodOf(e.entityId), recovery: rec ?? '—', bonus: bonus ?? '—' });
    }
    const score = e.note?.startsWith('score:') ? e.note.slice(6) : null;
    return score !== null ? t('academy.history.score', { name: nameOf(e.entityId), score }) : `${t(`dashboard.actions.${e.action}`)} ${t('academy.history.assessment')}: ${nameOf(e.entityId)}`;
  };
  return (
    <Surface>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">{t('academy.history.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((e) => (
            <li key={e.seq} className="flex items-baseline gap-3 text-sm">
              <span className="w-28 shrink-0 text-xs tabular text-subtle">{fmt.format(new Date(e.at))}</span>
              <span className="min-w-0 text-fg">{describe(e)}</span>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
