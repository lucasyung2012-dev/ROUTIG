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
import { ProfilePage } from '@/features/profile/ProfilePage';
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
          {NAV_MODULE_IDS.filter((id) => id !== 'dashboard' && id !== 'tasks' && id !== 'calendar').map((id) => (
            <Route key={id} path={MODULES[id].path.slice(1)} element={<ModuleRoadmapPage id={id} />} />
          ))}
          <Route path="profile" element={<ProfilePage />} />
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
