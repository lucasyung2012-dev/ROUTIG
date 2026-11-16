import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Copy, FileDown, FileText, Printer, Share2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { hasFinancePin } from '@/data/financePlanRepo';
import { loadPrivacy } from '@/data/privacyRepo';
import { loadTasksConfig } from '@/data/tasksRepo';
import { loadReportPrefs, saveReportPrefs } from '@/data/weeklyReportRepo';
import { todayKey, weekday } from '@/domain/dates';
import { buildPdf } from '@/domain/pdf';
import { COMMENT_MAX, CORE_SECTIONS, OPTIONAL_SECTIONS, REPORT_WEEKDAY, canGoNext, reportRange, type ReportPeriodKind, type ReportPrefs, type ReportSection } from '@/domain/weeklyReport';
import { isFinanceUnlocked } from '@/features/finance/FinanceLock';
import { saveFile } from '@/features/files/saveFile';
import { useNotifications } from '@/features/notifications/NotificationsProvider';
import { Button } from '@/ui/Button';
import { Field, Input, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Segmented';
import { LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/toast';
import { useInsightsData } from './useInsightsData';
import { buildReport, reportToPdfLines, reportToText, sectionTitle, type ReportModel } from './weeklyReport';

/** Seções que seguem a privacidade do Insights (Settings → Privacidade). O Calendar não está lá. */
const PRIVACY_OF: Partial<Record<ReportSection, 'habits' | 'tasks' | 'goals' | 'focus' | 'academy' | 'sports' | 'music' | 'languages' | 'projects' | 'finance'>> = {
  habits: 'habits',
  tasks: 'tasks',
  goals: 'goals',
  focus: 'focus',
  academy: 'academy',
  sports: 'sports',
  music: 'music',
  languages: 'languages',
  projects: 'projects',
  finance: 'finance',
};

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESC[c] ?? c);

/** Página só do relatório, para "Imprimir → Salvar como PDF" sem o menu do app. */
function reportHtml(m: ReportModel, commentTitle: string, lang: string): string {
  const blocks = m.blocks.map((b) => `<h2>${escapeHtml(b.title)}</h2>${b.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}`).join('');
  const comment = m.comment ? `<h2>${escapeHtml(commentTitle)}</h2><p class="c">${escapeHtml(m.comment)}</p>` : '';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(m.title)}</title><style>
body{font:11pt/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:18mm}
h1{font-size:18pt;margin:0 0 2pt}h2{font-size:12.5pt;margin:14pt 0 3pt;break-after:avoid}p{margin:1pt 0}.p{color:#555}.c{white-space:pre-wrap}footer{margin-top:18pt;font-size:8.5pt;color:#666}
</style></head><body><h1>${escapeHtml(m.title)}</h1><p class="p">${escapeHtml(m.period)}${m.partial ? ` (${escapeHtml(m.partial)})` : ''}</p>${blocks}${comment}<footer>${escapeHtml(m.footer)}</footer></body></html>`;
}

/** Imprime a página do relatório num quadro escondido (o diálogo de impressão tem "Salvar como PDF"). */
function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 60_000);
    }
  }, 50);
}

/**
 * Relatório da semana: um resumo para mandar aos pais (ou a quem quiser), com só o que foi registrado.
 * Período padrão: sábado → sexta, terminando na sexta mais recente. Também mês e ano.
 */
export function WeeklyReportPage() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const notif = useNotifications();
  const raw = useInsightsData();
  const events = useLiveQuery(() => getDb().events.toArray(), []);
  const tasksConfig = useLiveQuery(() => loadTasksConfig(), []);
  const prefs = useLiveQuery(() => loadReportPrefs(), []);
  const privacy = useLiveQuery(() => loadPrivacy(), []);
  const financePin = useLiveQuery(() => hasFinancePin(), []);
  const today = todayKey();
  const [kind, setKind] = useState<ReportPeriodKind>('week');
  const [offset, setOffset] = useState(0);
  const [comment, setComment] = useState<string | null>(null);

  // O comentário começa com o texto guardado da última vez (o ponto de partida da semana).
  useEffect(() => {
    if (prefs && comment === null) setComment(prefs.comment);
  }, [prefs, comment]);

  const range = reportRange(kind, today, offset);
  const financeLocked = !!financePin && !isFinanceUnlocked();
  const locked = useMemo(() => {
    const out = new Set<ReportSection>();
    for (const s of [...CORE_SECTIONS, ...OPTIONAL_SECTIONS]) {
      const p = PRIVACY_OF[s];
      if (p && privacy?.insightsHidden.includes(p)) out.add(s);
    }
    if (financeLocked) out.add('finance');
    return out;
  }, [privacy, financeLocked]);

  const model = useMemo(() => {
    if (!raw || !events || !tasksConfig || !prefs) return null;
    return buildReport(
      { ...raw, events, tasksConfig },
      {
        kind,
        range,
        today,
        weekStartsOn: settings.weekStartsOn,
        locale: settings.locale,
        sections: prefs.sections.filter((s) => !locked.has(s)),
        name: settings.profile.displayName,
        comment: prefs.includeComment ? (comment ?? prefs.comment) : null,
      },
      t,
    );
  }, [raw, events, tasksConfig, prefs, kind, range.from, range.to, today, settings.weekStartsOn, settings.locale, settings.profile.displayName, locked, comment, t]);

  if (!raw || !events || !tasksConfig || !prefs || !privacy || financePin === undefined || !model) return <LoadingState label={t('common.loading')} lines={6} />;

  const save = (p: Partial<ReportPrefs>) => void saveReportPrefs({ ...prefs, ...p });
  const toggleSection = (s: ReportSection, on: boolean) => save({ sections: on ? [...prefs.sections, s] : prefs.sections.filter((x) => x !== s) });
  const changeKind = (k: ReportPeriodKind) => {
    setKind(k);
    setOffset(0);
  };

  /** Depois de enviar o relatório desta sexta, o lembrete da noite não aparece mais hoje. */
  const markSent = () => {
    if (kind === 'week' && range.to === today && weekday(today) === REPORT_WEEKDAY) save({ lastSentFor: today, comment: comment ?? prefs.comment });
    else if (comment !== null && comment !== prefs.comment) save({ comment });
  };

  const text = reportToText(model, t);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard');
      await navigator.clipboard.writeText(text);
      toast.show(t('weeklyReport.send.copied'), 'success');
      markSent();
    } catch {
      toast.show(t('weeklyReport.send.copyFailed'), 'error');
    }
  };
  const shareText = async () => {
    try {
      await navigator.share({ title: model.title, text });
      markSent();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.show(t('weeklyReport.send.shareFailed'), 'error');
    }
  };
  const pdf = async () => {
    const bytes = buildPdf(reportToPdfLines(model, t));
    const file = new File([bytes], `routig-${t('weeklyReport.fileName')}-${range.from}_${range.to}.pdf`, { type: 'application/pdf' });
    if ((await saveFile(file)) === 'saved') {
      toast.show(t('weeklyReport.send.pdfReady'), 'success');
      markSent();
    }
  };

  const nc = notif.config;
  const setNc = (p: Partial<typeof nc>) => void notif.setConfig({ ...nc, ...p });

  const sectionRow = (s: ReportSection) => (
    <li key={s}>
      <label className="flex items-center gap-3 text-sm text-fg">
        <input
          type="checkbox"
          checked={prefs.sections.includes(s) && !locked.has(s)}
          disabled={locked.has(s)}
          onChange={(e) => toggleSection(s, e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent))]"
        />
        {sectionTitle(s, t)}
        {locked.has(s) && <span className="text-xs text-muted">{s === 'finance' && financeLocked ? t('weeklyReport.financeLocked') : t('insights.privateNote')}</span>}
      </label>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('modules.insights')}
        title={t('weeklyReport.title')}
        description={t('weeklyReport.description')}
        icon={<FileText className="h-7 w-7" aria-hidden />}
        actions={
          <Link to="/insights" className="inline-flex h-11 items-center rounded-xl bg-surface-2 px-4 text-[0.9375rem] font-medium text-fg ring-1 ring-inset ring-line hover:bg-surface-3">
            {t('weeklyReport.backToInsights')}
          </Link>
        }
      />

      <Surface className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<ReportPeriodKind> label={t('insights.period')} value={kind} onChange={changeKind} options={(['week', 'month', 'year'] as const).map((k) => ({ value: k, label: t(`weeklyReport.kinds.${k}`) }))} />
          <div className="flex items-center gap-1">
            <IconButton label={t('weeklyReport.prev')} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setOffset(offset - 1)} />
            <span className="min-w-48 text-center text-sm font-semibold text-fg">{model.period}</span>
            <IconButton label={t('weeklyReport.next')} icon={<ChevronRight className="h-4 w-4" />} onClick={() => setOffset(offset + 1)} disabled={!canGoNext(kind, today, offset)} />
          </div>
        </div>
        {kind === 'week' && <p className="text-xs text-muted">{t('weeklyReport.weekRule')}</p>}
        {model.partial && <p className="text-xs text-muted">{t('weeklyReport.partialHint')}</p>}
      </Surface>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Surface className="flex flex-col gap-3">
          <h2 className="font-semibold text-fg">{t('weeklyReport.whatGoesIn')}</h2>
          <p className="text-sm text-muted">{t('weeklyReport.whatGoesInHint')}</p>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{t('weeklyReport.main')}</h3>
          <ul className="flex flex-col gap-2">{CORE_SECTIONS.map(sectionRow)}</ul>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{t('weeklyReport.optional')}</h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{OPTIONAL_SECTIONS.map(sectionRow)}</ul>
          <Switch checked={prefs.includeComment} onChange={(v) => save({ includeComment: v })} label={t('weeklyReport.includeComment')} />
          {prefs.includeComment && (
            <Field label={t('weeklyReport.comment')} hint={t('weeklyReport.commentHint')}>
              {(id, d) => (
                <Textarea
                  id={id}
                  aria-describedby={d}
                  rows={4}
                  maxLength={COMMENT_MAX}
                  value={comment ?? ''}
                  placeholder={t('weeklyReport.commentPlaceholder')}
                  onChange={(e) => setComment(e.target.value)}
                  onBlur={() => comment !== null && comment !== prefs.comment && save({ comment })}
                />
              )}
            </Field>
          )}
        </Surface>

        <Surface className="flex flex-col gap-3">
          <h2 className="font-semibold text-fg">{t('weeklyReport.send.title')}</h2>
          <p className="text-sm text-muted">{t('weeklyReport.send.hint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Copy className="h-4 w-4" />} onClick={() => void copy()}>
              {t('weeklyReport.send.copy')}
            </Button>
            {canShare && (
              <Button icon={<Share2 className="h-4 w-4" />} onClick={() => void shareText()}>
                {t('weeklyReport.send.share')}
              </Button>
            )}
            <Button icon={<FileDown className="h-4 w-4" />} onClick={() => void pdf()}>
              {t('weeklyReport.send.pdf')}
            </Button>
            <Button variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => printHtml(reportHtml(model, t('weeklyReport.out.comment'), settings.locale))}>
              {t('weeklyReport.send.print')}
            </Button>
          </div>
          <p className="text-xs text-muted">{t('weeklyReport.send.pdfNote')}</p>

          <h2 className="mt-2 font-semibold text-fg">{t('weeklyReport.reminders.title')}</h2>
          <Switch checked={!!nc.enabled.report} onChange={(v) => setNc({ enabled: { ...nc.enabled, report: v } })} label={t('weeklyReport.reminders.on')} hint={t('weeklyReport.reminders.hint')} />
          {nc.enabled.report && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Switch checked={nc.reportAfternoon !== null} onChange={(v) => setNc({ reportAfternoon: v ? '16:00' : null })} label={t('notif.cfg.reportAfternoon')} />
                {nc.reportAfternoon !== null && <Input aria-label={t('notif.cfg.reportAfternoon')} type="time" value={nc.reportAfternoon} onChange={(e) => e.target.value && setNc({ reportAfternoon: e.target.value })} />}
              </div>
              <div className="flex flex-col gap-2">
                <Switch checked={nc.reportNight !== null} onChange={(v) => setNc({ reportNight: v ? '20:00' : null })} label={t('notif.cfg.reportNight')} />
                {nc.reportNight !== null && <Input aria-label={t('notif.cfg.reportNight')} type="time" value={nc.reportNight} onChange={(e) => e.target.value && setNc({ reportNight: e.target.value })} />}
              </div>
            </div>
          )}
          <p className="text-xs text-muted">{t('notif.cfg.limitsOpen')}</p>
          <Link to="/settings/notifications" className="w-fit text-xs font-medium text-accent hover:underline">
            {t('weeklyReport.reminders.more')}
          </Link>
        </Surface>
      </div>

      <Surface className="flex flex-col gap-4" data-private="insights">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{t('weeklyReport.preview')}</p>
          <h2 className="mt-1 text-lg font-semibold text-fg">{model.title}</h2>
          <p className="text-sm text-muted">
            {model.period}
            {model.partial ? ` (${model.partial})` : ''}
          </p>
        </div>
        {model.blocks.length === 0 && <p className="text-sm text-muted">{t('weeklyReport.noSections')}</p>}
        {model.blocks.map((b) => (
          <section key={b.id} className="flex flex-col gap-0.5" aria-label={b.title}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">{b.title}</h3>
            {b.lines.map((l, i) => (
              <p key={i} className="text-sm text-fg">
                {l}
              </p>
            ))}
          </section>
        ))}
        {model.comment && (
          <section className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">{t('weeklyReport.out.comment')}</h3>
            <p className="whitespace-pre-wrap text-sm text-fg">{model.comment}</p>
          </section>
        )}
        <p className="text-xs text-muted">{model.footer}</p>
      </Surface>
    </div>
  );
}
