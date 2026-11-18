/**
 * Andares dos interiores (V2.1, seções 10 e 11). O térreo é o salão de cada prédio; por cima dele
 * sobem os andares da especificação, cada prédio na sua arquitetura (forms.ts): átrio com galerias,
 * núcleo com escada, corredor com salas, mezanino sobre pé-direito alto, planta livre ou anel em
 * volta de um jardim; cada andar com a planta da volumetria do prédio (massing.ts: só onde há
 * volume naquele nível, alas mais baixas viram cobertura ou terraço) e a fachada própria. O núcleo
 * dos elevadores dentro do prédio, nos fundos (uma ou duas cabines, com o hall na frente das portas,
 * botoeira e indicador em cada pavimento), e a escada principal do prédio (stairs.ts: reta, em L,
 * em U, curva ou a do núcleo, onde se anda de verdade) ligam todos os níveis, do térreo ao terraço.
 * Cada sala dos andares abre o painel real do módulo que corresponde a ela e mostra, num quadro por
 * cima da porta, os dados reais dela (boards.ts, pelo setData do térreo: nada inventado).
 * Nos prédios com terraço (forms.ts), a cobertura do último andar é mais um nível: a céu aberto,
 * com guarda-corpo, bancos, floreiras e árvores, ligado ao mesmo elevador (e à escada do núcleo).
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { buildingById } from '@/domain/park';
import { Builder, type Kit } from '../kit';
import type { Obstacle, Seat } from '../camera';
import { sectorSign, zoneLabel, type InteriorScene } from './common';
import { footprint } from '../collision';
import { decorate, furnish, roomType, type RoomType } from './furnish';
import { enrichGround, enrichLevel, type Lobby } from './enrich';
import { FORMS, circle, clipZ, facadeAlong, facadeMats, hasRoofTerrace, slab, upperPlan, volSlab, type Plan } from '../forms';
import { MASSING, STOREY, groundHeight, groundSpan, roofsAt, sideCut, volsAt } from '../massing';
import { alongRun, boundOf, deckSpots, inVol, insideAt, inscribed, nearestRun, segDist, spanZ, terraceDoors, volPoly, wallRuns, type DeckSpot, type Pt, type Vol, type WallRun } from '../outline';
import type { Thing } from './things';
import { CIRCULATION, CORE_START, CORE_SWEEP, carve, coreDoor, coreFrom, corePath, coreSpots, coreWalk, corridorBand, inLiftCore, inLiftHall, inPoly, inWell, liftCore, liftKeep, ringGap, stairApproach, stairEdge, stairHole, stairOf, stairPath, stairSpots, stairWalk, voidRadius, type Box, type Stair, type StairWalk } from '../stairs';
import { buildLifts, drawStair, type Lift } from '../vertical';
import { distribute, seriesOf, type FloorBoards } from './boards';
import { boardMesh, type BoardMesh } from './boardMesh';

/** Sala de um andar: chave do nome, setor real que ela abre (null = sem tela própria), tipo de mobília. */
export type RoomKind = 'desk' | 'shelf' | 'screen' | 'lounge' | 'studio';
export type FloorRoom = [key: string, sector: string | null, kind: RoomKind];

/**
 * Andares acima do térreo, na ordem (1º, 2º, 3º), pelo programa aprovado de cada prédio do Campus.
 * Só entra sala que abre um painel real do módulo (setor do próprio prédio; `@options` abre as
 * opções do parque); funções do programa que o módulo não tem não viram sala. Andar sem nenhuma
 * dessas funções existe (circulação, saguão do elevador), mas sem salas. O terraço da cobertura
 * (ROOF_TERRACES, em forms.ts) é um nível a mais, a céu aberto, sem salas.
 */
export const FLOOR_PLANS: Record<ModuleId, FloorRoom[][]> = {
  dashboard: [
    [['indicators', 'panels', 'screen'], ['widgets', 'panels', 'screen'], ['visuals', 'overview', 'screen']],
    [['customize', 'profiles', 'desk'], ['observatory', 'overview', 'lounge']],
  ],
  profile: [[['achievements', 'achievements', 'shelf'], ['archive', 'archive', 'shelf'], ['personalize', 'personalize', 'desk']]],
  notes: [[['organize', 'organize', 'desk'], ['handwriting', 'handwriting', 'studio'], ['versions', 'versions', 'shelf']]],
  library: [
    [['collection', 'collections', 'shelf'], ['research', 'search', 'desk'], ['reading', 'consult', 'lounge']],
    [['deep', 'search', 'desk'], ['documents', 'consult', 'shelf']],
  ],
  calendar: [
    [['daily', 'daily', 'screen'], ['weekly', 'weekly', 'screen'], ['monthly', 'monthly', 'screen'], ['events', 'atrium', 'desk']],
    [['timeline', 'calendars', 'screen'], ['agenda', 'agenda', 'shelf'], ['links', 'planning', 'desk']],
  ],
  tasks: [
    [['stations', 'capture', 'desk'], ['organize', 'kanban', 'screen'], ['priorities', 'planning', 'screen']],
    [['review', 'lists', 'desk'], ['done', 'archive', 'shelf'], ['execution', 'recurrence', 'screen'], ['late', 'atrium', 'screen']],
  ],
  // Mezanino parcial (forms.ts: upper 'side') sobre o salão.
  focus: [[['history', 'history', 'screen']]],
  // Só o térreo: sem andar, mezanino, terraço, elevador ou escada.
  habits: [],
  academy: [
    // Uma sala de aula por disciplina real e as cabines de estudo (sessões de hoje).
    [['class1', 'rooms', 'desk'], ['class2', 'rooms', 'desk'], ['class3', 'rooms', 'desk'], ['cabins', 'plan', 'desk']],
    [['practice', 'review', 'studio']],
    // Sala de provas e notas: as avaliações do período e as notas registradas.
    [['exams', 'hall', 'screen']],
  ],
  languages: [
    // Uma sala por idioma estudado e o mural de gramática do idioma escolhido.
    [['lang1', 'spaces', 'desk'], ['lang2', 'spaces', 'desk'], ['lang3', 'spaces', 'desk'], ['grammar', 'spaces', 'desk']],
    [['conversation', 'spaces', 'lounge'], ['booths', 'spaces', 'studio']],
    // Biblioteca de vocabulário: as palavras para revisar hoje em cada idioma.
    [['vocab', 'spaces', 'shelf']],
  ],
  projects: [
    // Uma sala por projeto ativo (nome, cor, próximo marco).
    [['proj1', 'gallery', 'studio'], ['proj2', 'gallery', 'studio'], ['proj3', 'gallery', 'studio']],
    // O mezanino só tem largura para duas salas (a escada fica ao lado do núcleo) e a primeira da
    // lista é a que não cabe: o acompanhamento (parede e maquete dos projetos) vem por último.
    [['materials', 'gallery', 'shelf'], ['done', 'studio', 'shelf'], ['tracking', 'studio', 'screen']],
  ],
  // Salas de prática por instrumento; o 2º andar é o Estúdio (piano, bateria e violão tocáveis e os
  // murais do repertório e do tempo de prática na parede, WALL_BOARDS), sem salas.
  music: [[['practice1', 'instruments', 'studio'], ['practice2', 'instruments', 'studio'], ['study', 'instruments', 'desk']], []],
  // Uma sala por modalidade praticada (retrospecto e última sessão).
  sports: [[['sport1', 'modalities', 'studio'], ['sport2', 'modalities', 'studio'], ['sport3', 'modalities', 'studio']]],
  goals: [
    [['planning', 'garden', 'desk'], ['links', 'garden', 'desk']],
    [['tracking', 'analysis', 'screen'], ['updates', 'garden', 'desk'], ['history', 'achieved', 'shelf']],
  ],
  insights: [
    [['indicators', 'overview', 'screen'], ['charts', 'productivity', 'screen']],
    [['comparisons', 'overview', 'screen'], ['deep', 'learning', 'screen']],
  ],
  finance: [
    // Orçamento do mês no 1º andar; investimentos no 2º (tudo escuro com Finanças trancado pelo PIN).
    [['budget', 'planning', 'desk'], ['records', 'planning', 'shelf']],
    [['history', 'investments', 'shelf'], ['charts', 'investments', 'screen']],
  ],
  settings: [
    [['devices', 'data', 'desk'], ['sync', 'data', 'screen'], ['storage', 'data', 'shelf'], ['permissions', 'privacy', 'desk'], ['integrations', 'data', 'desk']],
    [['park', '@options', 'lounge'], ['privacy', 'privacy', 'desk'], ['security', 'privacy', 'desk']],
  ],
  inbox: [
    [['triage', 'triage', 'desk'], ['tags', 'gallery', 'desk']],
    [['flow', 'distribution', 'screen'], ['pending', 'triage', 'desk']],
  ],
};

/**
 * Murais na parede de um andar sem salas (chave, setor real que abrem), por prédio e nível: no
 * Estúdio da Música (2º andar), o repertório em andamento e o tempo de prática da semana.
 */
export const WALL_BOARDS: Partial<Record<ModuleId, Record<number, ReadonlyArray<readonly [key: string, sector: string]>>>> = {
  music: { 2: [['repertoire', 'instruments'], ['practiceTime', 'instruments']] },
};

/** Decoração de cada sala nova pela sala equivalente de antes (furnish.ts, decorate). */
const SERIES_DECO: Record<string, string> = { class: 'classrooms', lang: 'languageRooms', practice: 'individual', sport: 'training', proj: 'planning' };
const ROOM_DECO: Record<string, string> = { cabins: 'study', exams: 'comparisons', vocab: 'grammar' };
const decoKey = (key: string): string => {
  const s = seriesOf(key);
  return (s ? SERIES_DECO[s.name] : ROOM_DECO[key]) ?? key;
};

/**
 * Chave i18n do nome do nível `n` do prédio (0 = térreo): o terraço da cobertura tem nome próprio
 * (park.floorRooms.<prédio>.terrace); os demais, park.floorNames.f<n>.
 */
export function floorNameKey(id: ModuleId, n: number): string {
  return hasRoofTerrace(id) && n === (FLOOR_PLANS[id]?.length ?? 0) + 1 ? `park.floorRooms.${id}.terrace` : `park.floorNames.f${n}`;
}

/** Estilo de cada prédio: piso dos corredores por andar, paredes e luz (cada prédio com sua cara). */
const STYLES: Record<ModuleId, { floors: string[]; wall: string; glass: boolean; warm: boolean }> = {
  dashboard: { floors: ['#E6EBF2', '#D9E0EA'], wall: '#EEF2F7', glass: true, warm: false },
  profile: { floors: ['#D8C3A5'], wall: '#F3EBDD', glass: false, warm: true },
  notes: { floors: ['#E3D5C1'], wall: '#F5EFE4', glass: false, warm: true },
  library: { floors: ['#C9A27A', '#B98E66'], wall: '#EFE6D6', glass: false, warm: true },
  calendar: { floors: ['#E2E8F0', '#CBD5E1'], wall: '#F1F5F9', glass: true, warm: false },
  tasks: { floors: ['#E5E7EB', '#D1D5DB'], wall: '#F3F4F6', glass: true, warm: false },
  focus: { floors: ['#E7DCC8'], wall: '#F4EFE6', glass: false, warm: true },
  habits: { floors: ['#DDE8D5'], wall: '#EEF5EA', glass: true, warm: true },
  academy: { floors: ['#E9DFCF', '#E2D6C1', '#D9CCB3'], wall: '#F6F1E7', glass: false, warm: true },
  languages: { floors: ['#EADBC8', '#E3D2BA'], wall: '#F7EFE3', glass: false, warm: true },
  projects: { floors: ['#D9D4CC', '#CFC8BD'], wall: '#E7E3DC', glass: true, warm: false },
  music: { floors: ['#C7A27C', '#B48D68'], wall: '#EADFD0', glass: false, warm: true },
  sports: { floors: ['#D9DEE5', '#CDD3DB'], wall: '#EEF1F4', glass: true, warm: false },
  goals: { floors: ['#EDE3C8'], wall: '#F8F2E2', glass: false, warm: true },
  insights: { floors: ['#E3E8F0', '#D5DCE8', '#C8D1E0'], wall: '#EEF2F8', glass: true, warm: false },
  finance: { floors: ['#E8E2D6', '#DCD4C4'], wall: '#F2EEE6', glass: false, warm: true },
  settings: { floors: ['#E9EDF2', '#DDE3EA'], wall: '#F1F4F7', glass: true, warm: false },
  inbox: { floors: ['#E8EEF5'], wall: '#F2F6FA', glass: true, warm: false },
};

/** Piso de cada tipo de sala. */
const ROOM_FLOOR: Record<RoomType, string> = {
  classroom: '#C9A27A', lab: '#E5E7EB', booth: '#4B5563', gym: '#3F4A5A', archive: '#B98E66', gallery: '#EDE9E3', office: '#D6CFC4',
  dataviz: '#2E3646', lounge: '#B08968', studio: '#E7DCCB', stage: '#8B6B4E', observatory: '#2B3442', music: '#A47551',
};

export interface FloorZone {
  level: number;
  key: string;
  sector: string | null;
  x: number;
  z: number;
  face: number;
  /** Ponto em frente à porta da sala (de onde se entra). */
  ex: number;
  ez: number;
  /**
   * Parede de telas do fundo (salas de dados, furnish.ts 'dataviz'), no sistema da sala (centro no
   * piso, frente = +z): largura, altura, centro (y) e o plano da frente das telas (z). Os objetos de
   * ação dos andares (live3d.ts) se apoiam nela.
   */
  screen?: { w: number; h: number; y: number; z: number };
  /**
   * Nas outras salas, a superfície livre da parede do fundo (o quadro da sala de aula e do
   * escritório, o espelho da academia, a parede atrás dos instrumentos e dos cavaletes), no mesmo
   * sistema de `screen`: onde a parede de ação de um prédio sem sala de dados se apoia (live3d.ts).
   * Salas com estantes, sofá ou espuma no fundo não têm.
   */
  wall?: { w: number; h: number; y: number; z: number };
}

/**
 * Superfície livre do fundo de uma sala de tipo `type` (largura de mobília `fw`, fundo `d`), pelas
 * medidas de furnish.ts e decorate: na frente do quadro, do espelho ou das ripas, abaixo dos quadros
 * decorativos (y ≥ 1,9 m) e acima do que fica no chão. null: o fundo já está ocupado.
 */
export function backWall(type: RoomType, fw: number, d: number): { w: number; h: number; y: number; z: number } | undefined {
  const back = -d / 2 + 0.35;
  switch (type) {
    // Lousa da sala de aula: min(4, w/2) por 1,2 m, centro a 1,5 m, no fundo.
    case 'classroom':
      return { w: Math.min(4, fw * 0.5) - 0.12, h: 1.08, y: 1.5, z: back + 0.02 };
    // Quadro branco do escritório: min(3,2, 0,4 w) por 1,2 m, centro a 1,5 m.
    case 'office':
      return { w: Math.min(3.2, fw * 0.4) - 0.1, h: 1.08, y: 1.5, z: back + 0.02 };
    // Espelho da academia (fundo - 0,12, de 0,2 a 2,2 m): na metade de cima, acima dos bancos.
    case 'gym':
      return { w: Math.min(2.4, fw * 0.45), h: 0.85, y: 1.72, z: back - 0.1 };
    // Sala de música e ateliê: a parede de ripas, entre os instrumentos/cavaletes e os quadros.
    case 'music':
    case 'studio':
      return { w: Math.min(2.4, fw * 0.42), h: 0.85, y: 1.45, z: -d / 2 + 0.17 };
    default:
      return undefined;
  }
}

