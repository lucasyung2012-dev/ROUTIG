import type { FocusSector, GoalsSector, HabitsSector, MusicSector, SportsSector } from '../interiors/westsouth';
import { FocusHistoryStation, FocusPrepareStation, FocusStation } from './westsouth/FocusStations';
import { GoalsAchievedStation, GoalsAnalysisStation, GoalsGardenStation } from './westsouth/GoalsStations';
import { HabitsAnalysisStation, HabitsEvolutionStation, HabitsLabStation, HabitsTodayStation } from './westsouth/HabitsStations';
import { MusicAnalysisStation, MusicAtriumStation, MusicInstrumentsStation } from './westsouth/MusicStations';
import { SportsAnalysisStation, SportsAtriumStation, SportsModalitiesStation } from './westsouth/SportsStations';

/*
 * Estações do setor oeste/sul do Campus. Cada setor é uma estação física do edifício com a interface
 * própria do Campus (não a página do Control Room), usando os mesmos hooks e repositórios do módulo.
 * O Control Room continua a um toque ("Abrir no Control Room") para a edição avançada.
 */

/* ---------- Jardim da Concentração (Focus) ---------- */

export function FocusPanel({ id }: { id: FocusSector }) {
  switch (id) {
    case 'history':
      return <FocusHistoryStation />;
    case 'distraction':
      return <FocusPrepareStation />;
    default:
      return <FocusStation />;
  }
}

/* ---------- Estufa de Hábitos ---------- */

export function HabitsPanel({ id }: { id: HabitsSector }) {
  switch (id) {
    case 'greenhouse':
      return <HabitsLabStation />;
    case 'evolution':
      return <HabitsEvolutionStation />;
    case 'analysis':
      return <HabitsAnalysisStation />;
    default:
      return <HabitsTodayStation />;
  }
}

/* ---------- Centro de Objetivos (Goals) ---------- */

export function GoalsPanel({ id }: { id: GoalsSector }) {
  switch (id) {
    case 'achieved':
      return <GoalsAchievedStation />;
    case 'analysis':
      return <GoalsAnalysisStation />;
    default:
      return <GoalsGardenStation />;
  }
}

/* ---------- Conservatório Musical ---------- */

export function MusicPanel({ id }: { id: MusicSector }) {
  switch (id) {
    case 'instruments':
      return <MusicInstrumentsStation />;
    case 'analysis':
      return <MusicAnalysisStation />;
    default:
      return <MusicAtriumStation />;
  }
}

/* ---------- Centro Esportivo ---------- */

export function SportsPanel({ id }: { id: SportsSector }) {
  switch (id) {
    case 'modalities':
      return <SportsModalitiesStation />;
    case 'analysis':
      return <SportsAnalysisStation />;
    default:
      return <SportsAtriumStation />;
  }
}
