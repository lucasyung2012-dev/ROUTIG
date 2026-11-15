import { useSettings } from '@/app/SettingsProvider';
import { SectionBody } from '@/features/settings/SettingsPage';
import type { AcademySector, InsightsSector, LanguagesSector, LibrarySector, NotesSector } from '../interiors/north';
import { AcademyStation } from './north/AcademyStations';
import { InsightsStation } from './north/InsightsStations';
import { LanguagesStation } from './north/LanguagesStations';
import { LibraryStation } from './north/LibraryStations';
import { NotesStation } from './north/NotesStations';
import { ControlRoomLink, Station } from './north/station';

/*
 * Campus Norte: cada setor abre a estação nativa do lugar (pasta `north/`), que lê e grava pelos mesmos
 * repositórios e hooks do Control Room. Nada de banco paralelo; o Control Room fica só como link discreto.
 */

/* ---------- Biblioteca Digital ---------- */

export function LibraryPanel({ id }: { id: LibrarySector }) {
  const { t } = useSettings();
  // Preservação e transferência são as próprias seções de backup e transferência dos Settings (o mesmo serviço).
  if (id === 'preserve')
    return (
      <Station building="library" label={t('park.library.sectors.preserve')}>
        <p className="text-sm text-muted">{t('park.library.preserveHint')}</p>
        <SectionBody id="backup" />
        <ControlRoomLink to="/library" />
      </Station>
    );
  if (id === 'transfer')
    return (
      <Station building="library" label={t('park.library.sectors.transfer')}>
        <SectionBody id="transfer" />
      </Station>
    );
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

export function LanguagesPanel({ id }: { id: LanguagesSector }) {
  return <LanguagesStation key={id} id={id} />;
}

/* ---------- Insights ---------- */

export function InsightsPanel({ id }: { id: InsightsSector }) {
  return <InsightsStation key={id} id={id} />;
}