export interface FloorLevel {
  y: number;
  /** Raio da fachada (apótema; para a câmera não atravessar). */
  outer: number;
  /** Raio máximo onde se pode andar (inclui o terraço do recuo). */
  walk: number;
  /** Raio do vazio/núcleo do meio (0 quando não há). */
  inner: number;
  ceiling: number;
  obstacles: Obstacle[];
  /** Portas da fachada (ângulos) e meia abertura em radianos. */
  doors: number[];
  doorHalf: number;
  /** Onde não se pisa: vazios, núcleo, fachada fora das portas, além do terraço. */
  blocked: (x: number, z: number) => boolean;
  /** Raio da fachada na direção do ponto (câmera da 3ª pessoa). */
  wallAt: (x: number, z: number) => number;
  /** Onde se chega saindo do elevador. */
  arrive: { x: number; z: number };
}

/**
 * Subida ou descida pela escada: do nível `from` ao `to`, começando no pé da escada (x, z) e
 * seguindo `path` (x, y do piso, z de cada ponto, até o patamar de chegada no outro nível).
 */
export interface Climb {
  from: number;
  to: number;
  x: number;
  z: number;
  path: Float32Array;
}

export interface Floors {
  levels: FloorLevel[];
  /** Altura do piso de cada nível (a mesma de `levels`). */
  ys: number[];
  zones: FloorZone[];
  /** Centro do poço dos elevadores (no núcleo dentro do prédio, nos fundos; o hall fica na frente, +z). */
  elevator: { x: number; z: number };
  seats: Seat[];
  /** Cabine e portas do primeiro elevador (as de todos estão em `lifts`). */
  cabin: THREE.Group;
  doors: [THREE.Object3D, THREE.Object3D];
  /** Elevadores lado a lado no poço (um ou dois, pela seção de cada prédio). */
  lifts: Lift[];
  /** Cada subida e descida pela escada principal (ou pela do núcleo): o caminho de quem é guiado por ela. */
  climbs: Climb[];
  /** Onde se pisa na escada (andar nela de verdade); null sem escada. */
  walk: StairWalk | null;
  /** Objetos funcionais (piano, luminárias, globo, relógio, luneta, escada, portas das salas). */
  things: Thing[];
  plan: Plan;
}

/** Vaga de uma sala no andar: centro, frente (para onde abre a porta), largura e fundo. */
export interface Slot {
  /** Índice da sala no programa do andar (FLOOR_PLANS): sala que não cabe livre fica de fora. */
  k: number;
  x: number;
  z: number;
  face: number;
  w: number;
  d: number;
  /** Caixa com paredes (anel, corredor, mezanino) ou ilha sem paredes (planta livre). */
  kind: 'box' | 'island';
}

/** Posições (metros a partir de a) das portas pedidas que caem neste trecho de parede. */
function doorsOn(r: WallRun, pts: ReadonlyArray<{ x: number; z: number }>): number[] {
  return pts.filter((p) => segDist(p.x, p.z, r.ax, r.az, r.bx, r.bz) < 0.6).map((p) => alongRun(r, p.x, p.z));
}

/** Contorno de um volume crescido `grow` m para fora (o mesmo de volSlab, em forms.ts). */
function grownPoly(v: Vol, grow: number): Pt[] {
  return volPoly(v).map(([x, z]) => {
    const k = 1 + grow / Math.max(1, Math.hypot(x - v.cx, z - v.cz));
    return [v.cx + (x - v.cx) * k, v.cz + (z - v.cz) * k] as Pt;
  });
}

/**
 * Peças de um terraço (deckSpots), desenhadas igual por dentro e por fora: floreira de pedra,
 * banco de frente para a vista com balizador de luz, árvore em vaso e mesa redonda com bancos.
 */
export function drawDeck(kit: Kit, b: Builder, spots: readonly DeckSpot[], y: number, warm: boolean, seats: Seat[] | null, obstacles: Obstacle[] | null) {
  const stoneMat = kit.mat('#CFC6B6', { rough: 0.9 });
  const soil = kit.mat('#5B4636', { rough: 1 });
  const bark = kit.mat('#6B4F3A', { rough: 0.9 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const leafB = kit.mat('#3E7F44', { rough: 0.9 });
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const dark = kit.mat('#2B3442', { rough: 0.5 });
  const tableTop = kit.mat('#E5E7EB', { rough: 0.5 });
  const lampMat = kit.mat(warm ? '#FFE8C2' : '#E8F4FF', { glow: true });
  for (const s of spots) {
    const c = Math.cos(s.face);
    const sn = Math.sin(s.face);
    if (s.kind === 'planter') {
      b.add(stoneMat, new THREE.BoxGeometry(1.6, 0.55, 0.6), [s.x, y + 0.275, s.z], [0, s.face, 0]);
      b.add(soil, new THREE.BoxGeometry(1.45, 0.02, 0.45), [s.x, y + 0.56, s.z], [0, s.face, 0]);
      for (const t of [-0.45, 0, 0.45]) b.add(t ? leaf : leafB, new THREE.IcosahedronGeometry(0.32, 1), [s.x + c * t, y + 0.8, s.z - sn * t], undefined, [1.2, 0.9, 1]);
      obstacles?.push({ x: s.x, z: s.z, r: 0.8, h: 0.9 });
    } else if (s.kind === 'bench') {
      b.add(wood, new THREE.BoxGeometry(1.8, 0.08, 0.45), [s.x, y + 0.45, s.z], [0, s.face, 0]);
      b.add(wood, new THREE.BoxGeometry(1.8, 0.4, 0.06), [s.x - sn * 0.22, y + 0.72, s.z - c * 0.22], [0, s.face, 0]);
      for (const t of [-0.75, 0.75]) b.add(dark, new THREE.BoxGeometry(0.08, 0.42, 0.4), [s.x + c * t, y + 0.21, s.z - sn * t], [0, s.face, 0]);
      seats?.push({ x: s.x, y: y + 0.45, z: s.z, face: s.face });
      b.add(dark, new THREE.CylinderGeometry(0.07, 0.09, 0.7, 10), [s.x + c * 1.2, y + 0.35, s.z - sn * 1.2]);
      b.add(lampMat, new THREE.CylinderGeometry(0.075, 0.075, 0.12, 10), [s.x + c * 1.2, y + 0.76, s.z - sn * 1.2]);
    } else if (s.kind === 'tree') {
      b.add(stoneMat, new THREE.CylinderGeometry(0.85, 0.75, 0.6, 20), [s.x, y + 0.3, s.z]);
      b.add(soil, new THREE.CircleGeometry(0.78, 20), [s.x, y + 0.61, s.z], [-Math.PI / 2, 0, 0]);
      b.add(bark, new THREE.CylinderGeometry(0.1, 0.15, 2.4, 8), [s.x, y + 1.8, s.z]);
      for (let j = 0; j < 3; j++) b.add(j % 2 ? leaf : leafB, new THREE.IcosahedronGeometry(0.9 - j * 0.15, 1), [s.x + Math.sin(j * 2.1) * 0.3, y + 3.0 + j * 0.4, s.z + Math.cos(j * 2.1) * 0.3]);
      obstacles?.push({ x: s.x, z: s.z, r: 0.9, h: 3.5 });
    } else {
      b.add(tableTop, new THREE.CylinderGeometry(0.45, 0.45, 0.04, 20), [s.x, y + 0.75, s.z]);
      b.add(dark, new THREE.CylinderGeometry(0.04, 0.06, 0.73, 8), [s.x, y + 0.37, s.z]);
      for (const t of [-0.85, 0.85]) {
        const px = s.x + c * t;
        const pz = s.z - sn * t;
        b.add(wood, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), [px, y + 0.45, pz]);
        b.add(dark, new THREE.CylinderGeometry(0.03, 0.03, 0.43, 6), [px, y + 0.22, pz]);
        seats?.push({ x: px, y: y + 0.45, z: pz, face: Math.atan2(s.x - px, s.z - pz) });
      }
    }
  }
}

/** Lugar do relógio de sol no terraço do Calendar: na frente, no eixo da entrada, longe da borda. */
export function sundialSpot(vols: readonly Vol[]): { x: number; z: number } | null {
  const f = spanZ(vols, 0).front;
  for (let z = f - 4; z > 2; z -= 0.5) if (insideAt(vols, 0, z, 2.8)) return { x: 0, z };
  return null;
}

/**
 * Relógio de sol (seção 18): mostrador redondo de pedra com as doze marcas das horas e o gnômon de
 * bronze inclinado, apontando para o norte do prédio. O mesmo por dentro e por fora.
 */
export function sundial(kit: Kit, b: Builder, x: number, y: number, z: number) {
  const stone = kit.mat('#D8D2C6', { rough: 0.85 });
  const bronze = kit.mat('#B08D57', { metal: 0.85, rough: 0.3 });
  b.add(stone, new THREE.CylinderGeometry(2.2, 2.35, 0.4, 40), [x, y + 0.2, z]);
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    b.add(bronze, new THREE.BoxGeometry(0.08, 0.03, h % 3 ? 0.35 : 0.6), [x + Math.sin(a) * 1.8, y + 0.415, z + Math.cos(a) * 1.8], [0, a, 0]);
  }
  const g = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.6, 0), new THREE.Vector2(0, 1.4)]);
  const gnomon = new THREE.ExtrudeGeometry(g, { depth: 0.08, bevelEnabled: false });
  gnomon.translate(0, 0, -0.04);
  gnomon.rotateY(Math.PI / 2);
  b.add(bronze, gnomon, [x, y + 0.4, z + 0.8]);
}

/**
 * Monta os andares em cima de um interior, cada prédio na sua arquitetura (forms.ts) e na sua
 * volumetria (massing.ts): cada andar só existe onde há volume naquele nível, com as paredes, as
 * lajes, as salas e onde se anda pela mesma planta de fora. Ala que termina abaixo vira cobertura
 * (terraço com guarda-corpo e porta, nos prédios com terraço). `label(key)` dá o nome da sala no
 * idioma atual; `terrace` e `floorName(n)` também vêm traduzidos.
 */
