/**
 * Vida dentro dos prédios do Campus ("mais vivos"): quem está em cada andar a cada hora e fazendo o
 * quê. Sem three.js (testável):
 * - cada prédio tem um tipo de uso (estudo, trabalho, dados, música, esporte, calma) com a curva de
 *   ocupação do dia (cheio no horário de pico, quase vazio de madrugada) e o som do ambiente;
 * - cada andar acende (por fora e por dentro) conforme a ocupação daquela hora (`floorLight`);
 * - os lugares de cada pessoa: sentada nas cadeiras e bancos (digitando, lendo, escrevendo,
 *   tocando, descansando; na recepção, a recepcionista), de pé nas salas (no quadro, na estante,
 *   treinando, alongando, conversando) e alguns andando entre dois pontos;
 * - de pé, ninguém fica no vão da escada, no núcleo e no hall dos elevadores (com folga), na
 *   chegada e na rota a pé até a escada, nas portas das salas, no eixo da entrada ao elevador do
 *   térreo nem dentro dos móveis (`lifeClear`).
 * O motor pede as figuras de cada quadro (`createIndoorLife`): a mesma lista e os mesmos objetos,
 * sem alocar nada por quadro.
 */
import type { ModuleId } from '@/app/modules';
import type { Obstacle, Seat } from '../camera';
import { styleOf, type Figure, type Pose } from '../people';
import type { Quality } from '../world';
import { hasRoofTerrace } from '../forms';
import { groundSpan } from '../massing';
import { inLiftCore, inWell, liftCore, liftKeep, stairOf } from '../stairs';
import { FLOOR_PLANS, roomSlots, stairRoute, stairWays } from './floors';
import { roomType, type RoomType } from './furnish';

/** Uso do prédio: muda quem está lá, a que horas e o que faz. */
export type LifeKind = 'study' | 'work' | 'data' | 'music' | 'sport' | 'calm';
/** Som do ambiente de cada prédio (audio.ts). */
export type RoomTone = 'library' | 'study' | 'office' | 'clock' | 'chime' | 'music' | 'gym' | 'calm';

export const LIFE: Record<ModuleId, { kind: LifeKind; tone: RoomTone }> = {
  dashboard: { kind: 'data', tone: 'office' },
  profile: { kind: 'calm', tone: 'calm' },
  notes: { kind: 'study', tone: 'study' },
  library: { kind: 'study', tone: 'library' },
  calendar: { kind: 'work', tone: 'clock' },
  tasks: { kind: 'work', tone: 'office' },
  focus: { kind: 'calm', tone: 'calm' },
  habits: { kind: 'calm', tone: 'calm' },
  academy: { kind: 'study', tone: 'study' },
  languages: { kind: 'study', tone: 'study' },
  projects: { kind: 'work', tone: 'office' },
  music: { kind: 'music', tone: 'music' },
  sports: { kind: 'sport', tone: 'gym' },
  goals: { kind: 'work', tone: 'office' },
  insights: { kind: 'data', tone: 'office' },
  finance: { kind: 'work', tone: 'office' },
  settings: { kind: 'work', tone: 'office' },
  inbox: { kind: 'work', tone: 'chime' },
};

/** Ocupação (0 a 1) ao longo do dia, por tipo de uso; entre os pontos, linear. */
const CURVES: Record<LifeKind, ReadonlyArray<readonly [hour: number, occ: number]>> = {
  study: [[0, 0], [6.5, 0], [7.5, 0.25], [10, 0.8], [12, 0.6], [14, 0.85], [18, 0.75], [20, 0.6], [22, 0.25], [23.5, 0], [24, 0]],
  work: [[0, 0], [6.5, 0], [8, 0.45], [10, 0.9], [12, 0.55], [14, 0.9], [17.5, 0.7], [19, 0.3], [21, 0.1], [22, 0], [24, 0]],
  data: [[0, 0], [7, 0], [8.5, 0.5], [10.5, 0.85], [12, 0.5], [14, 0.85], [18, 0.6], [20, 0.2], [21.5, 0], [24, 0]],
  music: [[0, 0], [8, 0], [10, 0.35], [14, 0.5], [17, 0.7], [20, 0.95], [22.5, 0.5], [23.5, 0], [24, 0]],
  sport: [[0, 0], [5.5, 0], [6.5, 0.6], [8, 0.8], [10, 0.4], [12, 0.55], [15, 0.4], [17.5, 0.9], [20.5, 0.8], [22, 0.2], [23, 0], [24, 0]],
  calm: [[0, 0], [6, 0], [7.5, 0.35], [10, 0.5], [13, 0.45], [17, 0.55], [20, 0.35], [22, 0.08], [23, 0], [24, 0]],
};

