import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/app/SettingsProvider';
import { loadPrivacy, savePrivacy } from '@/data/privacyRepo';
import { PLACE_MODULES, PRIVACY_MODULES, PRIVACY_PLACES, QUICK_TARGETS, isShown, setShown, type PrivacyPrefs } from '@/domain/privacy';
import { useNotifications } from '@/features/notifications/NotificationsProvider';
import { useQuickPrivacy } from '@/features/security/QuickPrivacy';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';

const box = 'h-4 w-4 accent-[rgb(var(--accent))]';

/** Privacidade (Parte 26.1, 26.4 e 26.5): o que aparece em cada lugar, e a privacidade rápida. */
export function PrivacySection() {
  const { t } = useSettings();
  const toast = useToast();
  const qp = useQuickPrivacy();
  const n = useNotifications();
  const prefs = useLiveQuery(() => loadPrivacy(), []);
  if (!prefs) return null;
  const save = (p: PrivacyPrefs) => void savePrivacy(p).then(() => toast.show(t('privacy.saved')));
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-fg">{t('privacy.quick.title')}</h2>
          <p className="text-sm text-muted">{t('privacy.quick.hint')}</p>
        </div>
        <Switch checked={qp.on} onChange={qp.toggle} label={t('privacy.quick.now')} hint={t('privacy.quick.nowHint')} />
        <p className="text-sm font-medium text-fg">{t('privacy.quick.what')}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {QUICK_TARGETS.map((q) => (
            <li key={q}>
              <label className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm text-fg hover:bg-surface-2">
                <input type="checkbox" className={box} checked={prefs.quick.includes(q)} onChange={(e) => save({ ...prefs, quick: e.target.checked ? [...prefs.quick, q] : prefs.quick.filter((x) => x !== q) })} />
                {t(`privacy.quick.targets.${q}`)}
              </label>
            </li>
          ))}
        </ul>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-fg">{t('privacy.where.title')}</h2>
          <p className="text-sm text-muted">{t('privacy.where.hint')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="border-b border-line/70 text-left text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('privacy.where.module')}
                </th>
                {PRIVACY_PLACES.map((p) => (
                  <th key={p} scope="col" className="px-2 py-2 text-center font-medium">
                    {t(`privacy.places.${p}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PRIVACY_MODULES.map((m) => (
                <tr key={m} className="border-b border-line/40 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-fg">
                    {t(`search.groups.${m}`)}
                  </th>
                  {PRIVACY_PLACES.map((p) => (
                    <td key={p} className="px-2 py-2 text-center">
                      {PLACE_MODULES[p].includes(m) ? (
                        <input
                          type="checkbox"
                          className={box}
                          aria-label={`${t(`search.groups.${m}`)}: ${t(`privacy.places.${p}`)}`}
                          checked={isShown(prefs, p, m)}
                          onChange={(e) => save(setShown(prefs, p, m, e.target.checked))}
                        />
                      ) : (
                        <span className="text-subtle" title={t('privacy.where.notThere')}>
                          –
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">{t('privacy.where.financeNote')}</p>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('privacy.notif.title')}</h2>
        <Switch checked={n.config.hideContent} onChange={(v) => void n.setConfig({ ...n.config, hideContent: v })} label={t('notif.cfg.hideContent')} hint={t('notif.cfg.hideContentHint')} />
        <Link to="/settings/notifications" className="w-fit text-sm font-medium text-accent hover:underline">
          {t('privacy.notif.more')}
        </Link>
      </Surface>

      <Surface className="flex flex-col gap-2">
        <h2 className="font-semibold text-fg">{t('privacy.exports.title')}</h2>
        <p className="text-sm text-fg">{t('privacy.exports.report')}</p>
        <p className="text-sm text-fg">{t('privacy.exports.backup')}</p>
      </Surface>
    </div>
  );
}