export function withFloors(kit: Kit, scene: InteriorScene, id: ModuleId, label: (key: string) => string, terrace: string, floorName: (n: number) => string, elevators = 'Elevadores', liftWords?: { up: string; down: string; off: string }): InteriorScene {
  const plan = FLOOR_PLANS[id];
  if (!plan?.length) return scene;
  const form = FORMS[id];
  // Planta dos andares de cima (a do térreo ou a própria, como o mezanino do Focus).
  const fp = upperPlan(form);
  const roofT = hasRoofTerrace(id);
  const M = MASSING[id];
  const H = M.ground;
  const g0 = volsAt(id, 0);
  const span0 = groundSpan(id);
  const back0 = span0.back;
  const accent = buildingById(id)?.color ?? '#22D3EE';
  const b = new Builder();
  const slabMat = kit.mat('#F1F3F6', { rough: 0.6 });
  const roofMat = kit.mat('#D9DAD5', { rough: 0.9 });
  const deckMat = kit.mat('#E4DED2', { rough: 0.85 });
  const style = STYLES[id];
  const glass = kit.mat('#CFE7F5', { glass: true, side: THREE.DoubleSide });
  const metal = kit.mat('#9AA6B5', { metal: 0.85, rough: 0.3 });
  const wood = kit.mat('#A0714F', { rough: 0.75 });
  const dark = kit.mat('#2B3442', { rough: 0.5 });
  const leaf = kit.mat('#4C9A4F', { rough: 0.9 });
  const fm = facadeMats(kit, form);
  // Núcleo dos elevadores dentro do prédio, nos fundos em x = 0 (stairs.ts: o mesmo em todos os
  // níveis), com o hall na frente das portas; a laje de cada nível é recortada em volta do poço.
  const core = liftCore(id);
  if (!core) return scene;
  const tower = { x: 0, z: core.tz };
  const rules = levelRules(id) ?? [];
  const coreBox = { x0: core.x0, x1: core.x1, z0: core.z0, z1: core.z1 };
  /** Laje com a forma e os furos dados, sem o poço dos elevadores (por onde a cabine passa). */
  const carved = (m: THREE.Material, pts: Pt[], holes: Pt[][], y: number, thick: number) => {
    for (const p of carve(pts, holes, coreBox)) b.add(m, slab(p.pts, p.holes, y, thick));
  };
  // Escada principal (stairs.ts) ou a do núcleo; os anéis de salas abrem onde ela fica.
  const st = stairOf(id);
  const coreStair = CIRCULATION[id].stair === 'core';
  /**
   * Por onde se chega à escada no nível `L` (o pé, a chegada e a frente das bordas do patamar; no
   * caracol do núcleo, a porta): salas, móveis, plantas e placas ficam longe, para nenhum objeto
   * travar o caminho até ela (a "barreira invisível" de antes).
   */
  const ways = (L: number): Pt[] => stairWays(id, L);
  /** Longe (pelo menos `m` m) do caminho até a escada no nível `L`. */
  const offWay = (L: number, x: number, z: number, m: number) => ways(L).every(([px, pz]) => Math.hypot(x - px, z - pz) >= m);
  /** A escada no nível `L` para quem não está nela: o vão inteiro e o guarda-corpo em volta (menos a entrada pelo patamar). */
  const stairBlock = (L: number, x: number, z: number) => st !== null && (inPoly(st.well, x, z) || stairEdge(st, L, x, z));
  const groundBlocked = scene.room.blocked;
  scene.room.blocked = (x, z) => groundBlocked(x, z) || inLiftCore(core, x, z, 0.3) || stairBlock(0, x, z);
  // O núcleo da escada em caracol no térreo (Insights) era um obstáculo inteiro: agora se entra
  // nele pela porta e o caracol diz onde se pisa (stairs.ts, coreWalk).
  if (coreStair) {
    const rc = voidRadius(id);
    for (let i = scene.obstacles.length - 1; i >= 0; i--) {
      const o = scene.obstacles[i]!;
      if (Math.hypot(o.x, o.z) < 0.5 && o.r >= rc) scene.obstacles.splice(i, 1);
    }
  }
  const things: Thing[] = [];
  const thingRoot = new THREE.Group();
  scene.scene.add(thingRoot);
  const levels: FloorLevel[] = [
    { y: 0, outer: span0.bound, walk: back0 - 1.2, inner: 0, ceiling: H, obstacles: scene.obstacles, doors: [], doorHalf: 0, blocked: scene.room.blocked, wallAt: scene.room.wallAt, arrive: { x: 0, z: core.z1 + 1.6 } },
  ];
  const zones: FloorZone[] = [];
  const seats: Seat[] = [];
  const wallMat = kit.mat(style.wall, { rough: 0.8 });
  const partMat = style.glass ? glass : wallMat;
  const lampMat = kit.mat(style.warm ? '#FFE8C2' : '#E8F4FF', { glow: true });
  const wallH = STOREY - 0.35;
  // Vazio do meio (átrio, jardim interno ou núcleo da escada), o mesmo em todos os andares.
  const inner = fp === 'atrium' || fp === 'garden' ? Math.max(3.2, M.void) : fp === 'core' ? Math.max(2.6, M.void) : 0;
  const holds = (v: Vol) => inner > 0 && inVol(v, 0, 0, inner + 0.5);

  // Quadros dos andares (boards.ts): um por sala, por cima da porta, e os murais de parede (WALL_BOARDS).
  const boardAt = new Map<string, BoardMesh>();

  plan.forEach((rooms, i) => {
    const L = i + 1;
    const y = H + i * STOREY;
    const top = L === plan.length;
    const vols = volsAt(id, L);
    const runs = wallRuns(vols, 1);
    const sp = spanZ(vols, 0);
    const backR = sp.back;
    const inside = (x: number, z: number, m: number) => insideAt(vols, x, z, m);
    // Onde há piso livre para salas e móveis: dentro da planta e fora do vão da escada.
    // Fora do núcleo dos elevadores (as salas podem encostar nas paredes dele).
    const free = (x: number, z: number, m: number) => inside(x, z, m) && !inWell(st, x, z, m) && !inLiftCore(core, x, z, Math.min(m, 0.1));
    const zv = fp === 'side' ? sideCut(id, L) : Infinity;
    const hole = inner > 0 && (fp === 'atrium' || (fp === 'garden' && L > 1));
    // Coberturas das alas que terminam logo abaixo (vistas pela janela); terraço onde o prédio tem.
    const roofs = roofsAt(id, L);
    const terr = roofT ? roofs : [];
    const edges = terr.length ? wallRuns([...vols, ...terr], 1).filter((r) => r.vol >= vols.length) : [];
    // Portas da fachada: uma em cada trecho de frente para o terraço das alas (o elevador fica dentro).
    const doorPts: Array<{ x: number; z: number; nx?: number; nz?: number }> = [...terraceDoors(runs, terr)];

    // Laje do andar (com o vazio do meio ou cortada no mezanino) e o piso de circulação por cima.
    const corridorMat = kit.mat(style.floors[(L - 1) % style.floors.length]!, { rough: 0.35, metal: 0.05 });
    // Vão da escada nesta laje (nos volumes que contêm a escada inteira).
    const sh = stairHole(st, L);
    const shVols = st?.vols ?? [];
    for (const v of vols) {
      const pts = Number.isFinite(zv) ? clipZ(volPoly(v), zv) : volPoly(v);
      if (pts.length < 3) continue;
      const holes: Pt[][] = hole && holds(v) ? [circle(inner)] : [];
      if (sh && shVols.includes(v)) holes.push(sh);
      carved(slabMat, pts, holes, y, 0.3);
      carved(corridorMat, pts, holes, y + 0.012, 0.01);
    }
    // Cobertura das alas mais baixas (deque, quando é terraço) e o guarda-corpo nas bordas livres.
    for (const v of roofs) b.add(terr.length ? deckMat : roofMat, volSlab(v, y, 0.3));
    for (const r of edges) railing(b, glass, metal, [[r.ax, r.az], [r.bx, r.bz]], y, false);
    // Vazio do meio: guarda-corpo em volta.
    if (hole) {
      b.add(glass, new THREE.CylinderGeometry(inner, inner, 1.1, 48, 1, true), [0, y + 0.55, 0]);
      b.add(metal, new THREE.TorusGeometry(inner, 0.05, 6, 64), [0, y + 1.1, 0], [Math.PI / 2, 0, 0]);
    }
    if (fp === 'side') {
      // Guarda-corpo da galeria sobre o pé-direito alto, só onde há laje.
      let pts: Array<[number, number]> = [];
      for (let x = -60; x <= 60.01; x += 0.5) {
        if (inside(x, zv, 0.1)) pts.push([x, zv]);
        else {
          if (pts.length > 1) railing(b, glass, metal, pts, y, false);
          pts = [];
        }
      }
      if (pts.length > 1) railing(b, glass, metal, pts, y, false);
    }
    // Fachada no tipo do prédio, trecho a trecho, com as portas do terraço.
    for (const r of runs) facadeAlong(b, form, fm, r, y, STOREY - 0.3, doorsOn(r, doorPts));
    // Placa do terraço sobre cada porta que dá para ele (por dentro).
    for (const p of doorPts) {
      const s = sectorSign(kit, terrace, accent, 1.6);
      s.position.set(p.x - (p.nx ?? 0) * 0.3, y + 2.75, p.z - (p.nz ?? 0) * 0.3);
      s.rotation.y = Math.atan2(p.nx ?? 0, p.nz ?? 1);
      scene.scene.add(s);
    }
    if (top) {
      // Cobertura: claraboia sobre o átrio; jardim a céu aberto; laje inteira nos demais (com o vão
      // da escada, quando ela sobe ao terraço).
      const shRoof = stairHole(st, L + 1);
      for (const v of vols) {
        const roofHoles: Pt[][] = holds(v) && (fp === 'atrium' || fp === 'garden') ? [circle(fp === 'atrium' ? inner * 0.8 : inner)] : [];
        if (shRoof && shVols.includes(v)) roofHoles.push(shRoof);
        // Com terraço, a cabine sobe até ele: a cobertura tem o furo do poço.
        if (roofT) carved(slabMat, grownPoly(v, 0.2), roofHoles, y + STOREY, 0.3);
        else b.add(slabMat, volSlab(v, y + STOREY, 0.3, roofHoles, 0.2));
      }
      if (fp === 'atrium') {
        b.add(glass, new THREE.SphereGeometry(inner * 0.8, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, y + STOREY - 0.3, 0], undefined, [1, 0.35, 1]);
        for (let k = 0; k < 8; k++) b.add(metal, new THREE.TorusGeometry(inner * 0.8, 0.03, 4, 24, Math.PI), [0, y + STOREY - 0.3, 0], [0, (k / 8) * Math.PI, 0], [1, 0.35, 1]);
      }
    }
    // Terraço das alas: floreiras e bancos junto ao guarda-corpo.
    const obstacles: Obstacle[] = [];
    if (terr.length) drawDeck(kit, b, deckSpots(terr, edges, 0, Math.PI, false), y, style.warm, seats, obstacles);

    // Salas: cada planta distribui do seu jeito, dentro da planta deste andar.
    // (roomSlots: fora do núcleo e do hall, do vão e do caminho até a escada, sem fechar o corredor da
    // chegada do elevador até ela; a que não cabe em nenhuma vaga fica de fora.)
    const slots = roomSlots(id, L);
    // Rota a pé da chegada do elevador até a escada, só pela planta (stairRoute): o saguão, os bancos
    // e as floreiras desviam dela, e nenhum móvel fecha o hall, a passagem entre o núcleo e a escada
    // ou a do lado do vazio (antes, a mesa do saguão caía na chegada do Inbox e da Música).
    const route = routeOn(rules[L], ways(L));
    const onRoute = (x: number, z: number, m: number) => route.some(([px, pz]) => Math.hypot(x - px, z - pz) < m);
    const blockedHere = rules[L]?.blocked ?? (() => false);
    const lobbyOk = (x: number, z: number, m: number) => inside(x, z, 0.4) && !inWell(st, x, z, m) && !inLiftCore(core, x, z, 0.6 + m) && !inLiftHall(core, x, z, 0.3 + m) && offWay(L, x, z, m + 0.6) && Math.hypot(x, z - (core.z1 + 1.6)) > m + 1.0 && !blockedHere(x, z) && !onRoute(x, z, m + 0.6);
    const lobby = clearLobby(lobbyOf(fp, free, inner, zv, backR), lobbyOk);
    // Lugares já tomados no andar (saguão, peça-assinatura e o violão ao lado dela, salas): o piano do
    // Estúdio e os murais procuram lugar fora deles (x, z, raio).
    const taken: Array<[number, number, number]> = [[lobby.sofa.x, lobby.sofa.z, 1.2], [lobby.table[0], lobby.table[1], 0.6], [lobby.plant[0], lobby.plant[1], 0.6], [lobby.lamp[0], lobby.lamp[1], 0.5], [lobby.sig.x, lobby.sig.z, 1.4]];
    taken.push([lobby.sig.x + Math.cos(lobby.sig.face) * 1.5 - Math.sin(lobby.sig.face) * 1.1, lobby.sig.z - Math.sin(lobby.sig.face) * 1.5 - Math.cos(lobby.sig.face) * 1.1, 0.6]);
    if (lobby.service) taken.push([lobby.service[0] + 1.4, lobby.service[1], 2.0]);
    for (const sl of slots) taken.push([sl.x, sl.z, Math.hypot(sl.w, sl.d) / 2 + 0.9]);
    /**
     * Lugar livre de meia largura `m` mais perto de (x0, z0), em anéis de 0,5 m até 10 m: dentro da
     * planta, fora do núcleo, do hall, da escada, do caminho e da rota até ela (a mesma regra do
     * saguão) e longe do que já está no andar. null: não há.
     */
    const findSpot = (x0: number, z0: number, m: number): [number, number] | null => {
      for (let r = 0; r <= 10; r += 0.5)
        for (let k = 0; k < (r ? 16 : 1); k++) {
          const x = x0 + Math.sin((k / 16) * Math.PI * 2) * r;
          const z = z0 - Math.cos((k / 16) * Math.PI * 2) * r;
          if (!inside(x, z, m) || !lobbyOk(x, z, m) || !taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > tr + m)) continue;
          taken.push([x, z, m]);
          return [x, z];
        }
      return null;
    };
    slots.forEach((sl) => {
      const k = sl.k;
      const [key, sector] = rooms[k]!;
      const type = roomType(key, id);
      const front = { x: Math.sin(sl.face), z: Math.cos(sl.face) };
      const ex = sl.x + front.x * (sl.d / 2 + 0.9);
      const ez = sl.z + front.z * (sl.d / 2 + 0.9);
      // A parede de telas da sala de dados (furnish.ts: w × 0,62 por 1,7 m, centro a 1,65 m, no fundo).
      const fw = sl.w * (sl.kind === 'island' ? 0.75 : 1);
      const screen = type === 'dataviz' ? { w: fw * 0.62, h: 1.7, y: 1.65, z: -sl.d / 2 + 0.35 + 0.04 } : undefined;
      zones.push({ level: L, key, sector, x: sl.x, z: sl.z, face: sl.face, ex, ez, screen, wall: screen ? undefined : backWall(type, fw, sl.d) });
      const zi = zones.length - 1;
      const g = new THREE.Group();
      g.position.set(sl.x, y, sl.z);
      g.rotation.y = sl.face;
      const fb = new Builder();
      const { w, d } = sl;
      fb.add(kit.mat(ROOM_FLOOR[type], { rough: type === 'lab' || type === 'booth' ? 0.4 : 0.7 }), new THREE.PlaneGeometry(w, d), [0, 0.02, 0], [-Math.PI / 2, 0, 0]);
      if (sl.kind === 'box') {
        // Paredes: fundo, laterais e frente com porta de 1,8 m e verga; rodapé.
        fb.add(wallMat, new THREE.BoxGeometry(w, wallH, 0.15), [0, wallH / 2, -d / 2]);
        for (const s of [-1, 1]) fb.add(wallMat, new THREE.BoxGeometry(0.15, wallH, d), [s * w / 2, wallH / 2, 0]);
        const side = (w - 1.8) / 2;
        for (const s of [-1, 1]) fb.add(partMat, new THREE.BoxGeometry(side, wallH, 0.12), [s * (0.9 + side / 2), wallH / 2, d / 2]);
        fb.add(wallMat, new THREE.BoxGeometry(1.8, wallH - 2.4, 0.15), [0, 2.4 + (wallH - 2.4) / 2, d / 2]);
        for (const s of [-1, 1]) fb.add(metal, new THREE.BoxGeometry(0.08, 2.4, 0.18), [s * 0.9, 1.2, d / 2]);
        fb.add(dark, new THREE.BoxGeometry(w - 0.1, 0.1, 0.02), [0, 0.05, -d / 2 + 0.085]);
        for (const f of [-0.25, 0.25]) fb.add(lampMat, new THREE.BoxGeometry(1.2, 0.04, 0.5), [w * f, wallH - 0.05, 0]);
      } else {
        // Ilha da planta livre: tapete, estantes baixas nas laterais e pendentes.
        fb.add(kit.mat(style.warm ? '#C9B79C' : '#B8C2CF', { rough: 1 }), new THREE.PlaneGeometry(w * 0.8, d * 0.75), [0, 0.03, 0], [-Math.PI / 2, 0, 0]);
        for (const s of [-1, 1]) {
          fb.add(wood, new THREE.BoxGeometry(0.4, 1.15, d * 0.8), [s * (w / 2 - 0.2), 0.575, -0.1]);
          for (let r = 0; r < 3; r++) fb.add(kit.mat(['#E07A5F', '#81B29A', '#5B8DB8'][r]!, { rough: 0.85 }), new THREE.BoxGeometry(0.3, 0.26, d * 0.22), [s * (w / 2 - 0.2), 0.35 + r * 0.36, -d * 0.25 + r * d * 0.2]);
          fb.add(leaf, new THREE.IcosahedronGeometry(0.3, 1), [s * (w / 2 - 0.2), 1.35, d * 0.3]);
        }
        for (const s of [-1, 1]) {
          fb.add(metal, new THREE.CylinderGeometry(0.006, 0.006, 1.2, 4), [s * w * 0.2, wallH - 0.6, 0]);
          fb.add(lampMat, new THREE.ConeGeometry(0.28, 0.3, 20, 1, true), [s * w * 0.2, wallH - 1.3, 0]);
        }
      }
      const local = furnish(kit, fb, type, sl.w * (sl.kind === 'island' ? 0.75 : 1), sl.d, accent, k + L * 7);
      decorate(kit, fb, decoKey(key), sl.w, sl.d, accent, style.warm, k + L * 7);
      g.add(fb.build());
      const sign = sectorSign(kit, label(key), sector ? accent : '#94A3B8', 2.2);
      sign.position.set(0, 2.62, sl.d / 2 + 0.25);
      g.add(sign);
      // Quadro com os dados reais da sala (boards.ts), por cima da porta, virado para o corredor;
      // até chegarem os dados, só o nome da sala. Preso no teto por duas hastes (na ilha sem paredes).
      const bw = Math.min(sl.w - 0.3, 3.2);
      const bm = boardMesh(kit, bw, 0.95, accent, label(key));
      bm.group.position.set(0, 3.45, sl.d / 2 + 0.1);
      g.add(bm.group);
      for (const s of [-1, 1]) {
        const rod = new THREE.Mesh(kit.own(new THREE.BoxGeometry(0.02, 0.14, 0.02)), dark);
        rod.position.set(s * bw * 0.4, 3.99, sl.d / 2 + 0.1);
        g.add(rod);
      }
      boardAt.set(key, bm);
      const cf = Math.cos(sl.face);
      const sf = Math.sin(sl.face);
      for (const st of local) seats.push({ x: sl.x + st.x * cf + st.z * sf, y: y + st.y, z: sl.z - st.x * sf + st.z * cf, face: st.face + sl.face });
      g.traverse((o) => {
        o.userData.zone = zi;
        o.userData.sector = sector;
      });
      scene.scene.add(g);
      scene.pickables.push(g);
      // Porta da sala: chegando perto, abre o painel real dela.
      things.push({ kind: 'room', level: L, x: ex, z: ez, face: sl.face, zone: zi });
    });

    // Corredor do meio (planta em corredor e planta livre): faixa no piso e luz contínua no teto.
    if (fp === 'corridor' || fp === 'open') {
      const zf = sp.front - 0.6;
      const zb = -backR + 0.6;
      b.add(kit.mat(style.warm ? '#B9936C' : '#9AA8B8', { rough: 0.6 }), new THREE.BoxGeometry((fp === 'corridor' ? 1.6 : 2.4) * 1.2, 0.01, zf - zb), [0, y + 0.025, (zf + zb) / 2]);
      b.add(lampMat, new THREE.BoxGeometry(0.3, 0.04, Math.max(0.5, zf - zb - 1)), [0, y + wallH - 0.05, (zf + zb) / 2]);
      if (fp === 'open') {
        // Canteiros baixos no meio do corredor largo, com bancos dos dois lados.
        for (let zz = zb + 6; zz < zf - 3; zz += 7) {
          if (!inside(0, zz, 1.6)) continue;
          b.add(kit.mat('#D9CBB6', { rough: 0.8 }), new THREE.BoxGeometry(1.0, 0.45, 2.2), [0, y + 0.22, zz]);
          b.add(leaf, new THREE.IcosahedronGeometry(0.5, 1), [0, y + 0.75, zz], undefined, [1.2, 0.8, 2.4]);
          for (const s of [-1, 1]) {
            b.add(wood, new THREE.BoxGeometry(0.45, 0.08, 1.8), [s * 0.8, y + 0.45, zz]);
            seats.push({ x: s * 0.8, y: y + 0.45, z: zz, face: s * Math.PI / 2 });
          }
        }
      }
    }
    // Núcleo maciço (planta com núcleo): parede de pedra, nichos com telas, porta da escada.
    if (fp === 'core') coreLevel(kit, b, y, inner, accent, top && !roofT, coreStair);
    // Jardim interno no 1º andar (a céu aberto), com árvores, espelho d'água e bancos.
    if (fp === 'garden' && L === 1) gardenCourt(kit, b, seats, obstacles, y, inner);

    const ceiling = y + STOREY - 0.35;
    const apo = Math.max(4, inscribed(vols));
    enrichLevel(kit, b, seats, id, L, top, y, lobby, hole ? inner : 0, apo, ceiling, accent, style.warm, thingRoot, things, (x, z) => free(x, z, 0.8) && offWay(L, x, z, 1.5), (x, z) => !onRoute(x, z, 1.2) && offWay(L, x, z, 4), findSpot);

    // Murais na parede (WALL_BOARDS): rentes à fachada, de 1,55 m a 2,75 m de altura (acima da faixa
    // de colisão), num trecho reto longe das portas do terraço, do núcleo e da escada, com um lugar
    // livre na frente (de onde se lê e se toca). Tocar abre o painel real, como a porta de uma sala.
    for (const [key, sector] of WALL_BOARDS[id]?.[L] ?? []) {
      let at: { x: number; z: number; face: number; ex: number; ez: number } | null = null;
      for (const r of runs) {
        for (let s = 1.4; s <= r.len - 1.4 && !at; s += 0.5) {
          const px = r.ax + ((r.bx - r.ax) * s) / r.len;
          const pz = r.az + ((r.bz - r.az) * s) / r.len;
          const ex = px - r.nx * 1.8;
          const ez = pz - r.nz * 1.8;
          const ix = px - r.nx * 0.5;
          const iz = pz - r.nz * 0.5;
          if (doorPts.some((d) => Math.hypot(d.x - px, d.z - pz) < 2.2)) continue;
          if (!inside(ex, ez, 0.6) || !lobbyOk(ex, ez, 0.5) || inWell(st, ix, iz, 0.8) || inLiftCore(core, ix, iz, 1.0)) continue;
          if (!taken.every(([tx, tz, tr]) => Math.hypot(ix - tx, iz - tz) > tr + 1.3 && Math.hypot(ex - tx, ez - tz) > tr + 0.4)) continue;
          at = { x: px - r.nx * 0.06, z: pz - r.nz * 0.06, face: Math.atan2(-r.nx, -r.nz), ex, ez };
        }
        if (at) break;
      }
      if (!at) continue;
      taken.push([at.x, at.z, 1.3], [at.ex, at.ez, 0.6]);
      zones.push({ level: L, key, sector, x: at.x, z: at.z, face: at.face, ex: at.ex, ez: at.ez });
      const zi = zones.length - 1;
      const bm = boardMesh(kit, 2.4, 1.2, accent, label(key));
      bm.group.position.set(at.x, y + 2.15, at.z);
      bm.group.rotation.y = at.face;
      bm.group.traverse((o) => {
        o.userData.zone = zi;
        o.userData.sector = sector;
      });
      scene.scene.add(bm.group);
      scene.pickables.push(bm.group);
      boardAt.set(key, bm);
      things.push({ kind: 'room', level: L, x: at.ex, z: at.ez, face: at.face, zone: zi });
    }

    {
      // Placa verde de saída de emergência acesa, pendurada no teto do hall dos elevadores (o nome
      // do pavimento fica sobre as portas, no núcleo).
      const ex = -(core.x1 + 0.9);
      const ez = core.z1 + 1.0;
      const drop = STOREY - 0.35 - 2.87;
      b.add(kit.mat('#16A34A', { glow: true }), new THREE.BoxGeometry(0.7, 0.24, 0.05), [ex, y + 2.75, ez]);
      b.add(kit.mat('#F8FAFC', { glow: true }), new THREE.BoxGeometry(0.16, 0.12, 0.01), [ex - 0.15, y + 2.75, ez + 0.03]);
      if (drop > 0.05) b.add(dark, new THREE.BoxGeometry(0.02, drop, 0.02), [ex, y + 2.87 + drop / 2, ez]);
    }
    // Onde não se pisa neste andar (levelRules: a mesma regra que os testes conferem).
    const blocked = rules[L]?.blocked ?? (() => true);
    levels.push({
      y,
      outer: apo,
      walk: Math.max(boundOf([...vols, ...terr]), back0 + 3) + 1,
      inner,
      ceiling,
      obstacles,
      doors: doorPts.map((p) => Math.atan2(p.x, p.z)),
      doorHalf: 0.8 / apo,
      blocked,
      wallAt: (x, z) => Math.hypot(x, z) + (inside(x, z, 0.35) ? 1 : -1),
      arrive: { x: 0, z: core.z1 + 1.6 },
    });
  });

  // Terraço na cobertura do último andar: mais um nível, a céu aberto (sem teto), com deque,
  // guarda-corpo em toda a borda e em volta do vão/claraboia do meio, o núcleo dos elevadores
  // subindo acima do deque (as portas abrem para o pórtico do terraço), bancos virados para a
  // vista, floreiras, árvores em vasos e mesas. Nenhuma sala.
  if (roofT) {
    const LT = plan.length;
    const L = LT + 1;
    const y = H + LT * STOREY;
    const vols = volsAt(id, LT);
    // Vão do meio na cobertura: claraboia do átrio ou jardim interno a céu aberto.
    const hole = fp === 'atrium' ? inner * 0.8 : fp === 'garden' ? inner : 0;
    // Até onde não se pisa no meio: vão (com o guarda-corpo) ou casa da escada do núcleo.
    const free = fp === 'core' ? inner + 0.3 : hole ? hole + 0.6 : 0;
    const edges = wallRuns(vols, 1);
    const deck = kit.mat(style.warm ? '#B08968' : '#9C8F80', { rough: 0.8 });
    const shT = stairHole(st, L);
    for (const v of vols) {
      const dh: Pt[][] = hole && holds(v) ? [circle(hole + 0.05)] : [];
      if (shT && (st?.vols ?? []).includes(v)) dh.push(shT);
      carved(deck, volPoly(v), dh, y + 0.03, 0.03);
    }
    // Guarda-corpo em toda a borda (o elevador chega por dentro, no núcleo).
    for (const r of edges) railing(b, glass, metal, [[r.ax, r.az], [r.bx, r.bz]], y, false);
    if (hole) railing(b, glass, metal, circle(hole + (fp === 'atrium' ? 0.35 : 0.1), 48), y, true);
    if (fp === 'core') {
      // A escada do núcleo chega ao terraço numa casa de pedra com porta na frente (sem escada no
      // núcleo, como no Calendar, a casa é fechada: casa de máquinas).
      const stone = kit.mat('#D8D2C6', { rough: 0.9 });
      const h = 2.8;
      const gp = coreStair ? 0.7 : 0;
      if (gp) {
        b.add(stone, new THREE.CylinderGeometry(inner, inner, h, 40, 1, true, gp / 2, Math.PI * 2 - gp), [0, y + h / 2, 0]);
        b.add(kit.mat('#D2CBBE', { rough: 0.9, side: THREE.BackSide }), new THREE.CylinderGeometry(inner - 0.3, inner - 0.3, h, 40, 1, true, gp / 2, Math.PI * 2 - gp), [0, y + h / 2, 0]);
        b.add(stone, new THREE.CylinderGeometry(inner, inner, h - 2.4, 8, 1, true, -gp / 2, gp), [0, y + 2.4 + (h - 2.4) / 2, 0]);
      } else b.add(stone, new THREE.CylinderGeometry(inner, inner, h, 40), [0, y + h / 2, 0]);
      b.add(stone, new THREE.CylinderGeometry(inner + 0.25, inner + 0.25, 0.3, 40), [0, y + h + 0.15, 0]);
    }
    // Floreiras, bancos e mesas fora da escada, do caminho até ela e da rota a pé do elevador à escada.
    const route = routeOn(rules[L], ways(L));
    let spots = deckSpots(vols, edges, free + 0.6, Math.PI).filter((s) => !inWell(st, s.x, s.z, 1.6) && !inLiftCore(core, s.x, s.z, 1.2) && !inLiftHall(core, s.x, s.z, 0.8) && offWay(L, s.x, s.z, 1.8) && route.every(([px, pz]) => Math.hypot(s.x - px, s.z - pz) >= 1.6));
    // Calendar: o relógio de sol do Mirante do Tempo, na frente do terraço (o mesmo de fora).
    const dial = id === 'calendar' ? sundialSpot(vols) : null;
    if (dial) {
      spots = spots.filter((s) => Math.hypot(s.x - dial.x, s.z - dial.z) > 3);
      sundial(kit, b, dial.x, y, dial.z);
    }
    drawDeck(kit, b, spots, y, style.warm, seats, null);
    // Academy: as mesas redondas do terraço viram mesas de estudo ao ar livre (livros, caderno aberto
    // e luminária em cima do tampo; os bancos e a colisão continuam os de drawDeck).
    if (id === 'academy') studyTables(kit, b, spots.filter((s) => s.kind === 'table'), y);
    // Marquise em balanço sobre as portas dos elevadores (o núcleo sobe acima do deque), com o nome
    // do terraço pendurado na frente dela. Sem pilares: os do pórtico de antes, a 1,4 m do núcleo,
    // caíam junto da chegada da escada (no Languages, na frente da chegada ao terraço).
    const gw = 1.7;
    const gz = core.z1 + 1.4;
    b.add(dark, new THREE.BoxGeometry(2 * gw + 0.12, 0.08, gz - core.z1), [0, y + 3.35, (core.z1 + 0.1 + gz + 0.1) / 2]);
    b.add(metal, new THREE.BoxGeometry(2 * gw + 0.16, 0.12, 0.05), [0, y + 3.33, gz + 0.1]);
    for (const s of [-1, 1]) b.add(metal, new THREE.BoxGeometry(0.03, 0.4, 0.03), [s * 1.0, y + 3.11, gz]);
    const gate = sectorSign(kit, label('terrace'), accent, 2.6);
    gate.position.set(0, y + 2.75, gz);
    scene.scene.add(gate);
    levels.push({
      y,
      outer: Math.max(4, inscribed(vols)),
      walk: Math.max(boundOf(vols), back0 + 3) + 1,
      inner: free,
      // Céu aberto: nada em cima. Um teto alto (e não infinito) mantém a folga de colisão de
      // dentro dos prédios, igual à dos outros andares na ponte do elevador.
      ceiling: y + 60,
      obstacles: [],
      doors: [],
      doorHalf: 0,
      // Não se passa do guarda-corpo da borda nem entra no vão, no núcleo do meio (só pela porta do
      // caracol) ou no dos elevadores.
      blocked: rules[L]?.blocked ?? (() => true),
      // Sem fachada em volta: a câmera da 3ª pessoa fica livre.
      wallAt: () => Infinity,
      arrive: { x: 0, z: core.z1 + 1.6 },
    });
  }
  /** Nome de cada nível (o terraço tem nome próprio). */
  const levelName = (n: number) => (roofT && n === plan.length + 1 ? label('terrace') : floorName(n));

  // Térreo: camada de detalhe em volta do salão (sem cobrir o que o prédio já tem).
  // O que já ocupa o térreo (móveis, balcões, estantes) e o alto do salão, pelo desenho: os detalhes novos desviam.
  const occupied = [...scene.obstacles, ...footprint(scene.scene, () => 0, 0.05, 2.6, 0.5)];
  const overhead = footprint(scene.scene, () => 0, H - 2.4, H - 0.2, 0.5);
  // Diagnóstico (comando de teste 'stairs:check'): peças do térreo que caem no vão da escada, no
  // núcleo dos elevadores ou no hall na frente das portas (devia ser 0). As paredes do próprio
  // prédio (a fachada, a menos de 0,5 m do contorno) encostam no vão e no núcleo de propósito, e o
  // núcleo ainda não existe aqui (é desenhado depois): não contam.
  {
    const runs0 = wallRuns(g0, 1);
    const clash = occupied.filter((o) => !groundBlocked(o.x, o.z) && nearestRun(runs0, o.x, o.z).d >= 0.5 && (inWell(st, o.x, o.z, Math.min(o.r, 0.6)) || inLiftCore(core, o.x, o.z, Math.min(o.r, 0.4)) || inLiftHall(core, o.x, o.z, Math.min(o.r, 0.4))));
    scene.scene.userData.stairClash = clash.length;
    // Onde cada peça está (x, z, raio, altura), para achar a culpada.
    scene.scene.userData.stairClashAt = clash.map((o) => [+o.x.toFixed(1), +o.z.toFixed(1), +o.r.toFixed(2), +(o.h ?? 0).toFixed(1)]);
  }
  // A escada do térreo ocupa o seu contorno: o lounge e os detalhes desviam dela.
  if (st) for (const [x, z] of wellDots(st)) occupied.push({ x, z, r: 0.8, h: 3 });
  // E o caminho até ela (o pé e a frente do patamar) fica livre.
  for (const [x, z] of ways(0)) occupied.push({ x, z, r: 1.0, h: 3 });
  // O núcleo dos elevadores e o hall na frente das portas ficam livres: o lounge e os detalhes desviam.
  for (let z = core.z0 + 0.4; z < core.hall + 0.01; z += 0.8) for (const x of [-1.2, 0, 1.2]) occupied.push({ x, z, r: 0.9, h: 3 });
  // O quadro dos níveis fica do lado oposto ao da escada.
  const sS = st && st.well.reduce((s, p) => s + p[0], 0) < 0 ? -1 : 1;
  // Lounge dos elevadores na frente do hall: tapete, poltronas, plantas ao lado do núcleo, quadro
  // com os andares e uma faixa de luz no piso levando até as portas (antes dos outros detalhes,
  // para eles desviarem do lounge). As portas, a botoeira e "Elevadores" ficam no próprio núcleo.
  {
    const lz = core.hall + 1.0;
    const free = (x: number, z: number, r: number) => insideAt(g0, x, z, r) && !occupied.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r);
    const rug = kit.mat(style.warm ? '#B9A27E' : '#8EA0B5', { rough: 1 });
    // Tapete no hall, na frente das portas.
    b.add(rug, new THREE.BoxGeometry(3.4, 0.015, HALL_RUG), [0, 0.012, core.z1 + 0.15 + HALL_RUG / 2]);
    b.add(kit.mat(accent, { rough: 0.9 }), new THREE.BoxGeometry(3.6, 0.012, HALL_RUG + 0.2), [0, 0.008, core.z1 + 0.15 + HALL_RUG / 2]);
    // Faixa de luz no piso, do meio do salão até o hall.
    for (let k = 0; k < 8; k++) {
      const z = core.hall + 0.6 + k * 1.1;
      if (free(0, z, 0.2)) b.add(kit.mat(accent, { glow: true }), new THREE.BoxGeometry(0.12, 0.01, 0.6), [0, 0.02, z]);
    }
    const fabric = kit.mat(style.warm ? '#9C6B4E' : '#5B6B80', { rough: 0.95 });
    const legs = kit.mat('#2B3442', { rough: 0.5, metal: 0.3 });
    for (const sx of [-1, 1]) {
      // A poltrona procura um lugar livre perto do hall (cada térreo é diferente).
      const spot = ([[3.4, 0], [3.0, 1.0], [4.2, -0.8], [2.8, 1.9], [3.6, 2.6], [4.6, 1.2]] as const).map(([dx, dz]) => [sx * dx, lz + dz] as const).find(([px, pz]) => free(px, pz, 0.9));
      if (!spot) continue;
      const [x, az0] = spot;
      // Poltrona virada para o centro do lounge.
      b.add(fabric, new THREE.BoxGeometry(0.85, 0.4, 0.85), [x, 0.42, az0]);
      b.add(fabric, new THREE.BoxGeometry(0.2, 0.55, 0.85), [x + sx * 0.33, 0.85, az0]);
      for (const az of [-1, 1]) b.add(fabric, new THREE.BoxGeometry(0.85, 0.25, 0.15), [x, 0.72, az0 + az * 0.38]);
      for (const [ax, az] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const) b.add(legs, new THREE.CylinderGeometry(0.025, 0.02, 0.22, 6), [x + ax, 0.11, az0 + az]);
      seats.push({ x, y: 0.62, z: az0, face: sx > 0 ? -Math.PI / 2 : Math.PI / 2 });
      occupied.push({ x, z: az0, r: 0.7, h: 1 });
    }
    // Mesinha de centro com revistas.
    const tx = -sS * 2.6;
    if (free(tx, lz + 0.6, 0.5)) {
      b.add(kit.mat('#C9A27A', { rough: 0.6 }), new THREE.CylinderGeometry(0.45, 0.45, 0.04, 24), [tx, 0.45, lz + 0.6]);
      b.add(legs, new THREE.CylinderGeometry(0.04, 0.06, 0.43, 8), [tx, 0.22, lz + 0.6]);
      for (let k = 0; k < 3; k++) b.add(kit.mat(['#E07A5F', '#5B8DB8', '#F2CC8F'][k]!, { rough: 0.8 }), new THREE.BoxGeometry(0.22, 0.012, 0.3), [tx - 0.05 + k * 0.05, 0.48 + k * 0.012, lz + 0.6], [0, k * 0.4, 0]);
      occupied.push({ x: tx, z: lz + 0.6, r: 0.6, h: 0.5 });
    }
    // Plantas dos dois lados do núcleo, junto à frente dele.
    for (const sx of [-1, 1]) {
      const spot = [core.x1 + 0.75, core.x1 + 1.4].map((dx) => sx * dx).find((px) => free(px, core.z1 + 0.4, 0.5));
      if (spot === undefined) continue;
      const x = spot;
      const z = core.z1 + 0.4;
      b.add(kit.mat('#D9CBB6', { rough: 0.8 }), new THREE.CylinderGeometry(0.32, 0.25, 0.6, 16), [x, 0.3, z]);
      b.add(kit.mat('#3E7F44', { rough: 0.9 }), new THREE.IcosahedronGeometry(0.5, 1), [x, 1.05, z], undefined, [1, 1.5, 1]);
      occupied.push({ x, z, r: 0.5, h: 1.5 });
    }
    // Quadro com os níveis (do térreo ao último, terraço incluído) ao lado do núcleo, virado para o
    // salão, do lado oposto ao da escada (ou do outro, se ali não couber).
    const bz = core.z1 + 0.35;
    const boardX = [-sS, sS].map((s) => s * (core.x1 + 1.3)).find((x) => free(x, bz, 0.6));
    if (boardX !== undefined) {
      const nLv = levels.length;
      b.add(legs, new THREE.BoxGeometry(1.5, 0.5 + (nLv - 1) * 0.42, 0.06), [boardX, 1.7, bz]);
      for (const sx of [-0.7, 0.7]) b.add(legs, new THREE.BoxGeometry(0.06, 1.7, 0.06), [boardX + sx, 0.85, bz]);
      levels.forEach((_, n) => {
        const s = sectorSign(kit, levelName(n), n === 0 ? accent : '#94A3B8', 1.3);
        s.position.set(boardX, 1.7 + ((nLv - 1) / 2 - n) * 0.42, bz + 0.05);
        scene.scene.add(s);
      });
      occupied.push({ x: boardX, z: bz, r: 0.9, h: 3 });
    }
  }
  const hOf0 = (i: number) => groundHeight(id, g0[i]!);
  const ceilAt = (x: number, z: number) => g0.reduce((m, v, i) => (inVol(v, x, z) ? Math.max(m, hOf0(i)) : m), 0);
  enrichGround(kit, b, seats, occupied, overhead, { vols: g0, runs: wallRuns(g0, 1, hOf0), front: span0.front, back: back0, ceilAt, ways: stairWays(id, 0), route: stairRoute(id, 0) }, accent, style.warm, thingRoot, things);
  // O núcleo dos elevadores (do térreo ao alto, dentro do prédio): uma ou duas cabines lado a lado,
  // com as portas, a botoeira e o indicador de cada pavimento abrindo para o hall. Com terraço, o
  // núcleo passa da cobertura (a cabine para no terraço).
  const topY = H + plan.length * STOREY + (roofT ? 3.4 : 1.0);
  const lifts = buildLifts(kit, scene.scene, b, {
    xs: core.xs,
    w: core.w,
    d: core.d,
    t: core.t,
    cw: core.cw,
    tz: core.tz,
    ys: levels.map((lv) => lv.y),
    topY,
    accent,
    names: levels.map((_, n) => levelName(n)),
    title: elevators,
    words: liftWords,
    sign: (text, color, w) => sectorSign(kit, text, color, w),
  });
  // Escada principal: degraus, patamares e guarda-corpos; em cada nível, o pé (subir) e a chegada
  // (descer), com a placa "Escadas" e o nome do nível; e o caminho de cada subida e descida.
  const climbs: Climb[] = [];
  if (st) {
    // A escada fica fora da colisão pelo desenho: onde se pisa nela (lances, patamares) e o
    // guarda-corpo vêm de stairs.ts (stairWalk), para andar nela.
    const sb = new Builder();
    drawStair(kit, sb, st, style.warm);
    const stairMesh = sb.build();
    stairMesh.traverse((o) => (o.userData.noCollide = true));
    scene.scene.add(stairMesh);
    for (let n = 0; n < st.ys.length; n++) {
      const s = stairSpots(st, n);
      if (s.up) climbs.push({ from: n, to: n + 1, x: s.up[0], z: s.up[1], path: new Float32Array(stairPath(st, n, true)) });
      if (s.down) climbs.push({ from: n, to: n - 1, x: s.down[0], z: s.down[1], path: new Float32Array(stairPath(st, n, false)) });
      stairSign(kit, scene.scene, st, n, levelName(n), accent);
    }
  } else if (coreStair) {
    // Escada em caracol do núcleo: sobe pela esquerda da porta e chega pela direita.
    const sp = coreSpots(inner);
    const dark2 = kit.mat('#2B3442', { rough: 0.5 });
    for (let n = coreFrom(id); n + 1 < levels.length; n++) {
      const up = corePath(inner, levels[n]!.y, levels[n + 1]!.y);
      const down: number[] = [];
      for (let i = up.length - 3; i >= 0; i -= 3) down.push(up[i]!, up[i + 1]!, up[i + 2]!);
      climbs.push({ from: n, to: n + 1, x: sp.up[0], z: sp.up[1], path: new Float32Array(up) }, { from: n + 1, to: n, x: sp.down[0], z: sp.down[1], path: new Float32Array(down) });
    }
    // Placa "Escadas" e o nome do nível sobre a porta do núcleo (o térreo do Insights tem a sua).
    levels.forEach((lv, n) => {
      if (n < 1) return;
      const s = sectorSign(kit, zoneLabel('stairs'), accent, 1.6);
      s.position.set(0, lv.y + 2.62, inner + 0.1);
      scene.scene.add(s);
      if (n > plan.length) return;
      const f = sectorSign(kit, levelName(n), '#94A3B8', 1.2);
      f.position.set(0, lv.y + 3.06, inner + 0.1);
      scene.scene.add(f);
      b.add(dark2, new THREE.BoxGeometry(1.7, 0.05, 0.05), [0, lv.y + 2.4, inner + 0.08]);
    });
  }
  for (const c of climbs) {
    // O térreo do Insights já tem a porta da escada do núcleo (o próprio interior a anota).
    if (coreStair && c.from === 0) continue;
    const dx = (c.path[3] ?? c.x) - c.x;
    const dz = (c.path[5] ?? c.z) - c.z;
    things.push({ kind: 'stairs', level: c.from, x: c.x, z: c.z, face: Math.atan2(dx, dz) });
  }
  scene.scene.add(b.build());
  // Onde se pisa na escada principal ou no caracol do núcleo (andar nela de verdade, engine.ts).
  const walk: StairWalk | null = st ? stairWalk(st) : coreStair ? coreWalk(inner, levels.slice(coreFrom(id)).map((lv) => lv.y)) : null;
  // Colisão de cada andar pelo desenho (móveis, floreiras, paredes das salas); dentro da escada quem
  // decide é ela (os degraus do caracol não são parede).
  levels.forEach((lv, n) => n > 0 && lv.obstacles.push(...footprint(scene.scene, () => lv.y, 0.3, 1.45, 0.5).filter((o) => !walk?.zone(o.x, o.z, lv.y))));
  // Dados reais nos quadros: o ParkPage manda, junto com os dados do térreo, `floors` (boards.ts);
  // cada quadro só redesenha quando o texto muda. As salas em série ("class1", "class2"…) recebem um
  // item cada, na ordem em que existem no prédio (sala que não coube fica de fora da contagem).
  const seriesKeys = new Map<string, string[]>();
  for (const z of zones) {
    const s = seriesOf(z.key);
    if (s) seriesKeys.set(s.name, [...(seriesKeys.get(s.name) ?? []), z.key]);
  }
  for (const keys of seriesKeys.values()) keys.sort((a, b) => (seriesOf(a)?.n ?? 0) - (seriesOf(b)?.n ?? 0));
  const groundSet = scene.setData;
  scene.setData = (d) => {
    const { floors: fb, ...ground } = (d ?? {}) as { floors?: FloorBoards };
    // Os dados do térreo vão para o térreo só quando já chegaram (os dos andares podem chegar antes).
    if (Object.keys(ground).length) groundSet(d);
    if (!fb) return;
    for (const [key, bd] of Object.entries(fb.rooms)) boardAt.get(key)?.draw(bd);
    for (const [name, s] of Object.entries(fb.series)) {
      const keys = seriesKeys.get(name) ?? [];
      distribute(s, keys.length).forEach((bd, i) => boardAt.get(keys[i]!)?.draw(bd));
    }
  };
  const first = lifts[0]!;
  scene.floors = { levels, ys: levels.map((lv) => lv.y), zones, elevator: tower, seats, cabin: first.cabin, doors: first.doors, things, plan: fp, lifts, climbs, walk };
  return scene;
}