const wrap24 = (h: number) => ((h % 24) + 24) % 24;

/** Quanto do prédio está ocupado a esta hora (0 a 1). */
export function occupancy(kind: LifeKind, hour: number): number {
  const h = wrap24(hour);
  const c = CURVES[kind];
  for (let i = 0; i + 1 < c.length; i++) {
    const [h0, v0] = c[i]!;
    const [h1, v1] = c[i + 1]!;
    if (h >= h0 && h <= h1) {
      const v = h1 > h0 ? v0 + ((v1 - v0) * (h - h0)) / (h1 - h0) : v0;
      return Math.min(1, Math.max(0, v));
    }
  }
  return c[0]![1];
}

/** Recepção aberta (com recepcionista): das 6h30 às 22h30. */
export const staffOn = (hour: number): boolean => {
  const h = wrap24(hour);
  return h >= 6.5 && h < 22.5;
};

/** Número estável (0 a 1) a partir de dois inteiros. */
export function hash01(a: number, b = 0): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Semente de cada prédio (pelo nome). */
export function idSeed(id: string): number {
  let s = 7;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) % 100003;
  return s;
}

/** Nível do terraço da cobertura (a céu aberto), ou -1. */
export function terraceLevel(id: ModuleId): number {
  const n = FLOOR_PLANS[id]?.length ?? 0;
  return n > 0 && hasRoofTerrace(id) ? n + 1 : -1;
}

/**
 * Luz das salas de um andar (0 a 1) a esta hora: cada andar tem o seu limiar e acende quando a
 * ocupação do prédio passa dele (de manhã acendem uns, no pico todos, à noite só os mais usados).
 * O térreo (saguão e recepção) fica aceso enquanto a recepção está aberta e com luz de vigia depois.
 */
export function floorLight(id: ModuleId, L: number, hour: number): number {
  if (L <= 0) return staffOn(hour) ? 1 : 0.35;
  const occ = occupancy(LIFE[id].kind, hour);
  const bar = 0.12 + hash01(idSeed(id), L) * 0.5;
  return Math.max(0, Math.min(1, (occ - bar + 0.075) / 0.15));
}

/** Terraço a céu aberto: gente só de dia (das 7h às 19h30, com transição). */
const terraceOpen = (hour: number): number => {
  const h = wrap24(hour);
  return Math.max(0, Math.min(1, (h - 7) / 1, (19.5 - h) / 1));
};

/** Quanto um nível recebe de gente a esta hora (0 a 1): andar apagado fica vazio. */
export function levelFactor(id: ModuleId, L: number, hour: number): number {
  if (L === 0) return 1;
  if (L === terraceLevel(id)) return terraceOpen(hour);
  return floorLight(id, L, hour);
}

/** Pessoas de um prédio no máximo, pela qualidade (no aparelho fraco, poucas). */
export const LIFE_CAP: Record<Quality, number> = { low: 8, medium: 18, high: 28 };

/** Quantas pessoas no prédio a esta hora (sem a recepção), até o número de lugares. */
export function headcount(id: ModuleId, hour: number, q: Quality, places: number): number {
  return Math.min(places, Math.round(LIFE_CAP[q] * occupancy(LIFE[id].kind, hour)));
}

/* ---------- Lugares ---------- */

/** O que a pessoa faz no lugar. */
export type Doing = 'reception' | 'type' | 'read' | 'write' | 'play' | 'rest' | 'board' | 'browse' | 'train' | 'stretch' | 'chat' | 'view' | 'walk';

/** Pose de cada atividade (people.ts). */
export const POSE_OF: Record<Doing, Pose> = {
  reception: 'type',
  type: 'type',
  read: 'read',
  write: 'draw',
  play: 'play',
  rest: 'sit',
  board: 'board',
  browse: 'browse',
  train: 'exercise',
  stretch: 'stretch',
  chat: 'stand',
  view: 'stand',
  walk: 'walk',
};

export interface LifeSpot {
  level: number;
  x: number;
  /** Altura: do assento (sentado) ou do piso (de pé). */
  y: number;
  z: number;
  /** Para onde olha (ângulo y, frente = (sin, cos)). */
  face: number;
  doing: Doing;
  seated: boolean;
  /** Quem anda: vai de (x, z) até `to` e volta. */
  to?: { x: number; z: number };
  /** Mesa na frente do assento (topo), onde ficam os objetos em uso. */
  desk?: { x: number; z: number; y: number };
}

