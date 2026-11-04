import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import {
  createCollection,
  createNote,
  createNotebook,
  deleteCollection,
  deleteNotebook,
  emptyNoteInput,
  noteVersions,
  purgeNote,
  restoreNote,
  restoreVersion,
  saveNote,
  softDeleteNote,
  VERSION_INTERVAL_MS,
} from '@/data/notesRepo';
import { captureText, convertToNote } from '@/data/inboxRepo';
import { blocksToText, builtinTemplates, cloneBlocks, matchesNote, noteText, recognizeShape, strokePath, strokeWidth, textToBlocks, versionsToPrune, type Block, type Stroke } from '@/domain/notes';

describe('modo rápido ⇄ blocos (Parte 17.1)', () => {
  it('texto vira blocos com títulos, listas, checklist, citação e separador', () => {
    const blocks = textToBlocks('# Aula de física\nIntrodução\n- força\n- massa\n1. primeiro\n2. segundo\n[ ] revisar\n[x] ler\n> citação\n---');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bullet', 'bullet', 'numbered', 'numbered', 'todo', 'todo', 'quote', 'divider']);
    expect(blocks[7]).toMatchObject({ type: 'todo', checked: true, text: 'ler' });
  });

  it('itens vazios continuam com o tipo certo (lista, checklist, título)', () => {
    const blocks = textToBlocks('## \n- \n[ ] \n1. \n---');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'bullet', 'todo', 'numbered', 'divider']);
  });

  it('ida e volta não perde texto, e blocos que não são texto ficam separados', () => {
    const text = '# Título\nparágrafo\n- item\n1. um\n2. dois\n[ ] tarefa\n> frase\n---';
    const image: Block = { id: 'img', type: 'image', fileId: 'f1', caption: 'foto' };
    const { text: back, rest } = blocksToText([...textToBlocks(text), image]);
    expect(back).toBe(text);
    expect(rest).toEqual([image]);
  });

  it('texto pesquisável inclui tabelas, legendas e links', () => {
    const t = noteText({
      title: 'Química',
      blocks: [
        { id: 'a', type: 'table', rows: [['elemento', 'símbolo'], ['ouro', 'Au']] },
        { id: 'b', type: 'link', url: 'https://x.org', title: 'tabela periódica' },
      ],
    });
    expect(t).toContain('ouro');
    expect(t).toContain('tabela periódica');
  });

  it('modelos de fábrica existem e copiar blocos gera ids novos', () => {
    const tpls = builtinTemplates({});
    expect(tpls.map((x) => x.id)).toEqual(['tpl_class', 'tpl_chapter', 'tpl_meeting', 'tpl_journal']);
    const copy = cloneBlocks(tpls[0]!.blocks);
    expect(copy[0]!.id).not.toBe(tpls[0]!.blocks[0]!.id);
  });
});

describe('desenho (Parte 17.3)', () => {
  it('caminho suave e espessura pela pressão da caneta', () => {
    expect(strokePath([[0, 0, 0.5]])).toMatch(/^M0 0 L/);
    expect(strokePath([[0, 0, 0.5], [10, 10, 0.5], [20, 0, 0.5]])).toContain('Q');
    const light = strokeWidth({ points: [[0, 0, 0.1]], color: '#000', width: 4 });
    const strong = strokeWidth({ points: [[0, 0, 1]], color: '#000', width: 4 });
    expect(strong).toBeGreaterThan(light);
  });
});

