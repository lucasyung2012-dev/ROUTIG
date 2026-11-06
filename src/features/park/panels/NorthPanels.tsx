import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { NotebookPen } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createNote, emptyNoteInput } from '@/data/notesRepo';
import { AcademyPage } from '@/features/academy/AcademyPage';
import { ReviewHubPage } from '@/features/academy/flashcards';
import { StudyPlanPage } from '@/features/academy/StudyPlanPage';
import { useAcademyData } from '@/features/academy/useAcademyData';
import { InsightsPage, type InsightsModule } from '@/features/insights/InsightsPage';
import { LanguagesPage } from '@/features/languages/LanguagesPage';
import { useLanguages } from '@/features/languages/useLanguages';
import { LibraryPage } from '@/features/library/LibraryPage';
import { SectionBody } from '@/features/settings/SettingsPage';
import { Button } from '@/ui/Button';
import type { AcademySector, InsightsSector, LanguagesSector, LibrarySector, NotesSector } from '../interiors/north';

const linkCls = 'inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-accent ring-1 ring-inset ring-line hover:bg-surface-2';

/* ---------- Biblioteca Digital ---------- */

export function LibraryPanel({ id }: { id: LibrarySector }) {
  const { t } = useSettings();
  if (id === 'preserve')
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('park.library.preserveHint')}</p>
        <SectionBody id="backup" />
      </div>
    );
  if (id === 'transfer') return <SectionBody id="transfer" />;
  return <LibraryPage />;
}

/* ---------- Ateliê de Conhecimento (Notes) ----------
 * O editor (inclusive o manuscrito com Apple Pencil) abre na tela do Notes, sem o 3D por trás:
 * a experiência de escrita e desenho fica exatamente como é hoje. */

export function NotesPanel({ id }: { id: NotesSector }) {
  const { t } = useSettings();
  const navigate = useNavigate();
  const recent = useLiveQuery(async () => (await getDb().notes.toArray()).filter((n) => !n.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8), []);
  const newNote = () => void createNote(emptyNoteInput()).then((n) => navigate(`/notes/${n.id}`));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t(`park.notes.hints.${id}`)}</p>
      <div className="flex flex-wrap gap-2">
        {(id === 'reception' || id === 'writing' || id === 'advanced' || id === 'handwriting') && (
          <Button variant="primary" icon={<NotebookPen className="h-4 w-4" />} onClick={newNote}>
            {t('quick.note')}
          </Button>
        )}
        <Link to="/notes" className={linkCls}>
          {t('park.open', { name: t('modules.notes') })}
        </Link>
      </div>
      {(id === 'reception' || id === 'versions') && (
        <>
          <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t('park.inbox.recent')}</h3>
          {recent && recent.length === 0 && <p className="text-sm text-muted">{t('park.notes.empty')}</p>}
          <ul className="flex flex-col gap-1.5">
            {(recent ?? []).map((n) => (
              <li key={n.id}>
                <Link to={`/notes/${n.id}`} className="block truncate rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg hover:bg-surface-3">
                  {n.title || t('park.inbox.untitled')}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------- Academy ---------- */

export function AcademyPanel({ id }: { id: AcademySector }) {
  const { t } = useSettings();
  const data = useAcademyData();
  if (id === 'review') return <ReviewHubPage />;
  if (id === 'plan') return <StudyPlanPage />;
  if (id === 'rooms')
    return data.subjects.length === 0 ? (
      <p className="text-sm text-muted">{t('park.academy.noSubjects')}</p>
    ) : (
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.subjects.map((s) => (
          <li key={s.id}>
            <Link to={`/academy/subjects/${s.id}`} className="flex h-12 items-center rounded-xl bg-surface-2 px-4 text-sm font-medium text-fg ring-1 ring-inset ring-line/60 hover:bg-surface-3">
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    );
  return <AcademyPage />;
}

/* ---------- Idiomas ---------- */

export function LanguagesPanel({ id }: { id: LanguagesSector }) {
  const { t } = useSettings();
  const data = useLanguages();
  if (id === 'garden') return <LanguagesPage />;
  return data.languages.length === 0 ? (
    <p className="text-sm text-muted">{t('park.languages.none')}</p>
  ) : (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {data.languages.map((l) => (
        <li key={l.id}>
          <Link to={`/languages/${l.id}`} className="flex h-12 items-center rounded-xl bg-surface-2 px-4 text-sm font-medium text-fg ring-1 ring-inset ring-line/60 hover:bg-surface-3">
            {l.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Insights ---------- */

const INSIGHTS_MODULE: Record<Exclude<InsightsSector, 'overview'>, InsightsModule> = {
  productivity: 'tasks',
  learning: 'academy',
  habits: 'habits',
  goals: 'goals',
  activities: 'music',
  finance: 'finance',
};

export function InsightsPanel({ id }: { id: InsightsSector }) {
  // A chave recria a página ao trocar de setor, para abrir já no módulo certo.
  return <InsightsPage key={id} initialModule={id === 'overview' ? undefined : INSIGHTS_MODULE[id]} />;
}
