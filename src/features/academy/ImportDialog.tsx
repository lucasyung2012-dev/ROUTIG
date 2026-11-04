import { useRef, useState } from 'react';
import { FileUp, ScanText } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createContent, saveLesson } from '@/data/academyContentRepo';
import { AcademyRuleError, createAssessment } from '@/data/academyRepo';
import { getDb } from '@/data/db';
import { createNote, emptyNoteInput, storeNoteFile } from '@/data/notesRepo';
import { ASSESSMENT_TYPES, CONTENT_KINDS, emptyAssessmentInput, periodForDate, type AssessmentType, type ContentKind } from '@/domain/academy';
import { fold, parseIcs, parseText, type ImportKind, type ImportRow } from '@/domain/academyImport';
import { newId } from '@/domain/ids';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import type { AcademyData } from './useAcademyData';

const KINDS: ImportKind[] = ['assessment', 'content', 'lesson', 'ignore'];

/**
 * Importação acadêmica (Parte 9.14): texto colado, .txt/.csv, calendário .ics,
 * PDF e imagens. Sempre com prévia: nada é criado sem confirmação, e o que
 * parece repetido já vem desmarcado.
 */
export function ImportDialog({ data, onClose }: { data: AcademyData; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [defaultSubject, setDefaultSubject] = useState<string>(data.subjects[0]?.id ?? '');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [media, setMedia] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const year = Number(/\d{4}/.exec(data.year?.label ?? '')?.[0] ?? new Date().getFullYear());
  const subjects = data.subjects.map((s) => ({ id: s.id, name: s.name }));

  /** Marca como possível duplicação o que já existe na Academy. */
  const markDuplicates = async (list: ImportRow[]): Promise<ImportRow[]> => {
    const db = getDb();
    const ids = subjects.map((s) => s.id);
    const [asm, contents, lessons] = await Promise.all([
      db.assessments.where('subjectId').anyOf(ids).filter((a) => !a.deletedAt).toArray(),
      db.contents.where('subjectId').anyOf(ids).filter((c) => !c.deletedAt).toArray(),
      db.lessons.where('subjectId').anyOf(ids).filter((l) => !l.deletedAt).toArray(),
    ]);
    const seen = new Set<string>();
    return list.map((r) => {
      const key = `${r.kind}|${r.subjectId}|${fold(r.title)}|${r.date ?? ''}`;
      const inBatch = seen.has(key);
      seen.add(key);
      const exists =
        r.kind === 'assessment'
          ? asm.some((a) => a.subjectId === r.subjectId && fold(a.name) === fold(r.title) && a.date === r.date)
          : r.kind === 'content'
            ? contents.some((c) => c.subjectId === r.subjectId && fold(c.title) === fold(r.title))
            : r.kind === 'lesson'
              ? lessons.some((l) => l.subjectId === r.subjectId && l.date === r.date && fold(l.topic) === fold(r.title))
              : false;
      return { ...r, duplicate: exists || inBatch };
    });
  };

  const showPreview = async (list: ImportRow[]) => {
    const marked = await markDuplicates(list);
    setRows(marked);
    setSelected(new Set(marked.filter((r) => r.kind !== 'ignore' && !r.duplicate && r.subjectId).map((r) => r.id)));
  };

  const readFile = async (f: File) => {
    const name = f.name.toLowerCase();
    if (f.type.startsWith('image/') || f.type === 'application/pdf' || name.endsWith('.pdf')) {
      setMedia(f);
      return;
    }
    const content = await f.text();
    if (name.endsWith('.ics') || content.includes('BEGIN:VCALENDAR')) await showPreview(parseIcs(content, { subjects, defaultSubjectId: defaultSubject || null }));
    else {
      setText(content);
      await showPreview(parseText(content, { year, subjects, defaultSubjectId: defaultSubject || null }));
    }
  };

  const update = (id: string, patch: Partial<ImportRow>) => setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const create = async () => {
    if (!rows || !data.year) return;
    setBusy(true);
    const counts = { assessment: 0, content: 0, lesson: 0, skipped: 0 };
    // Árvore de conteúdos: o último item criado em cada nível, por disciplina.
    const stack = new Map<string, (string | null)[]>();
    for (const r of rows) {
      if (!selected.has(r.id) || r.kind === 'ignore' || !r.subjectId) continue;
      try {
        if (r.kind === 'assessment') {
          await createAssessment({
            ...emptyAssessmentInput(r.subjectId, periodForDate(data.year.periods, r.date) ?? data.year.periods[0]?.id ?? null),
            name: r.title.slice(0, 120),
            type: r.assessmentType,
            date: r.date,
            time: r.time,
            score: r.score !== null && (r.maxScore ?? 10) >= r.score ? r.score : null,
            maxScore: r.maxScore ?? 10,
          });
          counts.assessment++;
        } else if (r.kind === 'content') {
          const levels = stack.get(r.subjectId) ?? [];
          const parent = r.depth > 0 ? (levels[r.depth - 1] ?? null) : null;
          const c = await createContent(r.subjectId, parent, r.contentKind, r.title);
          levels[r.depth] = c.id;
          levels.length = r.depth + 1;
          stack.set(r.subjectId, levels);
          counts.content++;
        } else if (r.kind === 'lesson' && r.date) {
          await saveLesson(null, { subjectId: r.subjectId, date: r.date, teacherId: data.subjectById.get(r.subjectId)?.teacherId ?? null, contentIds: [], topic: r.title.slice(0, 300), notes: '', difficulties: '', activities: '', observations: '', noteIds: [] });
          counts.lesson++;
        }
      } catch (e) {
        if (e instanceof AcademyRuleError) counts.skipped++;
        else throw e;
      }
    }
    setBusy(false);
    toast.show(t('academy.import.done', counts));
    onClose();
  };

  /** PDF ou imagem: guarda como material numa nota da disciplina (o texto não é lido sem IA). */
  const saveMedia = async () => {
    if (!media || !defaultSubject) return;
    setBusy(true);
    try {
      const file = await storeNoteFile(media, media.name);
      const subject = data.subjectById.get(defaultSubject);
      const block = media.type.startsWith('image/') ? { id: newId('blk'), type: 'image' as const, fileId: file.id, caption: media.name } : { id: newId('blk'), type: 'file' as const, fileId: file.id, name: media.name, size: media.size };
      await createNote(emptyNoteInput({ title: `${subject?.name ?? ''} · ${media.name}`, mode: 'blocks', blocks: [block], links: [{ type: 'subject', id: defaultSubject }] }));
      toast.show(t('academy.import.mediaSaved'));
      onClose();
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const chosen = rows?.filter((r) => selected.has(r.id) && r.kind !== 'ignore' && r.subjectId).length ?? 0;

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('academy.import.title')}
      description={t('academy.import.hint')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={rows || media ? () => (setRows(null), setMedia(null)) : onClose}>
            {rows || media ? t('common.back') : t('common.cancel')}
          </Button>
          {media ? (
            <Button variant="primary" loading={busy} disabled={!defaultSubject} onClick={() => void saveMedia()}>
              {t('academy.import.saveMedia')}
            </Button>
          ) : rows ? (
            <Button variant="primary" loading={busy} disabled={chosen === 0} onClick={() => void create()}>
              {t('academy.import.create', { count: chosen })}
            </Button>
          ) : (
            <Button variant="primary" disabled={!text.trim()} onClick={() => void showPreview(parseText(text, { year, subjects, defaultSubjectId: defaultSubject || null }))}>
              {t('academy.import.preview')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('academy.import.defaultSubject')} hint={t('academy.import.defaultSubjectHint')}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={defaultSubject} onChange={(e) => setDefaultSubject(e.target.value)}>
              {data.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {media ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface-2/50 p-4 text-sm">
            <p className="font-medium text-fg">{media.name}</p>
            <p className="text-muted">{t('academy.import.mediaHint')}</p>
            <p className="flex items-start gap-2 text-muted">
              <ScanText className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              {t('academy.import.liveText')}
            </p>
          </div>
        ) : !rows ? (
          <>
            <Field label={t('academy.import.paste')}>
              {(id) => <Textarea id={id} rows={8} value={text} placeholder={t('academy.import.pastePlaceholder')} onChange={(e) => setText(e.target.value)} />}
            </Field>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.csv,.ics,text/plain,text/csv,text/calendar,application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void readFile(f);
              }}
            />
            <Button variant="secondary" className="w-fit" icon={<FileUp className="h-4 w-4" />} onClick={() => fileInput.current?.click()}>
              {t('academy.import.file')}
            </Button>
            <p className="text-xs text-muted">{t('academy.import.formats')}</p>
          </>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">{t('academy.import.nothing')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{t('academy.import.reviewHint')}</p>
            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <li key={r.id} className={cn('flex flex-col gap-2 rounded-xl p-3 ring-1', r.duplicate ? 'bg-warning/10 ring-warning/30' : 'bg-surface-2/50 ring-line/60', !selected.has(r.id) && 'opacity-60')}>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      aria-label={t('academy.import.include')}
                      className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--accent))]"
                      checked={selected.has(r.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? new Set([...s, r.id]) : new Set([...s].filter((x) => x !== r.id))))}
                    />
                    <div className="min-w-0 flex-1">
                      <Input aria-label={t('academy.import.titleLabel')} value={r.title} maxLength={200} onChange={(e) => update(r.id, { title: e.target.value })} style={{ marginLeft: r.kind === 'content' ? `${r.depth}rem` : undefined }} />
                      <p className="mt-1 truncate text-xs text-subtle">{r.source}</p>
                    </div>
                    {r.duplicate && <Badge tone="warning">{t('academy.import.duplicate')}</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Select aria-label={t('academy.import.kind')} value={r.kind} onChange={(e) => update(r.id, { kind: e.target.value as ImportKind })}>
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`academy.import.kinds.${k}`)}
                        </option>
                      ))}
                    </Select>
                    <Select aria-label={t('academy.assessment.subject')} value={r.subjectId ?? ''} onChange={(e) => update(r.id, { subjectId: e.target.value || null })}>
                      <option value="">{t('academy.import.chooseSubject')}</option>
                      {data.subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                    {r.kind === 'assessment' && (
                      <Select aria-label={t('academy.assessment.type')} value={r.assessmentType} onChange={(e) => update(r.id, { assessmentType: e.target.value as AssessmentType })}>
                        {ASSESSMENT_TYPES.map((k) => (
                          <option key={k} value={k}>
                            {t(`academy.assessment.types.${k}`)}
                          </option>
                        ))}
                      </Select>
                    )}
                    {r.kind === 'content' && (
                      <Select aria-label={t('academy.contents.kind')} value={r.contentKind} onChange={(e) => update(r.id, { contentKind: e.target.value as ContentKind })}>
                        {CONTENT_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {t(`academy.contents.kinds.${k}`)}
                          </option>
                        ))}
                      </Select>
                    )}
                    {(r.kind === 'assessment' || r.kind === 'lesson') && <Input type="date" aria-label={t('academy.assessment.date')} value={r.date ?? ''} onChange={(e) => update(r.id, { date: e.target.value || null })} />}
                  </div>
                  {r.kind === 'assessment' && r.score !== null && <p className="text-xs text-muted">{t('academy.import.scoreFound', { score: r.score, max: r.maxScore ?? 10 })}</p>}
                  {r.kind === 'lesson' && !r.date && <p className="text-xs text-warning">{t('academy.import.lessonNeedsDate')}</p>}
                  {!r.subjectId && r.kind !== 'ignore' && <p className="text-xs text-warning">{t('academy.import.needsSubject')}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
