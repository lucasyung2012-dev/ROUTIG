/**
 * Volumetria de cada prédio do Campus (seções 11 a 27 da especificação): a fonte única da forma,
 * por fora e por dentro. Cada prédio é um conjunto de volumes ligados (outline.ts), cada um com a
 * sua altura em pavimentos, de modo que as alas podem ser mais baixas que o corpo principal e o
 * corpo mais alto continua subindo. Daqui saem o térreo por fora (buildings/*.ts) e por dentro
 * (interiors/common.ts), os andares de cima e o terraço por fora (buildings/upper.ts) e por dentro
 * (interiors/floors.ts), onde se pode andar em cada nível e a área das salas de cada andar.
 *
 * Coordenadas locais: frente (entrada) = +z, x para o lado; a entrada fica em x = 0 na fachada da
 * frente, e o núcleo dos elevadores nos fundos, em x = 0, por dentro do prédio (stairs.ts,
 * liftCore). Os prédios não têm o mesmo tamanho: o tamanho vem de quanto do lote a planta ocupa e
 * de quantos pavimentos sobe.
 */
import type { ModuleId } from '@/app/modules';
import { boundOf, spanZ, type Vol } from './outline';

/** Altura de cada andar acima do térreo (piso a piso). */
export const STOREY = 4.4;

export interface Massing {
  vols: Vol[];
  /** Pé-direito do térreo (piso a piso até o 1º andar), igual por fora e por dentro. */
  ground: number;
  /** Raio do vazio do meio nos andares de cima (átrio, jardim interno ou núcleo da escada). */
  void: number;
  /** Largura da fachada envidraçada da entrada (entrada ampla ou monumental). */
  entry: number;
  /** Raio da claraboia redonda sobre o centro, no volume térreo que o contém (sem andar em cima). */
  sky?: number;
}

const rect = (cx: number, cz: number, w: number, d: number, hi: number, more: Partial<Pick<Vol, 'lo' | 'h'>> & { rot?: number } = {}): Vol => ({ kind: 'rect', cx, cz, w, d, hi, ...more });
const circle = (cx: number, cz: number, r: number, hi: number, more: Partial<Pick<Vol, 'lo' | 'h'>> = {}): Vol => ({ kind: 'circle', cx, cz, r, hi, ...more });
const poly = (r: number, sides: number, hi: number, more: Partial<Pick<Vol, 'lo' | 'h'>> & { rot?: number } = {}): Vol => ({ kind: 'poly', cx: 0, cz: 0, r, sides, hi, rot: Math.PI / sides, ...more });
/** Ala radial (Calendar): retângulo apontado para fora a partir do centro, no ângulo `a`. */
const radial = (a: number, dist: number, w: number, d: number, hi: number): Vol => ({ kind: 'rect', cx: Math.sin(a) * dist, cz: Math.cos(a) * dist, w, d, rot: a, hi });