/**
 * Por onde se chega à escada no nível `L`: o pé, a chegada e a frente das bordas do patamar
 * (stairApproach); no caracol do núcleo, os dois lados da porta. Salas, móveis e placas ficam longe.
 */
export function stairWays(id: ModuleId, L: number): Pt[] {
  const st = stairOf(id);
  if (st) return stairApproach(st, L);
  if (CIRCULATION[id].stair !== 'core' || L < coreFrom(id)) return [];
  const cs = coreSpots(voidRadius(id));
  return [cs.up, cs.down];
}

/** Grade da rota a pé até a escada (m) e a folga do corpo para cada lado. */
const ROUTE_CELL = 0.25;
const BODY = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]] as const;
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Rota a pé, só pela planta do nível (`rule`: fachada, núcleo, vão e guarda-corpo da escada, vazio
 * do meio), da chegada do elevador até cada ponto de `to` (o caminho até a escada): a mais curta
 * numa grade de 0,25 m em que o corpo cabe (0,3 m para cada lado). Pontos a cada 0,5 m (sem
 * repetir). O saguão, os bancos do vazio e o deque do terraço desviam dela.
 */
export function routeOn(rule: LevelRule | undefined, to: readonly Pt[]): Pt[] {
  if (!rule || !to.length) return [];
  // Passagens estreitas (entre escada e núcleo): se o corpo de 0,3 m não passa, tenta com 0,15 m.
  const wide = routeWith(rule, to, 1);
  return wide.length ? wide : routeWith(rule, to, 0.5);
}

