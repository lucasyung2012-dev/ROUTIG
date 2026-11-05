import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpenCheck, CalendarClock, CalendarRange, CircleHelp, ClipboardList, FileUp, GraduationCap, History, Layers, NotebookPen, PenLine, Plus, Settings2, Users } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { setCurrentYear } from '@/data/academyRepo';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import { contentProgress, masteryLevelsOf, type AcademicYear, type Assessment } from '@/domain/academy';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { cn } from '@/ui/cn';
import { GradeBadge } from './academyUi';
import { AssessmentDialog, SubjectDialog, TeachersDialog, YearDialog } from './dialogs';
import { formatGrade, useAcademyData, type AcademyData } from './useAcademyData';
import { useSubjectExtras } from './useSubjectExtras';
import { useStudySessions } from './StudyPlanPage';
import { ImportDialog } from './ImportDialog';
import { compareTasks, isClosedKind, statusKind } from '@/domain/tasks';
import { TaskRow } from '@/features/tasks/TaskRow';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { useTasksData } from '@/features/tasks/useTasksData';

/** Período "de agora": o que contém hoje pelas datas; senão, o primeiro. */
export function currentPeriodId(year: AcademicYear | null): string | null {
  if (!year) return null;
  const today = todayKey();
  return year.periods.find((p) => p.start && p.end && today >= p.start && today <= p.end)?.id ?? year.periods[0]?.id ?? null;
}

/** Academy (Parte 9): painel acadêmico do ano letivo aberto. */
export function AcademyPage() {
  const { t } = useSettings();
  const [params, setParams] = useSearchParams();
  const data = useAcademyData(params.get('year'));
  const [yearDialog, setYearDialog] = useState<'new' | 'edit' | null>(null);
  const [subjectDialog, setSubjectDialog] = useState(false);
  const [teachersOpen, setTeachersOpen] = useState(false);
  const [newAssessment, setNewAssessment] = useState(false);
  const [importing, setImporting] = useState(false);

  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;

  const year = data.year;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('modules.academy')}
        title={year ? `${year.label}${year.grade ? ` · ${year.grade}` : ''}` : t('modules.academy')}
        description={year?.institution || t('moduleSummary.academy')}
        icon={<GraduationCap className="h-7 w-7" aria-hidden />}
        actions={
          year && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-36">
                <Select
                  aria-label={t('academy.year.select')}
                  value={year.id}
                  onChange={(e) => {
                    if (e.target.value === '__new') return setYearDialog('new');
                    setParams({ year: e.target.value });
                    void setCurrentYear(e.target.value);
                  }}
                >
                  {data.years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                      {y.grade ? ` · ${y.grade}` : ''}
                    </option>
                  ))}
                  <option value="__new">{t('academy.year.new')}…</option>
                </Select>
              </div>
              <Button variant="secondary" size="sm" icon={<Settings2 className="h-4 w-4" />} onClick={() => setYearDialog('edit')}>
                {t('academy.year.settings')}
              </Button>
              <Link to="/academy/plan" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm font-medium text-fg ring-1 ring-inset ring-line transition hover:bg-surface-3">
                <CalendarRange className="h-4 w-4" aria-hidden />
                {t('academy.plan.title')}
              </Link>
              <Link to="/academy/review" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm font-medium text-fg ring-1 ring-inset ring-line transition hover:bg-surface-3">
                <Layers className="h-4 w-4" aria-hidden />
                {t('academy.review.title')}
              </Link>
              <Button variant="secondary" size="sm" icon={<Users className="h-4 w-4" />} onClick={() => setTeachersOpen(true)}>
                {t('academy.teachers.title')}
              </Button>
              <Button variant="secondary" size="sm" icon={<FileUp className="h-4 w-4" />} disabled={data.subjects.length === 0} onClick={() => setImporting(true)}>
                {t('academy.import.open')}
              </Button>
              <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} disabled={data.subjects.length === 0} onClick={() => setNewAssessment(true)}>
                {t('academy.assessment.new')}
              </Button>
            </div>
          )
        }
      />

      {!year ? (
        <Surface tone="flat">
          <EmptyState
            icon={<GraduationCap className="h-6 w-6" />}
            title={t('academy.empty.title')}
            body={t('academy.empty.body')}
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setYearDialog('new')}>
                {t('academy.year.new')}
              </Button>
            }
          />
        </Surface>
      ) : (
        <Dashboard data={data} onNewSubject={() => setSubjectDialog(true)} />
      )}

      {yearDialog && <YearDialog year={yearDialog === 'edit' ? year : null} onClose={() => setYearDialog(null)} />}
      {subjectDialog && <SubjectDialog data={data} subject={null} onClose={() => setSubjectDialog(false)} />}
      {teachersOpen && <TeachersDialog data={data} onClose={() => setTeachersOpen(false)} />}
      {importing && <ImportDialog data={data} onClose={() => setImporting(false)} />}
      {newAssessment && data.subjects[0] && <AssessmentDialog data={data} assessment={null} subjectId={data.subjects[0].id} periodId={currentPeriodId(year)} onClose={() => setNewAssessment(false)} />}
    </div>
  );
}

