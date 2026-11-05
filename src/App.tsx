import type { ReactNode } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { NAV_MODULE_IDS, MODULES } from '@/app/modules';
import { SettingsProvider, useSettings } from '@/app/SettingsProvider';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { AppShell } from '@/app/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ModuleRoadmapPage } from '@/features/roadmap/ModuleRoadmapPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { InboxPage } from '@/features/inbox/InboxPage';
import { NotesPage } from '@/features/notes/NotesPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ProjectPage } from '@/features/projects/ProjectPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { InterestPage } from '@/features/profile/InterestPage';
import { AcademyPage } from '@/features/academy/AcademyPage';
import { SubjectPage } from '@/features/academy/SubjectPage';
import { DeckPage, ReviewHubPage } from '@/features/academy/flashcards';
import { StudyPlanPage } from '@/features/academy/StudyPlanPage';
import { ExamPage } from '@/features/academy/ExamPage';
import { LanguagesPage } from '@/features/languages/LanguagesPage';
import { LanguagePage } from '@/features/languages/LanguagePage';
import { HabitsPage } from '@/features/habits/HabitsPage';
import { HabitPage } from '@/features/habits/HabitPage';
import { GoalsPage } from '@/features/goals/GoalsPage';
import { GoalPage } from '@/features/goals/GoalPage';
import { FocusPage } from '@/features/focus/FocusPage';
import { MusicPage } from '@/features/music/MusicPage';
import { InstrumentPage } from '@/features/music/InstrumentPage';
import { SportsPage } from '@/features/sports/SportsPage';
import { SportPage } from '@/features/sports/SportPage';
import { FinancePage } from '@/features/finance/FinancePage';
import { AssetPage } from '@/features/finance/AssetPage';
import { LibraryPage } from '@/features/library/LibraryPage';
import { InsightsPage } from '@/features/insights/InsightsPage';
import { SettingsIndexPage, SettingsSectionPage } from '@/features/settings/SettingsPage';
import { LogoComparePage } from '@/features/brand/LogoComparePage';
import { DesignSystemPage } from '@/features/design/DesignSystemPage';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { Logo } from '@/brand/Logo';
import { Button } from '@/ui/Button';
import { ErrorState } from '@/ui/States';
import { ToastProvider } from '@/ui/toast';

export function App({ extra }: { extra?: ReactNode }) {
  return (
    <SettingsProvider>
      <Toasts>
        {extra}
        <HashRouter>
          <Gate />
        </HashRouter>
      </Toasts>
    </SettingsProvider>
  );
}

function Toasts({ children }: { children: ReactNode }) {
  const { t } = useSettings();
  return <ToastProvider closeLabel={t('common.close')}>{children}</ToastProvider>;
}

/** Decide entre carregamento, erro do banco, onboarding e o app. */
function Gate() {
  const { status, settings, t } = useSettings();

  if (status === 'loading') {
    return (
      <div className="ambient flex h-full items-center justify-center" role="status" aria-label={t('common.loading')}>
        <Logo size={72} className="h-[72px] w-[72px] animate-pulse" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="ambient flex h-full items-center justify-center p-6">
        <ErrorState
          title={t('errors.title')}
          body={t('errors.dbUnavailable')}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              {t('errors.reload')}
            </Button>
          }
        />
      </div>
    );
  }

  if (!settings.onboarding.completed) return <Onboarding />;

  return (
    <ErrorBoundary
      fallback={(reset) => (
        <div className="ambient flex h-full items-center justify-center p-6">
          <ErrorState
            title={t('errors.title')}
            body={t('errors.body')}
            action={
              <Button variant="primary" onClick={reset}>
                {t('errors.reload')}
              </Button>
            }
          />
        </div>
      )}
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="notes/:id" element={<NotesPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="academy" element={<AcademyPage />} />
          <Route path="academy/subjects/:id" element={<SubjectPage />} />
          <Route path="academy/review" element={<ReviewHubPage />} />
          <Route path="academy/plan" element={<StudyPlanPage />} />
          <Route path="academy/assessments/:id" element={<ExamPage />} />
          <Route path="languages" element={<LanguagesPage />} />
          <Route path="languages/:id" element={<LanguagePage />} />
          <Route path="habits" element={<HabitsPage />} />
          <Route path="habits/:id" element={<HabitPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="goals/:id" element={<GoalPage />} />
          <Route path="focus" element={<FocusPage />} />
          <Route path="music" element={<MusicPage />} />
          <Route path="music/:id" element={<InstrumentPage />} />
          <Route path="sports" element={<SportsPage />} />
          <Route path="sports/:id" element={<SportPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="finance/assets/:id" element={<AssetPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="academy/decks/:id" element={<DeckPage />} />
          {NAV_MODULE_IDS.filter((id) => !['dashboard', 'tasks', 'calendar', 'inbox', 'notes', 'projects', 'academy', 'languages', 'habits', 'goals', 'focus', 'music', 'sports', 'finance', 'library', 'insights'].includes(id)).map((id) => (
            <Route key={id} path={MODULES[id].path.slice(1)} element={<ModuleRoadmapPage id={id} />} />
          ))}
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/interests/:id" element={<InterestPage />} />
          <Route path="settings" element={<SettingsIndexPage />} />
          <Route path="settings/logo" element={<LogoComparePage />} />
          <Route path="settings/:section" element={<SettingsSectionPage />} />
          <Route path="design" element={<DesignSystemPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

function NotFound() {
  const { t } = useSettings();
  return (
    <ErrorState
      title={t('errors.notFound')}
      body={t('errors.notFoundBody')}
      action={
        <Link to="/" className="inline-flex h-11 items-center rounded-xl bg-brand px-4 font-medium text-white shadow-glow">
          {t('errors.goHome')}
        </Link>
      }
    />
  );
}