function routeWith(rule: LevelRule, to: readonly Pt[], body: number): Pt[] {
  const lv: LevelRule = rule;
  const G = ROUTE_CELL;
  const pass = (x: number, z: number) => Math.hypot(x, z) <= lv.walk && BODY.every(([dx, dz]) => !lv.blocked(x + dx * body, z + dz * body));
  const key = (i: number, j: number) => `${i},${j}`;
  const i0 = Math.round(lv.arrive.x / G);
  const j0 = Math.round(lv.arrive.z / G);
  const prev = new Map<string, string>([[key(i0, j0), '']]);
  const bad = new Set<string>();
  // Cada alvo vale a até duas células dele (o ponto pode cair junto do guarda-corpo).
  const goals = to.map(([x, z]) => ({ i: Math.round(x / G), j: Math.round(z / G), at: '' }));
  let left = goals.length;
  const q: Array<[number, number]> = [[i0, j0]];
  for (let h = 0; h < q.length && left > 0; h++) {
    const [i, j] = q[h]!;
    for (const g of goals)
      if (!g.at && Math.abs(i - g.i) <= 2 && Math.abs(j - g.j) <= 2) {
        g.at = key(i, j);
        left--;
      }
    for (const [di, dj] of STEPS) {
      const a = i + di;
      const c = j + dj;
      const k = key(a, c);
      if (prev.has(k) || bad.has(k)) continue;
      if (!pass(a * G, c * G)) {
        bad.add(k);
        continue;
      }
      prev.set(k, key(i, j));
      q.push([a, c]);
    }
  }
  const out: Pt[] = [];
  const seen = new Set<string>();
  for (const g of goals)
    for (let k = g.at; k; k = prev.get(k) ?? '') {
      const [i = 0, j = 0] = k.split(',').map(Number);
      const s = `${Math.round(i / 2)},${Math.round(j / 2)}`;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push([i * G, j * G]);
    }
  return out;
}

/** A rota a pé da chegada do elevador até a escada no nível `L` (veja routeOn). */
export function stairRoute(id: ModuleId, L: number): Pt[] {
  return routeOn(levelRules(id)?.[L], stairWays(id, L));
}

/**
 * Salas do nível `L` (L ≥ 1) do prédio, como withFloors as desenha (sem three.js: testável): a
 * planta distribui (layout) e cada sala fica fora do núcleo dos elevadores e do hall (liftKeep), a
 * mais de 0,6 m do vão da escada e a mais de 0,9 m de cada ponto do caminho até ela; encolhe até
 * caber e, se nem assim, fica de fora. E nenhuma sala fecha o corredor até a escada (stairCheck:
 * da chegada do elevador, a pé, ao pé, à chegada e a uma borda aberta do patamar): a que fecha
 * procura outra vaga (mais rasa, deslizando na faixa dela, do outro lado, menor) e só fica de fora
 * se nenhuma serve. Guardado por prédio e nível (a conferência custa).
 */
export function roomSlots(id: ModuleId, L: number): Slot[] {
  const ck = `${id}:${L}`;
  const hit = slotCache.get(ck);
  if (hit) return hit.slice();
  const out = placeRooms(id, L);
  slotCache.set(ck, out);
  return out.slice();
}

/** Salas já distribuídas (prédio:nível). */
const slotCache = new Map<string, Slot[]>();

