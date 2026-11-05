import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Minus, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createItem, createSong, MusicRuleError, restoreItem, restoreSong, savePractice, softDeleteItem, softDeleteSong, updateItem, updateSong } from '@/data/musicRepo';
import { storeNoteFile } from '@/data/notesRepo';
import { todayKey } from '@/domain/dates';
import {
  chordsInSheet,
  emptyItemInput,
  emptyPracticeInput,
  emptySongInput,
  isChordLine,
  ITEM_STATUSES,
  itemInputOf,
  parseChordList,
  parseFrets,
  practiceInputOf,
  SONG_STATUSES,
  songInputOf,
  type Instrument,
  type MusicCategory,
  type MusicItem,
  type MusicItemInput,
  type PracticeInput,
  type PracticeSession,
  type Song,
  type SongInput,
} from '@/domain/music';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { useObjectUrl } from '@/features/files/useObjectUrl';

/* ---------- Diagrama de acorde ---------- */

/** Desenha o acorde a partir das casas ("x32010"). Mostra 5 casas a partir da mais baixa usada. */
export function ChordDiagram({ frets, strings, size = 96, label }: { frets: string; strings: number; size?: number; label?: string }) {
  const parsed = parseFrets(frets, strings);
  if (!parsed) return null;
  const pressed = parsed.filter((f): f is number => f !== null && f > 0);
  const min = pressed.length ? Math.min(...pressed) : 1;
  const max = pressed.length ? Math.max(...pressed) : 1;
  const start = max <= 5 ? 1 : min;
  const rows = 5;
  const w = size;
  const h = size * 1.25;
  const left = 14;
  const top = 18;
  const gw = w - left - 8;
  const gh = h - top - 6;
  const sx = gw / (strings - 1);
  const sy = gh / rows;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label ?? frets} className="text-fg">
      {start > 1 && (
        <text x={2} y={top + sy * 0.7} fontSize={9} fill="currentColor" opacity={0.7}>
          {start}
        </text>
      )}
      <line x1={left} y1={top} x2={left + gw} y2={top} stroke="currentColor" strokeWidth={start === 1 ? 3 : 1} />
      {Array.from({ length: rows }, (_, r) => (
        <line key={r} x1={left} y1={top + sy * (r + 1)} x2={left + gw} y2={top + sy * (r + 1)} stroke="currentColor" strokeOpacity={0.35} />
      ))}
      {Array.from({ length: strings }, (_, s) => (
        <line key={s} x1={left + sx * s} y1={top} x2={left + sx * s} y2={top + gh} stroke="currentColor" strokeOpacity={0.6} />
      ))}
      {parsed.map((f, s) => {
        const x = left + sx * s;
        if (f === null)
          return (
            <text key={s} x={x} y={top - 5} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.7}>
              ×
            </text>
          );
        if (f === 0) return <circle key={s} cx={x} cy={top - 8} r={3.5} fill="none" stroke="currentColor" />;
        const row = f - start;
        if (row < 0 || row >= rows) return null;
        return <circle key={s} cx={x} cy={top + sy * (row + 0.5)} r={Math.min(sx, sy) * 0.32} className="fill-accent" />;
      })}
    </svg>
  );
}

/* ---------- Cifra (leitura com rolagem automática) ---------- */

