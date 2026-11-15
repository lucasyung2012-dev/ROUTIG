import { describe, expect, it } from 'vitest';
import { pt } from '@/i18n/pt';
import { en } from '@/i18n/en';
import { GUITAR_CHORDS, GUITAR_STRINGS, INSTRUMENTS, STRUM_GAP, chordNotes, guitarStrum, vaultStateOf } from '@/features/park/interiors/things';

/** Classe da nota (0 = Dó … 11 = Si). */
const pc = (m: number) => ((m % 12) + 12) % 12;
/** Notas de cada acorde: fundamental primeiro. */
const TONES: Record<string, number[]> = { C: [0, 4, 7], D: [2, 6, 9], E: [4, 8, 11], G: [7, 11, 2], A: [9, 1, 4], Am: [9, 0, 4], Em: [4, 7, 11] };

describe('Campus: violão da Música', () => {
  it('exatamente três instrumentos tocáveis: piano, bateria e violão', () => {
    expect([...INSTRUMENTS]).toEqual(['piano', 'drums', 'guitar']);
  });

  it('afinação padrão: E2 A2 D3 G3 B3 E4', () => {
    expect([...GUITAR_STRINGS]).toEqual([40, 45, 50, 55, 59, 64]);
  });

  it('cada acorde soa só as notas do acorde, todas elas, com a fundamental no baixo', () => {
    expect(GUITAR_CHORDS.map((c) => c.id)).toEqual(['C', 'D', 'E', 'G', 'A', 'Am', 'Em']);
    for (const c of GUITAR_CHORDS) {
      const notes = chordNotes(c.frets);
      const tones = TONES[c.id]!;
      expect(notes.length, c.id).toBeGreaterThanOrEqual(4);
      expect(new Set(notes.map(pc)), c.id).toEqual(new Set(tones));
      expect(pc(notes[0]!), c.id).toBe(tones[0]);
      // Notas sobem da corda grave para a aguda (nenhuma corda abafada no meio).
      for (let k = 1; k < notes.length; k++) expect(notes[k]!, c.id).toBeGreaterThan(notes[k - 1]!);
    }
    expect(chordNotes(GUITAR_CHORDS.find((c) => c.id === 'C')!.frets)).toEqual([48, 52, 55, 60, 64]);
    expect(chordNotes(GUITAR_CHORDS.find((c) => c.id === 'G')!.frets)).toEqual([43, 47, 50, 55, 59, 67]);
    expect(chordNotes(GUITAR_CHORDS.find((c) => c.id === 'D')!.frets)).toEqual([50, 57, 62, 66]);
  });

  it('cordas soltas: uma nota, na hora', () => {
    GUITAR_STRINGS.forEach((m, i) => expect(guitarStrum(i)).toEqual([{ string: i, midi: m, delay: 0 }]));
  });

  it('acorde: batida da corda grave para a aguda, sem as cordas abafadas', () => {
    const c = guitarStrum(GUITAR_STRINGS.length); // Dó (x32010)
    expect(c.map((n) => n.string)).toEqual([1, 2, 3, 4, 5]);
    expect(c.map((n) => n.midi)).toEqual([48, 52, 55, 60, 64]);
    c.forEach((n, k) => expect(n.delay).toBeCloseTo(k * STRUM_GAP));
    GUITAR_CHORDS.forEach((ch, j) => expect(guitarStrum(GUITAR_STRINGS.length + j).map((n) => n.midi)).toEqual(chordNotes(ch.frets)));
  });

  it('índice fora do violão não toca nada', () => {
    expect(guitarStrum(-1)).toEqual([]);
    expect(guitarStrum(1.5)).toEqual([]);
    expect(guitarStrum(GUITAR_STRINGS.length + GUITAR_CHORDS.length)).toEqual([]);
  });

  it('nomes do violão e dos acordes em português e inglês', () => {
    for (const c of GUITAR_CHORDS) {
      expect(pt.park.instrument.chords[c.id]).toBeTruthy();
      expect(en.park.instrument.chords[c.id]).toBeTruthy();
    }
    expect(pt.park.instrument.guitar).toBe('Violão');
    expect(pt.park.use.guitar).toBeTruthy();
  });
});

describe('Campus: cofre de Finanças', () => {
  it('segue o bloqueio real: sem PIN não há tranca; com PIN, aberto só desbloqueado', () => {
    expect(vaultStateOf(false, false)).toBe('none');
    expect(vaultStateOf(false, true)).toBe('none');
    expect(vaultStateOf(true, false)).toBe('locked');
    expect(vaultStateOf(true, true)).toBe('open');
  });

  it('enquanto lê se há PIN, fica fechado', () => {
    expect(vaultStateOf(undefined, false)).toBe('locked');
    expect(vaultStateOf(undefined, true)).toBe('locked');
  });

  it('textos do cofre nos dois idiomas', () => {
    for (const k of ['title', 'lockedBody', 'openBody', 'noPinBody', 'lockAgain', 'goToFinance', 'opened', 'lockedNow', 'pinRemoved'] as const) {
      expect(pt.park.vault[k]).toBeTruthy();
      expect(en.park.vault[k]).toBeTruthy();
    }
    expect(pt.park.use.vault).toBeTruthy();
    expect(pt.park.use.vaultClose).toBeTruthy();
  });
});