function placeRooms(id: ModuleId, L: number): Slot[] {
  const rooms = FLOOR_PLANS[id]?.[L - 1];
  const core = liftCore(id);
  if (!rooms?.length || !core) return [];
  const fp = upperPlan(FORMS[id]);
  const st = stairOf(id);
  const vols = volsAt(id, L);
  const sp = spanZ(vols, 0);
  const zv = fp === 'side' ? sideCut(id, L) : Infinity;
  const free = (x: number, z: number, m: number) => insideAt(vols, x, z, m) && !inWell(st, x, z, m) && !inLiftCore(core, x, z, Math.min(m, 0.1));
  const keep = liftKeep(core);
  return layout(fp, rooms.length, free, voidRadius(id), zv, sp.front, sp.back, ringGap(st), stairBox(st), stairWays(id, L), (cx, cz, face, w, d) => roomClear(keep, st, cx, cz, face, w, d), keep.x1, stairCheck(id, L) ?? undefined);
}

/* ---------- Salas x escada: o corredor da chegada do elevador até ela fica aberto ---------- */

/** Células da colisão pelo desenho nos andares (footprint, engine: 0,5 m). */
const WALL_CELL = 0.5;
/** Uma peça marca a célula cujo centro fica a até meia diagonal dela (footprint). */
const WALL_REACH = WALL_CELL * 0.71;
/** Quem anda (o centro do corpo) não chega a menos disto do centro de uma célula: o raio dela (0,62 da célula) e a folga do corpo (0,3 m, com teto). */
const WALL_STOP = WALL_CELL * 0.62 + 0.3;
/** Quantas vagas alternativas (que cabem) se conferem para uma sala que fecha o caminho até a escada. */
const ALT_TRIES = 80;

const cellKey = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

/** Marca as células que um trecho de parede fina (de a até b) toca, vista de cima. */
function markSeg(cells: Set<number>, ax: number, az: number, bx: number, bz: number): void {
  const C = WALL_CELL;
  for (let i = Math.floor((Math.min(ax, bx) - WALL_REACH) / C); i <= Math.floor((Math.max(ax, bx) + WALL_REACH) / C); i++)
    for (let j = Math.floor((Math.min(az, bz) - WALL_REACH) / C); j <= Math.floor((Math.max(az, bz) + WALL_REACH) / C); j++)
      if (segDist((i + 0.5) * C, (j + 0.5) * C, ax, az, bx, bz) <= WALL_REACH) cells.add(cellKey(i, j));
}

/** Marca as células que uma peça retangular toca (centro, giro `face` como o das salas, meia largura e meio fundo). */
function markBox(cells: Set<number>, cx: number, cz: number, face: number, hw: number, hd: number): void {
  const C = WALL_CELL;
  const c = Math.cos(face);
  const s = Math.sin(face);
  const R = Math.hypot(hw, hd) + WALL_REACH;
  for (let i = Math.floor((cx - R) / C); i <= Math.floor((cx + R) / C); i++)
    for (let j = Math.floor((cz - R) / C); j <= Math.floor((cz + R) / C); j++) {
      const x = (i + 0.5) * C;
      const z = (j + 0.5) * C;
      const lx = (x - cx) * c - (z - cz) * s;
      const lz = (x - cx) * s + (z - cz) * c;
      if (Math.hypot(Math.max(0, Math.abs(lx) - hw), Math.max(0, Math.abs(lz) - hd)) <= WALL_REACH) cells.add(cellKey(i, j));
    }
}

/**
 * Marca as paredes da sala como withFloors as desenha (na faixa do corpo): fundo, laterais, as duas
 * partes da frente ao lado da porta de 1,8 m e os batentes; na ilha da planta livre, as estantes.
 */
function markRoom(cells: Set<number>, sl: Slot): void {
  const { w, d } = sl;
  const side = (w - 1.8) / 2;
  // Peças: centro (x, z locais), meia largura e meio fundo.
  const parts: ReadonlyArray<readonly [number, number, number, number]> =
    sl.kind === 'box'
      ? [[0, -d / 2, w / 2, 0.075], [-w / 2, 0, 0.075, d / 2], [w / 2, 0, 0.075, d / 2], [-(0.9 + side / 2), d / 2, side / 2, 0.06], [0.9 + side / 2, d / 2, side / 2, 0.06], [-0.9, d / 2, 0.04, 0.09], [0.9, d / 2, 0.04, 0.09]]
      : [[-(w / 2 - 0.2), -0.1, 0.2, d * 0.4], [w / 2 - 0.2, -0.1, 0.2, d * 0.4]];
  const c = Math.cos(sl.face);
  const s = Math.sin(sl.face);
  for (const [px, pz, hw, hd] of parts) markBox(cells, sl.x + px * c + pz * s, sl.z - px * s + pz * c, sl.face, hw, hd);
}

/**
 * Células do que fica de pé no andar `L` antes das salas: a fachada (fora das portas do terraço) e
 * o guarda-corpo do vazio do meio (átrio; jardim acima do 1º andar). O núcleo, a escada e o vazio
 * em si já estão na regra do nível (levelRules).
 */
function levelCells(id: ModuleId, L: number): Set<number> {
  const cells = new Set<number>();
  const runs = wallRuns(volsAt(id, L), 1);
  const doors = terraceDoors(runs, hasRoofTerrace(id) ? roofsAt(id, L) : []);
  for (const r of runs) {
    const n = Math.max(1, Math.ceil(r.len / 0.5));
    for (let k = 0; k < n; k++) {
      const ax = r.ax + ((r.bx - r.ax) * k) / n;
      const az = r.az + ((r.bz - r.az) * k) / n;
      const bx = r.ax + ((r.bx - r.ax) * (k + 1)) / n;
      const bz = r.az + ((r.bz - r.az) * (k + 1)) / n;
      if (doors.some((p) => Math.hypot(p.x - (ax + bx) / 2, p.z - (az + bz) / 2) < 0.9)) continue;
      markSeg(cells, ax, az, bx, bz);
    }
  }
  const fp = upperPlan(FORMS[id]);
  const inner = voidRadius(id);
  if (inner > 0 && (fp === 'atrium' || (fp === 'garden' && L > 1))) {
    const ring = circle(inner, 48);
    ring.forEach(([ax, az], k) => {
      const [bx, bz] = ring[(k + 1) % ring.length]!;
      markSeg(cells, ax, az, bx, bz);
    });
  }
  return cells;
}

/** Perto (a menos de WALL_STOP) do centro de uma célula marcada. */
function nearCell(cells: ReadonlySet<number>, x: number, z: number): boolean {
  const C = WALL_CELL;
  const i0 = Math.floor(x / C);
  const j0 = Math.floor(z / C);
  for (let i = i0 - 2; i <= i0 + 2; i++)
    for (let j = j0 - 2; j <= j0 + 2; j++) if (cells.has(cellKey(i, j)) && Math.hypot(x - (i + 0.5) * C, z - (j + 0.5) * C) < WALL_STOP) return true;
  return false;
}

/**
 * A pé (o centro do corpo, grade de 0,25 m, como reach.ts), da chegada do elevador: quais pontos de
 * `to` se alcançam (a até uma célula deles), pela regra do nível e longe das células marcadas.
 */
function planReach(rule: LevelRule, cells: ReadonlySet<number>, to: readonly Pt[]): boolean[] {
  const G = ROUTE_CELL;
  const got = to.map(() => false);
  const goals = to.map(([x, z]) => [Math.round(x / G), Math.round(z / G)] as const);
  const pass = (i: number, j: number) => {
    const x = i * G;
    const z = j * G;
    return Math.hypot(x, z) <= rule.walk && !rule.blocked(x, z) && !nearCell(cells, x, z);
  };
  const i0 = Math.round(rule.arrive.x / G);
  const j0 = Math.round(rule.arrive.z / G);
  if (!pass(i0, j0)) return got;
  const seen = new Set<number>([cellKey(i0, j0)]);
  const q: Array<[number, number]> = [[i0, j0]];
  let left = to.length;
  for (let h = 0; h < q.length && left > 0; h++) {
    const [i, j] = q[h]!;
    goals.forEach(([gi, gj], g) => {
      if (!got[g] && Math.abs(i - gi) <= 1 && Math.abs(j - gj) <= 1) {
        got[g] = true;
        left--;
      }
    });
    for (const [di, dj] of STEPS) {
      const a = i + di;
      const c = j + dj;
      const k = cellKey(a, c);
      if (seen.has(k)) continue;
      seen.add(k);
      if (pass(a, c)) q.push([a, c]);
    }
  }
  return got;
}

/** Alcance a pé até a escada num andar, sem e com salas (planStairReach). */
export interface PlanReach {
  way: Pt[];
  ends: number;
  base: boolean[];
  rooms: boolean[];
}

/**
 * Até onde se chega a pé no andar `L`, da chegada do elevador, aos pontos do caminho até a escada
 * (stairWays: os `ends` primeiros são o pé e a chegada; depois, a frente das bordas do patamar),
 * sem salas (`base`) e com as salas `slots` (`rooms`). Pela regra do nível (levelRules) e pelas
 * células de colisão do desenho (a fachada fora das portas do terraço, o guarda-corpo do vazio do
 * meio e as paredes das salas, com a porta aberta para o corredor). null: nível sem regra ou sem
 * caminho até a escada.
 */
export function planStairReach(id: ModuleId, L: number, slots: readonly Slot[]): PlanReach | null {
  const ctx = stairCtx(id, L);
  return ctx ? { way: ctx.way, ends: ctx.ends, base: ctx.base, rooms: ctx.reach(slots) } : null;
}

function stairCtx(id: ModuleId, L: number): { way: Pt[]; ends: number; base: boolean[]; reach: (slots: readonly Slot[]) => boolean[] } | null {
  const rule = levelRules(id)?.[L];
  const way = stairWays(id, L);
  if (!rule || !way.length) return null;
  const st = stairOf(id);
  const sp = st ? stairSpots(st, L) : null;
  const ends = sp ? (sp.up ? 1 : 0) + (sp.down ? 1 : 0) : way.length;
  const fixed = levelCells(id, L);
  const reach = (slots: readonly Slot[]) => {
    const cells = new Set(fixed);
    for (const sl of slots) markRoom(cells, sl);
    return planReach(rule, cells, way);
  };
  return { way, ends, base: planReach(rule, fixed, way), reach };
}

/**
 * A conferência que layout usa no andar `L`: as salas mantêm tudo o que se alcança sem elas — o pé
 * e a chegada da escada e, se alguma borda do patamar se alcança, pelo menos uma. null: nada a
 * conferir (sem escada, ou nada alcançável já sem salas).
 */
function stairCheck(id: ModuleId, L: number): ((slots: readonly Slot[]) => boolean) | null {
  const ctx = stairCtx(id, L);
  if (!ctx || !ctx.base.some(Boolean)) return null;
  const { ends, base, reach } = ctx;
  const edge = base.slice(ends).some(Boolean);
  return (slots) => {
    const got = reach(slots);
    for (let g = 0; g < ends; g++) if (base[g] && !got[g]) return false;
    return !edge || got.slice(ends).some(Boolean);
  };
}

/** Cantos da sala (piso crescido `grow` m para cada lado). */
function slotPoly(sl: Slot, grow: number): Pt[] {
  const c = Math.cos(sl.face);
  const s = Math.sin(sl.face);
  const hw = sl.w / 2 + grow;
  const hd = sl.d / 2 + grow;
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const).map(([lx, lz]): Pt => [sl.x + lx * c + lz * s, sl.z - lx * s + lz * c]);
}

/** Duas salas se sobrepõem (paredes incluídas). */
const slotsOverlap = (a: Slot, b: Slot) => convexOverlap(slotPoly(a, 0.1), slotPoly(b, 0.1));

/**
 * A sala (centro, giro, largura e fundo; paredes incluídas) não entra no retângulo `keep` (o núcleo
 * e o hall; teste exato de dois retângulos) nem chega a menos de 0,6 m do vão da escada (amostra de
 * 0,4 m da sala e os cantos do vão dentro dela).
 */
export function roomClear(keep: Box, st: Stair | null, cx: number, cz: number, face: number, w: number, d: number): boolean {
  const c = Math.cos(face);
  const s = Math.sin(face);
  const hw = w / 2 + 0.08;
  const hd = d / 2 + 0.08;
  const room = ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const).map(([lx, lz]): Pt => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
  if (convexOverlap(room, [[keep.x0, keep.z0], [keep.x1, keep.z0], [keep.x1, keep.z1], [keep.x0, keep.z1]])) return false;
  if (!st) return true;
  const inRoom = (x: number, z: number, m: number) => {
    const dx = x - cx;
    const dz = z - cz;
    return Math.abs(dx * c - dz * s) < hw + m && Math.abs(dx * s + dz * c) < hd + m;
  };
  if (st.well.some(([x, z]) => inRoom(x, z, 0.6))) return false;
  const nx = Math.max(2, Math.ceil((2 * hw) / 0.4));
  const nz = Math.max(2, Math.ceil((2 * hd) / 0.4));
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      const lx = -hw + (2 * hw * i) / nx;
      const lz = -hd + (2 * hd * j) / nz;
      if (inWell(st, cx + lx * c + lz * s, cz - lx * s + lz * c, 0.6)) return false;
    }
  return true;
}

/** Dois polígonos convexos se sobrepõem (eixos separadores; só encostar não conta). */
function convexOverlap(a: readonly Pt[], b: readonly Pt[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q[1] - p[1];
      const nz = p[0] - q[0];
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const [x, z] of a) {
        const t = x * nx + z * nz;
        a0 = Math.min(a0, t);
        a1 = Math.max(a1, t);
      }
      for (const [x, z] of b) {
        const t = x * nx + z * nz;
        b0 = Math.min(b0, t);
        b1 = Math.max(b1, t);
      }
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
    }
  return true;
}

/** Onde não se pisa num nível do prédio, e de onde se parte nele (a chegada do elevador). */
export interface LevelRule {
  y: number;
  /** Raio até onde se anda (o limite da câmera). */
  walk: number;
  arrive: { x: number; z: number };
  blocked: (x: number, z: number) => boolean;
}

/**
 * Onde não se pisa em cada nível do prédio (0 = térreo, os andares e o terraço), só pela planta:
 * a fachada (fora das portas do terraço das alas), o núcleo dos elevadores, a escada (o vão e o
 * guarda-corpo, menos a entrada pelo patamar), o vazio do meio (aberto na porta do caracol), o
 * pé-direito alto do mezanino e a borda do terraço. É a regra que withFloors usa nos andares e no
 * terraço; no térreo, a de cada interior (dentro da planta, a 0,45 m da fachada) com o núcleo e a
 * escada. Sem desenhar nada: testável (até onde se chega a pé, reach.ts). null: prédio sem andar.
 */
