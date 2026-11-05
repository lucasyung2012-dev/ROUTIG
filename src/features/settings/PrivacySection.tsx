import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/app/SettingsProvider';
import { loadPrivacy, savePrivacy } from '@/data/privacyRepo';
import { SEARCHABLE_MODULES } from '@/domain/search';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';

/** Privacidade (Parte 26.1): o que aparece em cada lugar. Começa pela busca global. */
export function PrivacySection() {
  const { t } = useSettings();
  const toast = useToast();
  const prefs = useLiveQuery(() => loadPrivacy(), []);
  if (!prefs) return null;
  const toggle = (m: (typeof SEARCHABLE_MODULES)[number], on: boolean) =>
    void savePrivacy({ ...prefs, searchHidden: on ? prefs.searchHidden.filter((x) => x !== m) : [...prefs.searchHidden, m] }).then(() => toast.show(t('privacy.saved')));
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-fg">{t('privacy.search.title')}</h2>
          <p className="text-sm text-muted">{t('privacy.search.hint')}</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SEARCHABLE_MODULES.map((m) => (
            <li key={m}>
              <label className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm text-fg hover:bg-surface-2">
                <input type="checkbox" checked={!prefs.searchHidden.includes(m)} onChange={(e) => toggle(m, e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                {t(`search.groups.${m}`)}
                {m === 'finance' && <span className="text-xs text-muted">{t('privacy.search.financeNote')}</span>}
              </label>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}
