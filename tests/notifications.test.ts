import { describe, expect, it } from 'vitest';
import { canDeliver, computeAlerts, DEFAULT_NOTIF_CONFIG, inQuietHours, migrateNotifConfig, pruneKeys, type AlertInput } from '@/domain/notifications';

const base: AlertInput = { today: '2026-11-04', openTasks: [], assessments: [], events: [], habitsDue: [], goals: [], backupStale: false, storageUse: null };
const cfg = { ...DEFAULT_NOTIF_CONFIG };

describe('notificações (Parte 23)', () => {
  it('tarefas: atrasadas viram um aviso só; a de hoje com horário avisa 15 min antes', () => {
    const a = computeAlerts(
      {
        ...base,
        openTasks: [
          { id: '1', title: 'Atrasada', dueDate: '2026-11-01', dueTime: null },
          { id: '2', title: 'Outra atrasada', dueDate: '2026-11-02', dueTime: null },
          { id: '3', title: 'Redação', dueDate: '2026-11-04', dueTime: '14:00' },
          { id: '4', title: 'Futura', dueDate: '2026-11-10', dueTime: null },
        ],
      },
      cfg,
    );
    expect(a.map((x) => [x.key, x.at])).toEqual([
      ['tasks-overdue:2026-11-04', '2026-11-04T07:30:00'],
      ['task:3:2026-11-04', '2026-11-04T13:45:00'],
    ]);
    expect(a[0]!.body.vars).toEqual({ count: 2 });
  });

  it('provas dentro da antecedência; eventos pelo lembrete próprio; tipo desligado não avisa', () => {
    const input: AlertInput = {
      ...base,
      assessments: [
        { id: 'p1', name: 'Prova', subject: 'Matemática', date: '2026-11-06', time: null },
        { id: 'p2', name: 'Longe', subject: 'História', date: '2026-11-20', time: null },
      ],
      events: [
        { id: 'e1', title: 'Dentista', date: '2026-11-04', startTime: '10:00', reminders: [30, 60] },
        { id: 'e2', title: 'Sem lembrete', date: '2026-11-04', startTime: '11:00', reminders: [] },
      ],
    };
    const a = computeAlerts(input, cfg);
    expect(a.filter((x) => x.category === 'assessments').map((x) => x.body.vars?.count)).toEqual([2]);
    expect(a.filter((x) => x.category === 'events').map((x) => x.at)).toEqual(['2026-11-04T09:00:00', '2026-11-04T09:30:00']);
    expect(computeAlerts(input, { ...cfg, eventDefaultMin: 15 }).filter((x) => x.category === 'events')).toHaveLength(3);
    expect(computeAlerts(input, { ...cfg, enabled: { ...cfg.enabled, assessments: false } }).some((x) => x.category === 'assessments')).toBe(false);
  });

  it('hábitos, prazos de objetivos, backup e armazenamento', () => {
    const a = computeAlerts({ ...base, habitsDue: [{ id: 'h', name: 'Ler' }], goals: [{ id: 'g', name: 'Ler 12 livros', deadline: '2026-11-05' }], backupStale: true, storageUse: 0.85 }, cfg);
    expect(a.map((x) => x.category).sort()).toEqual(['backup', 'goals', 'habits', 'storage']);
    expect(a.find((x) => x.category === 'habits')?.at).toBe('2026-11-04T19:00:00');
  });

  it('silêncio que vira a noite, silenciar até, concentração e permissão', () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 4, h, m);
    expect(inQuietHours(cfg, at(23))).toBe(true);
    expect(inQuietHours(cfg, at(6, 59))).toBe(true);
    expect(inQuietHours(cfg, at(7))).toBe(false);
    const on = { ...cfg, system: true };
    expect(canDeliver(on, at(12), false)).toBe(true);
    expect(canDeliver(on, at(12), true)).toBe(false);
    expect(canDeliver({ ...on, pauseDuringFocus: false }, at(12), true)).toBe(true);
    expect(canDeliver({ ...on, muteUntil: at(13).toISOString() }, at(12), false)).toBe(false);
    expect(canDeliver(cfg, at(12), false)).toBe(false);
  });

  it('configuração inválida volta ao padrão; registro de vistos não cresce para sempre', () => {
    expect(migrateNotifConfig({ dailyTime: '25h' }).dailyTime).toBe('07:30');
    expect(migrateNotifConfig({ enabled: { tasks: false } }).enabled).toMatchObject({ tasks: false, habits: true });
    expect(pruneKeys({ a: '2026-10-01', b: '2026-11-03' }, '2026-11-04')).toEqual({ b: '2026-11-03' });
  });
});