/** Um nível do interior aberto: piso, onde não se pisa e a colisão dos móveis. */
export interface LifeLevel {
  y: number;
  blocked: (x: number, z: number) => boolean;
  obstacles: readonly Obstacle[];
}

/** Sala de um andar (a mesma que withFloors desenha): centro, frente (porta), tamanho e tipo. */
export interface LifeRoom {
  level: number;
  x: number;
  z: number;
  face: number;
  w: number;
  d: number;
  box: boolean;
  type: RoomType;
}

/** Salas do nível `L` (L ≥ 1), pela mesma distribuição de floors.ts (roomSlots). */
export function lifeRooms(id: ModuleId, L: number): LifeRoom[] {
  const plan = FLOOR_PLANS[id] ?? [];
  if (L < 1 || L > plan.length) return [];
  const rooms = plan[L - 1] ?? [];
  return roomSlots(id, L).flatMap((sl) => {
    const r = rooms[sl.k];
    return r ? [{ level: L, x: sl.x, z: sl.z, face: sl.face, w: sl.w, d: sl.d, box: sl.kind === 'box', type: roomType(r[0], id) }] : [];
  });
}

/** Ponto local da sala (x para o lado, z para a porta) no sistema do prédio. */
export function roomPoint(r: { x: number; z: number; face: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(r.face);
  const s = Math.sin(r.face);
  return [r.x + lx * c + lz * s, r.z - lx * s + lz * c];
}

/** Portas de cada sala do nível: o ponto na frente da porta e o logo dentro dela. */
function roomDoors(rooms: readonly LifeRoom[]): Array<[number, number]> {
  return rooms.flatMap((r) => [roomPoint(r, 0, r.d / 2 + 0.9), roomPoint(r, 0, r.d / 2 - 0.6)]);
}

const BODY = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]] as const;

/** A rota a pé do elevador até a escada de cada nível (só depende da planta: calculada uma vez). */
const routes = new Map<string, ReadonlyArray<readonly [number, number]>>();
function routeOf(id: ModuleId, L: number): ReadonlyArray<readonly [number, number]> {
  const k = `${id}:${L}`;
  let r = routes.get(k);
  if (!r) {
    r = stairRoute(id, L);
    routes.set(k, r);
  }
  return r;
}

/** Folgas (m) de quem fica de pé. */
export const KEEP = { well: 0.9, lift: 0.3, ways: 1.8, route: 1.0, doors: 1.2, spine: 1.6, furniture: 0.25 } as const;

export interface Clear {
  /** Dá para alguém ficar de pé aqui (parado) sem atrapalhar a circulação. */
  stand: (x: number, z: number) => boolean;
  /** Dá para passar andando por aqui (quem caminha entre dois pontos). */
  pass: (x: number, z: number) => boolean;
}

/**
 * Onde alguém pode ficar de pé no nível `L`: dentro da planta (o corpo inteiro), longe do vão da
 * escada, do núcleo e do hall dos elevadores, dos pontos de chegada à escada, da rota a pé do
 * elevador até ela, das portas das salas, do eixo da entrada ao elevador (térreo) e dos móveis.
 */
export function lifeClear(id: ModuleId, L: number, lv: LifeLevel, doors: ReadonlyArray<readonly [number, number]> = []): Clear {
  const st = stairOf(id);
  const core = liftCore(id);
  const keep = core ? liftKeep(core) : null;
  const ways = stairWays(id, L);
  const route = routeOf(id, L);
  const front = groundSpan(id).front;
  const inKeep = (x: number, z: number, m: number) => !!keep && x > keep.x0 - m && x < keep.x1 + m && z > keep.z0 - m && z < keep.z1 + m;
  const body = (x: number, z: number) => BODY.every(([dx, dz]) => !lv.blocked(x + dx, z + dz));
  const far = (pts: ReadonlyArray<readonly [number, number]>, x: number, z: number, r: number) => pts.every(([px, pz]) => Math.hypot(px - x, pz - z) >= r);
  const free = (x: number, z: number, m: number) => lv.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + m);
  // Térreo: o eixo da porta de entrada até o hall dos elevadores (por onde se entra andando).
  const spine = (x: number, z: number) => L === 0 && Math.abs(x) < KEEP.spine && z > (keep ? keep.z0 : 0) && z < front + 1;
  return {
    stand: (x, z) =>
      body(x, z) &&
      !inWell(st, x, z, KEEP.well) &&
      !inLiftCore(core, x, z, KEEP.lift) &&
      !inKeep(x, z, KEEP.lift) &&
      far(ways, x, z, KEEP.ways) &&
      far(route, x, z, KEEP.route) &&
      far(doors, x, z, KEEP.doors) &&
      !spine(x, z) &&
      free(x, z, KEEP.furniture),
    pass: (x, z) => body(x, z) && !inWell(st, x, z, 0.5) && !inLiftCore(core, x, z, 0.2) && !inKeep(x, z, 0.2) && free(x, z, 0.15),
  };
}