function Dashboard({ data, onNewSubject }: { data: AcademyData; onNewSubject: () => void }) {
  const { t, settings } = useSettings();
  const year = data.year!;
  const [periodId, setPeriodId] = useState<string | null>(() => currentPeriodId(year));
  const [editing, setEditing] = useState<Assessment | null>(null);
  const period = year.periods.find((p) => p.id === periodId) ?? year.periods[0] ?? null;
  const today = todayKey();
  const upcoming = data.assessments.filter((a) => a.date && a.date >= today && a.date <= addDays(today, 30)).slice(0, 8);
  const toGrade = data.assessments.filter((a) => a.date && a.date < today && a.score === null);
  const grades = period ? data.subjects.map((s) => ({ s, g: data.gradeOf(s, period.id) })) : [];
  const ok = grades.filter((x) => x.g.status === 'ok');
  const below = ok.filter((x) => x.g.status === 'ok' && !x.g.passing);
  const fmtDay = (d: string) => (d === today ? t('tasks.due.today') : formatDateKey(d, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' }));

  return (
    <div className="flex flex-col gap-6">
      {/* Resumo do desempenho */}
      <Surface className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-base font-semibold text-fg">{t('academy.dash.summary')}</h2>
          {year.periods.length > 0 && (
            <div className="w-44">
              <Select aria-label={t('academy.assessment.period')} value={period?.id ?? ''} onChange={(e) => setPeriodId(e.target.value)}>
                {year.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        {data.subjects.length === 0 ? (
          <p className="text-sm text-muted">{t('academy.dash.noSubjects')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{t('academy.dash.passingCount', { count: ok.length - below.length })}</Badge>
            {below.length > 0 && <Badge tone="danger">{t('academy.dash.belowCount', { count: below.length })}</Badge>}
            <Badge>{t('academy.dash.pendingCount', { count: grades.length - ok.length })}</Badge>
            {toGrade.length > 0 && <Badge tone="warning">{t('academy.dash.toGrade', { count: toGrade.length })}</Badge>}
          </div>
        )}
      </Surface>

      {/* Disciplinas */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t('academy.dash.subjects')}</h2>
          <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={onNewSubject}>
            {t('academy.subject.new')}
          </Button>
        </div>
        {data.subjects.length === 0 ? (
          <Surface tone="flat">
            <EmptyState title={t('academy.dash.noSubjectsTitle')} body={t('academy.dash.noSubjects')} action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onNewSubject}>{t('academy.subject.new')}</Button>} />
          </Surface>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {grades.map(({ s, g }) => {
              const yg = data.yearGradeOf(s);
              const next = data.assessments.find((a) => a.subjectId === s.id && a.date && a.date >= today);
              return (
                <li key={s.id}>
                  <Link to={`/academy/subjects/${s.id}`} className="flex h-full flex-col gap-3 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-line" style={{ background: s.color }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-fg">{s.name}</div>
                        <div className="truncate text-xs text-muted">
                          {s.kind !== 'subject' ? `${t(`academy.subject.kinds.${s.kind}`)} · ` : ''}
                          {(s.teacherId && data.teacherById.get(s.teacherId)?.name) || t('academy.subject.noTeacher')}
                        </div>
                      </div>
                      <GradeBadge result={g} locale={settings.locale} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>{t('academy.dash.yearGrade', { value: yg.status === 'ok' ? formatGrade(yg.value, settings.locale) : t('academy.grade.pending') })}</span>
                      {next && <span>{t('academy.dash.next', { name: next.name, date: fmtDay(next.date!) })}</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Próximas avaliações */}
        <Surface className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <CalendarClock className="h-5 w-5 text-rose" aria-hidden />
            {t('academy.dash.upcoming')}
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">{t('academy.dash.upcomingEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {upcoming.map((a) => (
                <AssessmentRow key={a.id} a={a} data={data} label={fmtDay(a.date!)} onOpen={() => setEditing(a)} />
              ))}
            </ul>
          )}
        </Surface>

        {/* Atividades pendentes: tarefas abertas das disciplinas e avaliações que já passaram sem nota */}
        <Surface className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <ClipboardList className="h-5 w-5 text-amber" aria-hidden />
            {t('academy.dash.pendingActivities')}
          </h2>
          <PendingActivities data={data} />
          <h3 className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('academy.dash.pending')}</h3>
          {toGrade.length === 0 ? (
            <p className="text-sm text-muted">{t('academy.dash.pendingEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {toGrade.map((a) => (
                <AssessmentRow key={a.id} a={a} data={data} label={fmtDay(a.date!)} onOpen={() => setEditing(a)} warn />
              ))}
            </ul>
          )}
        </Surface>
      </div>

      <PlanPanel data={data} />
      <LearningPanels data={data} />

      {/* Histórico acadêmico */}
      <Surface className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          <History className="h-5 w-5 text-violet" aria-hidden />
          {t('academy.dash.history')}
        </h2>
        <ul className="flex flex-col gap-1">
          {data.years.map((y) => (
            <li key={y.id} className={cn('flex flex-wrap items-baseline gap-x-3 rounded-xl px-2 py-1.5', y.id === year.id && 'bg-accent/10')}>
              <Link to={`/academy?year=${y.id}`} className="font-medium text-fg hover:underline">
                {y.label}
              </Link>
              <span className="text-sm text-muted">{[y.grade, y.institution].filter(Boolean).join(' · ') || '—'}</span>
            </li>
          ))}
        </ul>
      </Surface>

      {editing && <AssessmentDialog data={data} assessment={editing} subjectId={editing.subjectId} periodId={editing.periodId} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function AssessmentRow({ a, data, label, onOpen, warn = false }: { a: Assessment; data: AcademyData; label: string; onOpen: () => void; warn?: boolean }) {
  const { t, settings } = useSettings();
  const s = data.subjectById.get(a.subjectId);
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-2/70">
        <span className="h-9 w-1 shrink-0 rounded-full ring-1 ring-line/60" style={{ background: s?.color }} aria-hidden />
        <span className={cn('w-20 shrink-0 text-xs font-medium capitalize', warn ? 'text-warning' : 'text-muted')}>{label}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{a.name}</span>
          <span className="block truncate text-xs text-muted">
            {s?.name} · {t(`academy.assessment.types.${a.type}`)}
          </span>
        </span>
        {a.score !== null ? (
          <span className="text-sm tabular text-fg">
            {formatGrade(a.score, settings.locale)}/{formatGrade(a.maxScore, settings.locale)}
          </span>
        ) : (
          <PenLine className="h-4 w-4 text-subtle" aria-label={t('academy.assessment.noScore')} />
        )}
      </button>
    </li>
  );
}

/** Progresso de aprendizagem, conteúdos recentes, dúvidas e materiais de todas as disciplinas do ano (Parte 9.2). */
function LearningPanels({ data }: { data: AcademyData }) {
  const { t } = useSettings();
  const extras = useSubjectExtras(
    data.subjects.map((s) => s.id),
    data.assessments.flatMap((a) => a.noteIds),
  );
  const levels = masteryLevelsOf(data.year);
  const p = contentProgress(extras.contents, levels.length);
  const recent = [...extras.contents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const doubts = extras.doubts.filter((d) => d.status === 'open').slice(0, 6);
  const notes = extras.notes.slice(0, 6);
  const subjectName = (id: string) => data.subjectById.get(id)?.name ?? '';
  if (extras.loading) return null;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Surface className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          <BookOpenCheck className="h-5 w-5 text-teal" aria-hidden />
          {t('academy.dash.progress')}
        </h2>
        {p.total === 0 ? (
          <p className="text-sm text-muted">{t('academy.dash.progressEmpty')}</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm text-muted">
                <span>{t('academy.dash.studiedOf', { studied: p.studied, total: p.total })}</span>
                <span>{t('academy.dash.masteredOf', { mastered: p.mastered, total: p.total })}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <div className="h-full rounded-full bg-teal" style={{ width: `${(p.studied / p.total) * 100}%` }} />
              </div>
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t('academy.dash.recentContents')}</h3>
            <ul className="flex flex-col gap-1">
              {recent.map((c) => (
                <li key={c.id}>
                  <Link to={`/academy/subjects/${c.subjectId}`} className="flex items-baseline gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-2/70">
                    <span className="min-w-0 flex-1 truncate text-fg">{c.title}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {subjectName(c.subjectId)} · {t(`academy.contents.statuses.${c.status}`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Surface>
      <Surface className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          <CircleHelp className="h-5 w-5 text-amber" aria-hidden />
          {t('academy.dash.doubts')}
        </h2>
        {doubts.length === 0 ? (
          <p className="text-sm text-muted">{t('academy.dash.doubtsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {doubts.map((d) => (
              <li key={d.id}>
                <Link to={`/academy/subjects/${d.subjectId}`} className="block rounded-xl px-2 py-1.5 hover:bg-surface-2/70">
                  <span className="block truncate text-sm text-fg">{d.question}</span>
                  <span className="block text-xs text-muted">{subjectName(d.subjectId)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">
          <NotebookPen className="h-4 w-4" aria-hidden />
          {t('academy.dash.materials')}
        </h3>
        {notes.length === 0 ? (
          <p className="text-sm text-muted">{t('academy.dash.materialsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {notes.map((n) => (
              <li key={n.id}>
                <Link to={`/notes/${n.id}`} className="block truncate rounded-xl px-2 py-1.5 text-sm text-fg hover:bg-surface-2/70">
                  {n.title || t('notes.untitled')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

/** Planejamento de estudos no painel (Parte 9.2): próximas sessões e o que ficou atrasado. */
function PlanPanel({ data }: { data: AcademyData }) {
  const { t, settings } = useSettings();
  const { loading, sessions } = useStudySessions(data);
  if (loading) return null;
  const today = todayKey();
  const overdue = sessions.filter((s) => s.status === 'planned' && s.date < today).length;
  const next = sessions.filter((s) => s.status === 'planned' && s.date >= today).slice(0, 5);
  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold text-fg">
          <CalendarRange className="h-5 w-5 text-teal" aria-hidden />
          {t('academy.plan.title')}
        </h2>
        <Link to="/academy/plan" className="text-sm font-medium text-accent hover:underline">
          {t('common.open')}
        </Link>
      </div>
      {overdue > 0 && (
        <div>
          <Badge tone="warning">{t('academy.plan.overdue', { count: overdue })}</Badge>
        </div>
      )}
      {next.length === 0 ? (
        <p className="text-sm text-muted">{t('academy.plan.panelEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {next.map((s) => {
            const sub = data.subjectById.get(s.subjectId);
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm">
                <span className="h-8 w-1 shrink-0 rounded-full ring-1 ring-line/60" style={{ background: sub?.color }} aria-hidden />
                <span className="w-20 shrink-0 text-xs font-medium capitalize text-muted">{s.date === today ? t('tasks.due.today') : formatDateKey(s.date, settings.locale, { weekday: 'short', day: 'numeric' })}</span>
                <span className="min-w-0 flex-1 truncate text-fg">
                  {sub?.name} · {t(`academy.plan.kinds.${s.kind}`)}
                </span>
                <span className="text-xs text-muted">{t('academy.plan.minutes', { min: s.durationMin })}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}

/** Atividades (tarefas ligadas às disciplinas) ainda abertas, as mesmas de Tasks. */
function PendingActivities({ data }: { data: AcademyData }) {
  const { t } = useSettings();
  const tasks = useTasksData();
  const editor = useTaskEditor();
  const actions = useTaskActions(tasks);
  const ids = new Set(data.subjects.map((s) => s.id));
  const open = tasks.active
    .filter((x) => x.subjectId && ids.has(x.subjectId) && !isClosedKind(statusKind(tasks.config, x.statusId)))
    .sort(compareTasks(tasks.config))
    .slice(0, 8);
  if (tasks.loading) return null;
  return (
    <>
      {open.length === 0 ? (
        <p className="text-sm text-muted">{t('academy.dash.activitiesEmpty')}</p>
      ) : (
        <ul className="flex flex-col">
          {open.map((task) => (
            <li key={task.id}>
              <TaskRow task={task} data={tasks} onOpen={editor.openTask} onToggle={actions.toggle} compact />
            </li>
          ))}
        </ul>
      )}
      {actions.dialogs}
    </>
  );
}
