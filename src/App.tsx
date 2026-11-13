import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { NAV_MODULE_IDS, MODULES } from '@/app/modules';
import { SettingsProvider, useSettings } from '@/app/SettingsProvider';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { AppProviders, AppShell } from '@/app/layout/AppShell';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { Logo } from '@/brand/Logo';
import { Button } from '@/ui/Button';
import { ErrorState, LoadingState } from '@/ui/States';
import { ToastProvider } from '@/ui/toast';
import { AppLock } from '@/features/security/AppLock';

/* Telas 2D sob demanda: cada módulo vira um pedaço próprio do build (o parque já era). */
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ModuleRoadmapPage = lazy(() => import('@/features/roadmap/ModuleRoadmapPage').then((m) => ({ default: m.ModuleRoadmapPage })));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const InboxPage = lazy(() => import('@/features/inbox/InboxPage').then((m) => ({ default: m.InboxPage })));
const NotesPage = lazy(() => import('@/features/notes/NotesPage').then((m) => ({ default: m.NotesPage })));
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const ProjectPage = lazy(() => import('@/features/projects/ProjectPage').then((m) => ({ default: m.ProjectPage })));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const InterestPage = lazy(() => import('@/features/profile/InterestPage').then((m) => ({ default: m.InterestPage })));
const AcademyPage = lazy(() => import('@/features/academy/AcademyPage').then((m) => ({ default: m.AcademyPage })));
const SubjectPage = lazy(() => import('@/features/academy/SubjectPage').then((m) => ({ default: m.SubjectPage })));
const DeckPage = lazy(() => import('@/features/academy/flashcards').then((m) => ({ default: m.DeckPage })));
const ReviewHubPage = lazy(() => import('@/features/academy/flashcards').then((m) => ({ default: m.ReviewHubPage })));
const StudyPlanPage = lazy(() => import('@/features/academy/StudyPlanPage').then((m) => ({ default: m.StudyPlanPage })));
const ExamPage = lazy(() => import('@/features/academy/ExamPage').then((m) => ({ default: m.ExamPage })));
const LanguagesPage = lazy(() => import('@/features/languages/LanguagesPage').then((m) => ({ default: m.LanguagesPage })));
const LanguagePage = lazy(() => import('@/features/languages/LanguagePage').then((m) => ({ default: m.LanguagePage })));
const HabitsPage = lazy(() => import('@/features/habits/HabitsPage').then((m) => ({ default: m.HabitsPage })));
const HabitPage = lazy(() => import('@/features/habits/HabitPage').then((m) => ({ default: m.HabitPage })));
const GoalsPage = lazy(() => import('@/features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const GoalPage = lazy(() => import('@/features/goals/GoalPage').then((m) => ({ default: m.GoalPage })));
const FocusPage = lazy(() => import('@/features/focus/FocusPage').then((m) => ({ default: m.FocusPage })));
const MusicPage = lazy(() => import('@/features/music/MusicPage').then((m) => ({ default: m.MusicPage })));
const InstrumentPage = lazy(() => import('@/features/music/InstrumentPage').then((m) => ({ default: m.InstrumentPage })));
const SportsPage = lazy(() => import('@/features/sports/SportsPage').then((m) => ({ default: m.SportsPage })));
const SportPage = lazy(() => import('@/features/sports/SportPage').then((m) => ({ default: m.SportPage })));
const FinancePage = lazy(() => import('@/features/finance/FinancePage').then((m) => ({ default: m.FinancePage })));
const AssetPage = lazy(() => import('@/features/finance/AssetPage').then((m) => ({ default: m.AssetPage })));
const LibraryPage = lazy(() => import('@/features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const InsightsPage = lazy(() => import('@/features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })));
const SettingsIndexPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsIndexPage })));
const SettingsSectionPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsSectionPage })));
const LogoComparePage = lazy(() => import('@/features/brand/LogoComparePage').then((m) => ({ default: m.LogoComparePage })));
const DesignSystemPage = lazy(() => import('@/features/design/DesignSystemPage').then((m) => ({ default: m.DesignSystemPage })));
const ParkPage = lazy(() => import('@/features/park/ParkPage'));

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
    <AppLock>
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
          {/* Tela principal (V2): o parque 3D em tela cheia; o 3D só é carregado aqui. */}
          <Route
            index
            element={
              <AppProviders>
                <Suspense fallback={<div className="ambient flex h-full items-center justify-center text-sm text-muted">{t('common.loading')}</div>}>
                  <ParkPage />
                </Suspense>
              </AppProviders>
            }
          />
          {/* Endereços das provas da Etapa 0 levam ao parque. */}
          <Route path="lab/*" element={<Navigate to="/" replace />} />
          <Route element={<AppShell />}>
            <Route element={<PageSuspense />}>
              <Route path="dashboard" element={<DashboardPage />} />
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
          </Route>
        </Routes>
      </ErrorBoundary>
    </AppLock>
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

/** As telas 2D chegam sob demanda: enquanto o pedaço da tela carrega, o menu e a barra continuam na tela. */
function PageSuspense() {
  const { t } = useSettings();
  return (
    <Suspense fallback={<LoadingState label={t('common.loading')} lines={4} />}>
      <Outlet />
    </Suspense>
  );
}