export function levelRules(id: ModuleId): LevelRule[] | null {
  const plan = FLOOR_PLANS[id];
  const core = liftCore(id);
  if (!plan?.length || !core) return null;
  const fp = upperPlan(FORMS[id]);
  const roofT = hasRoofTerrace(id);
  const M = MASSING[id];
  const H = M.ground;
  const g0 = volsAt(id, 0);
  const span0 = groundSpan(id);
  const st = stairOf(id);
  const coreStair = CIRCULATION[id].stair === 'core';
  const inner = fp === 'atrium' || fp === 'garden' ? Math.max(3.2, M.void) : fp === 'core' ? Math.max(2.6, M.void) : 0;
  const stairBlock = (L: number, x: number, z: number) => st !== null && (inPoly(st.well, x, z) || stairEdge(st, L, x, z));
  const arrive = { x: 0, z: core.z1 + 1.6 };
  const out: LevelRule[] = [{ y: 0, walk: span0.bound + 1, arrive, blocked: (x, z) => !insideAt(g0, x, z, 0.45) || inLiftCore(core, x, z, 0.3) || stairBlock(0, x, z) }];
  plan.forEach((_, i) => {
    const L = i + 1;
    const vols = volsAt(id, L);
    const runs = wallRuns(vols, 1);
    const zv = fp === 'side' ? sideCut(id, L) : Infinity;
    const terr = roofT ? roofsAt(id, L) : [];
    const doorPts = terraceDoors(runs, terr);
    const atDoor = (x: number, z: number) => doorPts.some((p) => Math.hypot(x - p.x, z - p.z) < 0.85);
    out.push({
      y: H + i * STOREY,
      walk: Math.max(boundOf([...vols, ...terr]), span0.back + 3) + 1,
      arrive,
      blocked: (x, z) => {
        if (atDoor(x, z)) return false;
        // Parede (fora das portas): não se passa.
        if (nearestRun(runs, x, z).d < 0.3) return true;
        // Núcleo dos elevadores (as portas abrem para o hall, na frente dele).
        if (inLiftCore(core, x, z, 0.3)) return true;
        // Vão da escada (com o guarda-corpo em volta): só se entra pelo patamar (e quem anda nela, reach.ts).
        if (stairBlock(L, x, z)) return true;
        if (insideAt(vols, x, z, 0.35)) {
          // Vazio do meio (átrio, jardim dos andares de cima) ou núcleo da escada (aberto na porta do
          // caracol); pé-direito alto do mezanino.
          if (inner && (fp !== 'garden' || L > 1) && Math.hypot(x, z) < inner + (fp === 'core' ? 0.3 : 0.5)) return !(coreStair && coreDoor(x, z));
          return z > zv - 0.4;
        }
        // Fora da planta: só no terraço das alas (até o guarda-corpo).
        return !(terr.length && insideAt(terr, x, z, 0.5));
      },
    });
  });
  if (roofT) {
    const LT = plan.length;
    const L = LT + 1;
    const vols = volsAt(id, LT);
    // Vão do meio na cobertura (claraboia do átrio, jardim) ou a casa da escada do núcleo, com o guarda-corpo.
    const hole = fp === 'atrium' ? inner * 0.8 : fp === 'garden' ? inner : 0;
    const free = fp === 'core' ? inner + 0.3 : hole ? hole + 0.6 : 0;
    out.push({
      y: H + LT * STOREY,
      walk: Math.max(boundOf(vols), span0.back + 3) + 1,
      arrive,
      blocked: (x, z) => !insideAt(vols, x, z, 0.45) || (Math.hypot(x, z) < free && !(coreStair && coreDoor(x, z))) || inLiftCore(core, x, z, 0.3) || stairBlock(L, x, z),
    });
  }
  return out;
}

/** Fundo do tapete do hall dos elevadores (térreo). */
const HALL_RUG = 1.8;

/** Guarda-corpo de vidro com corrimão ao longo de uma linha (fechada ou não). */
function railing(b: Builder, glass: THREE.Material, metal: THREE.Material, pts: Array<[number, number]>, y: number, closed: boolean) {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 0.01) continue;
    const ang = Math.atan2(q[0] - p[0], q[1] - p[1]);
    const mx = (p[0] + q[0]) / 2;
    const mz = (p[1] + q[1]) / 2;
    b.add(glass, new THREE.BoxGeometry(0.03, 1.0, len), [mx, y + 0.5, mz], [0, ang, 0]);
    b.add(metal, new THREE.BoxGeometry(0.06, 0.05, len), [mx, y + 1.05, mz], [0, ang, 0]);
  }
}

/**
 * Distribui as salas conforme a planta, dentro da planta do andar (`inside`): em anel em volta do
 * vazio do meio, voltadas para ele (os fundos ficam para o saguão); dos dois lados de um corredor
 * reto da frente aos fundos; ou atrás da galeria do mezanino. Cada sala encolhe até caber. No anel,
 * a abertura dos fundos (`gap`, ângulos) fica livre para o saguão e a escada; no mezanino, as salas
 * param antes da coluna da escada (`box`, com 1,6 m de passagem), deixando o caminho da galeria até
 * ela; no corredor, as salas do lado da escada começam depois dela (o pé fica livre). Toda sala
 * passa por `clear` (fora do núcleo e do hall, longe do vão: roomClear) e pelo caminho até a escada
 * (`keep`): encolhe até caber e, se nem no menor tamanho, fica de fora. No mezanino, a passagem do
 * meio vai até `mid` (a largura do núcleo e do hall); um lado sem largura para uma sala passa as
 * salas dele para o outro. Por fim, `ok` (stairCheck) confere, sala a sala com as já postas, que o
 * corredor da chegada do elevador até a escada continua aberto: a sala que o fecha vai para a
 * primeira vaga alternativa que cabe, não encosta nas outras e não o fecha (no anel, mais rasa no
 * mesmo lugar, abrindo passagem entre o fundo dela e a fachada, e depois deslizando no anel; no
 * corredor e no mezanino, deslizando na faixa, do outro lado e mais estreita) e, se nenhuma serve,
 * fica de fora.
 */
function layout(plan: Plan, n: number, inside: (x: number, z: number, m: number) => boolean, inner: number, zv: number, front: number, back: number, gap: [number, number], box: StairBox | null, keep: readonly Pt[] = [], clear: (cx: number, cz: number, face: number, w: number, d: number) => boolean = () => true, mid = 1.5, ok: (slots: readonly Slot[]) => boolean = () => true): Slot[] {
  const avoid = (x: number) => !!box && x > box.x0 - 1.6 && x < box.x1 + 1.6;
  // A caixa cabe na planta (cantos com folga das paredes).
  const fits = (cx: number, cz: number, face: number, w: number, d: number) => {
    const c = Math.cos(face);
    const s = Math.sin(face);
    if (!clearOf(cx, cz, face, w, d) || !clear(cx, cz, face, w, d)) return false;
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [-w / 2, 0], [w / 2, 0]].every(([lx, lz]) => inside(cx + lx! * c + lz! * s, cz - lx! * s + lz! * c, 0.35));
  };
  /** Nenhum ponto do caminho até a escada (`keep`) a menos de 0,9 m da sala. */
  function clearOf(cx: number, cz: number, face: number, w: number, d: number): boolean {
    const c = Math.cos(face);
    const s = Math.sin(face);
    return keep.every(([px, pz]) => {
      const dx = px - cx;
      const dz = pz - cz;
      return Math.abs(dx * c - dz * s) >= w / 2 + 0.9 || Math.abs(dx * s + dz * c) >= d / 2 + 0.9;
    });
  }
  /**
   * Cada sala na sua vaga (`want`) se fica livre do núcleo, do hall, do vão e do caminho até a
   * escada e não fecha o corredor até ela (`ok`, com as já postas); se esbarra num deles ou fecha o
   * corredor, a primeira vaga de `alts` que cabe (`fits` confere núcleo, hall, vão e caminho), não
   * encosta nas outras salas (as postas e as que vêm depois) e não fecha (no máximo ALT_TRIES
   * conferidas); se nenhuma, fica de fora. (Antes, a sala que esbarrava ficava de fora sem procurar
   * outra vaga: era assim que o 2º andar do Projects perdia a sala de acompanhamento.)
   */
  const settle = (want: readonly Slot[], alts: (sl: Slot) => Iterable<Slot>): Slot[] => {
    const out: Slot[] = [];
    want.forEach((sl, j) => {
      const free = clearOf(sl.x, sl.z, sl.face, sl.w, sl.d) && clear(sl.x, sl.z, sl.face, sl.w, sl.d);
      if (free && ok([...out, sl])) {
        out.push(sl);
        return;
      }
      const others = [...out, ...want.slice(j + 1)];
      let tries = 0;
      for (const c of alts(sl)) {
        if (tries >= ALT_TRIES) return;
        if (others.some((o) => slotsOverlap(o, c)) || !fits(c.x, c.z, c.face, c.w, c.d)) continue;
        tries++;
        if (ok([...out, c])) {
          out.push(c);
          return;
        }
      }
    });
    return out;
  };
  if (plan === 'atrium' || plan === 'garden' || plan === 'core') {
    // Anel de salas entre o corredor do meio e a fachada; os fundos ficam para o saguão.
    const ri = inner + (plan === 'core' ? 1.9 : 1.6);
    const lobby = gap[1] - gap[0];
    const span = (Math.PI * 2 - lobby) / n;
    const start = gap[1];
    /** Sala `k` do anel na direção `a`: do corredor do meio até a fachada (no máximo `dMax` de fundo), encolhendo até caber. */
    const ringAt = (k: number, a: number, dMax: number): Slot => {
      const s = Math.sin(a);
      const c = Math.cos(a);
      // Até a fachada nesta direção (no máximo 9 m de fundo).
      let ro = ri;
      while (ro < ri + 9 && inside(s * (ro + 0.1), c * (ro + 0.1), 0.35)) ro += 0.1;
      let d = Math.max(2.4, Math.min(dMax, ro - ri - 0.3));
      let w = Math.max(2.4, Math.min(9, ((ri + ro) / 2) * span * 0.85, 2 * (ri + 0.3) * Math.sin(Math.min(span, Math.PI) / 2) - 0.4));
      const at = (dd: number) => ri + 0.15 + dd / 2;
      while (!fits(s * at(d), c * at(d), a + Math.PI, w, d) && (w > 2.4 || d > 2.4)) {
        if (w > 2.4) w -= 0.25;
        if (d > 2.4) d -= 0.25;
      }
      return { k, x: s * at(d), z: c * at(d), face: a + Math.PI, w, d, kind: 'box' };
    };
    const want: Slot[] = [];
    for (let k = 0; k < n; k++) want.push(ringAt(k, start + (k + 0.5) * span, Infinity));
    // Vagas de uma sala do anel que fecha o corredor: mais rasa no mesmo lugar (abre passagem entre
    // o fundo dela e a fachada); depois deslizando no arco das salas (fora da abertura dos fundos),
    // do fundo inteiro ao menor.
    const ringAlts = function* (sl: Slot): Generator<Slot> {
      const a0 = sl.face - Math.PI;
      const half = Math.atan2(sl.w / 2, ri);
      const depths: number[] = [];
      for (let dd = sl.d - 0.5; dd > 2.4; dd -= 0.5) depths.push(dd);
      depths.push(2.4);
      for (const dm of depths) yield ringAt(sl.k, a0, dm);
      const angles: number[] = [];
      for (let j = 1; j * 0.15 <= Math.PI * 2 - lobby; j++)
        for (const sg of [-1, 1]) {
          const a = a0 + sg * j * 0.15;
          if (a - half >= start && a + half <= start + Math.PI * 2 - lobby) angles.push(a);
        }
      for (const dm of [Infinity, ...depths]) for (const a of angles) yield ringAt(sl.k, a, dm);
    };
    return settle(want, ringAlts);
  }
  if (plan === 'corridor' || plan === 'open') {
    // Corredor reto da frente aos fundos; salas (ou ilhas) dos dois lados, de frente para ele.
    const half = plan === 'corridor' ? 1.6 : 2.4;
    const { zb, zf } = corridorBand(front, back);
    const nL = Math.ceil(n / 2);
    /** Sala `k` de um lado do corredor, centrada em `z` com `w` de frente: tão funda quanto cabe (até 12 m). */
    const sideAt = (k: number, left: boolean, z: number, w: number): Slot => {
      const s = left ? -1 : 1;
      const face = left ? Math.PI / 2 : -Math.PI / 2;
      let d = 2.5;
      while (d < 12 && fits(s * (half + (d + 0.25) / 2), z, face, w, d + 0.25)) d += 0.25;
      return { k, x: s * (half + d / 2), z, face, w, d, kind: plan === 'corridor' ? 'box' : 'island' };
    };
    const want: Slot[] = [];
    for (let k = 0; k < n; k++) {
      const left = k < nL;
      const m = left ? nL : n - nL;
      const j = left ? k : k - nL;
      // Do lado da escada (quando ela entra na faixa das salas), as salas começam depois dela.
      const zs0 = box && (left ? box.x1 < 0 : box.x0 > 0) && box.z1 > zb - 0.5 ? Math.max(zb, box.z1 + 1.6) : zb;
      // E depois do caminho até ela (o pé, a chegada, a frente do patamar) que cai na faixa das salas deste lado.
      const zw = keep.filter(([px, pz]) => (left ? px < -half + 0.9 : px > half - 0.9) && pz > zb - 1.4 && pz < zf).reduce((mz, [, pz]) => Math.max(mz, pz + 1.4), zs0);
      const zs = Math.min(zf - 2.6, zw);
      const len = (zf - zs) / m;
      const z = zs + (j + 0.5) * len;
      // Poucas salas num lado: a sala não vira um corredor de 15 m (no máximo 8 m de frente).
      const w = Math.max(2.4, Math.min(8, len - (plan === 'open' ? 0.8 : 0.15)));
      want.push(sideAt(k, left, z, w));
    }
    // Vagas de uma sala que fecha o corredor: deslizando na faixa (passos de 0,5 m, da mais perto à
    // mais longe), do mesmo lado e depois do outro, na largura dela e depois na menor.
    const corridorAlts = function* (sl: Slot): Generator<Slot> {
      const left = sl.x < 0;
      for (const side of [left, !left])
        for (const w of sl.w > 2.4 ? [sl.w, 2.4] : [sl.w])
          for (let j = 0; j * 0.5 <= zf - zb; j++)
            for (const sg of j ? [-1, 1] : [1]) {
              const z = sl.z + sg * j * 0.5;
              if (side === left && w === sl.w && j === 0) continue;
              if (z - w / 2 < zb - 0.01 || z + w / 2 > zf + 0.01) continue;
              yield sideAt(sl.k, side, z, w);
            }
    };
    return settle(want, corridorAlts);
  }
  // Mezanino: salas lado a lado no fundo, de frente para a galeria sobre o pé-direito alto;
  // passagem no meio até o elevador, da largura do hall (as salas não encostam no núcleo).
  const zr1 = zv - 2.8;
  const x0 = Math.max(1.5, mid + 0.1);
  let xr = x0;
  while (xr < 60 && inside(xr + 0.25, zr1, 0.4) && !avoid(xr + 0.25)) xr += 0.25;
  let xl = x0;
  while (xl < 60 && inside(-(xl + 0.25), zr1, 0.4) && !avoid(-(xl + 0.25))) xl += 0.25;
  // Lado sem largura para uma sala (a escada ao lado do núcleo, no Projects): as salas vão para o outro.
  const okL = xl - x0 >= 2.55;
  const okR = xr - x0 >= 2.55;
  if (!okL && !okR) return [];
  const nL = okL ? (okR ? Math.ceil(n / 2) : n) : 0;
  /** Sala `k` do mezanino centrada em `cx` com `w` de frente: tão funda quanto cabe (até 30 m). */
  const backAt = (k: number, cx: number, w: number): Slot => {
    let d = 2.5;
    while (d < 30 && fits(cx, zr1 - (d + 0.25) / 2, 0, w, d + 0.25)) d += 0.25;
    return { k, x: cx, z: zr1 - d / 2, face: 0, w, d, kind: 'box' };
  };
  const want: Slot[] = [];
  for (let k = 0; k < n; k++) {
    const left = k < nL;
    const m = left ? nL : n - nL;
    const j = left ? k : k - nL;
    const wAll = (left ? xl : xr) - x0;
    // Sala sozinha num lado do mezanino: no máximo 7 m de frente, no meio da sua vaga.
    const w = Math.max(2.4, Math.min(7, wAll / m - 0.15));
    const cx = (left ? -1 : 1) * (x0 + (j + 0.5) * (wAll / m));
    want.push(backAt(k, cx, w));
  }
  // Vagas de uma sala que fecha o caminho: deslizando no fundo (passos de 0,5 m, da mais perto à mais
  // longe, passando para o outro lado da passagem do meio se ele tem largura), na largura dela e
  // depois na menor.
  const backAlts = function* (sl: Slot): Generator<Slot> {
    for (const w of sl.w > 2.4 ? [sl.w, 2.4] : [sl.w])
      for (let j = 0; j * 0.5 <= xl + xr; j++)
        for (const sg of j ? [-1, 1] : [1]) {
          const cx = sl.x + sg * j * 0.5;
          if (w === sl.w && j === 0) continue;
          const left = cx < 0;
          if (!(left ? okL : okR) || Math.abs(cx) - w / 2 < x0 - 0.01 || Math.abs(cx) + w / 2 > (left ? xl : xr) + 0.01) continue;
          yield backAt(sl.k, cx, w);
        }
  };
  return settle(want, backAlts);
}

