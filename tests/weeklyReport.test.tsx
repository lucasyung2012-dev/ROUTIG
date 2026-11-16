import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { RoutigDB, setDbForTests } from '@/data/db';
import { saveSettings } from '@/data/settingsRepo';
import { loadReportPrefs } from '@/data/weeklyReportRepo';
import { computeAlerts, DEFAULT_NOTIF_CONFIG, type AlertInput } from '@/domain/notifications';
import { buildPdf, toWinAnsi, wrapText } from '@/domain/pdf';
import { defaultSettings } from '@/domain/settings';
import { defaultTasksConfig } from '@/domain/tasks';
import { canGoNext, DEFAULT_REPORT_PREFS, migrateReportPrefs, reportDueToday, reportRange, reportWeek } from '@/domain/weeklyReport';
import { buildReport, reportToPdfLines, reportToText, type ReportData, type ReportOptions } from '@/features/insights/weeklyReport';
import { translate } from '@/i18n';

/* 2026-11-13 é sexta; 14 é sábado; 12 é quinta. */

describe('período do relatório (sábado → sexta)', () => {
  it('na sexta, a semana termina hoje e começa no sábado anterior', () => {
    expect(reportWeek('2026-11-13')).toEqual({ from: '2026-11-07', to: '2026-11-13' });
  });

  it('no sábado e no domingo, ainda é a semana que terminou na sexta', () => {
    expect(reportWeek('2026-11-14')).toEqual({ from: '2026-11-07', to: '2026-11-13' });
    expect(reportWeek('2026-11-15')).toEqual({ from: '2026-11-07', to: '2026-11-13' });
  });

  it('na quinta, o padrão é a semana da sexta passada; a seguinte está em andamento', () => {
    expect(reportWeek('2026-11-12')).toEqual({ from: '2026-10-31', to: '2026-11-06' });
    expect(reportWeek('2026-11-12', 1)).toEqual({ from: '2026-11-07', to: '2026-11-13' });
    expect(canGoNext('week', '2026-11-12', 0)).toBe(true);
    expect(canGoNext('week', '2026-11-12', 1)).toBe(false);
    expect(canGoNext('week', '2026-11-13', 0)).toBe(false);
  });

  it('semanas anteriores, virada de ano, mês e ano', () => {
    expect(reportWeek('2026-11-13', -1)).toEqual({ from: '2026-10-31', to: '2026-11-06' });
    expect(reportWeek('2027-01-01')).toEqual({ from: '2026-12-26', to: '2027-01-01' });
    expect(reportWeek('2027-01-02')).toEqual({ from: '2026-12-26', to: '2027-01-01' });
    expect(reportRange('month', '2026-11-15', 0)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(reportRange('month', '2026-11-15', -11)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(reportRange('year', '2026-11-15', -1)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(canGoNext('month', '2026-11-15', 0)).toBe(false);
  });

  it('só lembra na sexta e enquanto o relatório não foi enviado', () => {
    expect(reportDueToday('2026-11-13', { lastSentFor: null })).toBe(true);
    expect(reportDueToday('2026-11-13', { lastSentFor: '2026-11-06' })).toBe(true);
    expect(reportDueToday('2026-11-13', { lastSentFor: '2026-11-13' })).toBe(false);
    expect(reportDueToday('2026-11-12', { lastSentFor: null })).toBe(false);
  });

  it('escolhas guardadas: ids desconhecidos saem e a ordem é a do relatório', () => {
    expect(migrateReportPrefs(undefined)).toEqual(DEFAULT_REPORT_PREFS);
    expect(migrateReportPrefs({ sections: ['goals', 'bogus', 'habits', 'goals'], comment: 'oi', includeComment: false, lastSentFor: 'x' })).toEqual({
      sections: ['habits', 'goals'],
      comment: 'oi',
      includeComment: false,
      lastSentFor: null,
    });
  });
});

describe('lembretes de sexta (Notificações)', () => {
  const input: AlertInput = { today: '2026-11-13', openTasks: [], assessments: [], events: [], habitsDue: [], goals: [], backupStale: false, storageUse: null };

  it('sexta à tarde e à noite, levando ao relatório', () => {
    const a = computeAlerts({ ...input, weeklyReportDue: true }, DEFAULT_NOTIF_CONFIG).filter((x) => x.category === 'report');
    expect(a.map((x) => [x.at, x.path])).toEqual([
      ['2026-11-13T16:00:00', '/insights/weekly'],
      ['2026-11-13T20:00:00', '/insights/weekly'],
    ]);
  });

  it('cada horário pode ser desligado, e sem relatório pendente não há lembrete', () => {
    expect(computeAlerts({ ...input, weeklyReportDue: true }, { ...DEFAULT_NOTIF_CONFIG, reportNight: null }).filter((x) => x.category === 'report')).toHaveLength(1);
    expect(computeAlerts({ ...input, weeklyReportDue: true }, { ...DEFAULT_NOTIF_CONFIG, enabled: { ...DEFAULT_NOTIF_CONFIG.enabled, report: false } }).some((x) => x.category === 'report')).toBe(false);
    expect(computeAlerts(input, DEFAULT_NOTIF_CONFIG).some((x) => x.category === 'report')).toBe(false);
  });
});

/* ---------- Texto do relatório ---------- */

const base = { createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '', deletedAt: null, rev: 1 };
const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('pt-BR', k, v);

function habit(id: string, name: string, period: 'day' | 'week', times = 1) {
  return {
    ...base,
    id,
    name,
    description: '',
    color: '#7C5CFC',
    category: '',
    method: 'check' as const,
    unit: '',
    scaleMax: 5,
    schedule: [{ from: '2026-01-01', period, times, weekdays: [], intervalDays: 2, target: null }],
    startDate: '2026-01-01',
    pauses: [],
    archived: false,
    showInCalendar: false,
    time: null,
    notes: '',
    order: 0,
  };
}
const log = (habitId: string, date: string) => ({ ...base, id: `${habitId}-${date}`, habitId, date, value: 1, note: '' });

function fixture(): ReportData {
  return {
    habits: [habit('h1', 'Ler', 'day'), habit('h2', 'Academia', 'week', 3)],
    habitLogs: [log('h1', '2026-11-07'), log('h1', '2026-11-09'), log('h1', '2026-11-13'), log('h1', '2026-11-01'), log('h2', '2026-11-10'), log('h2', '2026-11-12')],
    tasks: [
      { ...base, id: 't1', title: 'Trabalho de história', statusId: 'done', dueDate: '2026-11-10', completedAt: '2026-11-10T15:00:00', occurrences: [] },
      { ...base, id: 't2', title: 'Redação', statusId: 'todo', dueDate: '2026-11-11', completedAt: null, occurrences: [] },
      { ...base, id: 't3', title: 'Lista de exercícios', statusId: 'todo', dueDate: '2026-11-20', completedAt: null, occurrences: [] },
      { ...base, id: 't4', title: 'Velha', statusId: 'done', dueDate: null, completedAt: '2026-10-02T15:00:00', occurrences: [] },
    ] as never,
    goals: [
      {
        ...base,
        id: 'g1',
        name: 'Ler 12 livros',
        description: '',
        area: 'personal',
        horizon: null,
        type: 'measurable',
        status: 'active',
        priority: 'none',
        deadline: null,
        indicators: [{ id: 'i1', name: 'Livros', unit: '', start: 0, target: 12 }],
        levelMax: 5,
        levelTarget: null,
        milestones: [],
        refs: [],
        notes: '',
        doneAt: null,
      },
    ],
    goalCheckins: [
      { ...base, id: 'c1', goalId: 'g1', date: '2026-10-20', indicatorId: 'i1', value: 3, level: null, note: '' },
      { ...base, id: 'c2', goalId: 'g1', date: '2026-11-10', indicatorId: 'i1', value: 6, level: null, note: '' },
    ],
    projects: [],
    focus: [],
    subjects: [],
    years: [],
    assessments: [],
    contents: [],
    studySessions: [],
    languages: [],
    languageSessions: [],
    vocab: [],
    grammar: [],
    cardReviews: [],
    instruments: [],
    practice: [],
    songs: [],
    songChanges: [],
    sports: [],
    sportActivities: [],
    finAssets: [],
    finTransactions: [],
    finQuotes: [],
    events: [],
    tasksConfig: defaultTasksConfig(),
  };
}

const opts: ReportOptions = {
  kind: 'week',
  range: { from: '2026-11-07', to: '2026-11-13' },
  today: '2026-11-13',
  weekStartsOn: 1,
  locale: 'pt-BR',
  sections: ['habits', 'tasks', 'goals', 'focus'],
  name: 'Ana',
  comment: 'Semana puxada, mas fechei o trabalho.',
};

describe('texto do relatório', () => {
  it('hábitos, tarefas e objetivos com os números reais do período', () => {
    const text = reportToText(buildReport(fixture(), opts, t), t);
    const lines = text.split('\n');
    expect(lines[0]).toBe('*Relatório da semana de Ana*');
    expect(lines).toContain('*Hábitos*');
    // Diário: 3 dias feitos entre 7 dias previstos (o registro de 01/11 é de outra semana).
    expect(lines).toContain('• Ler: 3 de 7 dias');
    // Semanal: dias feitos no período e a meta da semana.
    expect(lines).toContain('• Academia: 2 dias feitos (meta: 3 por semana)');
    expect(lines).toContain('*Tarefas*');
    expect(lines).toContain('Concluídas no período: 1');
    expect(lines).toContain('• Trabalho de história');
    expect(lines).not.toContain('• Velha');
    expect(lines).toContain('Atrasadas agora: 1');
    expect(lines.some((l) => l.startsWith('• Redação (prazo '))).toBe(true);
    expect(lines).toContain('Ainda pendentes: 1');
    expect(lines.some((l) => l.startsWith('• Lista de exercícios (prazo '))).toBe(true);
    expect(lines).toContain('*Objetivos*');
    // De 3/12 (25%) para 6/12 (50%) nesta semana.
    expect(lines).toContain('• Ler 12 livros: 50% (+25 pontos no período) · 1 acompanhamento');
    // Seção sem nenhum registro diz isso, sem inventar zero.
    expect(lines).toContain('*Foco*');
    expect(lines).toContain('Sem dados neste módulo ainda.');
    expect(lines).toContain('*Comentário*');
    expect(lines).toContain('Semana puxada, mas fechei o trabalho.');
    expect(lines[lines.length - 1]).toMatch(/^_Feito no ROUTIG em .*_$/);
  });

  it('só as seções escolhidas, na ordem fixa, e sem comentário quando não há', () => {
    const m = buildReport(fixture(), { ...opts, sections: ['goals', 'habits'], comment: '   ', name: '' }, t);
    expect(m.title).toBe('Relatório da semana');
    expect(m.blocks.map((b) => b.id)).toEqual(['habits', 'goals']);
    expect(m.comment).toBeNull();
    expect(reportToText(m, t)).not.toContain('*Comentário*');
  });

  it('semana sem registros: "nada registrado", não zero inventado', () => {
    const m = buildReport(fixture(), { ...opts, range: { from: '2026-10-24', to: '2026-10-30' }, today: '2026-11-13' }, t);
    const goals = m.blocks.find((b) => b.id === 'goals')!;
    expect(goals.lines[0]).toBe('• Ler 12 livros: 25% (sem mudança no período)');
    const tasks = m.blocks.find((b) => b.id === 'tasks')!;
    expect(tasks.lines[0]).toBe('Concluídas no período: 0');
  });

  it('semana em andamento avisa que ainda não acabou', () => {
    expect(buildReport(fixture(), { ...opts, today: '2026-11-12' }, t).partial).toMatch(/^em andamento, até /);
    expect(buildReport(fixture(), opts, t).partial).toBeNull();
  });
});

describe('PDF', () => {
  it('é um PDF válido, com acentos em WinAnsi e as posições certas na tabela xref', () => {
    const m = buildReport(fixture(), opts, t);
    const bytes = buildPdf(reportToPdfLines(m, t));
    const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    expect(s.startsWith('%PDF-1.4\n')).toBe(true);
    expect(s.endsWith('%%EOF\n')).toBe(true);
    expect(s).toContain('(Relat\\363rio da semana de Ana) Tj');
    const xref = Number(/startxref\n(\d+)\n/.exec(s)![1]);
    expect(s.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((x) => Number(x[1]));
    offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it('quebra linhas e páginas', () => {
    expect(wrapText('um dois três quatro', 9)).toEqual(['um dois', 'três', 'quatro']);
    expect(toWinAnsi('ção – •')).toEqual([0xe7, 0xe3, 0x6f, 0x20, 0x96, 0x20, 0x95]);
    const many = Array.from({ length: 120 }, (_, i) => ({ text: `Linha ${i}` }));
    const s = Array.from(buildPdf(many), (b) => String.fromCharCode(b)).join('');
    expect(s).toMatch(/\/Count [2-9] /);
  });
});

/* ---------- Tela ---------- */

describe('tela do Relatório da semana', () => {
  beforeEach(async () => {
    setDbForTests(new RoutigDB(`test-report-${Math.random().toString(36).slice(2)}`));
    localStorage.clear();
    sessionStorage.clear();
    const s = defaultSettings();
    s.onboarding.completed = true;
    await saveSettings(s);
    window.location.hash = '#/insights/weekly';
  });

  it('mostra as seções, copia o texto para o WhatsApp e guarda as escolhas', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect((await screen.findAllByRole('heading', { name: 'Relatório da semana' })).length).toBeGreaterThan(0);
    // Sem nenhum registro: cada seção diz isso honestamente.
    expect((await screen.findAllByText('Sem dados neste módulo ainda.')).length).toBeGreaterThanOrEqual(3);
    // Finanças começa fora.
    expect(screen.getByRole('checkbox', { name: 'Finanças' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hábitos' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Copiar texto' }));
    expect(await screen.findByText('Texto copiado. É só colar no WhatsApp.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toMatch(/^\*Relatório da semana\*\n/);

    await user.click(screen.getByRole('checkbox', { name: 'Esportes' }));
    await waitFor(async () => expect((await loadReportPrefs()).sections).toContain('sports'));
  });
});
