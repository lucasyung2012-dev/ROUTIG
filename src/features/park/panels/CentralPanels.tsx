import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, ListTodo, NotebookPen } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { loadDashboardConfig, saveDashboardConfig } from '@/data/dashboardRepo';
import { captureText } from '@/data/inboxRepo';
import { createNote, emptyNoteInput } from '@/data/notesRepo';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { TodayCard } from '@/features/dashboard/cards';
import { EvolutionTab, HistoryTab, InterestsTab, ProfileCard } from '@/features/profile/ProfilePage';
import { SectionBody } from '@/features/settings/SettingsPage';
import type { SettingsSectionId } from '@/features/settings/sections';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Textarea } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/toast';
import type { DashboardSector, ProfileSector, SettingsRoom } from '../interiors/central';

/* ---------- Dashboard — Observatório Central ---------- */

export function DashboardPanel({ id }: { id: DashboardSector }) {
  if (id === 'overview' || id === 'panels') return <DashboardPage />;
  if (id === 'profiles') return <ProfilesRoom />;
  if (id === 'actions') return <QuickActions />;
  return <TodayCard />;
}

function ProfilesRoom() {
  const { t } = useSettings();
  const toast = useToast();
  const config = useLiveQuery(() => loadDashboardConfig(), []);
  if (!config) return null;
  return (
    <ul className="flex flex-col gap-2">
      {config.profiles.map((p) => {
        const name = p.builtin ? t(`dashboard.profiles.${p.id as 'complete' | 'studies' | 'projects'}`) : p.name;
        const active = p.id === config.activeId;
        return (
          <li key={p.id} className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{name}</span>
            <span className="text-xs text-subtle">{t('park.dashboard.cards', { count: p.cards.length })}</span>
            {active ? (
              <Badge tone="success">{t('park.dashboard.active')}</Badge>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => void saveDashboardConfig({ ...config, activeId: p.id }).then(() => toast.show(t('dashboard.applied')))}>
                {t('park.dashboard.apply')}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function QuickActions() {
  const { t } = useSettings();
  const tasks = useTaskEditor();
  const events = useEventEditor();
  const navigate = useNavigate();
  const toast = useToast();
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col gap-3">
      <Textarea aria-label={t('inbox.capturePlaceholder')} placeholder={t('inbox.capturePlaceholder')} value={text} rows={2} maxLength={20000} onChange={(e) => setText(e.target.value)} />
      <Button
        variant="primary"
        disabled={!text.trim()}
        onClick={() =>
          void captureText(text).then(
            () => {
              setText('');
              toast.show(t('inbox.captured'));
            },
            () => toast.show(t('errors.title'), 'error'),
          )
        }
      >
        {t('park.dashboard.toInbox')}
      </Button>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button variant="secondary" icon={<ListTodo className="h-4 w-4" />} onClick={() => tasks.newTask()}>
          {t('quick.task')}
        </Button>
        <Button variant="secondary" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => events.newEvent()}>
          {t('quick.event')}
        </Button>
        <Button variant="secondary" icon={<NotebookPen className="h-4 w-4" />} onClick={() => void createNote(emptyNoteInput()).then((n) => navigate(`/notes/${n.id}`))}>
          {t('quick.note')}
        </Button>
      </div>
    </div>
  );
}

/* ---------- Profile — Pavilhão da Identidade ---------- */

export function ProfilePanel({ id }: { id: ProfileSector }) {
  const { t } = useSettings();
  if (id === 'atrium') return <ProfileCard />;
  if (id === 'interests') return <InterestsTab />;
  if (id === 'trajectory')
    return (
      <div className="flex flex-col gap-6">
        <HistoryTab />
        <EvolutionTab />
      </div>
    );
  if (id === 'achievements') return <Achievements />;
  if (id === 'archive')
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('park.profile.archiveLater')}</p>
        <Link to="/library" className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-medium text-accent ring-1 ring-inset ring-line hover:bg-surface-2">
          {t('park.open', { name: t('modules.library') })}
        </Link>
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      <SectionBody id="profile" />
      <SectionBody id="privacy" />
    </div>
  );
}

/** Conquistas reais: projetos e objetivos concluídos (sem copiar nada). */
function Achievements() {
  const { t } = useSettings();
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [projects, goals] = await Promise.all([db.projects.toArray(), db.goals.toArray()]);
    return {
      projects: projects.filter((p) => !p.deletedAt && p.status === 'done'),
      goals: goals.filter((g) => !g.deletedAt && g.status === 'done'),
    };
  }, []);
  if (!data) return null;
  if (data.projects.length + data.goals.length === 0) return <p className="text-sm text-muted">{t('park.profile.noAchievements')}</p>;
  return (
    <div className="flex flex-col gap-4">
      {data.goals.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t('modules.goals')}</h3>
          <ul className="flex flex-col gap-1.5">
            {data.goals.map((g) => (
              <li key={g.id}>
                <Link to={`/goals/${g.id}`} className="block rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg hover:bg-surface-3">
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.projects.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t('modules.projects')}</h3>
          <ul className="flex flex-col gap-1.5">
            {data.projects.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="block rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg hover:bg-surface-3">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ---------- Settings — pavilhões de setor ---------- */

export const SETTINGS_ROOM_SECTIONS: Record<SettingsRoom, SettingsSectionId[]> = {
  identity: ['profile', 'language', 'region'],
  appearance: ['appearance', 'navigation', 'accessibility'],
  modules: ['modules', 'notifications'],
  privacy: ['privacy', 'security'],
  data: ['storage', 'backup', 'transfer', 'devices'],
  help: ['help', 'about'],
};

export function SettingsPanel({ id }: { id: SettingsRoom }) {
  const { t } = useSettings();
  const sections = SETTINGS_ROOM_SECTIONS[id];
  const [section, setSection] = useState<SettingsSectionId>(sections[0]!);
  const current = sections.includes(section) ? section : sections[0]!;
  return (
    <div className="flex flex-col gap-4">
      {sections.length > 1 && <Segmented<SettingsSectionId> label={t(`park.settings.rooms.${id}`)} value={current} onChange={setSection} options={sections.map((s) => ({ value: s, label: t(`settings.sections.${s}`) }))} className="w-full" />}
      <SectionBody id={current} />
    </div>
  );
}