describe('formas automáticas (segurar a caneta)', () => {
  // Traço "à mão": pontos ao longo de um caminho com um tremido determinístico.
  const wobble = (i: number) => Math.sin(i * 1.7) * 3;
  const along = (pts: Array<[number, number]>, per = 20): Stroke =>
    ({
      color: '#000',
      width: 4,
      points: pts.slice(0, -1).flatMap(([x1, y1], k) => {
        const [x2, y2] = pts[k + 1]!;
        return Array.from({ length: per }, (_, i) => {
          const f = i / per;
          return [x1 + (x2 - x1) * f + wobble(i + k), y1 + (y2 - y1) * f + wobble(i + k + 5), 0.5] as [number, number, number];
        });
      }),
    }) satisfies Stroke;

  it('linha torta vira linha reta', () => {
    const s = along([
      [100, 100],
      [500, 130],
    ]);
    s.points.push([500, 130, 0.5]);
    expect(recognizeShape(s)?.kind).toBe('line');
    expect(recognizeShape(s)?.points).toHaveLength(2);
  });

  it('retângulo torto vira retângulo reto', () => {
    const r = recognizeShape(
      along([
        [100, 100],
        [400, 104],
        [397, 300],
        [102, 296],
        [104, 108],
      ]),
    );
    expect(r?.kind).toBe('rectangle');
    expect(r?.points).toHaveLength(5);
  });

  it('triângulo e círculo', () => {
    expect(
      recognizeShape(
        along([
          [300, 100],
          [450, 350],
          [150, 350],
          [296, 108],
        ]),
      )?.kind,
    ).toBe('triangle');
    const circle: Stroke = {
      color: '#000',
      width: 4,
      points: Array.from({ length: 60 }, (_, i) => {
        const a = (i / 58) * Math.PI * 2;
        return [500 + (150 + wobble(i)) * Math.cos(a), 300 + (150 + wobble(i + 3)) * Math.sin(a), 0.5] as [number, number, number];
      }),
    };
    expect(recognizeShape(circle)?.kind).toBe('ellipse');
  });

  it('rabisco livre continua livre', () => {
    const scribble: Stroke = {
      color: '#000',
      width: 4,
      points: Array.from({ length: 60 }, (_, i) => [100 + i * 8, 200 + Math.sin(i / 2) * 60 + (i % 7) * 9, 0.5] as [number, number, number]),
    };
    expect(recognizeShape(scribble)).toBeNull();
  });
});

describe('notas: salvar, versões e Lixeira (Parte 17.4)', () => {
  beforeEach(() => setDbForTests(new RoutigDB(`test-notes-${Math.random().toString(36).slice(2)}`)));

  it('salvar guarda versão do conteúdo anterior no máximo a cada 5 minutos', async () => {
    const n = await createNote(emptyNoteInput({ title: 'v1' }));
    const t0 = Date.now();
    await saveNote(n.id, { ...emptyNoteInput(), title: 'v2' }, t0);
    await saveNote(n.id, { ...emptyNoteInput(), title: 'v3' }, t0 + 60_000);
    expect((await noteVersions(n.id)).map((v) => v.title)).toEqual(['v1']);
    await saveNote(n.id, { ...emptyNoteInput(), title: 'v4' }, t0 + VERSION_INTERVAL_MS + 1);
    expect((await noteVersions(n.id)).map((v) => v.title)).toEqual(['v3', 'v1']);
  });

  it('restaurar versão guarda o conteúdo atual antes, nada se perde', async () => {
    const n = await createNote(emptyNoteInput({ title: 'original' }));
    await saveNote(n.id, { ...emptyNoteInput(), title: 'mudado' });
    const [v] = await noteVersions(n.id);
    const restored = await restoreVersion(n.id, v!.id);
    expect(restored.title).toBe('original');
    expect((await noteVersions(n.id)).map((x) => x.title)).toContain('mudado');
  });

  it('só as 50 versões mais novas ficam', () => {
    const vs = Array.from({ length: 55 }, (_, i) => ({ id: `v${i}`, noteId: 'n', at: new Date(2026, 0, 1, 0, i).toISOString(), title: '', blocks: [] }));
    expect(versionsToPrune(vs)).toHaveLength(5);
    expect(versionsToPrune(vs)).toContain('v0');
  });

  it('Lixeira: excluir, restaurar e excluir de vez apaga versões e arquivos sem uso', async () => {
    const n = await createNote(emptyNoteInput({ title: 'X' }));
    await saveNote(n.id, { ...emptyNoteInput(), title: 'Y' });
    await softDeleteNote(n.id);
    expect((await getDb().notes.get(n.id))?.deletedAt).not.toBeNull();
    await restoreNote(n.id);
    expect((await getDb().notes.get(n.id))?.deletedAt).toBeNull();
    await purgeNote(n.id);
    expect(await getDb().notes.get(n.id)).toBeUndefined();
    expect(await getDb().noteVersions.where('noteId').equals(n.id).count()).toBe(0);
  });

  it('excluir caderno ou coleção não apaga as notas', async () => {
    const nb = await createNotebook('Escola', '#7357F6');
    const col = await createCollection('Provas');
    const n = await createNote(emptyNoteInput({ title: 'Resumo', notebookId: nb.id, collectionIds: [col.id] }));
    expect(await deleteNotebook(nb.id)).toBe(1);
    await deleteCollection(col.id);
    expect(await getDb().notes.get(n.id)).toMatchObject({ notebookId: null, collectionIds: [] });
  });

  it('busca encontra pelo conteúdo e pelas tags, sem acento', async () => {
    const n = await createNote(emptyNoteInput({ title: 'Física', tags: ['prova'], blocks: textToBlocks('- aceleração\n- velocidade') }));
    expect(matchesNote(n, 'aceleracao')).toBe(true);
    expect(matchesNote(n, 'prova')).toBe(true);
    expect(matchesNote(n, 'química')).toBe(false);
  });

  it('Inbox → nota: cria uma nota só e marca o item como processado', async () => {
    const i = await captureText('ideia: app de flashcards de alemão');
    const id = await convertToNote(i.id, emptyNoteInput({ title: 'App de flashcards', blocks: textToBlocks(i.text) }));
    expect(await getDb().notes.count()).toBe(1);
    expect((await getDb().inbox.get(i.id))?.processedTo).toEqual({ type: 'note', id });
  });
});

