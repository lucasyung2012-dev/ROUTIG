import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import {
  AcademyRuleError,
  createAssessment,
  createSubject,
  createTeacher,
  createYear,
  deleteTeacher,
  periodInUse,
  softDeleteAssessment,
  restoreAssessment,
  updateAssessment,
  updateSubject,
  updateTeacher,
  updateYear,
} from '@/data/academyRepo';
import { getDb } from '@/data/db';
import {
  ASSESSMENT_TYPES,
  defaultGradingModel,
  defaultPeriods,
  emptyAssessmentInput,
  periodForDate,
  SUBJECT_KINDS,
  type AcademicPeriod,
  type AcademicYear,
  type Assessment,
  type AssessmentInput,
  type AssessmentType,
  type GradingModel,
  type Subject,
  type SubjectKind,
  type Teacher,
} from '@/domain/academy';
import { newId } from '@/domain/ids';
import { Button } from '@/ui/Button';
import { ColorPicker, PALETTE } from '@/ui/ColorPicker';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { DecimalInput, ModelEditor } from './academyUi';
import type { AcademyData } from './useAcademyData';

const errText = (e: unknown, t: ReturnType<typeof useSettings>['t']) =>
  e instanceof AcademyRuleError && e.code === 'duplicate' ? t('academy.errors.duplicate') : e instanceof AcademyRuleError ? t('academy.errors.invalid') : t('errors.saveFailed');

/* ---------- Ano letivo ---------- */

/** Cria ou edita um ano letivo: instituição, série, períodos e o modelo de nota. */
export function YearDialog({ year, onClose }: { year: AcademicYear | null; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [label, setLabel] = useState(year?.label ?? String(new Date().getFullYear()));
  const [institution, setInstitution] = useState(year?.institution ?? '');
  const [grade, setGrade] = useState(year?.grade ?? '');
  const [periods, setPeriods] = useState<AcademicPeriod[]>(year?.periods ?? defaultPeriods());
  const [model, setModel] = useState<GradingModel>(year?.model ?? defaultGradingModel());
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      if (year) await updateYear(year.id, { label, institution, grade, periods, model });
      else await createYear({ label, institution, grade, periods, model });
      toast.show(year ? t('common.saved') : t('academy.year.created'));
      onClose();
    } catch (e) {
      setError(errText(e, t));
    }
  };

  const removePeriod = async (p: AcademicPeriod) => {
    if (await periodInUse(p.id)) {
      toast.show(t('academy.year.periodInUse', { name: p.name }), 'error');
      return;
    }
    setPeriods(periods.filter((x) => x.id !== p.id));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={year ? t('academy.year.edit') : t('academy.year.new')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!label.trim()} onClick={() => void save()}>
            {year ? t('common.save') : t('academy.year.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('academy.year.label')} error={error ?? undefined}>
            {(id) => <Input id={id} value={label} maxLength={40} onChange={(e) => (setLabel(e.target.value), setError(null))} />}
          </Field>
          <Field label={t('academy.year.grade')}>{(id) => <Input id={id} value={grade} maxLength={60} placeholder={t('academy.year.gradePlaceholder')} onChange={(e) => setGrade(e.target.value)} />}</Field>
          <Field label={t('academy.year.institution')}>{(id) => <Input id={id} value={institution} maxLength={120} placeholder={t('academy.year.institutionPlaceholder')} onChange={(e) => setInstitution(e.target.value)} />}</Field>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('academy.year.periods')}</h3>
          <p className="text-sm text-muted">{t('academy.year.periodsHint')}</p>
          <ul className="flex flex-col gap-2">
            {periods.map((p, i) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <Input aria-label={t('academy.year.periodName')} value={p.name} maxLength={40} className="min-w-0 flex-1 basis-40" onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input type="date" aria-label={t('academy.year.periodStart')} value={p.start ?? ''} className="w-40" onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, start: e.target.value || null } : x)))} />
                <Input type="date" aria-label={t('academy.year.periodEnd')} value={p.end ?? ''} className="w-40" onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, end: e.target.value || null } : x)))} />
                <IconButton size="sm" label={t('academy.year.removePeriod', { name: p.name })} icon={<Trash2 className="h-4 w-4" />} onClick={() => void removePeriod(p)} />
              </li>
            ))}
          </ul>
          <Button size="sm" variant="secondary" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={() => setPeriods([...periods, { id: newId('per'), name: t('academy.year.periodDefault', { n: periods.length + 1 }), start: null, end: null }])}>
            {t('academy.year.addPeriod')}
          </Button>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('academy.model.title')}</h3>
          <p className="text-sm text-muted">{t('academy.model.hint')}</p>
          <ModelEditor value={model} onChange={setModel} />
        </section>
      </div>
    </Dialog>
  );
}

