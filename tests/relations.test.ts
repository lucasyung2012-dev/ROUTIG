import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { captureFile, captureText, convertToLibrary, purgeItem, softDeleteItem } from '@/data/inboxRepo';

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-rel-${Math.random().toString(36).slice(2)}`));
});

describe('Inbox → Library (Parte 20 e 18.4)', () => {
  it('link vira material do tipo link; o mesmo link de novo aponta para o que existe', async () => {
    const a = await captureText('https://exemplo.com/artigo');
    const r1 = await convertToLibrary(a.id);
    expect(r1.existed).toBe(false);
    const lib = await getDb().libraryItems.get(r1.libraryId);
    expect(lib).toMatchObject({ kind: 'link', url: 'https://exemplo.com/artigo' });
    expect(await getDb().inbox.get(a.id)).toMatchObject({ status: 'processed', processedTo: { type: 'library', id: r1.libraryId } });

    const b = await captureText('Ler depois https://exemplo.com/artigo');
    const r2 = await convertToLibrary(b.id);
    expect(r2).toEqual({ libraryId: r1.libraryId, existed: true });
    expect(await getDb().libraryItems.count()).toBe(1);
  });

  it('arquivo vira material com o mesmo arquivo, sem cópia; apagar o item do Inbox não apaga o arquivo', async () => {
    const { item } = await captureFile(new Blob(['resumo da aula de biologia'], { type: 'text/plain' }), 'resumo.txt');
    const r = await convertToLibrary(item.id);
    const lib = await getDb().libraryItems.get(r.libraryId);
    expect(lib).toMatchObject({ kind: 'document', fileId: item.fileId, origin: 'upload', title: 'resumo' });
    expect(lib?.textContent).toContain('biologia');
    expect(await getDb().files.count()).toBe(1);

    await softDeleteItem(item.id);
    await purgeItem(item.id);
    expect(await getDb().files.get(item.fileId!)).toBeDefined();
  });
});
