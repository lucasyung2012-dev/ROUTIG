import { describe, expect, it } from 'vitest';
import { FLOOR_PLANS, WALL_BOARDS, roomSlots } from '@/features/park/interiors/floors';
import { projectsBoards, type BoardCtx } from '@/features/park/interiors/boards';
import { translate, type MessageKey } from '@/i18n';

const c: BoardCtx = { t: (k, v) => translate('pt-BR', k as MessageKey, v), locale: 'pt-BR', today: '2026-11-18' };

describe('Projects: os materiais de cada projeto no 2º andar', () => {
  it('a sala de materiais que não cabe no mezanino vira mural na parede do mesmo andar (e nunca os dois)', () => {
    const rooms = FLOOR_PLANS.projects[1]!;
    const k = rooms.findIndex(([key]) => key === 'materials');
    expect(k).toBeGreaterThanOrEqual(0);
    const hasRoom = roomSlots('projects', 2).some((s) => s.k === k);
    const mural = (WALL_BOARDS.projects?.[2] ?? []).some(([key, sector]) => key === 'materials' && sector === rooms[k]![1]);
    expect(mural).toBe(true);
    // O mural só é desenhado quando a sala não coube (floors.ts pula a chave que tem sala no andar);
    // hoje o mezanino tem lugar para duas salas, e a de materiais é a que fica de fora.
    expect(hasRoom).toBe(false);
  });

  it('o mural mostra os mesmos dados da sala: os projetos ativos com materiais ligados, ou o estado vazio', () => {
    const none = projectsBoards({ active: [], done: [] }, c).rooms.materials!;
    expect(none.empty).toBe(true);
    const some = projectsBoards(
      {
        active: [
          { name: 'Casa', color: '#438BEA', next: null, done: 0, total: 0, refs: 3 },
          { name: 'Livro', color: '#30A46C', next: null, done: 0, total: 0, refs: 0 },
        ],
        done: [],
      },
      c,
    ).rooms.materials!;
    expect(some.empty).toBeFalsy();
    expect(some.lines).toHaveLength(1);
    expect(some.lines[0]).toContain('Casa');
  });
});