/** Nível de um assento pela altura (o piso mais alto abaixo dele). */
function levelOfY(levels: readonly LifeLevel[], y: number): number {
  let best = 0;
  levels.forEach((lv, L) => {
    if (lv.y <= y - 0.2 && lv.y >= (levels[best]?.y ?? 0)) best = L;
  });
  return best;
}

/** Topo do que está em (x, z) no nível (a célula de colisão que contém o ponto), fora `skip`. */
function topAt(lv: LifeLevel, x: number, z: number, sx: number, sz: number): number {
  let top = -1;
  for (const o of lv.obstacles) {
    const half = o.r * 0.8;
    if (Math.abs(o.x - x) > half || Math.abs(o.z - z) > half) continue;
    // A célula do próprio assento (encosto) não é mesa.
    if (Math.abs(o.x - sx) <= half && Math.abs(o.z - sz) <= half) continue;
    top = Math.max(top, o.h - lv.y);
  }
  return top;
}

/**
 * Mesa na frente do assento: a colisão logo à frente (a 0,55 e a 0,75 m) tem altura de mesa
 * (0,62 a 1,0 m) nos dois pontos. Devolve onde apoiar um objeto (no topo dela) ou null.
 */
export function deskAt(s: { x: number; z: number; face: number }, lv: LifeLevel): { x: number; z: number; y: number } | null {
  const fx = Math.sin(s.face);
  const fz = Math.cos(s.face);
  const a = topAt(lv, s.x + fx * 0.55, s.z + fz * 0.55, s.x, s.z);
  const b = topAt(lv, s.x + fx * 0.75, s.z + fz * 0.75, s.x, s.z);
  if (a < 0.62 || a > 1.0 || b < 0.62 || b > 1.0 || Math.abs(a - b) > 0.08) return null;
  return { x: s.x + fx * 0.58, z: s.z + fz * 0.58, y: lv.y + Math.min(a, b) };
}

/** O que faz quem está sentado, pelo uso do prédio e por ter mesa na frente. */
function seatDoing(kind: LifeKind, desk: boolean, r: number): Doing {
  switch (kind) {
    case 'study':
      return desk ? (r < 0.45 ? 'read' : r < 0.8 ? 'write' : 'type') : r < 0.7 ? 'read' : 'rest';
    case 'work':
      return desk ? (r < 0.6 ? 'type' : r < 0.85 ? 'write' : 'read') : r < 0.5 ? 'rest' : 'read';
    case 'data':
      return desk ? (r < 0.75 ? 'type' : 'write') : 'rest';
    case 'music':
      return desk ? (r < 0.6 ? 'write' : 'read') : r < 0.65 ? 'play' : 'rest';
    case 'sport':
      return desk ? 'read' : 'rest';
    case 'calm':
      return desk ? (r < 0.5 ? 'read' : 'write') : r < 0.5 ? 'rest' : 'read';
  }
}