export function ChordSheetView({ song, onClose }: { song: Song; onClose: () => void }) {
  const { t } = useSettings();
  const [size, setSize] = useState(16);
  const [speed, setSpeed] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!speed) return;
    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const el = box.current;
      if (el) el.scrollTop += ((now - last) / 1000) * speed * 12;
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [speed]);
  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} size="lg" title={song.name} description={[song.artist, song.chords.join(' · ')].filter(Boolean).join(' — ')}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label={t('music.smaller')} icon={<Minus className="h-4 w-4" />} onClick={() => setSize((s) => Math.max(11, s - 1))} />
          <span className="w-12 text-center text-sm tabular text-muted">{size}px</span>
          <IconButton label={t('music.larger')} icon={<Plus className="h-4 w-4" />} onClick={() => setSize((s) => Math.min(30, s + 1))} />
          <span className="mx-2 h-6 w-px bg-line" aria-hidden />
          <Button size="sm" variant={speed ? 'primary' : 'secondary'} icon={speed ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} onClick={() => setSpeed(speed ? 0 : 2)}>
            {speed ? t('music.stopScroll') : t('music.autoScroll')}
          </Button>
          {speed > 0 && (
            <>
              <IconButton label={t('music.slower')} icon={<Minus className="h-4 w-4" />} onClick={() => setSpeed((s) => Math.max(1, s - 1))} />
              <span className="text-sm tabular text-muted">{speed}×</span>
              <IconButton label={t('music.faster')} icon={<Plus className="h-4 w-4" />} onClick={() => setSpeed((s) => Math.min(10, s + 1))} />
            </>
          )}
        </div>
        <div ref={box} className="max-h-[65vh] overflow-y-auto rounded-2xl bg-surface-2/60 p-4">
          <pre className="whitespace-pre-wrap font-mono leading-relaxed" style={{ fontSize: size }}>
            {song.chordSheet.split('\n').map((line, i) => (
              <span key={i} className={cn('block', isChordLine(line) ? 'font-semibold text-accent' : 'text-fg')}>
                {line || ' '}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- Escolha de 1 a 5 ---------- */

function Dots({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`${label}: ${n}`}
          onClick={() => onChange(value === n ? null : n)}
          className={cn('h-10 w-10 rounded-xl text-sm font-semibold ring-1 ring-inset transition', value !== null && n <= value ? 'bg-brand text-white ring-transparent' : 'bg-surface-2 text-muted ring-line hover:bg-surface-3')}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/* ---------- Técnica, acorde, ritmo, escala, dedilhado, teoria ---------- */

export function ItemDialog({ instrument, category, item, onClose }: { instrument: Instrument; category: MusicCategory; item?: MusicItem; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<MusicItemInput>(() => (item ? itemInputOf(item) : emptyItemInput(instrument.id, category)));
  const set = (p: Partial<MusicItemInput>) => setInput((i) => ({ ...i, ...p }));
  const fretsOk = !input.frets || !!parseFrets(input.frets, instrument.strings);
  const save = async () => {
    try {
      if (item) await updateItem(item.id, input);
      else await createItem(input);
      toast.show(t('music.saved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof MusicRuleError && e.code === 'duplicate' ? t('music.errors.duplicateItem') : t('music.errors.invalid'), 'error');
    }
  };
  const remove = async () => {
    if (!item) return;
    await softDeleteItem(item.id);
    toast.show(t('music.moved'), 'success', { label: t('notes.undo'), run: () => void restoreItem(item.id) });
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={item ? t(`music.editItem.${category}`) : t(`music.newItem.${category}`)}
      footer={
        <>
          {item && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('music.moveToTrash')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.name.trim() || !fretsOk} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('music.fields.name')}>{(id) => <Input id={id} autoFocus value={input.name} maxLength={120} placeholder={t(`music.namePlaceholder.${category}`)} onChange={(e) => set({ name: e.target.value })} />}</Field>
          <Field label={t('music.fields.status')}>
            {(id) => (
              <Select id={id} value={input.status} onChange={(e) => set({ status: e.target.value as MusicItemInput['status'] })}>
                {ITEM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`music.itemStatuses.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {category === 'chord' && instrument.strings > 0 && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-48 flex-1">
              <Field label={t('music.fields.frets')} hint={t('music.fretsHint', { strings: instrument.strings, tuning: instrument.tuning || '—' })} error={fretsOk ? undefined : t('music.errors.frets', { strings: instrument.strings })}>
                {(id, d) => <Input id={id} aria-describedby={d} value={input.frets} maxLength={40} placeholder="x32010" onChange={(e) => set({ frets: e.target.value })} className="font-mono" />}
              </Field>
            </div>
            {input.frets && fretsOk && <ChordDiagram frets={input.frets} strings={instrument.strings} label={input.name} />}
          </div>
        )}
        {(category === 'rhythm' || category === 'fingerpicking' || category === 'scale') && (
          <Field label={t(`music.fields.pattern.${category}`)} hint={t(`music.patternHint.${category}`)}>
            {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} maxLength={500} value={input.pattern} onChange={(e) => set({ pattern: e.target.value })} className="font-mono" />}
          </Field>
        )}
        <Field label={category === 'theory' ? t('music.fields.content') : t('music.fields.description')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={category === 'theory' ? 6 : 3} maxLength={20000} value={input.description} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('music.fields.difficulty')}>{() => <Dots value={input.difficulty} onChange={(difficulty) => set({ difficulty })} label={t('music.fields.difficulty')} />}</Field>
          <Field label={t('music.fields.confidence')} hint={t('music.confidenceHint')}>
            {() => <Dots value={input.confidence} onChange={(confidence) => set({ confidence })} label={t('music.fields.confidence')} />}
          </Field>
        </div>
        <Field label={t('music.fields.difficulties')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={2} maxLength={4000} value={input.difficulties} placeholder={t('music.difficultiesPlaceholder')} onChange={(e) => set({ difficulties: e.target.value })} />}
        </Field>
        <Field label={t('music.fields.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={2} maxLength={20000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------- Música do repertório (Parte 11.3) ---------- */

function FileChip({ file, onRemove }: { file: { fileId: string; name: string }; onRemove: () => void }) {
  const { t } = useSettings();
  const url = useObjectUrl(file.fileId);
  return (
    <li className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
      <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-fg hover:text-accent">
          {file.name}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted">{file.name}</span>
      )}
      <IconButton label={t('music.removeFile')} icon={<X className="h-4 w-4" />} onClick={onRemove} />
    </li>
  );
}

export function SongDialog({ instrument, song, onClose }: { instrument: Instrument; song?: Song; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<SongInput>(() => (song ? songInputOf(song) : emptySongInput(instrument.id)));
  const [chordText, setChordText] = useState(() => (song?.chords ?? []).join(' '));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<SongInput>) => setInput((i) => ({ ...i, ...p }));
  const fromSheet = chordsInSheet(input.chordSheet).filter((c) => !parseChordList(chordText).some((x) => x.toLowerCase() === c.toLowerCase()));

  const save = async () => {
    const data = { ...input, chords: parseChordList(chordText) };
    try {
      if (song) await updateSong(song.id, data);
      else await createSong(data);
      toast.show(t('music.saved'));
      onClose();
    } catch (e) {
      toast.show(e instanceof MusicRuleError && e.code === 'duplicate' ? t('music.errors.duplicateSong') : input.videoUrl && !/^https?:\/\//i.test(input.videoUrl) ? t('music.errors.url') : t('music.errors.invalid'), 'error');
    }
  };
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added = [];
      for (const f of Array.from(files)) {
        const stored = await storeNoteFile(f, f.name);
        added.push({ fileId: stored.id, name: stored.name, size: stored.size });
      }
      set({ files: [...input.files, ...added.filter((a) => !input.files.some((x) => x.fileId === a.fileId))] });
    } catch {
      toast.show(t('notes.blocks.fileTooLarge'), 'error');
    } finally {
      setUploading(false);
    }
  };
  const remove = async () => {
    if (!song) return;
    await softDeleteSong(song.id);
    toast.show(t('music.moved'), 'success', { label: t('notes.undo'), run: () => void restoreSong(song.id) });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={song ? t('music.editSong') : t('music.newSong')}
      footer={
        <>
          {song && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('music.moveToTrash')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.name.trim() || uploading} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('music.fields.songName')}>{(id) => <Input id={id} autoFocus value={input.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} />}</Field>
          <Field label={t('music.fields.artist')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} value={input.artist} maxLength={120} onChange={(e) => set({ artist: e.target.value })} />}
          </Field>
          <Field label={t('music.fields.composer')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} value={input.composer} maxLength={120} onChange={(e) => set({ composer: e.target.value })} />}
          </Field>
          <Field label={t('music.fields.genre')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} value={input.genre} maxLength={60} placeholder={t('music.genrePlaceholder')} onChange={(e) => set({ genre: e.target.value })} />}
          </Field>
          <Field label={t('music.fields.status')}>
            {(id) => (
              <Select id={id} value={input.status} onChange={(e) => set({ status: e.target.value as SongInput['status'] })}>
                {SONG_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`music.songStatuses.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('music.fields.progress', { pct: input.progress ?? '—' })} hint={t('music.progressHint')}>
            {(id, d) => <input id={id} aria-describedby={d} type="range" min={0} max={100} step={5} value={input.progress ?? 0} onChange={(e) => set({ progress: Number(e.target.value) })} className="w-full accent-[rgb(var(--accent))]" />}
          </Field>
        </div>
        <Field label={t('music.fields.difficulty')}>{() => <Dots value={input.difficulty} onChange={(difficulty) => set({ difficulty })} label={t('music.fields.difficulty')} />}</Field>
        <Field label={t('music.fields.chords')} hint={t('music.chordsHint')}>
          {(id, d) => <Input id={id} aria-describedby={d} value={chordText} placeholder="Am C G F" onChange={(e) => setChordText(e.target.value)} className="font-mono" />}
        </Field>
        {fromSheet.length > 0 && (
          <Button size="sm" variant="ghost" className="w-fit" onClick={() => setChordText(parseChordList(`${chordText} ${fromSheet.join(' ')}`).join(' '))}>
            {t('music.addFromSheet', { chords: fromSheet.join(' ') })}
          </Button>
        )}
        <Field label={t('music.fields.chordSheet')} optionalLabel={t('common.optional')} hint={t('music.chordSheetHint')}>
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={8} maxLength={60000} value={input.chordSheet} onChange={(e) => set({ chordSheet: e.target.value })} className="font-mono text-sm" />}
        </Field>
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t('music.fields.sheetMusic')}</span>
          {input.files.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {input.files.map((f) => (
                <FileChip key={f.fileId} file={f} onRemove={() => set({ files: input.files.filter((x) => x.fileId !== f.fileId) })} />
              ))}
            </ul>
          )}
          <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
          <Button size="sm" variant="secondary" className="w-fit" icon={<Plus className="h-4 w-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>
            {t('music.addFile')}
          </Button>
          <p className="text-xs text-muted">{t('music.sheetMusicHint')}</p>
        </section>
        <Field label={t('music.fields.video')} optionalLabel={t('common.optional')} hint={t('music.videoHint')}>
          {(id, d) => <Input id={id} aria-describedby={d} type="url" inputMode="url" value={input.videoUrl} placeholder="https://" onChange={(e) => set({ videoUrl: e.target.value.trim() })} />}
        </Field>
        <Field label={t('music.fields.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={3} maxLength={20000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}

export function VideoLink({ url }: { url: string }) {
  const { t } = useSettings();
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      {t('music.openVideo')}
    </a>
  );
}

/* ---------- Sessão de prática (Parte 11.5) ---------- */

function MultiPick({ label, options, value, onChange }: { label: string; options: Array<{ id: string; name: string }>; value: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
              className={cn('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line hover:text-fg')}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PracticeDialog({ instrument, session, songs, items, onClose }: { instrument: Instrument; session?: PracticeSession; songs: Song[]; items: MusicItem[]; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const [input, setInput] = useState<PracticeInput>(() => (session ? practiceInputOf(session) : emptyPracticeInput(instrument.id, today)));
  const set = (p: Partial<PracticeInput>) => setInput((i) => ({ ...i, ...p }));
  const notes = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt).toArray(), []) ?? [];
  const activeSongs = songs.filter((s) => s.status !== 'archived' || input.songIds.includes(s.id));
  const save = async () => {
    try {
      await savePractice(session?.id ?? null, input);
      toast.show(t('music.practiceSaved', { min: input.durationMin }));
      onClose();
    } catch {
      toast.show(t('music.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={session ? t('music.editPractice') : t('music.newPractice')}
      description={instrument.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('music.fields.date')}>{(id) => <Input id={id} type="date" value={input.date} max={today} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
          <Field label={t('music.fields.duration')}>
            {(id) => (
              <div className="flex items-center gap-2">
                <Input id={id} type="number" inputMode="numeric" min={1} max={1440} value={input.durationMin} onChange={(e) => set({ durationMin: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
                <span className="text-sm text-muted">min</span>
              </div>
            )}
          </Field>
        </div>
        <Field label={t('music.fields.goal')} optionalLabel={t('common.optional')}>
          {(id) => <Input id={id} value={input.goal} maxLength={2000} placeholder={t('music.goalPlaceholder')} onChange={(e) => set({ goal: e.target.value })} />}
        </Field>
        <MultiPick label={t('music.fields.songs')} options={activeSongs} value={input.songIds} onChange={(songIds) => set({ songIds })} />
        <MultiPick label={t('music.fields.items')} options={items.map((i) => ({ id: i.id, name: `${i.name} · ${t(`music.categoryShort.${i.category}`)}` }))} value={input.itemIds} onChange={(itemIds) => set({ itemIds })} />
        <Field label={t('music.fields.practiced')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={3} maxLength={10000} value={input.practiced} placeholder={t('music.practicedPlaceholder')} onChange={(e) => set({ practiced: e.target.value })} />}
        </Field>
        <Field label={t('music.fields.difficulties')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={2} maxLength={4000} value={input.difficulties} onChange={(e) => set({ difficulties: e.target.value })} />}
        </Field>
        <Field label={t('music.fields.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={2} maxLength={10000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
        {notes.length > 0 && (
          <Field label={t('music.fields.materials')} optionalLabel={t('common.optional')}>
            {(id) => (
              <div className="flex flex-col gap-2">
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
                {input.noteIds.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {input.noteIds.map((nid) => (
                      <li key={nid} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm">
                        {notes.find((n) => n.id === nid)?.title || t('notes.untitled')}
                        <button type="button" aria-label={t('music.removeFile')} onClick={() => set({ noteIds: input.noteIds.filter((x) => x !== nid) })} className="text-subtle hover:text-danger">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Field>
        )}
      </div>
    </Dialog>
  );
}
