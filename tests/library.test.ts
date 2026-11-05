import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { createItem, importFiles, isFileUsed, linkItem, prepareImport, purgeItem, softDeleteItem } from '@/data/libraryRepo';
import { EMPTY_LIBRARY_FILTER, folderTree, kindForFile, matchesLibrary, titleFromFile, type ItemMeta } from '@/domain/library';

beforeEach(() => setDbForTests(new RoutigDB(`test-lib-${Math.random().toString(36).slice(2)}`)));

const meta = (p: Partial<ItemMeta>): ItemMeta => ({ kind: 'link', title: 'x', author: '', url: '', folder: '', category: '', tags: [], collectionIds: [], favorite: false, readStatus: null, notes: '', ...p });
const file = (name: string, text: string, type = 'application/pdf') => new File([text], name, { type });

describe('library (Parte 18)', () => {
  it('reconhece o tipo e o título pelo arquivo', () => {
    expect(kindForFile('Prova_final.pdf', '')).toBe('pdf');
    expect(kindForFile('slides.pptx', '')).toBe('presentation');
    expect(kindForFile('notas.xlsx', '')).toBe('spreadsheet');
    expect(kindForFile('foto.heic', 'image/heic')).toBe('image');
    expect(titleFromFile('Prova_final_2026.pdf')).toBe('Prova final 2026');
  });

  it('busca sem acento, por pasta com subpastas, tags e favoritos', () => {
    const base = { ...meta({}), id: 'a', fileId: null, fileName: '', size: 0, mime: '', origin: 'manual' as const, importedAt: '', refs: [], createdAt: '', updatedAt: '', deletedAt: null, rev: 1 };
    const i = { ...base, title: 'Revolução Industrial', folder: 'Escola/9º ano/História', tags: ['prova'] };
    expect(matchesLibrary(i, { ...EMPTY_LIBRARY_FILTER, text: 'revolucao' })).toBe(true);
    expect(matchesLibrary(i, { ...EMPTY_LIBRARY_FILTER, folder: 'Escola' })).toBe(true);
    expect(matchesLibrary(i, { ...EMPTY_LIBRARY_FILTER, folder: 'Esc' })).toBe(false);
    expect(matchesLibrary(i, { ...EMPTY_LIBRARY_FILTER, tag: 'PROVA' })).toBe(true);
    expect(matchesLibrary(i, { ...EMPTY_LIBRARY_FILTER, favorites: true })).toBe(false);
    expect(folderTree([i])).toEqual(['Escola', 'Escola/9º ano', 'Escola/9º ano/História']);
  });

  it('importação com prévia: duplicatas desmarcadas, nada substituído, mesmo arquivo reaproveitado', async () => {
    const first = await prepareImport([file('a.pdf', 'conteudo A')]);
    expect(await importFiles(first, { folder: 'Escola', collectionIds: [], tags: ['x'] })).toBe(1);
    const again = await prepareImport([file('copia.pdf', 'conteudo A'), file('b.pdf', 'conteudo B'), file('b2.pdf', 'conteudo B')]);
    expect(again.map((c) => [Boolean(c.duplicateOf), c.include])).toEqual([
      [true, false],
      [false, true],
      [true, false],
    ]);
    again[0]!.include = true;
    expect(await importFiles(again, { folder: '', collectionIds: [], tags: [] })).toBe(2);
    const items = await getDb().libraryItems.toArray();
    expect(items).toHaveLength(3);
    expect(await getDb().files.count()).toBe(2);
    expect(items.find((i) => i.fileName === 'a.pdf')).toMatchObject({ origin: 'upload', folder: 'Escola', tags: ['x'] });
  });

  it('um material serve a vários módulos e o arquivo não some enquanto alguém usa', async () => {
    const [c] = await prepareImport([file('apostila.pdf', 'apostila')]);
    await importFiles([c!], { folder: '', collectionIds: [], tags: [] });
    const twin = await prepareImport([file('apostila2.pdf', 'apostila')]);
    twin[0]!.include = true;
    await importFiles(twin, { folder: '', collectionIds: [], tags: [] });
    const [a, b] = await getDb().libraryItems.toArray();
    await linkItem(a!.id, { type: 'subject', id: 's1' });
    await linkItem(a!.id, { type: 'subject', id: 's1' });
    await linkItem(a!.id, { type: 'goal', id: 'g1' });
    expect((await getDb().libraryItems.get(a!.id))?.refs).toHaveLength(2);
    await softDeleteItem(a!.id);
    expect(await purgeItem(a!.id)).toEqual({ fileRemoved: false });
    expect(await isFileUsed(b!.fileId!)).toBe(true);
    expect(await purgeItem(b!.id)).toEqual({ fileRemoved: true });
    expect(await getDb().files.count()).toBe(0);
  });

  it('link repetido não entra duas vezes', async () => {
    await createItem(meta({ title: 'Khan', url: 'https://khanacademy.org' }));
    await expect(createItem(meta({ title: 'Outro', url: 'https://khanacademy.org' }))).rejects.toMatchObject({ code: 'duplicate' });
    await expect(createItem(meta({ title: 'Ruim', url: 'javascript:alert(1)' }))).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('inbox: exclusão definitiva respeita arquivos usados em outro lugar', () => {
  it('não apaga o arquivo que uma nota ou a Library usa', async () => {
    const { purgeItem: purgeInbox } = await import('@/data/inboxRepo');
    const [c] = await prepareImport([file('foto.png', 'png', 'image/png')]);
    await importFiles([c!], { folder: '', collectionIds: [], tags: [] });
    const fileId = (await getDb().libraryItems.toArray())[0]!.fileId!;
    await getDb().inbox.add({ id: 'in1', kind: 'image', text: '', url: null, fileId, fileName: 'foto.png', size: 3, createdAt: '', updatedAt: '', deletedAt: '2026-11-04', rev: 1 } as never);
    await purgeInbox('in1');
    expect(await getDb().files.get(fileId)).toBeDefined();
  });
});