export const MASSING: Record<ModuleId, Massing> = {
  // Academy (seção 13): presença institucional. Bloco do átrio central (4 pavimentos e o terraço),
  // duas alas de salas um pavimento mais baixas (terraço em cima delas) e o pórtico monumental.
  academy: {
    ground: 10,
    void: 7,
    entry: 10,
    vols: [rect(0, -0.5, 32, 30, 3), rect(-21, -1, 11, 20, 2), rect(21, -1, 11, 20, 2), rect(0, 17.25, 14, 6, 0, { h: 10 })],
  },
  // Idiomas (seção 14): volumes ligados com elemento curvo. Tambor de vidro com o jardim interno,
  // duas alas retangulares de alturas diferentes (2 e 3 pavimentos) e o vestíbulo da entrada.
  languages: {
    ground: 8,
    void: 5,
    entry: 6,
    vols: [circle(0, 0, 14.5, 3), rect(-18, 0, 12, 12, 1), rect(17, -3, 10, 14, 2), rect(0, 15.75, 8, 4, 0, { h: 6 })],
  },
  // Notes (seção 15): planta retangular, composição horizontal, dois pavimentos e sem terraço. Corpo
  // central de dois pavimentos, ateliê térreo a leste (cobertura em dente de serra) e recepção de
  // ideias mais baixa a oeste.
  notes: {
    ground: 7,
    void: 0,
    entry: 6,
    vols: [rect(0, 0.5, 24, 25, 1), rect(-16.5, 0, 10, 14, 0, { h: 5 }), rect(17, -1, 11, 18, 0)],
  },
  // Library (seção 16): volumes retangulares ligados, átrio central de pé-direito duplo. Bloco
  // principal de 3 pavimentos, alas de leitura de 2 pavimentos (terraço em cima) e o pórtico.
  library: {
    ground: 14,
    void: 6,
    entry: 10,
    vols: [rect(0, 0, 34, 32, 2), rect(-19.75, 0, 6, 16, 1), rect(19.75, 0, 6, 16, 1), rect(0, 17.75, 12, 4, 0, { h: 6 })],
  },
  // Inbox (seção 17): volumes retangulares ligados, entrada ampla, átrio de pé-direito duplo, sem
  // terraço. Núcleo de 3 pavimentos, alas laterais de 2, volume de distribuição e hall de entrada
  // térreos e mais baixos.
  inbox: {
    ground: 14,
    void: 0,
    entry: 12,
    vols: [rect(0, 0, 22, 22, 2), rect(-16, 0, 10.5, 14, 1), rect(16, 0, 10.5, 14, 1), rect(0, -16, 16, 10.5, 0, { h: 9 }), rect(0, 15, 18, 8.5, 0, { h: 9 })],
  },
  // Calendar (seção 18): geometria radial com alas retangulares, átrio envidraçado e núcleo com a
  // escada curva. Tambor de 3 pavimentos, duas alas radiais de 2 e o pórtico da entrada.
  calendar: {
    ground: 10,
    void: 3.4,
    entry: 6,
    vols: [circle(0, 0, 16, 2), radial((2 * Math.PI) / 3, 18, 9, 10, 1), radial((-2 * Math.PI) / 3, 18, 9, 10, 1), rect(0, 17.5, 10, 5, 0, { h: 6 })],
  },
  // Tasks (seção 19): volumes retangulares ligados em alturas diferentes. Salão de 2 pavimentos,
  // torre de 3 (com o terraço) e ala térrea baixa a oeste.
  tasks: {
    ground: 8,
    void: 0,
    entry: 7,
    vols: [rect(0, 2, 32, 24, 1), rect(0.5, -7, 19, 18, 2), rect(-19.5, 1, 8, 14, 0, { h: 5 })],
  },
  // Projects (seção 20): volumes retangulares ligados e deslocados, alturas diferentes, átrio
  // iluminado na frente (pé-direito alto do mezanino). O volume de cima é girado e deslocado.
  projects: {
    ground: 9,
    void: 0,
    entry: 6,
    vols: [rect(0, 0, 30, 27, 1), rect(1.5, -5, 22, 15, 2, { rot: 0.2 }), rect(0, 15.5, 8, 4.5, 0, { h: 5 })],
  },
  // Finanças (seção 27): institucional, compacto e alto, 3 pavimentos sem terraço. Bloco central,
  // dois anexos geométricos de 2 pavimentos (o do leste guarda o cofre) e o pórtico da entrada.
  finance: {
    ground: 8,
    void: 0,
    entry: 6,
    vols: [rect(0, -0.5, 23, 25, 2), rect(13.5, 0, 4.5, 7, 1), rect(-13.5, 0, 4.5, 7, 1), rect(0, 13.75, 8, 4, 0, { h: 5 })],
  },
  // Focus (seção 21): volumes baixos em volta do jardim central. Pavilhão redondo do jardim (com a
  // claraboia), alas térreas baixas e o bloco dos fundos com o mezanino parcial.
  focus: {
    ground: 7,
    void: 0,
    entry: 5,
    sky: 6,
    vols: [circle(0, 0, 12.5, 0), rect(0, -17, 18, 13, 1), rect(-15, 0, 6, 10, 0, { h: 4.5 }), rect(15, 0, 6, 10, 0, { h: 4.5 }), rect(0, 14.5, 10, 5, 0, { h: 4.5 })],
  },
  // Habits (seção 22): estufa contemporânea, volumes baixos e horizontais, só o térreo. Nave da
  // estufa, alas laterais mais baixas e o pavilhão de entrada.
  habits: {
    ground: 10,
    void: 0,
    entry: 6,
    sky: 8,
    vols: [rect(0, -1.5, 36, 22, 0), rect(-20.75, -2, 6, 12, 0, { h: 5.5 }), rect(20.75, -2, 6, 12, 0, { h: 5.5 }), rect(0, 12, 10, 6.5, 0, { h: 6 })],
  },
  // Goals (seção 23): volumes geométricos ligados, composição vertical, átrio central. Embasamento
  // hexagonal térreo e baixo, com a torre de 3 pavimentos (terraço em cima) subindo do meio dele, e o pórtico.
  goals: {
    ground: 11,
    void: 4,
    entry: 5,
    vols: [poly(16.5, 6, 0, { h: 6 }), rect(0, 0, 20, 20, 2), rect(0, 15.5, 7, 3, 0, { h: 6 })],
  },
  // Insights (seção 24): geometria circular com volumes retangulares, átrio central redondo.
  // Tambor de 3 pavimentos com o núcleo, bloco lateral de 2, bloco térreo a oeste e a entrada.
  insights: {
    ground: 9,
    void: 3,
    entry: 6,
    vols: [circle(0, 0, 14, 2), rect(14, -4, 8, 12, 1), rect(-14, 4, 8, 8, 0, { h: 6 }), rect(0, 15, 9, 6, 0, { h: 5 })],
  },
  // Música (seção 25): volumes assimétricos de alturas diferentes, 3 pavimentos sem terraço. Salão
  // de 2 pavimentos, torre do auditório de 3 deslocada para oeste e ala térrea baixa a leste.
  music: {
    ground: 9,
    void: 0,
    entry: 6,
    vols: [rect(-1, -0.5, 26, 27, 1), rect(-2, -9, 16, 14, 2), rect(16.5, 2, 9.5, 16, 0, { h: 5 })],
  },
  // Esportes (seção 26): funcional, 2 pavimentos, volumes amplos. Nave larga de 2 pavimentos,
  // vestiários térreos a oeste e a marquise da entrada.
  sports: {
    ground: 10,
    void: 0,
    entry: 8,
    vols: [rect(0, -0.5, 38, 25, 1), rect(-23.5, -1, 9.5, 16, 0, { h: 5 }), rect(0, 14, 12, 4.5, 0, { h: 5.5 })],
  },
  // Sem prédio no Campus (Home e Control Room), mantidos para o interior: o polígono de antes.
  dashboard: { ground: 8, void: 6, entry: 6, vols: [poly(18, 12, 2)] },
  profile: { ground: 6.5, void: 0, entry: 6, vols: [poly(17, 8, 1)] },
  settings: { ground: 7, void: 3.5, entry: 6, vols: [poly(16, 6, 2)] },
};

