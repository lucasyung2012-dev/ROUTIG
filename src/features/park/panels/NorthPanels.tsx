import type { AcademySector, InsightsSector, LanguagesSector, LibrarySector, NotesSector } from '../interiors/north';
import { AcademyStation } from './north/AcademyStations';
import { InsightsStation } from './north/InsightsStations';
import { LanguagesStation } from './north/LanguagesStations';
import { PreserveStation, TransferStation } from './north/LibraryArchive';
import { LibraryStation } from './north/LibraryStations';
import { NotesStation } from './north/NotesStations';

/*
 * Campus Norte: cada setor abre a estação nativa do lugar (pasta `north/`), que lê e grava pelos mesmos
 * repositórios e hooks do Control Room. Nada de banco paralelo; o Control Room fica só como link discreto.
 */

/* ---------- Biblioteca Digital ---------- */

export function LibraryPanel({ id }: { id: LibrarySector }) {
  // Preservação e transferência: estações próprias, com as mesmas funções do backup e da exportação dos Settings.
  if (id === 'preserve') return <PreserveStation />;
  if (id === 'transfer') return <TransferStation />;
  return <LibraryStation key={id} id={id} />;
}

/* ---------- Ateliê de Conhecimento (Notes) ---------- */

export function NotesPanel({ id }: { id: NotesSector }) {
  return <NotesStation key={id} id={id} />;
}

/* ---------- Academy ---------- */

export function AcademyPanel({ id }: { id: AcademySector }) {
  return <AcademyStation key={id} id={id} />;
}

/* ---------- Idiomas ---------- */

/** `zone`: a sala do andar que abriu o setor (o mural de gramática e as cabines de pronúncia têm estação própria). */
export function LanguagesPanel({ id, zone }: { id: LanguagesSector; zone?: string | null }) {
  return <LanguagesStation key={`${id}:${zone ?? ''}`} id={id} zone={zone ?? null} />;
}

/* ---------- Insights ---------- */

export function InsightsPanel({ id }: { id: InsightsSector }) {
  return <InsightsStation key={id} id={id} />;
}