/** Saguão do elevador de cada planta (sofá, mesa, planta, luminária e a marca do prédio). */
function lobbyOf(plan: Plan, inside: (x: number, z: number, m: number) => boolean, inner: number, zv: number, back: number): Lobby {
  if (plan === 'side') {
    // Na galeria sobre o pé-direito alto, nas pontas: sofá de frente para o vazio. As salas do
    // mezanino abrem a 2,8 m da borda (zv); a galeria fica no meio disso (andar sem salas também).
    const zg = zv - 1.4;
    let xr = 1;
    while (xr < 60 && inside(xr + 0.25, zg, 0.8)) xr += 0.25;
    let xl = 1;
    while (xl < 60 && inside(-(xl + 0.25), zg, 0.8)) xl += 0.25;
    const sx = -Math.max(3.2, xl * 0.5);
    return { sofa: { x: sx, z: zg - 0.5, face: 0 }, table: [sx, zg + 0.45], plant: [sx - 1.6, zg - 0.3], lamp: [sx + 1.5, zg - 0.6], sig: { x: Math.max(3.2, xr * 0.5), z: zg - 0.4, face: Math.PI } };
  }
  const z = plan === 'corridor' || plan === 'open' ? -back * 0.8 : -(inner + back) / 2;
  const sx = plan === 'corridor' || plan === 'open' ? 3.4 : 2.2;
  // Canto de apoio encostado na parede dos fundos, ao lado da porta da ponte; nos fundos curvos ou
  // estreitos, um pouco mais para dentro, até caber (do bebedouro ao extintor, 1,2 a 4,6 m de x = 0).
  let sz = -(back - 0.65);
  while (sz < -1 && !(inside(4.6, sz, 0.35) && inside(1.2, sz, 0.35))) sz += 0.25;
  return { sofa: { x: -2.2, z, face: Math.PI / 2 }, table: [-0.9, z], plant: [-2.4, z + 1.8], lamp: [-2.4, z - 1.8], sig: { x: sx, z, face: -Math.PI / 2 }, service: [1.5, sz] };
}

/**
 * Núcleo maciço: parede de pedra e nichos com telas; com a escada em caracol (`stair`), a porta da
 * escada na frente e os degraus em volta do pilar; sem ela (Calendar, que sobe pela escada curva do
 * átrio), fechado.
 */
function coreLevel(kit: Kit, b: Builder, y: number, r: number, accent: string, top: boolean, stair: boolean) {
  const stone = kit.mat('#D8D2C6', { rough: 0.9 });
  const dark = kit.mat('#2B3442', { rough: 0.5 });
  const h = STOREY - 0.35;
  // Parede do núcleo com a abertura da escada na frente (ângulo 0).
  const gap = 0.7;
  if (!stair) b.add(stone, new THREE.CylinderGeometry(r, r, h, 40), [0, y + h / 2, 0]);
  else {
    b.add(stone, new THREE.CylinderGeometry(r, r, h, 40, 1, true, gap / 2, Math.PI * 2 - gap), [0, y + h / 2, 0]);
    // Face de dentro do núcleo (vista de quem sobe a escada): desenhada pelo lado de dentro.
    b.add(kit.mat('#D2CBBE', { rough: 0.9, side: THREE.BackSide }), new THREE.CylinderGeometry(r - 0.3, r - 0.3, h, 40, 1, true, gap / 2, Math.PI * 2 - gap), [0, y + h / 2, 0]);
    b.add(stone, new THREE.CylinderGeometry(r, r, h - 2.4, 8, 1, true, -gap / 2, gap), [0, y + 2.4 + (h - 2.4) / 2, 0]);
  }
  // Nichos com telas acesas em volta.
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.add(dark, new THREE.BoxGeometry(1.4, 0.9, 0.06), [Math.sin(a) * (r + 0.04), y + 1.6, Math.cos(a) * (r + 0.04)], [0, a, 0]);
    b.add(kit.mat(accent, { glow: true }), new THREE.BoxGeometry(1.25, 0.75, 0.02), [Math.sin(a) * (r + 0.08), y + 1.6, Math.cos(a) * (r + 0.08)], [0, a, 0]);
    b.add(kit.mat('#F8FAFC', { glow: true }), new THREE.BoxGeometry(0.8, 0.05, 0.01), [Math.sin(a) * (r + 0.095), y + 1.75, Math.cos(a) * (r + 0.095)], [0, a, 0]);
  }
  if (top) b.add(stone, new THREE.CylinderGeometry(r + 0.2, r + 0.2, 1.2, 40), [0, y + STOREY + 0.6, 0]);
  if (!stair) return;
  // Escada em caracol dentro do núcleo (degraus girando em volta do pilar), deste andar ao de cima.
  // No último andar sem terraço não há para onde subir: só o pilar.
  const wood = kit.mat('#A0714F', { rough: 0.7 });
  b.add(dark, new THREE.CylinderGeometry(0.18, 0.18, STOREY, 12), [0, y + STOREY / 2 - 0.3, 0]);
  if (top) return;
  // Degraus na mesma rampa em que se anda (stairs.ts, coreY): a volta começa em CORE_START e chega
  // ao andar de cima em CORE_SWEEP, antes da porta (dali até a porta é o patamar).
  for (let k = 0; k < 18; k++) {
    const u = (k + 0.5) / 18;
    const a = CORE_START - u * CORE_SWEEP;
    const rr = (r - 0.3) / 2 + 0.1;
    b.add(wood, new THREE.BoxGeometry(0.4, 0.06, r - 0.6), [Math.sin(a) * rr, y + u * STOREY - 0.03, Math.cos(a) * rr], [0, a + Math.PI / 2, 0]);
  }
}

/** Pontos (grade de 0,8 m) dentro do vão da escada: o que o térreo tem de desviar. */
function wellDots(st: Stair): Pt[] {
  const xs = st.well.map((p) => p[0]);
  const zs = st.well.map((p) => p[1]);
  const out: Pt[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs) + 0.01; x += 0.8) for (let z = Math.min(...zs); z <= Math.max(...zs) + 0.01; z += 0.8) if (inWell(st, x, z, 0.05)) out.push([x, z]);
  return out;
}

/** Caixa (no plano) que contém a escada: as salas do mezanino e do corredor se arrumam em volta dela. */
interface StairBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
function stairBox(st: Stair | null): StairBox | null {
  if (!st) return null;
  const xs = st.well.map((p) => p[0]);
  const zs = st.well.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/**
 * O saguão sai da escada, do núcleo, do hall e da rota a pé até a escada (`ok` diz se o ponto serve
 * para uma peça de meia largura `m`): cada peça fica onde está, no espelho (o outro lado do eixo)
 * ou no primeiro lugar livre em anéis de 0,5 m em volta dela (até 10 m). O canto de apoio é uma
 * fileira (bebedouro, reciclagem e extintor, de x a x + 2,75 m): vale a fileira inteira. A
 * peça-assinatura do prédio (com o violão da Música ao lado) pede mais folga. Sem lugar livre,
 * a peça fica onde estava.
 */
function clearLobby(l: Lobby, ok: (x: number, z: number, m: number) => boolean): Lobby {
  const around = function* (x: number, z: number): Generator<[number, number]> {
    yield [x, z];
    yield [-x, z];
    for (let r = 0.5; r <= 10; r += 0.5) for (let k = 0; k < 16; k++) yield [x + Math.sin((k / 16) * Math.PI * 2) * r, z - Math.cos((k / 16) * Math.PI * 2) * r];
  };
  const fix = (x: number, z: number, m: number): [number, number] => {
    for (const p of around(x, z)) if (ok(p[0], p[1], m)) return p;
    return [x, z];
  };
  const pt = (p: [number, number], m: number) => fix(p[0], p[1], m);
  const po = (p: { x: number; z: number; face: number }, m: number) => {
    const [x, z] = fix(p.x, p.z, m);
    return { x, z, face: x === -p.x && z === p.z && x !== p.x ? -p.face : p.face };
  };
  const out: Lobby = { sofa: po(l.sofa, 1.0), table: pt(l.table, 0.6), plant: pt(l.plant, 0.6), lamp: pt(l.lamp, 0.5), sig: po(l.sig, 2.0) };
  if (l.service) {
    const [sx, sz] = l.service;
    let at: [number, number] = [sx, sz];
    for (const p of around(sx, sz))
      if ([0, 1.45, 2.75].every((dx) => ok(p[0] + dx, p[1], 0.5))) {
        at = p;
        break;
      }
    out.service = at;
  }
  return out;
}

/**
 * Placa "Escadas" com o nome do nível junto ao patamar da escada, num poste logo fora do canto de
 * fora do patamar (no canto do guarda-corpo, onde não se passa), virada para quem chega, em cada
 * nível que ela serve. O poste fica fora do patamar e fora da colisão pelo desenho: antes, dentro
 * do patamar, a célula de colisão dele (0,5 m) travava a entrada da escada.
 */
function stairSign(kit: Kit, root: THREE.Object3D, st: Stair, L: number, name: string, accent: string) {
  const y = st.ys[L] ?? 0;
  const land = landingOf(st, L);
  const cx = st.well.reduce((s, p) => s + p[0], 0) / st.well.length;
  const cz = st.well.reduce((s, p) => s + p[1], 0) / st.well.length;
  const corner = land.reduce((m, p) => (Math.hypot(p[0] - cx, p[1] - cz) > Math.hypot(m[0] - cx, m[1] - cz) ? p : m), land[0]!);
  const dc = Math.hypot(corner[0] - cx, corner[1] - cz) || 1;
  const px = corner[0] + ((corner[0] - cx) / dc) * 0.18;
  const pz = corner[1] + ((corner[1] - cz) / dc) * 0.18;
  const face = Math.atan2(px - cx, pz - cz);
  const pole = new THREE.Mesh(kit.own(new THREE.BoxGeometry(0.07, 2.75, 0.07)), kit.mat('#2B3442', { rough: 0.5, metal: 0.3 }));
  pole.position.set(px, y + 1.375, pz);
  pole.userData.noCollide = true;
  root.add(pole);
  const s = sectorSign(kit, zoneLabel('stairs'), accent, 1.5);
  s.position.set(px, y + 2.62, pz);
  s.rotation.y = face;
  root.add(s);
  const f = sectorSign(kit, name, '#94A3B8', 1.1);
  f.position.set(px, y + 2.22, pz);
  f.rotation.y = face;
  root.add(f);
}
/** Patamar da escada no nível `L` (parte da laje). */
const landingOf = (st: Stair, L: number): Pt[] => st.phases[(st.first[L] ?? 0) % st.phases.length]!.land;

/** Pátio-jardim do 1º andar: grama, árvores, espelho d'água com pedras e bancos em volta. */
function gardenCourt(kit: Kit, b: Builder, seats: Seat[], obstacles: Obstacle[], y: number, r: number) {
  const grass = kit.mat('#7DA65E', { rough: 1 });
  const bark = kit.mat('#6B4F3A', { rough: 0.9 });
  const leafA = kit.mat('#4C9A4F', { rough: 0.9 });
  const leafB = kit.mat('#3E7F44', { rough: 0.9 });
  const stone = kit.mat('#CFC6B6', { rough: 0.9 });
  b.add(grass, new THREE.CircleGeometry(r - 0.2, 48), [0, y + 0.03, 0], [-Math.PI / 2, 0, 0]);
  b.add(stone, new THREE.TorusGeometry(r - 0.15, 0.12, 6, 64), [0, y + 0.08, 0], [Math.PI / 2, 0, 0]);
  // Espelho d'água no meio.
  b.add(stone, new THREE.CylinderGeometry(r * 0.38, r * 0.38, 0.3, 32), [0, y + 0.15, 0]);
  b.add(kit.mat('#5DA9C9', { rough: 0.05, metal: 0.2 }), new THREE.CircleGeometry(r * 0.34, 32), [0, y + 0.31, 0], [-Math.PI / 2, 0, 0]);
  obstacles.push({ x: 0, z: 0, r: r * 0.38, h: 0.3 });
  for (let k = 0; k < 3; k++) b.add(stone, new THREE.DodecahedronGeometry(0.2 + k * 0.05, 0), [Math.sin(k * 2.1) * r * 0.2, y + 0.35, Math.cos(k * 2.1) * r * 0.2]);
  // Árvores e bancos alternados.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const tr = r * 0.68;
    const x = Math.sin(a) * tr;
    const z = Math.cos(a) * tr;
    if (k % 2 === 0) {
      b.add(bark, new THREE.CylinderGeometry(0.1, 0.16, 2.6, 8), [x, y + 1.3, z]);
      for (let j = 0; j < 4; j++) b.add(j % 2 ? leafA : leafB, new THREE.IcosahedronGeometry(0.9 - j * 0.12, 1), [x + Math.sin(j * 1.7) * 0.4, y + 2.6 + j * 0.35, z + Math.cos(j * 1.7) * 0.4]);
      obstacles.push({ x, z, r: 0.4, h: 3 });
    } else {
      b.add(kit.mat('#A0714F', { rough: 0.75 }), new THREE.BoxGeometry(1.6, 0.08, 0.45), [x, y + 0.45, z], [0, a + Math.PI / 2, 0]);
      b.add(stone, new THREE.BoxGeometry(1.4, 0.4, 0.35), [x, y + 0.2, z], [0, a + Math.PI / 2, 0]);
      seats.push({ x, y: y + 0.45, z, face: a + Math.PI });
    }
  }
}

/** Mesas de estudo do terraço da Academy: livros empilhados, caderno aberto e luminária no tampo das mesas do deque. */
function studyTables(kit: Kit, b: Builder, tables: readonly DeckSpot[], y: number) {
  const paper = kit.mat('#F8FAFC', { rough: 0.6 });
  const lampMat = kit.mat('#2B3442', { rough: 0.5, metal: 0.3 });
  const glow = kit.mat('#FFE8C2', { glow: true });
  const covers = ['#B45309', '#1D4ED8', '#047857'].map((c) => kit.mat(c, { rough: 0.8 }));
  for (const s of tables) {
    const c = Math.cos(s.face);
    const sn = Math.sin(s.face);
    const top = y + 0.77;
    // Livros empilhados de um lado do tampo, caderno aberto no meio e a luminária do outro lado.
    covers.forEach((m, k) => b.add(m, new THREE.BoxGeometry(0.22, 0.04, 0.16), [s.x - c * 0.22, top + 0.02 + k * 0.04, s.z + sn * 0.22], [0, s.face + k * 0.25, 0]));
    b.add(paper, new THREE.BoxGeometry(0.34, 0.01, 0.24), [s.x + sn * 0.08, top + 0.005, s.z + c * 0.08], [0, s.face, 0]);
    b.add(lampMat, new THREE.CylinderGeometry(0.06, 0.07, 0.02, 12), [s.x + c * 0.25, top + 0.01, s.z - sn * 0.25]);
    b.add(lampMat, new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), [s.x + c * 0.25, top + 0.17, s.z - sn * 0.25]);
    b.add(glow, new THREE.ConeGeometry(0.09, 0.1, 14, 1, true), [s.x + c * 0.25, top + 0.34, s.z - sn * 0.25]);
  }
}