/** Volumes presentes no nível `L` (0 = térreo). */
export const volsAt = (id: ModuleId, L: number): Vol[] => MASSING[id].vols.filter((v) => (v.lo ?? 0) <= L && v.hi >= L);

/** Nível mais alto do prédio (número de andares acima do térreo). */
export const topLevel = (id: ModuleId): number => Math.max(...MASSING[id].vols.map((v) => v.hi));

/** Altura do piso do nível `L`. */
export const levelY = (id: ModuleId, L: number): number => (L <= 0 ? 0 : MASSING[id].ground + (L - 1) * STOREY);

/** Altura de um volume no térreo (ala mais baixa: a própria; senão, o pé-direito do prédio). */
export const groundHeight = (id: ModuleId, v: Vol): number => (v.hi === 0 && v.h !== undefined ? v.h : MASSING[id].ground);

/**
 * Coberturas que ficam na altura do piso do nível `L` (L ≥ 1): os volumes que terminam no nível
 * de baixo e têm a altura cheia do pavimento (as alas térreas mais baixas cobrem-se mais abaixo).
 */
export function roofsAt(id: ModuleId, L: number): Vol[] {
  const M = MASSING[id];
  return M.vols.filter((v) => v.hi === L - 1 && (L > 1 || v.h === undefined || v.h >= M.ground));
}

/** Frente e fundos do térreo em x = 0, e o raio que cobre a planta (para a câmera). */
export function groundSpan(id: ModuleId): { front: number; back: number; bound: number } {
  const g = volsAt(id, 0);
  return { ...spanZ(g, 0), bound: boundOf(g) };
}

/**
 * Mezanino (planta 'side'): até onde vai o piso do nível `L` em z; à frente disso fica o
 * pé-direito alto, aberto desde o térreo (o mesmo corte por dentro e por fora).
 */
export function sideCut(id: ModuleId, L: number): number {
  const s = spanZ(volsAt(id, L), 0);
  return s.front - (s.front + s.back) * 0.45;
}
