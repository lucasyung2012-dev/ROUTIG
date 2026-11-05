import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Mic, NotebookPen, Save, Square, Volume2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createNote, emptyNoteInput, linkNote, storeNoteFile } from '@/data/notesRepo';
import { newId } from '@/domain/ids';
import type { Language } from '@/domain/languages';
import { notePreview } from '@/domain/notes';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select } from '@/ui/Field';
import { EmptyState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { useVocab } from './VocabTab';
import { canSpeak, speak, speakTextOf } from './vocabUtils';

/** Pronúncia (Parte 10.2): ouvir o modelo na voz do aparelho, gravar a própria voz e comparar. */
export function PronunciationTab({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const toast = useToast();
  const { list } = useVocab(lang.id);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(
    () => () => {
      if (clip) URL.revokeObjectURL(clip.url);
    },
    [clip],
  );

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/mp4' });
        setClip({ blob, url: URL.createObjectURL(blob) });
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      toast.show(t('languages.pron.micDenied'), 'error');
    }
  };
  const stop = () => {
    recorder.current?.stop();
    setRecording(false);
  };

  /** Guarda a gravação como material do idioma (uma nota com o áudio). */
  const save = async () => {
    if (!clip) return;
    try {
      const ext = clip.blob.type.includes('webm') ? 'webm' : 'm4a';
      const file = await storeNoteFile(clip.blob, `${lang.name} - ${text || 'gravação'}.${ext}`);
      await createNote(
        emptyNoteInput({
          title: t('languages.pron.noteTitle', { lang: lang.name, text: text || t('languages.pron.free') }),
          mode: 'blocks',
          blocks: [
            { id: newId('blk'), type: 'paragraph', text },
            { id: newId('blk'), type: 'file', fileId: file.id, name: file.name, size: file.size },
          ],
          links: [{ type: 'language', id: lang.id }],
        }),
      );
      toast.show(t('languages.pron.saved'));
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('languages.pron.hint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('languages.pron.text')}>{(id) => <Input id={id} value={text} maxLength={300} placeholder={t('languages.pron.textPlaceholder')} onChange={(e) => setText(e.target.value)} />}</Field>
          {list.length > 0 && (
            <Field label={t('languages.pron.fromVocab')}>
              {(id) => (
                <Select id={id} value="" onChange={(e) => {
                  const v = list.find((x) => x.id === e.target.value);
                  if (v) setText(speakTextOf(v));
                }}>
                  <option value="">{t('languages.pron.pick')}</option>
                  {list.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.term} · {v.translation}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Volume2 className="h-4 w-4" />} disabled={!text.trim() || !canSpeak()} onClick={() => speak(text, lang.code)}>
            {t('languages.pron.listenModel')}
          </Button>
          {supported ? (
            recording ? (
              <Button variant="danger" icon={<Square className="h-4 w-4" />} onClick={stop}>
                {t('languages.pron.stop')}
              </Button>
            ) : (
              <Button variant="primary" icon={<Mic className="h-4 w-4" />} onClick={() => void start()}>
                {clip ? t('languages.pron.recordAgain') : t('languages.pron.record')}
              </Button>
            )
          ) : (
            <span className="text-sm text-muted">{t('languages.pron.noRecorder')}</span>
          )}
        </div>
        {recording && <p className="text-sm font-medium text-danger">{t('languages.pron.recording')}</p>}
        {clip && (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-2/60 p-3">
            <span className="text-sm font-medium text-fg">{t('languages.pron.yourVoice')}</span>
            <audio controls src={clip.url} className="w-full" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Volume2 className="h-4 w-4" />} disabled={!text.trim() || !canSpeak()} onClick={() => speak(text, lang.code)}>
                {t('languages.pron.compare')}
              </Button>
              <Button size="sm" variant="secondary" icon={<Save className="h-4 w-4" />} onClick={() => void save()}>
                {t('languages.pron.save')}
              </Button>
            </div>
          </div>
        )}
        {!canSpeak() && <p className="text-xs text-muted">{t('languages.pron.noVoice')}</p>}
      </Surface>
    </div>
  );
}

/* ---------- Materiais (Parte 10.2) ---------- */

export function MaterialsTab({ lang }: { lang: Language }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [linking, setLinking] = useState(false);
  const notes = useLiveQuery(async () => {
    const db = getDb();
    const fromSessions = new Set((await db.languageSessions.where('languageId').equals(lang.id).filter((s) => !s.deletedAt).toArray()).flatMap((s) => s.noteIds));
    return (await db.notes.filter((n) => !n.deletedAt && (n.links.some((l) => l.type === 'language' && l.id === lang.id) || fromSessions.has(n.id))).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [lang.id]);
  const all = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt).toArray(), []) ?? [];
  const newNote = async () => {
    try {
      const n = await createNote(emptyNoteInput({ title: lang.name, links: [{ type: 'language', id: lang.id }] }));
      navigate(`/notes/${n.id}`);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  const ids = new Set((notes ?? []).map((n) => n.id));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<NotebookPen className="h-4 w-4" />} onClick={() => void newNote()}>
          {t('languages.materials.newNote')}
        </Button>
        <Button variant="secondary" onClick={() => setLinking(true)}>
          {t('profile.sections.linkNote')}
        </Button>
      </div>
      <p className="text-sm text-muted">{t('languages.materials.hint')}</p>
      {!notes?.length ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.materials.emptyTitle')} body={t('languages.materials.empty')} />
        </Surface>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="block h-full rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="block truncate font-medium text-fg">{n.title || t('notes.untitled')}</span>
                <span className="mt-1 line-clamp-2 block text-sm text-muted">{notePreview(n, 140) || '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {linking && (
        <Dialog open onClose={() => setLinking(false)} closeLabel={t('common.close')} title={t('profile.sections.linkNote')} footer={<Button onClick={() => setLinking(false)}>{t('common.close')}</Button>}>
          {all.filter((n) => !ids.has(n.id)).length === 0 ? (
            <p className="text-sm text-muted">{t('academy.materials.nothingToLink')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {all
                .filter((n) => !ids.has(n.id))
                .map((n) => (
                  <li key={n.id}>
                    <button type="button" className="w-full rounded-xl px-2 py-2 text-left text-sm text-fg hover:bg-surface-2" onClick={() => void linkNote(n.id, { type: 'language', id: lang.id }).then(() => setLinking(false))}>
                      {n.title || t('notes.untitled')}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Dialog>
      )}
    </div>
  );
}
