/**
 * Andares dos interiores (V2.1, seções 10 e 11). O térreo é o salão de cada prédio; por cima dele
 * sobem os andares da especificação, cada prédio na sua arquitetura (forms.ts): átrio com galerias,
 * núcleo com escada, corredor com salas, mezanino sobre pé-direito alto, planta livre ou anel em
 * volta de um jardim; cada andar com a planta da volumetria do prédio (massing.ts: só onde há
 * volume naquele nível, alas mais baixas viram cobertura ou terraço) e a fachada própria. Uma torre
 * de elevador envidraçada, nos fundos, liga todos os andares.
 * Cada sala dos andares abre o painel real do módulo que corresponde a ela (nenhum dado novo).
 * Nos prédios com terraço (forms.ts), a cobertura do último andar é mais um nível: a céu aberto,
 * com guarda-corpo, bancos, floreiras e árvores, ligado ao mesmo elevador (e à escada do núcleo).
 */
import * as THREE from 'three';
import type { ModuleId } from '@/app/modules';
import { buildingById } from '@/domain/park';
import { Builder, type Kit } from '../kit';
import type { Obstacle, Seat } from '../camera';
import { sectorSign, type InteriorScene } from './common';
import { footprint } from '../collision';
import { decorate, furnish, roomType, type RoomType } from './furnish';
import { enrichGround, enrichLevel, type Lobby } from './enrich';
import { FORMS, circle, clipZ, facadeAlong, facadeMats, hasRoofTerrace, slab, upperPlan, volSlab, type Plan } from '../forms';
import { MASSING, STOREY, groundHeight, groundSpan, liftDist, roofsAt, sideCut, volsAt } from '../massing';
import { alongRun, boundOf, deckSpots, inVol, insideAt, inscribed, nearestRun, segDist, spanZ, terraceDoors, volPoly, wallRuns, type DeckSpot, type Vol, type WallRun } from '../outline';
import type { Thing } from './things';

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
    [['classrooms', 'rooms', 'desk'], ['individual', 'plan', 'desk'], ['activities', 'hall', 'desk']],
    [['practice', 'review', 'studio']],
    [],
  ],
  languages: [
    [['languageRooms', 'spaces', 'desk'], ['sessions', 'spaces', 'desk'], ['grammar', 'spaces', 'desk'], ['skills', 'garden', 'lounge']],
    [['conversation', 'spaces', 'lounge'], ['booths', 'spaces', 'studio']],
    [],
  ],
  projects: [
    [['planning', 'studio', 'desk'], ['milestones', 'gallery', 'screen'], ['tasks', 'gallery', 'desk']],
    [['tracking', 'studio', 'screen'], ['materials', 'gallery', 'shelf'], ['done', 'studio', 'shelf']],
  ],
  music: [[['individual', 'instruments', 'studio'], ['study', 'instruments', 'desk']], []],
  sports: [[['training', 'modalities', 'studio'], ['activities', 'atrium', 'screen'], ['records', 'analysis', 'screen']]],
  goals: [
    [['planning', 'garden', 'desk'], ['links', 'garden', 'desk']],
    [['tracking', 'analysis', 'screen'], ['updates', 'garden', 'desk'], ['history', 'achieved', 'shelf']],
  ],
  insights: [
    [['indicators', 'overview', 'screen'], ['charts', 'productivity', 'screen']],
    [['comparisons', 'overview', 'screen'], ['deep', 'learning', 'screen']],
  ],
  finance: [
    [['budget', 'planning', 'desk'], ['records', 'investments', 'shelf']],
    [['history', 'planning', 'shelf'], ['charts', 'investments', 'screen']],
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

export interface Floors {
  levels: FloorLevel[];
  zones: FloorZone[];
  /** Torre do elevador (fora do salão do térreo, nos fundos). */
  elevator: { x: number; z: number };
  seats: Seat[];
  /** Cabine (sobe e desce) e as duas portas de correr (abrem para os lados). */
  cabin: THREE.Group;
  doors: [THREE.Object3D, THREE.Object3D];
  /** Objetos funcionais (piano, luminárias, globo, relógio, luneta, escada, portas das salas). */
  things: Thing[];
  plan: Plan;
}

/** Vaga de uma sala no andar: centro, frente (para onde abre a porta), largura e fundo. */
interface Slot {
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

/** Pedaços de um segmento reto fora de onde `skip` diz (passagem da ponte do elevador). */
function splitRun(ax: number, az: number, bx: number, bz: number, skip: (x: number, z: number) => boolean, step = 0.8): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
  let run: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const p: [number, number] = [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n];
    const q: [number, number] = [ax + ((bx - ax) * (k + 1)) / n, az + ((bz - az) * (k + 1)) / n];
    if (skip((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) {
      if (run.length > 1) out.push(run);
      run = [];
      continue;
    }
    if (!run.length) run.push(p);
    run.push(q);
  }
  if (run.length > 1) out.push(run);
  return out;
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
export function withFloors(kit: Kit, scene: InteriorScene, id: ModuleId, label: (key: string) => string, terrace: string, floorName: (n: number) => string, elevators = 'Elevadores'): InteriorScene {
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
  // Torre do elevador nos fundos, em x = 0, fora da parede do térreo (a mesma distância de fora).
  const tower = { x: 0, z: -liftDist(id) };
  const things: Thing[] = [];
  const thingRoot = new THREE.Group();
  scene.scene.add(thingRoot);
  const levels: FloorLevel[] = [
    { y: 0, outer: span0.bound, walk: back0 - 1.2, inner: 0, ceiling: H, obstacles: scene.obstacles, doors: [], doorHalf: 0, blocked: scene.room.blocked, wallAt: scene.room.wallAt, arrive: { x: 0, z: -(back0 - 4) } },
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

  plan.forEach((rooms, i) => {
    const L = i + 1;
    const y = H + i * STOREY;
    const top = L === plan.length;
    const vols = volsAt(id, L);
    const runs = wallRuns(vols, 1);
    const sp = spanZ(vols, 0);
    const backR = sp.back;
    const inside = (x: number, z: number, m: number) => insideAt(vols, x, z, m);
    const zv = fp === 'side' ? sideCut(id, L) : Infinity;
    const hole = inner > 0 && (fp === 'atrium' || (fp === 'garden' && L > 1));
    // Coberturas das alas que terminam logo abaixo (vistas pela janela); terraço onde o prédio tem.
    const roofs = roofsAt(id, L);
    const terr = roofT ? roofs : [];
    const edges = terr.length ? wallRuns([...vols, ...terr], 1).filter((r) => r.vol >= vols.length) : [];
    // Portas da fachada: a da ponte do elevador (fundos, x = 0) e uma em cada trecho de frente para o terraço.
    const doorPts: Array<{ x: number; z: number; nx?: number; nz?: number }> = [{ x: 0, z: -backR }, ...terraceDoors(runs, terr)];

    // Laje do andar (com o vazio do meio ou cortada no mezanino) e o piso de circulação por cima.
    const corridorMat = kit.mat(style.floors[(L - 1) % style.floors.length]!, { rough: 0.35, metal: 0.05 });
    for (const v of vols) {
      const pts = Number.isFinite(zv) ? clipZ(volPoly(v), zv) : volPoly(v);
      if (pts.length < 3) continue;
      const holes = hole && holds(v) ? [circle(inner)] : [];
      b.add(slabMat, slab(pts, holes, y, 0.3));
      b.add(corridorMat, slab(pts, holes, y + 0.012, 0.01));
    }
    // Cobertura das alas mais baixas (deque, quando é terraço) e o guarda-corpo nas bordas livres.
    for (const v of roofs) b.add(terr.length ? deckMat : roofMat, volSlab(v, y, 0.3));
    for (const r of edges) for (const run of splitRun(r.ax, r.az, r.bx, r.bz, (x, z) => Math.abs(x) < 1.25 && z < 0 && z > tower.z)) railing(b, glass, metal, run, y, false);
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
    // Fachada no tipo do prédio, trecho a trecho, com a porta da ponte do elevador e as do terraço.
    for (const r of runs) facadeAlong(b, form, fm, r, y, STOREY - 0.3, doorsOn(r, doorPts));
    // Placa do terraço sobre cada porta que dá para ele (por dentro).
    for (const p of doorPts.slice(1)) {
      const s = sectorSign(kit, terrace, accent, 1.6);
      s.position.set(p.x - (p.nx ?? 0) * 0.3, y + 2.75, p.z - (p.nz ?? 0) * 0.3);
      s.rotation.y = Math.atan2(p.nx ?? 0, p.nz ?? 1);
      scene.scene.add(s);
    }
    if (top) {
      // Cobertura: claraboia sobre o átrio; jardim a céu aberto; laje inteira nos demais.
      for (const v of vols) {
        const roofHoles = holds(v) && (fp === 'atrium' || fp === 'garden') ? [circle(fp === 'atrium' ? inner * 0.8 : inner)] : [];
        b.add(slabMat, volSlab(v, y + STOREY, 0.3, roofHoles, 0.2));
      }
      if (fp === 'atrium') {
        b.add(glass, new THREE.SphereGeometry(inner * 0.8, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, y + STOREY - 0.3, 0], undefined, [1, 0.35, 1]);
        for (let k = 0; k < 8; k++) b.add(metal, new THREE.TorusGeometry(inner * 0.8, 0.03, 4, 24, Math.PI), [0, y + STOREY - 0.3, 0], [0, (k / 8) * Math.PI, 0], [1, 0.35, 1]);
      }
    }
    // Ponte da fachada até a torre do elevador.
    b.add(slabMat, new THREE.BoxGeometry(2.4, 0.3, -tower.z - backR + 0.6), [0, y - 0.15, -(backR + -tower.z) / 2]);
    for (const s of [-1, 1]) railing(b, glass, metal, [[s * 1.2, -backR], [s * 1.2, tower.z + 1.3]], y, false);

    // Terraço das alas: floreiras e bancos junto ao guarda-corpo.
    const obstacles: Obstacle[] = [];
    if (terr.length) drawDeck(kit, b, deckSpots(terr, edges, 0, Math.PI, false), y, style.warm, seats, obstacles);

    // Salas: cada planta distribui do seu jeito, dentro da planta deste andar.
    const slots = layout(fp, rooms.length, inside, inner, zv, sp.front, backR);
    const lobby = lobbyOf(fp, inside, inner, zv, backR);
    slots.forEach((sl, k) => {
      const [key, sector] = rooms[k]!;
      const type = roomType(key, id);
      const front = { x: Math.sin(sl.face), z: Math.cos(sl.face) };
      const ex = sl.x + front.x * (sl.d / 2 + 0.9);
      const ez = sl.z + front.z * (sl.d / 2 + 0.9);
      zones.push({ level: L, key, sector, x: sl.x, z: sl.z, face: sl.face, ex, ez });
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
      decorate(kit, fb, key, sl.w, sl.d, accent, style.warm, k + L * 7);
      g.add(fb.build());
      const sign = sectorSign(kit, label(key), sector ? accent : '#94A3B8', 2.2);
      sign.position.set(0, 2.62, sl.d / 2 + 0.25);
      g.add(sign);
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
    if (fp === 'core') coreLevel(kit, b, things, L, y, inner, accent, top && !roofT);
    // Jardim interno no 1º andar (a céu aberto), com árvores, espelho d'água e bancos.
    if (fp === 'garden' && L === 1) gardenCourt(kit, b, seats, obstacles, y, inner);

    const ceiling = y + STOREY - 0.35;
    const apo = Math.max(4, inscribed(vols));
    enrichLevel(kit, b, seats, id, L, top, y, lobby, hole ? inner : 0, apo, ceiling, accent, style.warm, thingRoot, things, (x, z) => inside(x, z, 0.8));

    {
      const s = sectorSign(kit, floorName(L), accent, 1.8);
      s.position.set(0, y + 3.0, -backR + 0.45);
      scene.scene.add(s);
      // Placa verde de saída de emergência acesa.
      b.add(kit.mat('#16A34A', { glow: true }), new THREE.BoxGeometry(0.7, 0.24, 0.05), [-1.6, y + 2.55, -backR + 0.4]);
      b.add(kit.mat('#F8FAFC', { glow: true }), new THREE.BoxGeometry(0.16, 0.12, 0.01), [-1.75, y + 2.55, -backR + 0.43]);
    }
    const bridge = (x: number, z: number) => Math.abs(x) < 1.1 && z < -backR + 0.4 && z > tower.z + 1.2;
    const atDoor = (x: number, z: number) => doorPts.some((p) => Math.hypot(x - p.x, z - p.z) < 0.85);
    const blocked = (x: number, z: number) => {
      if (bridge(x, z) || atDoor(x, z)) return false;
      // Parede (fora das portas): não se passa.
      if (nearestRun(runs, x, z).d < 0.3) return true;
      if (inside(x, z, 0.35)) {
        // Vazio do meio (átrio, jardim dos andares de cima) ou núcleo da escada; pé-direito alto do mezanino.
        if (inner && (fp !== 'garden' || L > 1) && Math.hypot(x, z) < inner + (fp === 'core' ? 0.3 : 0.5)) return true;
        return z > zv - 0.4;
      }
      // Fora da planta: só no terraço das alas (até o guarda-corpo).
      return !(terr.length && insideAt(terr, x, z, 0.5));
    };
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
      arrive: { x: 0, z: -backR + 2.4 },
    });
  });

  // Terraço na cobertura do último andar: mais um nível, a céu aberto (sem teto), com deque,
  // guarda-corpo em toda a borda (aberto só na ponte do elevador) e em volta do vão/claraboia do
  // meio, bancos virados para a vista, floreiras, árvores em vasos e mesas. Nenhuma sala.
  if (roofT) {
    const LT = plan.length;
    const L = LT + 1;
    const y = H + LT * STOREY;
    const vols = volsAt(id, LT);
    const backR = spanZ(vols, 0).back;
    // Vão do meio na cobertura: claraboia do átrio ou jardim interno a céu aberto.
    const hole = fp === 'atrium' ? inner * 0.8 : fp === 'garden' ? inner : 0;
    // Até onde não se pisa no meio: vão (com o guarda-corpo) ou casa da escada do núcleo.
    const free = fp === 'core' ? inner + 0.3 : hole ? hole + 0.6 : 0;
    const edges = wallRuns(vols, 1);
    const deck = kit.mat(style.warm ? '#B08968' : '#9C8F80', { rough: 0.8 });
    for (const v of vols) b.add(deck, volSlab(v, y + 0.03, 0.03, hole && holds(v) ? [circle(hole + 0.05)] : []));
    const atBridge = (x: number, z: number) => Math.abs(x) < 1.25 && z < 0 && z > -backR - 1;
    for (const r of edges) for (const run of splitRun(r.ax, r.az, r.bx, r.bz, atBridge)) railing(b, glass, metal, run, y, false);
    if (hole) railing(b, glass, metal, circle(hole + (fp === 'atrium' ? 0.35 : 0.1), 48), y, true);
    if (fp === 'core') {
      // A escada do núcleo chega ao terraço numa casa de pedra com porta na frente.
      const stone = kit.mat('#D8D2C6', { rough: 0.9 });
      const h = 2.8;
      const gap = 0.7;
      b.add(stone, new THREE.CylinderGeometry(inner, inner, h, 40, 1, true, gap / 2, Math.PI * 2 - gap), [0, y + h / 2, 0]);
      b.add(kit.mat('#D2CBBE', { rough: 0.9, side: THREE.BackSide }), new THREE.CylinderGeometry(inner - 0.3, inner - 0.3, h, 40, 1, true, gap / 2, Math.PI * 2 - gap), [0, y + h / 2, 0]);
      b.add(stone, new THREE.CylinderGeometry(inner, inner, h - 2.4, 8, 1, true, -gap / 2, gap), [0, y + 2.4 + (h - 2.4) / 2, 0]);
      b.add(stone, new THREE.CylinderGeometry(inner + 0.25, inner + 0.25, 0.3, 40), [0, y + h + 0.15, 0]);
      things.push({ kind: 'stairs', level: L, x: 0, z: inner + 1.0, face: 0 });
    }
    let spots = deckSpots(vols, edges, free + 0.6, Math.PI);
    // Calendar: o relógio de sol do Mirante do Tempo, na frente do terraço (o mesmo de fora).
    const dial = id === 'calendar' ? sundialSpot(vols) : null;
    if (dial) {
      spots = spots.filter((s) => Math.hypot(s.x - dial.x, s.z - dial.z) > 3);
      sundial(kit, b, dial.x, y, dial.z);
    }
    drawDeck(kit, b, spots, y, style.warm, seats, null);
    // Ponte da cobertura até a torre do elevador e o pórtico com o nome do terraço.
    b.add(slabMat, new THREE.BoxGeometry(2.4, 0.3, -tower.z - backR + 0.6), [0, y - 0.15, -(backR + -tower.z) / 2]);
    for (const s of [-1, 1]) railing(b, glass, metal, [[s * 1.2, -backR], [s * 1.2, tower.z + 1.3]], y, false);
    for (const s of [-1, 1]) b.add(dark, new THREE.BoxGeometry(0.12, 3.0, 0.12), [s * 1.9, y + 1.5, -backR + 1.2]);
    b.add(dark, new THREE.BoxGeometry(3.92, 0.12, 0.12), [0, y + 3.0, -backR + 1.2]);
    const gate = sectorSign(kit, label('terrace'), accent, 2.6);
    gate.position.set(0, y + 2.6, -backR + 1.2);
    scene.scene.add(gate);
    const bridge = (x: number, z: number) => Math.abs(x) < 1.1 && z < -backR + 0.6 && z > tower.z + 1.2;
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
      // Não se passa do guarda-corpo da borda nem entra no vão ou no núcleo do meio.
      blocked: (x, z) => {
        if (bridge(x, z)) return false;
        return !insideAt(vols, x, z, 0.45) || Math.hypot(x, z) < free;
      },
      // Sem fachada em volta: a câmera da 3ª pessoa fica livre.
      wallAt: () => Infinity,
      arrive: { x: 0, z: -backR + 2.4 },
    });
  }
  /** Nome de cada nível (o terraço tem nome próprio). */
  const levelName = (n: number) => (roofT && n === plan.length + 1 ? label('terrace') : floorName(n));

  // Térreo: camada de detalhe em volta do salão (sem cobrir o que o prédio já tem).
  // O que já ocupa o térreo (móveis, balcões, estantes) e o alto do salão, pelo desenho: os detalhes novos desviam.
  const occupied = [...scene.obstacles, ...footprint(scene.scene, () => 0, 0.05, 2.6, 0.5)];
  const overhead = footprint(scene.scene, () => 0, H - 2.4, H - 0.2, 0.5);
  // Lounge dos elevadores no fundo do térreo: tapete, poltronas, plantas, quadro com os andares,
  // botão de chamada aceso e uma faixa de luz no piso levando até ele (antes dos outros detalhes,
  // para eles desviarem do lounge).
  {
    const lz = -(back0 - 3.4);
    const free = (x: number, z: number, r: number) => insideAt(g0, x, z, r) && !occupied.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r);
    const rug = kit.mat(style.warm ? '#B9A27E' : '#8EA0B5', { rough: 1 });
    b.add(rug, new THREE.BoxGeometry(6.4, 0.015, 3.6), [0, 0.012, lz]);
    b.add(kit.mat(accent, { rough: 0.9 }), new THREE.BoxGeometry(6.6, 0.012, 3.8), [0, 0.008, lz]);
    // Faixa de luz no piso, do meio do salão até o lounge.
    for (let k = 0; k < 8; k++) {
      const z = lz + 2.2 + k * 1.1;
      if (free(0, z, 0.2)) b.add(kit.mat(accent, { glow: true }), new THREE.BoxGeometry(0.12, 0.01, 0.6), [0, 0.02, z]);
    }
    const fabric = kit.mat(style.warm ? '#9C6B4E' : '#5B6B80', { rough: 0.95 });
    const legs = kit.mat('#2B3442', { rough: 0.5, metal: 0.3 });
    for (const sx of [-1, 1]) {
      // A poltrona procura um lugar livre perto do lounge (cada térreo é diferente).
      const spot = ([[3.9, 0], [3.3, 0.9], [4.5, -0.7], [2.8, 1.7], [3.6, 2.4]] as const).map(([dx, dz]) => [sx * dx, lz + dz] as const).find(([px, pz]) => free(px, pz, 0.9));
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
    if (free(-1.9, lz + 0.6, 0.5)) {
      b.add(kit.mat('#C9A27A', { rough: 0.6 }), new THREE.CylinderGeometry(0.45, 0.45, 0.04, 24), [-1.9, 0.45, lz + 0.6]);
      b.add(legs, new THREE.CylinderGeometry(0.04, 0.06, 0.43, 8), [-1.9, 0.22, lz + 0.6]);
      for (let k = 0; k < 3; k++) b.add(kit.mat(['#E07A5F', '#5B8DB8', '#F2CC8F'][k]!, { rough: 0.8 }), new THREE.BoxGeometry(0.22, 0.012, 0.3), [-1.95 + k * 0.05, 0.48 + k * 0.012, lz + 0.6], [0, k * 0.4, 0]);
    }
    for (const sx of [-1, 1]) {
      const spot = ([2.6, 3.4, 1.9] as const).map((dx) => sx * dx).find((px) => free(px, -(back0 - 1.6), 0.5));
      if (spot === undefined) continue;
      const x = spot;
      const z = -(back0 - 1.6);
      b.add(kit.mat('#D9CBB6', { rough: 0.8 }), new THREE.CylinderGeometry(0.32, 0.25, 0.6, 16), [x, 0.3, z]);
      b.add(kit.mat('#3E7F44', { rough: 0.9 }), new THREE.IcosahedronGeometry(0.5, 1), [x, 1.05, z], undefined, [1, 1.5, 1]);
    }
    // Portal dos elevadores na parede do fundo: moldura, placa e botão de chamada.
    const pz = -(back0 - 0.35);
    b.add(legs, new THREE.BoxGeometry(2.8, 0.18, 0.2), [0, 2.75, pz]);
    for (const sx of [-1, 1]) b.add(legs, new THREE.BoxGeometry(0.16, 2.75, 0.2), [sx * 1.4, 1.375, pz]);
    b.add(kit.mat('#E5E7EB', { metal: 0.6, rough: 0.3 }), new THREE.BoxGeometry(0.16, 0.3, 0.05), [1.75, 1.2, pz + 0.1]);
    for (const dy of [0.07, -0.07]) b.add(kit.mat(accent, { glow: true }), new THREE.CircleGeometry(0.035, 12), [1.75, 1.2 + dy, pz + 0.13]);
    const sign = sectorSign(kit, elevators, accent, 2.4);
    sign.position.set(0, 3.2, pz + 0.12);
    scene.scene.add(sign);
    // Quadro com os níveis (do térreo ao último, terraço incluído) ao lado do portal.
    const nLv = levels.length;
    b.add(legs, new THREE.BoxGeometry(1.5, 0.5 + (nLv - 1) * 0.42, 0.06), [-2.4, 1.7, pz + 0.05]);
    levels.forEach((_, n) => {
      const s = sectorSign(kit, levelName(n), n === 0 ? accent : '#94A3B8', 1.3);
      s.position.set(-2.4, 1.7 + ((nLv - 1) / 2 - n) * 0.42, pz + 0.1);
      scene.scene.add(s);
    });
    occupied.push({ x: 0, z: lz, r: 2.2, h: 0.1 }, { x: 0, z: -(back0 - 1.2), r: 1.6, h: 3 });
  }
  const hOf0 = (i: number) => groundHeight(id, g0[i]!);
  const ceilAt = (x: number, z: number) => g0.reduce((m, v, i) => (inVol(v, x, z) ? Math.max(m, hOf0(i)) : m), 0);
  enrichGround(kit, b, seats, occupied, overhead, { vols: g0, runs: wallRuns(g0, 1, hOf0), front: span0.front, back: back0, ceilAt }, accent, style.warm, thingRoot, things);
  // Torre do elevador: vidro, estrutura e uma cabine em cada andar; placa com o nome de cada andar.
  // Com terraço, a torre passa da cobertura (a cabine para no terraço).
  const topY = H + plan.length * STOREY + (roofT ? 3.0 : 0);
  b.add(glass, new THREE.CylinderGeometry(1.4, 1.4, topY, 24, 1, true), [tower.x, topY / 2, tower.z]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    b.add(metal, new THREE.BoxGeometry(0.12, topY, 0.12), [tower.x + Math.sin(a) * 1.4, topY / 2, tower.z + Math.cos(a) * 1.4]);
  }
  b.add(slabMat, new THREE.CylinderGeometry(1.6, 1.6, 0.3, 24), [tower.x, topY, tower.z]);
  levels.forEach((lv, n) => {
    const s = sectorSign(kit, levelName(n), accent, 1.6);
    s.position.set(tower.x, lv.y + 2.9, tower.z + 1.5);
    scene.scene.add(s);
  });
  scene.scene.add(b.build());
  // Cabine: piso, parede curva ao fundo, corrimão, teto com luz, painel de andares e portas de vidro.
  const cabin = new THREE.Group();
  const cb = new Builder();
  cb.add(slabMat, new THREE.CylinderGeometry(1.25, 1.25, 0.12, 24), [0, -0.06, 0]);
  cb.add(kit.mat('#E9EDF2', { rough: 0.4, metal: 0.2 }), new THREE.CylinderGeometry(1.25, 1.25, 2.4, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), [0, 1.2, 0]);
  cb.add(slabMat, new THREE.CylinderGeometry(1.25, 1.25, 0.1, 24), [0, 2.45, 0]);
  cb.add(kit.mat('#FFF1D6', { glow: true }), new THREE.CylinderGeometry(0.6, 0.6, 0.03, 24), [0, 2.39, 0]);
  cb.add(metal, new THREE.TorusGeometry(1.12, 0.025, 6, 32, Math.PI * 0.8), [0, 0.95, 0], [Math.PI / 2, 0, Math.PI * 0.1]);
  cb.add(dark, new THREE.BoxGeometry(0.22, 0.4, 0.04), [0.95, 1.3, -0.55], [0, -0.9, 0]);
  cb.add(kit.mat(accent, { glow: true }), new THREE.BoxGeometry(0.14, 0.04, 0.05), [0.95, 1.45, -0.54], [0, -0.9, 0]);
  cabin.add(cb.build());
  const door = (side: number) => {
    const d = new THREE.Group();
    const db = new Builder();
    db.add(glass, new THREE.BoxGeometry(0.78, 2.3, 0.04), [0, 1.15, 0]);
    db.add(metal, new THREE.BoxGeometry(0.06, 2.3, 0.06), [side * 0.37, 1.15, 0]);
    db.add(metal, new THREE.BoxGeometry(0.78, 0.06, 0.06), [0, 2.3, 0]);
    d.add(db.build(false));
    d.position.set(side * 0.39, 0, 1.18);
    cabin.add(d);
    return d;
  };
  const doors: [THREE.Object3D, THREE.Object3D] = [door(-1), door(1)];
  cabin.position.set(tower.x, 0, tower.z);
  cabin.traverse((o) => (o.userData.noCollide = true));
  scene.scene.add(cabin);
  // Colisão de cada andar pelo desenho (móveis, floreiras, paredes das salas).
  levels.forEach((lv, n) => n > 0 && lv.obstacles.push(...footprint(scene.scene, () => lv.y, 0.3, 1.45, 0.5)));
  scene.floors = { levels, zones, elevator: tower, seats, cabin, doors, things, plan: fp };
  return scene;
}

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
 * reto da frente aos fundos; ou atrás da galeria do mezanino. Cada sala encolhe até caber.
 */
function layout(plan: Plan, n: number, inside: (x: number, z: number, m: number) => boolean, inner: number, zv: number, front: number, back: number): Slot[] {
  const out: Slot[] = [];
  // A caixa cabe na planta (cantos com folga das paredes).
  const fits = (cx: number, cz: number, face: number, w: number, d: number) => {
    const c = Math.cos(face);
    const s = Math.sin(face);
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [-w / 2, 0], [w / 2, 0]].every(([lx, lz]) => inside(cx + lx! * c + lz! * s, cz - lx! * s + lz! * c, 0.35));
  };
  if (plan === 'atrium' || plan === 'garden' || plan === 'core') {
    // Anel de salas entre o corredor do meio e a fachada; os fundos ficam para o saguão.
    const ri = inner + (plan === 'core' ? 1.9 : 1.6);
    const lobby = 1.0;
    const span = (Math.PI * 2 - lobby) / n;
    const start = Math.PI + lobby / 2;
    for (let k = 0; k < n; k++) {
      const a = start + (k + 0.5) * span;
      const s = Math.sin(a);
      const c = Math.cos(a);
      // Até a fachada nesta direção (no máximo 9 m de fundo).
      let ro = ri;
      while (ro < ri + 9 && inside(s * (ro + 0.1), c * (ro + 0.1), 0.35)) ro += 0.1;
      let d = Math.max(2.4, ro - ri - 0.3);
      let w = Math.max(2.4, Math.min(9, ((ri + ro) / 2) * span * 0.85, 2 * (ri + 0.3) * Math.sin(Math.min(span, Math.PI) / 2) - 0.4));
      const mid = (dd: number) => ri + 0.15 + dd / 2;
      while (!fits(s * mid(d), c * mid(d), a + Math.PI, w, d) && (w > 2.4 || d > 2.4)) {
        if (w > 2.4) w -= 0.25;
        if (d > 2.4) d -= 0.25;
      }
      out.push({ x: s * mid(d), z: c * mid(d), face: a + Math.PI, w, d, kind: 'box' });
    }
    return out;
  }
  if (plan === 'corridor' || plan === 'open') {
    // Corredor reto da frente aos fundos; salas (ou ilhas) dos dois lados, de frente para ele.
    const half = plan === 'corridor' ? 1.6 : 2.4;
    let zb = -back * 0.6;
    let zf = front - Math.max(1.5, front * 0.2);
    if (zf - zb < 6) {
      zb = -back + 4.5;
      zf = front - 1.2;
    }
    const nL = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {
      const left = k < nL;
      const m = left ? nL : n - nL;
      const j = left ? k : k - nL;
      const len = (zf - zb) / m;
      const z = zb + (j + 0.5) * len;
      const s = left ? -1 : 1;
      const face = left ? Math.PI / 2 : -Math.PI / 2;
      // Poucas salas num lado: a sala não vira um corredor de 15 m (no máximo 8 m de frente).
      const w = Math.max(2.4, Math.min(8, len - (plan === 'open' ? 0.8 : 0.15)));
      let d = 2.5;
      while (d < 12 && fits(s * (half + (d + 0.25) / 2), z, face, w, d + 0.25)) d += 0.25;
      out.push({ x: s * (half + d / 2), z, face, w, d, kind: plan === 'corridor' ? 'box' : 'island' });
    }
    return out;
  }
  // Mezanino: salas lado a lado no fundo, de frente para a galeria sobre o pé-direito alto;
  // passagem no meio até o elevador.
  const zr1 = zv - 2.8;
  const nL = Math.ceil(n / 2);
  let xr = 1.5;
  while (xr < 60 && inside(xr + 0.25, zr1, 0.4)) xr += 0.25;
  let xl = 1.5;
  while (xl < 60 && inside(-(xl + 0.25), zr1, 0.4)) xl += 0.25;
  for (let k = 0; k < n; k++) {
    const left = k < nL;
    const m = left ? nL : n - nL;
    const j = left ? k : k - nL;
    const wAll = (left ? xl : xr) - 1.5;
    // Sala sozinha num lado do mezanino: no máximo 7 m de frente, no meio da sua vaga.
    const w = Math.max(2.4, Math.min(7, wAll / m - 0.15));
    const cx = (left ? -1 : 1) * (1.5 + (j + 0.5) * (wAll / m));
    let d = 2.5;
    while (d < 30 && fits(cx, zr1 - (d + 0.25) / 2, 0, w, d + 0.25)) d += 0.25;
    out.push({ x: cx, z: zr1 - d / 2, face: 0, w, d, kind: 'box' });
  }
  return out;
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

/** Núcleo maciço com a escada em caracol: parede de pedra, nichos com telas e porta da escada. */
function coreLevel(kit: Kit, b: Builder, things: Thing[], L: number, y: number, r: number, accent: string, top: boolean) {
  const stone = kit.mat('#D8D2C6', { rough: 0.9 });
  const dark = kit.mat('#2B3442', { rough: 0.5 });
  const h = STOREY - 0.35;
  // Parede do núcleo com a abertura da escada na frente (ângulo 0).
  const gap = 0.7;
  b.add(stone, new THREE.CylinderGeometry(r, r, h, 40, 1, true, gap / 2, Math.PI * 2 - gap), [0, y + h / 2, 0]);
  // Face de dentro do núcleo (vista de quem sobe a escada): desenhada pelo lado de dentro.
  b.add(kit.mat('#D2CBBE', { rough: 0.9, side: THREE.BackSide }), new THREE.CylinderGeometry(r - 0.3, r - 0.3, h, 40, 1, true, gap / 2, Math.PI * 2 - gap), [0, y + h / 2, 0]);
  b.add(stone, new THREE.CylinderGeometry(r, r, h - 2.4, 8, 1, true, -gap / 2, gap), [0, y + 2.4 + (h - 2.4) / 2, 0]);
  // Nichos com telas acesas em volta.
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.add(dark, new THREE.BoxGeometry(1.4, 0.9, 0.06), [Math.sin(a) * (r + 0.04), y + 1.6, Math.cos(a) * (r + 0.04)], [0, a, 0]);
    b.add(kit.mat(accent, { glow: true }), new THREE.BoxGeometry(1.25, 0.75, 0.02), [Math.sin(a) * (r + 0.08), y + 1.6, Math.cos(a) * (r + 0.08)], [0, a, 0]);
    b.add(kit.mat('#F8FAFC', { glow: true }), new THREE.BoxGeometry(0.8, 0.05, 0.01), [Math.sin(a) * (r + 0.095), y + 1.75, Math.cos(a) * (r + 0.095)], [0, a, 0]);
  }
  // Escada em caracol dentro do núcleo (degraus girando em volta do pilar).
  const wood = kit.mat('#A0714F', { rough: 0.7 });
  b.add(dark, new THREE.CylinderGeometry(0.18, 0.18, STOREY, 12), [0, y + STOREY / 2 - 0.3, 0]);
  for (let k = 0; k < 18; k++) {
    const a = -0.4 - (k / 18) * Math.PI * 2;
    const rr = (r - 0.3) / 2 + 0.1;
    b.add(wood, new THREE.BoxGeometry(0.4, 0.06, r - 0.6), [Math.sin(a) * rr, y + (k / 18) * STOREY, Math.cos(a) * rr], [0, a + Math.PI / 2, 0]);
  }
  if (top) b.add(stone, new THREE.CylinderGeometry(r + 0.2, r + 0.2, 1.2, 40), [0, y + STOREY + 0.6, 0]);
  things.push({ kind: 'stairs', level: L, x: 0, z: r + 1.0, face: 0 });
}

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
