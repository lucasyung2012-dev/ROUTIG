import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { archive, captureText, convertToEvent, convertToTask, purgeItem, reopen, restoreItem, snooze, softDeleteItem } from '@/data/inboxRepo';
import { cleanTitle, extractTags, findDuplicates, parseDate, parseTime, similarity, suggest } from '@/domain/inbox';
import { emptyTaskInput } from '@/domain/tasks';
import { emptyEventInput } from '@/domain/events';

const TODAY = '2026-11-03'; // terça-feira

describe('sugestões (lógica local, Parte 20.2)', () => {
  it('entende datas em português', () => {
    expect(parseDate('estudar amanhã', TODAY)).toBe('2026-11-04');
    expect(parseDate('depois de amanhã', TODAY)).toBe('2026-11-05');
    expect(parseDate('prova na sexta', TODAY)).toBe('2026-11-06');
    expect(parseDate('reunião terça', TODAY)).toBe('2026-11-10');
    expect(parseDate('entregar dia 15', TODAY)).toBe('2026-11-15');
    expect(parseDate('entregar dia 1', TODAY)).toBe('2026-12-01');
    expect(parseDate('festa 20/12', TODAY)).toBe('2026-12-20');
    expect(parseDate('volta 10/01', TODAY)).toBe('2027-01-10');
    expect(parseDate('sem data nenhuma', TODAY)).toBeNull();
  });

  it('entende horários', () => {
    expect(parseTime('aula às 15h')).toBe('15:00');
    expect(parseTime('treino 18:30')).toBe('18:30');
    expect(parseTime('9h15 dentista')).toBe('09:15');
    expect(parseTime('página 20')).toBeNull();
  });

  it('separa tags e limpa o título', () => {
    expect(extractTags('revisar #Matemática e #prova')).toEqual(['matemática', 'prova']);
    expect(cleanTitle('ideia: app de flashcards #estudo')).toBe('app de flashcards');
  });

  it('sugere o tipo certo e explica o porquê', () => {
    expect(suggest({ kind: 'text', text: 'treino de tênis amanhã às 17h', url: null }, TODAY)).toMatchObject({ type: 'event', date: '2026-11-04', time: '17:00' });
    expect(suggest({ kind: 'text', text: 'estudar alemão', url: null }, TODAY)).toMatchObject({ type: 'task', reasons: ['verb'] });
    expect(suggest({ kind: 'text', text: 'ideia: jogo de vocabulário', url: null }, TODAY).type).toBe('idea');
    expect(suggest({ kind: 'link', text: 'https://exemplo.com/artigo', url: 'https://exemplo.com/artigo' }, TODAY).type).toBe('link');
    expect(suggest({ kind: 'image', text: 'foto do quadro', url: null }, TODAY).type).toBe('note');
  });
});

describe('duplicados (Parte 20.3)', () => {
  it('acha registros parecidos e ignora os diferentes', () => {
    expect(similarity('Estudar alemão capítulo 3', 'estudar Alemão - capítulo 3')).toBe(1);
    const d = findDuplicates('estudar alemão', [
      { ref: { type: 'task', id: 'a' }, title: 'Estudar alemão' },
      { ref: { type: 'task', id: 'b' }, title: 'Treino de tênis' },
    ]);
    expect(d.map((x) => x.ref.id)).toEqual(['a']);
  });
});

describe('Inbox: guardar, organizar e converter', () => {
  beforeEach(() => setDbForTests(new RoutigDB(`test-inbox-${Math.random().toString(36).slice(2)}`)));

  it('link sozinho vira item de link', async () => {
    const i = await captureText('https://exemplo.com');
    expect(i.kind).toBe('link');
    expect(i.url).toBe('https://exemplo.com');
  });

  it('adiar, arquivar, voltar, excluir e restaurar', async () => {
    const i = await captureText('pensar no projeto de ciências');
    await snooze(i.id, '2026-11-10');
    expect((await getDb().inbox.get(i.id))?.snoozedUntil).toBe('2026-11-10');
    await archive(i.id);
    expect((await getDb().inbox.get(i.id))?.status).toBe('archived');
    await reopen(i.id);
    expect((await getDb().inbox.get(i.id))).toMatchObject({ status: 'open', snoozedUntil: null });
    await softDeleteItem(i.id);
    expect((await getDb().inbox.get(i.id))?.deletedAt).not.toBeNull();
    await restoreItem(i.id);
    expect((await getDb().inbox.get(i.id))?.deletedAt).toBeNull();
    await purgeItem(i.id);
    expect(await getDb().inbox.get(i.id)).toBeUndefined();
  });

  it('converter em tarefa cria uma tarefa só e marca o item como processado', async () => {
    const i = await captureText('comprar cordas do violão');
    const taskId = await convertToTask(i.id, emptyTaskInput({ title: 'Comprar cordas do violão' }));
    expect(await getDb().tasks.count()).toBe(1);
    expect((await getDb().tasks.get(taskId))?.originModule).toBe('inbox');
    expect((await getDb().inbox.get(i.id))).toMatchObject({ status: 'processed', processedTo: { type: 'task', id: taskId } });
  });

  it('converter em evento cria o evento no Calendar', async () => {
    const i = await captureText('dentista sexta 14h');
    const eventId = await convertToEvent(i.id, emptyEventInput({ title: 'Dentista', start: '2026-11-06', endDate: '2026-11-06', startTime: '14:00' }));
    expect((await getDb().events.get(eventId))?.startTime).toBe('14:00');
    expect((await getDb().inbox.get(i.id))?.status).toBe('processed');
  });

  it('não guarda texto vazio', async () => {
    await expect(captureText('   ')).rejects.toMatchObject({ code: 'empty' });
  });
});
