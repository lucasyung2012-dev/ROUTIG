import { describe, expect, it } from 'vitest';
import { detectAssessmentType, findDate, findScore, findTime, matchSubject, parseIcs, parseText } from '@/domain/academyImport';

const subjects = [
  { id: 'mat', name: 'Matemática' },
  { id: 'his', name: 'História' },
  { id: 'ing', name: 'Inglês' },
];

describe('leitura de datas, horários e notas', () => {
  it('entende vários formatos de data', () => {
    expect(findDate('PU 12/11', 2026)?.date).toBe('2026-11-12');
    expect(findDate('prova 12/11/27', 2026)?.date).toBe('2027-11-12');
    expect(findDate('2026-12-01', 2026)?.date).toBe('2026-12-01');
    expect(findDate('dia 3 de março', 2026)?.date).toBe('2026-03-03');
    expect(findDate('3 aulas, entrega 15 nov', 2026)?.date).toBe('2026-11-15');
    expect(findDate('31/02', 2026)).toBeNull(); // não existe
  });

  it('horário e nota, sem confundir data com nota', () => {
    expect(findTime('às 14h30')).toBe('14:30');
    expect(findTime('8h')).toBe('08:00');
    expect(findScore('tirei 8,5/10')).toEqual({ score: 8.5, max: 10 });
    expect(findScore('7 de 10')).toEqual({ score: 7, max: 10 });
    expect(findScore('nota 6')).toEqual({ score: 6, max: null });
    expect(findScore('11/5')).toBeNull(); // 11 de 5 não é nota
  });

  it('tipo da avaliação e disciplina citada', () => {
    expect(detectAssessmentType('PU de frações')).toBe('test');
    expect(detectAssessmentType('Trabalho em grupo')).toBe('assignment');
    expect(detectAssessmentType('Seminário de química')).toBe('presentation');
    expect(detectAssessmentType('Leitura do livro')).toBeNull();
    expect(matchSubject('Prova de matematica', subjects)).toBe('mat');
    expect(matchSubject('PP de Inglês', subjects)).toBe('ing');
    expect(matchSubject('Física', subjects)).toBeNull();
  });
});

describe('texto colado (Parte 9.14)', () => {
  const opts = { year: 2026, subjects, defaultSubjectId: 'mat' };

  it('reconhece provas, conteúdos em árvore, aulas e notas', () => {
    const rows = parseText(
      ['PU de Matemática 12/11 14h', 'Trabalho de História - 20/11', 'Unidade 1: Frações', '  - Soma de frações', '  - Simplificação', 'Aula 05/11 Revisão de MMC', 'PP de Inglês 8,5/10', 'Lembrar de levar régua'].join('\n'),
      opts,
    );
    expect(rows.map((r) => [r.kind, r.subjectId, r.date])).toEqual([
      ['assessment', 'mat', '2026-11-12'],
      ['assessment', 'his', '2026-11-20'],
      ['content', 'mat', null],
      ['content', 'mat', null],
      ['content', 'mat', null],
      ['lesson', 'mat', '2026-11-05'],
      ['assessment', 'ing', null],
      ['ignore', 'mat', null],
    ]);
    expect(rows[0]).toMatchObject({ title: 'PU de Matemática', time: '14:00', assessmentType: 'test' });
    expect(rows[1]).toMatchObject({ title: 'Trabalho de História', assessmentType: 'assignment' });
    expect(rows.slice(2, 5).map((r) => [r.contentKind, r.depth])).toEqual([
      ['unit', 0],
      ['topic', 1],
      ['topic', 1],
    ]);
    expect(rows[6]).toMatchObject({ score: 8.5, maxScore: 10 });
  });

  it('CSV com ponto e vírgula', () => {
    const rows = parseText('Prova;Matemática;12/11\nTrabalho;História;20/11', opts);
    expect(rows.map((r) => [r.kind, r.subjectId, r.date])).toEqual([
      ['assessment', 'mat', '2026-11-12'],
      ['assessment', 'his', '2026-11-20'],
    ]);
  });
});

describe('calendário .ics', () => {
  it('lê eventos e sugere avaliação pelo nome', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Prova de História', 'DTSTART;TZID=America/Sao_Paulo:20261118T080000', 'END:VEVENT', 'BEGIN:VEVENT', 'SUMMARY:Feriado', 'DTSTART;VALUE=DATE:20261115', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const rows = parseIcs(ics, { subjects, defaultSubjectId: null });
    expect(rows.map((r) => [r.kind, r.subjectId, r.date, r.time])).toEqual([
      ['assessment', 'his', '2026-11-18', '08:00'],
      ['ignore', null, '2026-11-15', null],
    ]);
  });
});