/** De pé dentro de cada tipo de sala: posição local (x, z a partir do fundo), atividade e para onde olha (local). */
function roomStands(r: LifeRoom, kind: LifeKind): Array<[lx: number, lz: number, doing: Doing, yaw: number]> {
  const back = -r.d / 2;
  const t: RoomType = kind === 'sport' && (r.type === 'studio' || r.type === 'stage') ? 'gym' : r.type;
  switch (t) {
    case 'classroom':
    case 'office':
    case 'lab':
    case 'booth':
      return [[-r.w * 0.2, back + 0.9, 'board', Math.PI], [r.w * 0.22, back + 1.0, kind === 'study' ? 'board' : 'chat', Math.PI]];
    case 'dataviz':
      return [[-r.w * 0.18, back + 1.4, 'board', Math.PI], [r.w * 0.2, back + 1.5, 'view', Math.PI]];
    case 'observatory':
      return [[0, back + 1.2, 'view', Math.PI]];
    case 'archive':
      return [[-r.w * 0.3, back + 0.75, 'browse', Math.PI], [r.w * 0.3, back + 0.75, 'browse', Math.PI]];
    case 'gallery':
      return [[-r.w * 0.25, back + 1.4, 'view', Math.PI], [r.w * 0.25, back + 1.4, 'view', Math.PI]];
    case 'gym':
      return [[-r.w * 0.22, 0, 'train', 0], [r.w * 0.22, -0.3, 'stretch', 0], [0, back + 1.0, 'stretch', Math.PI]];
    case 'lounge':
      return [[-0.55, 0.2, 'chat', Math.PI / 2], [0.55, 0.2, 'chat', -Math.PI / 2]];
    case 'studio':
    case 'stage':
    case 'music':
      return kind === 'music' ? [[-0.6, -0.2, 'chat', Math.PI / 2], [0.6, -0.2, 'chat', -Math.PI / 2]] : [[0, back + 0.9, 'board', Math.PI]];
  }
}

/** Ninguém de pé a menos de 1,1 m de outra pessoa (nem a 0,8 m de um assento). */
function roomy(spots: readonly LifeSpot[], L: number, x: number, z: number): boolean {
  return spots.every((s) => s.level !== L || Math.hypot(s.x - x, s.z - z) >= (s.seated ? 0.8 : 1.1));
}

/** Atividade de pé num lugar do salão, pelo uso do prédio (perto de algo alto: olhando para ele). */
function openDoing(kind: LifeKind, tall: boolean, r: number): Doing {
  if (tall) return kind === 'study' ? 'browse' : kind === 'sport' ? 'stretch' : 'view';
  if (kind === 'sport') return r < 0.6 ? 'train' : 'stretch';
  if (kind === 'calm') return r < 0.5 ? 'view' : 'chat';
  return 'chat';
}

/**
 * Todos os lugares do prédio aberto, nível por nível: os assentos (com a atividade de cada um e a
 * mesa na frente), quem fica de pé nas salas e no salão, e quem anda entre dois pontos.
 */