describe('desenho: formas por arrastar, laço e arquivos', () => {
  it('seta tem a linha e as duas asas na ponta', async () => {
    const { dragShapePoints } = await import('@/domain/notes');
    const pts = dragShapePoints('arrow', [0, 0], [100, 0]);
    expect(pts).toHaveLength(5);
    expect(pts[1]).toEqual([100, 0, 0.5]);
    expect(pts[2]![0]).toBeLessThan(100);
    expect(pts[2]![1]).not.toBe(pts[4]![1]); // uma asa para cada lado
    expect(dragShapePoints('rectangle', [0, 0], [10, 20]).map(([x, y]) => [x, y])).toEqual([[0, 0], [10, 0], [10, 20], [0, 20], [0, 0]]);
  });

  it('laço pega só os traços dentro da volta e move só eles', async () => {
    const { strokesInLasso, moveStrokes } = await import('@/domain/notes');
    const a = { points: [[10, 10, 0.5], [20, 20, 0.5]] as Array<[number, number, number]>, color: '#000', width: 4 };
    const b = { points: [[500, 500, 0.5], [510, 510, 0.5]] as Array<[number, number, number]>, color: '#000', width: 4 };
    const sel = strokesInLasso([a, b], [[0, 0], [100, 0], [100, 100], [0, 100]]);
    expect(sel).toEqual([0]);
    const moved = moveStrokes([a, b], sel, 5, -5);
    expect(moved[0]!.points[0]).toEqual([15, 5, 0.5]);
    expect(moved[1]).toBe(b);
  });

  it('a imagem de fundo do desenho conta como arquivo usado', async () => {
    const { blockFileIds } = await import('@/domain/notes');
    expect(blockFileIds([{ id: 'd', type: 'drawing', strokes: [], height: 700, imageFileId: 'f1' }, { id: 'i', type: 'image', fileId: 'f2', caption: '' }])).toEqual(['f1', 'f2']);
  });

  it('marca-texto não varia com a pressão', async () => {
    const { strokeWidth } = await import('@/domain/notes');
    expect(strokeWidth({ points: [[0, 0, 1]], color: '#ff0', width: 20, highlight: true })).toBe(20);
  });
});

describe('cor do caderno', () => {
  it('muda nome e cor; cor inválida é ignorada', async () => {
    const { createNotebook, updateNotebook } = await import('@/data/notesRepo');
    const nb = await createNotebook('Escola', '#7357F6');
    await updateNotebook(nb.id, { name: 'Escola 2026', color: '#000000' });
    await updateNotebook(nb.id, { color: 'roxo' });
    expect(await getDb().notebooks.get(nb.id)).toMatchObject({ name: 'Escola 2026', color: '#000000' });
  });
});
