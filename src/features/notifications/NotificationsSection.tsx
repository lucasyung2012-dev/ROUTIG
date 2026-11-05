import { useSettings } from '@/app/SettingsProvider';
import { NOTIF_CATEGORIES, type NotifConfig } from '@/domain/notifications';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Field';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { useNotifications } from './NotificationsProvider';

/** Settings → Notificações (Parte 23.2): tipo, horário, antecedência, módulo, frequência, silêncio e concentração. */
export function NotificationsSection() {
  const { t } = useSettings();
  const toast = useToast();
  const n = useNotifications();
  const c = n.config;
  const set = (p: Partial<NotifConfig>) => void n.setConfig({ ...c, ...p });
  const muteFor = (hours: number | null) => set({ muteUntil: hours === null ? null : new Date(Date.now() + hours * 3_600_000).toISOString() });
  const muted = !!c.muteUntil && new Date(c.muteUntil) > new Date();
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('notif.cfg.categories')}</h2>
        <p className="text-sm text-muted">{t('notif.cfg.categoriesHint')}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {NOTIF_CATEGORIES.map((k) => (
            <li key={k}>
              <Switch checked={!!c.enabled[k]} onChange={(v) => set({ enabled: { ...c.enabled, [k]: v } })} label={t(`notif.categories.${k}`)} hint={t(`notif.categoryHints.${k}`)} />
            </li>
          ))}
        </ul>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('notif.cfg.timing')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('notif.cfg.dailyTime')} hint={t('notif.cfg.dailyTimeHint')}>
            {(id, d) => <Input id={id} aria-describedby={d} type="time" value={c.dailyTime} onChange={(e) => e.target.value && set({ dailyTime: e.target.value })} />}
          </Field>
          <Field label={t('notif.cfg.habitTime')}>{(id) => <Input id={id} type="time" value={c.habitTime} onChange={(e) => e.target.value && set({ habitTime: e.target.value })} />}</Field>
          <Field label={t('notif.cfg.assessmentDays')}>
            {(id) => (
              <Select id={id} value={c.assessmentDays} onChange={(e) => set({ assessmentDays: Number(e.target.value) })}>
                {[0, 1, 2, 3, 5, 7, 14].map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? t('notif.cfg.onTheDay') : t('notif.cfg.daysBefore', { count: d })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('notif.cfg.goalDays')}>
            {(id) => (
              <Select id={id} value={c.goalDays} onChange={(e) => set({ goalDays: Number(e.target.value) })}>
                {[0, 1, 3, 7, 14, 30].map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? t('notif.cfg.onTheDay') : t('notif.cfg.daysBefore', { count: d })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('notif.cfg.eventDefault')} hint={t('notif.cfg.eventDefaultHint')}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={c.eventDefaultMin} onChange={(e) => set({ eventDefaultMin: Number(e.target.value) })}>
                {[0, 5, 10, 15, 30, 60, 120].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? t('notif.cfg.onlyOwn') : t('notif.cfg.minutesBefore', { count: m })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('notif.cfg.silence')}</h2>
        <Switch checked={c.quiet.on} onChange={(v) => set({ quiet: { ...c.quiet, on: v } })} label={t('notif.cfg.quiet')} hint={t('notif.cfg.quietHint')} />
        {c.quiet.on && (
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Field label={t('notif.cfg.from')}>{(id) => <Input id={id} type="time" value={c.quiet.from} onChange={(e) => e.target.value && set({ quiet: { ...c.quiet, from: e.target.value } })} />}</Field>
            <Field label={t('notif.cfg.to')}>{(id) => <Input id={id} type="time" value={c.quiet.to} onChange={(e) => e.target.value && set({ quiet: { ...c.quiet, to: e.target.value } })} />}</Field>
          </div>
        )}
        <Switch checked={c.pauseDuringFocus} onChange={(v) => set({ pauseDuringFocus: v })} label={t('notif.cfg.focus')} hint={t('notif.cfg.focusHint')} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg">{muted ? t('notif.cfg.mutedNow') : t('notif.cfg.muteFor')}</span>
          {muted ? (
            <Button size="sm" variant="secondary" onClick={() => muteFor(null)}>
              {t('notif.cfg.unmute')}
            </Button>
          ) : (
            [1, 4, 12].map((h) => (
              <Button key={h} size="sm" variant="secondary" onClick={() => muteFor(h)}>
                {t('notif.cfg.hours', { count: h })}
              </Button>
            ))
          )}
        </div>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('notif.cfg.device')}</h2>
        <p className="text-sm text-muted">{t(`notif.support.${n.support}`)}</p>
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-2/60 p-3 text-sm text-fg">
          <p>{t('notif.cfg.limitsIos')}</p>
          <p>{t('notif.cfg.limitsOpen')}</p>
          <p className="text-muted">{t('notif.cfg.limitsCloud')}</p>
        </div>
        {n.support === 'default' && (
          <Button variant="primary" className="w-fit" onClick={() => void n.requestPermission().then((s) => s === 'granted' && set({ system: true }))}>
            {t('notif.cfg.allow')}
          </Button>
        )}
        {n.support === 'granted' && (
          <>
            <Switch checked={c.system} onChange={(v) => set({ system: v })} label={t('notif.cfg.useDevice')} />
            <Button variant="secondary" className="w-fit" onClick={() => void n.sendTest().then((ok) => toast.show(ok ? t('notif.cfg.testSent') : t('notif.cfg.testFailed'), ok ? 'success' : 'error'))}>
              {t('notif.cfg.test')}
            </Button>
          </>
        )}
        <Switch checked={c.hideContent} onChange={(v) => set({ hideContent: v })} label={t('notif.cfg.hideContent')} hint={t('notif.cfg.hideContentHint')} />
      </Surface>
    </div>
  );
}