export function lifeSpots(id: ModuleId, levels: readonly LifeLevel[], seats: readonly Seat[]): LifeSpot[] {
  const kind = LIFE[id].kind;
  const seed = idSeed(id);
  const st = stairOf(id);
  const core = liftCore(id);
  const keep = core ? liftKeep(core) : null;
  const out: LifeSpot[] = [];
  // Sentados.
  seats.forEach((s, i) => {
    const L = levelOfY(levels, s.y);
    const lv = levels[L];
    if (!lv) return;
    if (inWell(st, s.x, s.z, 0.2) || inLiftCore(core, s.x, s.z, 0.2)) return;
    if (keep && s.x > keep.x0 && s.x < keep.x1 && s.z > keep.z0 && s.z < keep.z1) return;
    // Assento repetido (o mesmo lugar anotado duas vezes).
    if (out.some((o) => o.seated && o.level === L && Math.hypot(o.x - s.x, o.z - s.z) < 0.35)) return;
    const desk = deskAt(s, lv) ?? undefined;
    const doing = s.tag === 'staff' ? 'reception' : seatDoing(kind, !!desk, hash01(seed + i, 3));
    out.push({ level: L, x: s.x, y: s.y, z: s.z, face: s.face, doing, seated: true, desk });
  });
  const terr = terraceLevel(id);
  const R = groundSpan(id).bound + 4;
  levels.forEach((lv, L) => {
    const rooms = lifeRooms(id, L);
    const clear = lifeClear(id, L, lv, roomDoors(rooms));
    // De pé nas salas.
    rooms.forEach((r) => {
      for (const [lx, lz, doing, yaw] of roomStands(r, kind)) {
        const [x, z] = roomPoint(r, lx, lz);
        if (clear.stand(x, z) && roomy(out, L, x, z)) out.push({ level: L, x, y: lv.y, z, face: r.face + yaw, doing, seated: false });
      }
    });
    // De pé no salão, no saguão e no terraço: uma grade de 1,5 m, até 24 lugares por nível.
    const inRoom = (x: number, z: number) =>
      rooms.some((r) => {
        const dx = x - r.x;
        const dz = z - r.z;
        const c = Math.cos(r.face);
        const s = Math.sin(r.face);
        return Math.abs(dx * c - dz * s) < r.w / 2 + 0.5 && Math.abs(dx * s + dz * c) < r.d / 2 + 0.5;
      });
    const grid: Array<{ x: number; z: number; k: number }> = [];
    for (let x = -R; x <= R; x += 1.5)
      for (let z = -R; z <= R; z += 1.5) {
        if (inRoom(x, z) || !clear.stand(x, z)) continue;
        grid.push({ x, z, k: hash01(seed + Math.round(x * 7) * 131 + Math.round(z * 7), L) });
      }
    grid.sort((a, b) => a.k - b.k);
    let n = 0;
    const open: LifeSpot[] = [];
    // Corredor (parede ou móvel dos dois lados a 1,3 m): ninguém fica parado ali, para não estreitar a passagem.
    const wall = (x: number, z: number) => lv.blocked(x, z) || lv.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r);
    const corridor = (x: number, z: number) =>
      [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].some((a) => wall(x + Math.sin(a) * 1.3, z + Math.cos(a) * 1.3) && wall(x - Math.sin(a) * 1.3, z - Math.cos(a) * 1.3));
    for (const g of grid) {
      if (n >= 24) break;
      if (!roomy(out, L, g.x, g.z)) continue;
      if (corridor(g.x, g.z)) continue;
      // Algo alto perto (estante, parede, vitrine): olha para ele.
      let tall: Obstacle | null = null;
      let td = 1.4;
      for (const o of lv.obstacles) {
        const d = Math.hypot(o.x - g.x, o.z - g.z);
        if (d < td && o.h - lv.y > 1.6) {
          td = d;
          tall = o;
        }
      }
      const ter = L === terr;
      const doing: Doing = ter ? (kind === 'sport' ? 'stretch' : g.k < 0.5 ? 'view' : 'chat') : openDoing(kind, !!tall, g.k);
      // No terraço, olhando para fora; perto de algo alto, para ele; senão, para o meio do prédio.
      const face = ter ? Math.atan2(g.x, g.z) : tall ? Math.atan2(tall.x - g.x, tall.z - g.z) : Math.atan2(-g.x, -g.z) + (g.k - 0.5) * 1.2;
      const sp: LifeSpot = { level: L, x: g.x, y: lv.y, z: g.z, face, doing, seated: false };
      out.push(sp);
      if (!tall) open.push(sp);
      n++;
    }
    // Conversa: quem conversa olha para o vizinho mais perto (até 2,2 m), se houver.
    for (const sp of open) {
      if (sp.doing !== 'chat') continue;
      let best: LifeSpot | null = null;
      let bd = 2.2;
      for (const o of out) {
        if (o === sp || o.level !== L || o.seated) continue;
        const d = Math.hypot(o.x - sp.x, o.z - sp.z);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best) sp.face = Math.atan2(best.x - sp.x, best.z - sp.z);
    }
    // Quem anda: até dois lugares do salão viram caminhadas (4 a 10 m, até 1,3 m antes do outro
    // ponto), com o caminho livre a cada 0,2 m e a 0,7 m de quem está parado.
    let walkers = 0;
    for (let i = 0; i < open.length && walkers < (L === 0 ? 2 : 1); i++)
      for (let j = 0; j < open.length; j++) {
        const a = open[i]!;
        const b = open[j]!;
        if (a === b || a.doing === 'walk' || b.doing === 'walk') continue;
        const full = Math.hypot(b.x - a.x, b.z - a.z);
        if (full < 5.3 || full > 11.3) continue;
        const d = full - 1.3;
        const ux = (b.x - a.x) / full;
        const uz = (b.z - a.z) / full;
        let ok = true;
        for (let k = 1; k * 0.2 < d + 0.2 && ok; k++) {
          const px = a.x + ux * Math.min(k * 0.2, d);
          const pz = a.z + uz * Math.min(k * 0.2, d);
          ok = clear.pass(px, pz) && out.every((o) => o === a || o.level !== L || o.seated || Math.hypot(o.x - px, o.z - pz) >= 0.7);
        }
        if (!ok) continue;
        a.doing = 'walk';
        a.to = { x: a.x + ux * d, z: a.z + uz * d };
        a.face = Math.atan2(ux, uz);
        walkers++;
        break;
      }
  });
  return out;
}