/* ---------- Disciplina ---------- */

export function SubjectDialog({ data, subject, onClose, onCreated }: { data: AcademyData; subject: Subject | null; onClose: () => void; onCreated?: (s: Subject) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState(subject?.name ?? '');
  const [kind, setKind] = useState<SubjectKind>(subject?.kind ?? 'subject');
  const [color, setColor] = useState(subject?.color ?? PALETTE[(data.subjects.length + 9) % PALETTE.length]!);
  const [teacherId, setTeacherId] = useState<string | null>(subject?.teacherId ?? null);
  const [ownModel, setOwnModel] = useState(!!subject?.model);
  const [model, setModel] = useState<GradingModel>(subject?.model ?? data.year?.model ?? defaultGradingModel());
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!data.year) return;
    try {
      if (subject) await updateSubject(subject.id, { name, kind, color, teacherId, model: ownModel ? model : null });
      else {
        const s = await createSubject({ yearId: data.year.id, name, kind, color, teacherId });
        if (ownModel) await updateSubject(s.id, { model });
        onCreated?.(s);
      }
      toast.show(subject ? t('common.saved') : t('academy.subject.created'));
      onClose();
    } catch (e) {
      setError(errText(e, t));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={subject ? t('academy.subject.edit') : t('academy.subject.new')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
            {subject ? t('common.save') : t('academy.subject.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('academy.subject.name')} error={error ?? undefined}>
            {(id) => <Input id={id} autoFocus={!subject} value={name} maxLength={80} placeholder={t('academy.subject.namePlaceholder')} onChange={(e) => (setName(e.target.value), setError(null))} />}
          </Field>
          <Field label={t('academy.subject.kind')} hint={t('academy.subject.kindHint')}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={kind} onChange={(e) => setKind(e.target.value as SubjectKind)}>
                {SUBJECT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`academy.subject.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('academy.subject.teacher')}>
            {(id) => (
              <Select id={id} value={teacherId ?? ''} onChange={(e) => setTeacherId(e.target.value || null)}>
                <option value="">{t('academy.subject.noTeacher')}</option>
                {data.teachers.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <ColorPicker value={color} onChange={setColor} label={t('projects.fields.color')} showLabel />
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-2/50 p-3">
          <Switch label={t('academy.subject.ownModel')} hint={t('academy.subject.ownModelHint')} checked={ownModel} onChange={setOwnModel} />
          {ownModel && <ModelEditor value={model} onChange={setModel} />}
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- Professores ---------- */

export function TeachersDialog({ data, onClose }: { data: AcademyData; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<Teacher | null>(null);
  const fail = () => toast.show(t('errors.saveFailed'), 'error');
  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} title={t('academy.teachers.title')} description={t('academy.teachers.privacy')} footer={<Button onClick={onClose}>{t('common.done')}</Button>}>
      <ul className="flex flex-col gap-3">
        {data.teachers.map((tc) => (
          <li key={tc.id} className="flex flex-col gap-2 rounded-xl bg-surface-2/50 p-2.5">
            <div className="flex items-center gap-2">
              <Input aria-label={t('academy.teachers.name')} defaultValue={tc.name} maxLength={80} className="min-w-0 flex-1" onBlur={(e) => e.target.value.trim() && e.target.value !== tc.name && void updateTeacher(tc.id, { name: e.target.value }).catch(fail)} />
              <IconButton size="sm" label={t('academy.teachers.remove', { name: tc.name })} icon={<Trash2 className="h-4 w-4" />} onClick={() => setRemoving(tc)} />
            </div>
            <Input aria-label={t('academy.teachers.contact')} placeholder={t('academy.teachers.contact')} defaultValue={tc.contact} maxLength={200} onBlur={(e) => e.target.value !== tc.contact && void updateTeacher(tc.id, { contact: e.target.value }).catch(fail)} />
            <Input aria-label={t('academy.teachers.notes')} placeholder={t('academy.teachers.notes')} defaultValue={tc.notes} maxLength={2000} onBlur={(e) => e.target.value !== tc.notes && void updateTeacher(tc.id, { notes: e.target.value }).catch(fail)} />
            <p className="text-xs text-muted">
              {t('academy.teachers.subjects')}: {data.subjects.filter((s) => s.teacherId === tc.id).map((s) => s.name).join(', ') || '—'}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <Input aria-label={t('academy.teachers.name')} placeholder={t('academy.teachers.newName')} value={name} maxLength={80} className="min-w-0 flex-1" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && void createTeacher(name).then(() => setName(''), fail)} />
        <Button icon={<Plus className="h-4 w-4" />} disabled={!name.trim()} onClick={() => void createTeacher(name).then(() => setName(''), fail)}>
          {t('academy.teachers.add')}
        </Button>
      </div>
      <ConfirmDialog
        open={!!removing}
        danger
        title={t('academy.teachers.removeTitle', { name: removing?.name ?? '' })}
        body={t('academy.teachers.removeBody')}
        confirmLabel={t('academy.teachers.remove', { name: removing?.name ?? '' })}
        cancelLabel={t('common.cancel')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) void deleteTeacher(removing.id).catch(fail);
          setRemoving(null);
        }}
      />
    </Dialog>
  );
}

/* ---------- Avaliação ---------- */

export function AssessmentDialog({ data, assessment, subjectId, periodId, onClose }: { data: AcademyData; assessment: Assessment | null; subjectId: string; periodId: string | null; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<AssessmentInput>(() => (assessment ? { ...assessment } : emptyAssessmentInput(subjectId, periodId ?? data.year?.periods[0]?.id ?? null)));
  const [error, setError] = useState<string | null>(null);
  const subject = data.subjectById.get(input.subjectId);
  const model = subject ? data.modelOf(subject) : null;
  const set = (patch: Partial<AssessmentInput>) => {
    setInput((i) => ({ ...i, ...patch }));
    setError(null);
  };
  const scoreBad = input.score !== null && input.score > input.maxScore;

  const save = async () => {
    try {
      if (assessment) await updateAssessment(assessment.id, input);
      else await createAssessment(input);
      toast.show(assessment ? t('common.saved') : t('academy.assessment.created'));
      onClose();
    } catch (e) {
      setError(errText(e, t));
    }
  };

  const remove = async () => {
    if (!assessment) return;
    await softDeleteAssessment(assessment.id);
    toast.show(t('academy.assessment.moved'), 'success', { label: t('notes.undo'), run: () => void restoreAssessment(assessment.id) });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={assessment ? t('academy.assessment.edit') : t('academy.assessment.new')}
      size="lg"
      footer={
        <>
          {assessment && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('academy.assessment.moveToTrash')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.name.trim() || scoreBad} onClick={() => void save()}>
            {assessment ? t('common.save') : t('academy.assessment.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('academy.assessment.name')} error={error ?? undefined}>
            {(id) => <Input id={id} autoFocus={!assessment} value={input.name} maxLength={120} placeholder={t('academy.assessment.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}
          </Field>
          <Field label={t('academy.assessment.subject')}>
            {(id) => (
              <Select id={id} value={input.subjectId} onChange={(e) => set({ subjectId: e.target.value, componentId: null })}>
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('academy.assessment.type')}>
            {(id) => (
              <Select id={id} value={input.type} onChange={(e) => set({ type: e.target.value as AssessmentType })}>
                {ASSESSMENT_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {t(`academy.assessment.types.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('academy.assessment.period')}>
            {(id) => (
              <Select id={id} value={input.periodId ?? ''} onChange={(e) => set({ periodId: e.target.value || null })}>
                <option value="">{t('academy.assessment.noPeriod')}</option>
                {data.year?.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {model?.method === 'sum' && (
            <Field label={t('academy.assessment.component')} hint={t('academy.assessment.componentHint')}>
              {(id, d) => (
                <Select id={id} aria-describedby={d} value={input.componentId ?? ''} onChange={(e) => set({ componentId: e.target.value || null })}>
                  <option value="">{t('academy.assessment.noComponent')}</option>
                  {model.components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} {c.name ? `· ${c.name}` : ''} ({c.max})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('academy.assessment.date')}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={input.date ?? ''}
                  onChange={(e) => {
                    const date = e.target.value || null;
                    // Sugere o período pela data, se as datas dos períodos estiverem preenchidas.
                    const auto = data.year ? periodForDate(data.year.periods, date) : null;
                    set({ date, periodId: auto ?? input.periodId });
                  }}
                />
              )}
            </Field>
            <Field label={t('academy.assessment.time')}>{(id) => <Input id={id} type="time" value={input.time ?? ''} onChange={(e) => set({ time: e.target.value || null })} />}</Field>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('academy.assessment.score')} error={scoreBad ? t('academy.assessment.scoreAboveMax') : undefined}>
            {(id) => <DecimalInput id={id} value={input.score} placeholder="—" onChange={(score) => set({ score })} />}
          </Field>
          <Field label={t('academy.assessment.maxScore')}>{(id) => <DecimalInput id={id} value={input.maxScore} allowEmpty={false} onChange={(v) => v !== null && v > 0 && set({ maxScore: v })} />}</Field>
          <Field label={t('academy.assessment.weight')}>{(id) => <DecimalInput id={id} value={input.weight} allowEmpty={false} onChange={(v) => v !== null && set({ weight: v })} />}</Field>
        </div>
        <Field label={t('academy.assessment.topics')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} value={input.topics} maxLength={4000} placeholder={t('academy.assessment.topicsPlaceholder')} onChange={(e) => set({ topics: e.target.value })} />}
        </Field>
        <Field label={t('academy.assessment.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} value={input.notes} maxLength={4000} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
        <Field label={t('academy.assessment.materials')} hint={t('academy.assessment.materialsHint')}>
          {(id) => <NoteLinker id={id} ids={input.noteIds} onChange={(noteIds) => set({ noteIds })} />}
        </Field>
      </div>
    </Dialog>
  );
}

/** Liga notas do Notes à avaliação (materiais relacionados), sem copiar nada. */
function NoteLinker({ id, ids, onChange }: { id: string; ids: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useSettings();
  const notes = useNotesList();
  const linked = ids.map((i) => notes.find((n) => n.id === i)).filter((n): n is NonNullable<typeof n> => !!n);
  return (
    <div className="flex flex-col gap-2">
      {linked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {linked.map((n) => (
            <li key={n.id} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-sm text-fg ring-1 ring-line">
              {n.title || t('notes.untitled')}
              <button type="button" className="text-subtle hover:text-fg" aria-label={t('profile.sections.unlink')} onClick={() => onChange(ids.filter((x) => x !== n.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <Select id={id} value="" onChange={(e) => e.target.value && onChange([...ids, e.target.value])}>
        <option value="">{t('profile.sections.linkNote')}</option>
        {notes
          .filter((n) => !ids.includes(n.id))
          .map((n) => (
            <option key={n.id} value={n.id}>
              {n.title || t('notes.untitled')}
            </option>
          ))}
      </Select>
    </div>
  );
}

function useNotesList() {
  return useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt).toArray(), []) ?? [];
}
