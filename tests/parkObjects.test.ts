import { describe, expect, it } from 'vitest';
import type { ModuleId } from '@/app/modules';
import type { FinAsset, Position } from '@/domain/finance';
import type { VocabEntry } from '@/domain/languages';
import type { Milestone } from '@/domain/projects';
import { newSrsState } from '@/domain/srs';
import { FLOOR_PLANS } from '@/features/park/interiors/floors';
import { roomType } from '@/features/park/interiors/furnish';
import {
  blockHeight,
  deckQueue,
  hourLabel,
  hourRows,
  lampState,
  lampTap,
  milestoneList,
  OBJECT_KIND,
  OBJECT_STATION,
  objectBuilding,
  orbAngles,
  practiceInstrument,
  practiceMinutes,
  vaultLines,
  WALL_KIND,
  wallBuilding,
} from '@/features/park/live';

/* "3D de verdade" nos objetos (seção 28): as partes puras dos objetos de ação (objects3d.ts). */

const TODAY = '2026-11-18';
const base = { createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', deletedAt: null as string | null, rev: 1 };

describe('prefixos dos objetos', () => {
  it('cada prefixo é de um prédio só, volta para ele e tem estação', () => {
    for (const [kind, id] of Object.entries(OBJECT_KIND)) {
      expect(objectBuilding(kind)).toBe(id);
      expect(OBJECT_STATION[kind], kind).toBeDefined();
    }
    expect(Object.keys(OBJECT_STATION).sort()).toEqual(Object.keys(OBJECT_KIND).sort());
    expect(objectBuilding('nada')).toBeNull();
    expect(objectBuilding('toString')).toBeNull();
  });

  it('não se confunde com as paredes nem com o piloto', () => {
    for (const kind of Object.keys(OBJECT_KIND)) expect(wallBuilding(kind), kind).toBeNull();
    for (const k of Object.values(WALL_KIND)) expect(objectBuilding(k), k).toBeNull();
    for (const k of ['bed', 'card', 'more', 'ev']) expect(objectBuilding(k)).toBeNull();
  });

  it('a placa do Goals e a maquete do Projects têm a sala de telas onde se apoiar', () => {
    for (const id of ['goals', 'projects'] as ModuleId[]) {
      const room = FLOOR_PLANS[id].flat().find(([key]) => key === 'tracking');
      expect(room, id).toBeDefined();
      expect(roomType('tracking', id)).toBe('dataviz');
    }
  });
});

describe('Calendar: horas da parede do dia', () => {
  it('uma faixa por hora cheia inteira da janela', () => {
    const rows = hourRows(7 * 60, 22 * 60);
    expect(rows).toHaveLength(15);
    expect(rows[0]).toEqual({ hour: 7, y0: 0, y1: 1 / 15 });
    expect(rows[14]!.hour).toBe(21);
    expect(rows[14]!.y1).toBeCloseTo(1);
  });

  it('janela que começa no meio da hora: a primeira faixa é a da hora cheia seguinte', () => {
    const rows = hourRows(450, 600);
    expect(rows.map((r) => r.hour)).toEqual([8, 9]);
    expect(rows[0]!.y0).toBeCloseTo(0.2);
    expect(rows[1]!.y1).toBeCloseTo(1);
  });

  it('janela vazia ou invertida não tem faixa; o dia termina às 23h', () => {
    expect(hourRows(600, 600)).toEqual([]);
    expect(hourRows(700, 600)).toEqual([]);
    expect(hourRows(0, 1440).map((r) => r.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('o início do evento é a hora cheia', () => {
    expect(hourLabel(9)).toBe('09:00');
    expect(hourLabel(14)).toBe('14:00');
    expect(hourLabel(-1)).toBe('00:00');
    expect(hourLabel(30)).toBe('23:00');
  });
});

describe('Projects: maquete', () => {
  it('a altura do bloco segue o progresso real; sem como medir, uma base baixa', () => {
    expect(blockHeight(null)).toBeCloseTo(0.03);
    expect(blockHeight(0)).toBeCloseTo(0.05);
    expect(blockHeight(50)).toBeCloseTo(0.225);
    expect(blockHeight(100)).toBeCloseTo(0.4);
    expect(blockHeight(140)).toBeCloseTo(0.4);
    expect(blockHeight(25)).toBeLessThan(blockHeight(75));
  });

  it('marcos: os em aberto pela data (sem data no fim) e depois os feitos', () => {
    const m = (id: string, date: string | null, done = false): Milestone => ({ id, title: id, date, done, doneAt: done ? '2026-11-01T00:00:00Z' : null });
    const list = milestoneList({ milestones: [m('feito', '2026-01-01', true), m('semData', null), m('dez', '2026-12-01'), m('nov', '2026-11-20')] });
    expect(list.map((x) => x.id)).toEqual(['nov', 'dez', 'semData', 'feito']);
    expect(milestoneList({ milestones: [] })).toEqual([]);
  });
});

describe('Focus: luminária', () => {
  it('acesa correndo, meio acesa pausada ou entre fases, apagada sem sessão', () => {
    expect(lampState(null)).toBe('off');
    expect(lampState({ runningSince: 1, waiting: false })).toBe('on');
    expect(lampState({ runningSince: null, waiting: false })).toBe('paused');
    expect(lampState({ runningSince: null, waiting: true })).toBe('paused');
  });

  it('o toque começa, pausa, continua, passa de fase ou leva à estação para salvar', () => {
    expect(lampTap(null, false)).toBe('start');
    expect(lampTap({ runningSince: 1, waiting: false }, false)).toBe('pause');
    expect(lampTap({ runningSince: null, waiting: false }, false)).toBe('resume');
    expect(lampTap({ runningSince: null, waiting: true }, false)).toBe('next');
    expect(lampTap({ runningSince: 1, waiting: false }, true)).toBe('open');
  });
});

describe('Idiomas: baralho de hoje', () => {
  const word = (id: string, languageId: string, due: string | null, over: Partial<VocabEntry> = {}): VocabEntry => ({ ...base, id, languageId, term: id, translation: `t-${id}`, srs: { ...newSrsState(), due }, ...over }) as unknown as VocabEntry;
  it('vencidas até hoje primeiro (as mais atrasadas antes), depois as novas, dos idiomas que existem', () => {
    const langs = [{ id: 'de', deletedAt: null }, { id: 'fr', deletedAt: '2026-11-01T00:00:00Z' }];
    const q = deckQueue(
      [word('hoje', 'de', TODAY), word('antiga', 'de', '2026-11-01'), word('amanha', 'de', '2026-11-19'), word('nova', 'de', null), word('apagada', 'de', TODAY, { deletedAt: '2026-11-02T00:00:00Z' }), word('frances', 'fr', TODAY), word('semIdioma', 'xx', TODAY)],
      langs,
      TODAY,
    );
    expect(q.map((v) => v.id)).toEqual(['antiga', 'hoje', 'nova']);
  });

  it('sem nada vencido, o baralho fica vazio', () => {
    expect(deckQueue([word('a', 'de', '2026-12-01')], [{ id: 'de', deletedAt: null }], TODAY)).toEqual([]);
  });
});

describe('Música: prática no Estúdio', () => {
  it('minutos entre a primeira e a última nota; menos de meio minuto não conta', () => {
    expect(practiceMinutes(0, 20_000)).toBeNull();
    expect(practiceMinutes(0, 30_000)).toBe(1);
    expect(practiceMinutes(0, 5 * 60_000 + 10_000)).toBe(5);
    expect(practiceMinutes(1000, 0)).toBeNull();
    expect(practiceMinutes(0, 3 * 24 * 3600_000)).toBe(1440);
  });

  it('o instrumento do módulo já vem escolhido quando dá para saber; senão, nenhum', () => {
    const ins = [
      { id: 'v', name: 'Meu violão', kind: 'guitar' as const, deletedAt: null },
      { id: 't', name: 'Teclado', kind: 'other' as const, deletedAt: null },
      { id: 'b', name: 'Bateria eletrônica', kind: 'other' as const, deletedAt: '2026-11-01T00:00:00Z' },
    ];
    expect(practiceInstrument('guitar', ins)).toBe('v');
    expect(practiceInstrument('piano', ins)).toBe('t');
    expect(practiceInstrument('drums', ins)).toBeNull();
    expect(practiceInstrument('guitar', [])).toBeNull();
  });
});

describe('Insights: esferas', () => {
  it('em volta do núcleo, deixando a frente (a porta da escada) livre', () => {
    expect(orbAngles(0)).toEqual([]);
    expect(orbAngles(1)).toHaveLength(1);
    expect(orbAngles(1)[0]).toBeCloseTo(Math.PI);
    const a = orbAngles(7);
    expect(a).toHaveLength(7);
    expect(a[0]).toBeCloseTo(0.75);
    expect(a[6]).toBeCloseTo(Math.PI * 2 - 0.75);
    for (let i = 1; i < a.length; i++) expect(a[i]!).toBeGreaterThan(a[i - 1]!);
  });
});

describe('Finance: saldos do cofre', () => {
  const asset = (id: string, currency: FinAsset['currency'], over: Partial<FinAsset> = {}) => ({ id, currency, archived: false, deletedAt: null as string | null, ...over });
  const pos = (quantity: number, invested: number, currentValue: number | null): Pick<Position, 'quantity' | 'invested' | 'currentValue'> => ({ quantity, invested, currentValue });
  it('as mesmas contas do resumo: o valor atual só soma o que tem valor informado', () => {
    const positions: Record<string, Pick<Position, 'quantity' | 'invested' | 'currentValue'>> = { a: pos(10, 1000, 1200), b: pos(5, 500, null), c: pos(1, 100, 90), d: pos(1, 999, 999), e: pos(1, 777, 777) };
    const lines = vaultLines([asset('c', 'USD'), asset('a', 'BRL'), asset('b', 'BRL'), asset('d', 'BRL', { archived: true }), asset('e', 'EUR', { deletedAt: '2026-11-01T00:00:00Z' })], (id) => positions[id]!, ['BRL', 'USD', 'EUR']);
    expect(lines).toEqual([
      { currency: 'BRL', invested: 1500, value: 1200, held: 2, quoted: 1 },
      { currency: 'USD', invested: 100, value: 90, held: 1, quoted: 1 },
    ]);
  });

  it('nenhum valor informado: sem valor (não inventa); sem ativos: nada', () => {
    expect(vaultLines([asset('a', 'BRL')], () => pos(1, 50, null), ['BRL'])).toEqual([{ currency: 'BRL', invested: 50, value: null, held: 1, quoted: 0 }]);
    expect(vaultLines([], () => pos(0, 0, null), ['BRL'])).toEqual([]);
  });
});