/**
 * Quem está agora (índices em `spots`), sempre na mesma ordem por prédio: as recepcionistas no
 * horário da recepção e, depois, os lugares numa ordem fixa (o mesmo lugar recebe sempre a mesma
 * pessoa; mais gente = mais lugares da mesma lista), só nos níveis acesos, até `headcount`.
 */
export function lifePick(id: ModuleId, spots: readonly LifeSpot[], hour: number, q: Quality): number[] {
  const seed = idSeed(id);
  const picked: number[] = [];
  if (staffOn(hour)) spots.forEach((s, i) => s.doing === 'reception' && picked.push(i));
  const order = spots.map((s, i) => ({ i, k: hash01(seed + i * 17, 11) - (s.seated ? 0 : 0.15) })).sort((a, b) => a.k - b.k);
  const want = headcount(id, hour, q, spots.length);
  let n = 0;
  let walkers = 0;
  for (const { i } of order) {
    if (n >= want) break;
    const s = spots[i]!;
    if (s.doing === 'reception') continue;
    if (hash01(seed + i, 5) >= levelFactor(id, s.level, hour)) continue;
    if (s.doing === 'walk') {
      if (walkers >= 3) continue;
      walkers++;
    }
    picked.push(i);
    n++;
  }
  return picked;
}

/* ---------- Pessoas ---------- */

const SHIRTS = ['#3E6E9E', '#C0504D', '#4F8A5B', '#E8C547', '#8E6BB8', '#F4F1EA', '#2F3A4F', '#D9822B', '#5BA8A0', '#B85C82', '#7A8B99', '#A0522D'];
const PANTS = ['#2F3A4F', '#4B5563', '#1F2937', '#6B5B4B', '#3B5B7A', '#8C7A5B', '#E5E0D5'];
const SKINS = ['#F1C9A5', '#E0AC8A', '#C68E6A', '#A86F4C', '#8D5A3B', '#6B4228'];
const HAIRS = ['#2F2A26', '#4A3426', '#7A5230', '#C9A26B', '#1C1C1C', '#9A9A9A', '#B5532E'];
const EYES = ['#4A3426', '#3B5B7A', '#4F7A4F', '#2F2A26'];

/** Aparência fixa de quem ocupa um lugar (roupa de treino em quem treina, camisa na recepção). */
export function lookFor(seed: number, doing: Doing): Figure {
  const h = (k: number) => hash01(seed, k);
  const pick = <T>(a: readonly T[], k: number): T => a[Math.floor(h(k) * a.length) % a.length]!;
  const style = styleOf(seed);
  const sporty = doing === 'train' || doing === 'stretch';
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pose: POSE_OF[doing],
    phase: h(9) * 6,
    stride: 0,
    shirt: pick(SHIRTS, 1),
    pants: pick(PANTS, 2),
    skin: pick(SKINS, 3),
    hair: pick(HAIRS, 4),
    hairStyle: Math.floor(h(5) * 4),
    eyes: pick(EYES, 6),
    scale: 0.93 + h(7) * 0.12,
    seed,
    expr: 'neutral',
    ...style,
    ...(sporty ? { outfit: 'sport' as const, shorts: true, shortSleeves: true, bag: false, hat: 0 } : {}),
    ...(doing === 'reception' ? { outfit: 'shirt' as const, bag: false, hat: 0 } : {}),
    ...(doing !== 'walk' ? { bag: false } : {}),
  };
}

/** Campos de aparência que um morador do parque empresta a um lugar (quando ele está no prédio). */
const LOOK_KEYS = ['shirt', 'pants', 'skin', 'hair', 'hairStyle', 'eyes', 'scale', 'outfit', 'accent', 'hat', 'hatColor', 'glasses', 'shoes', 'sole', 'shortSleeves', 'shorts', 'seed'] as const;

export interface IndoorLife {
  readonly spots: readonly LifeSpot[];
  /**
   * As figuras de agora (a mesma lista e os mesmos objetos a cada quadro). `residents` = moradores
   * do parque que estão neste prédio (emprestam a aparência aos primeiros lugares); `hide` = onde
   * a pessoa sentou (ninguém senta no mesmo lugar).
   */
  figures: (hour: number, t: number, q: Quality, residents?: readonly Figure[] | null, hide?: { x: number; z: number } | null) => Figure[];
  /** Índices dos lugares ocupados agora. */
  active: () => readonly number[];
}

/** Velocidade de quem anda (m/s) e a pausa (s) em cada ponta. */
const WALK = 1.05;
const PAUSE = 2.6;

export function createIndoorLife(id: ModuleId, spots: readonly LifeSpot[]): IndoorLife {
  const seed = idSeed(id);
  const figs = spots.map((s, i) => lookFor(seed * 131 + i * 7, s.doing));
  const base = figs.map((f) => Object.fromEntries(LOOK_KEYS.map((k) => [k, f[k]])) as unknown as Partial<Figure>);
  const lens = spots.map((s) => (s.to ? Math.hypot(s.to.x - s.x, s.to.z - s.z) : 0));
  const out: Figure[] = [];
  let picks: number[] = [];
  let pickHour = -99;
  let pickQ: Quality | null = null;
  let dressed = -1;
  const dress = (residents: readonly Figure[]) => {
    // Cada lugar volta à própria aparência; os moradores que estão no prédio ocupam os primeiros.
    for (const i of picks) Object.assign(figs[i]!, base[i]);
    let r = 0;
    for (const i of picks) {
      if (r >= residents.length) break;
      if (spots[i]!.doing === 'reception') continue;
      const src = residents[r++]!;
      const f = figs[i]!;
      for (const k of LOOK_KEYS) if (src[k] !== undefined) (f as unknown as Record<string, unknown>)[k] = src[k];
    }
    dressed = residents.length;
  };
  const animate = (f: Figure, s: LifeSpot, t: number, i: number) => {
    const ph = t + i * 1.73;
    f.look = 0;
    f.expr = 'neutral';
    f.stride = 0;
    if (s.seated) {
      f.x = s.x;
      f.y = s.y - 0.44;
      f.z = s.z;
      f.yaw = s.face;
      f.pose = POSE_OF[s.doing];
      f.phase = ph * 1.6;
      if (s.doing === 'reception' && Math.floor(ph / 9) % 4 === 0) f.expr = 'smile';
      return;
    }
    f.y = s.y;
    if (s.to) {
      // Vai, para um pouco, volta e para de novo.
      const len = lens[i]!;
      const tw = len / WALK;
      const cyc = 2 * (tw + PAUSE);
      const u = (((ph * 1.0) % cyc) + cyc) % cyc;
      const go = Math.atan2(s.to.x - s.x, s.to.z - s.z);
      let k: number;
      let moving = true;
      let yaw = go;
      if (u < tw) k = u / tw;
      else if (u < tw + PAUSE) {
        k = 1;
        moving = false;
      } else if (u < 2 * tw + PAUSE) {
        k = 1 - (u - tw - PAUSE) / tw;
        yaw = go + Math.PI;
      } else {
        k = 0;
        moving = false;
        yaw = go + Math.PI;
      }
      f.x = s.x + (s.to.x - s.x) * k;
      f.z = s.z + (s.to.z - s.z) * k;
      f.yaw = yaw;
      f.pose = moving ? 'walk' : 'stand';
      f.stride = moving ? WALK / 2.5 : 0;
      f.phase = moving ? (u * WALK * Math.PI * 2) / (0.9 + 0.45 * WALK) : ph;
      return;
    }
    f.x = s.x;
    f.z = s.z;
    f.yaw = s.face;
    f.pose = POSE_OF[s.doing];
    f.phase = ph * (s.doing === 'train' ? 2.6 : s.doing === 'stretch' ? 0.9 : 1.2);
    if (s.doing === 'browse') f.look = Math.sin(ph * 0.4) * 0.35;
    if (s.doing === 'chat') f.expr = Math.floor(ph / 3.5) % 3 === 0 ? 'talk' : Math.floor(ph / 3.5) % 3 === 1 ? 'smile' : 'neutral';
    if (s.doing === 'view') f.look = Math.sin(ph * 0.25) * 0.5;
  };
  return {
    spots,
    active: () => picks,
    figures: (hour, t, q, residents, hide) => {
      const dh = Math.abs(wrap24(hour) - wrap24(pickHour));
      if (dh > 0.1 || q !== pickQ) {
        picks = lifePick(id, spots, hour, q);
        pickHour = hour;
        pickQ = q;
        dressed = -1;
      }
      const res = residents ?? [];
      if (dressed !== res.length) dress(res);
      out.length = 0;
      for (const i of picks) {
        const s = spots[i]!;
        if (hide && s.seated && Math.hypot(s.x - hide.x, s.z - hide.z) < 0.6) continue;
        const f = figs[i]!;
        animate(f, s, t, i);
        out.push(f);
      }
      return out;
    },
  };
}
